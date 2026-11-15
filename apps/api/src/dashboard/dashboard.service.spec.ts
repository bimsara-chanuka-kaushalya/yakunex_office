import { NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const adminActor: AuthUser = {
    id: 'usr_admin',
    organizationId: 'org_yakunex',
    companyId: 'YNX-DIR-0001',
    email: 'admin@yakunex.local',
    fullName: 'Yakunex Admin',
    role: Role.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  function makeDashboard(orgExists = true) {
    const prismaStub = {
      isConnected: () => false,
      organization: {
        findUnique: jest.fn(async () =>
          orgExists ? { name: 'Yakunex Technologies', timezone: 'Asia/Colombo' } : null,
        ),
      },
      getCachedUsers: jest.fn(() => [
        { role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE },
        { role: Role.ADMIN, status: UserStatus.ACTIVE },
        { role: Role.PROJECT_MANAGER, status: UserStatus.ACTIVE },
        { role: Role.STAFF, status: UserStatus.ACTIVE },
        { role: Role.STAFF, status: UserStatus.SUSPENDED },
        { role: Role.INTERN, status: UserStatus.ACTIVE },
      ]),
      auditLog: {
        findMany: jest.fn(async () => [
          {
            id: 'aud_1',
            action: 'LOGIN_SUCCESS',
            entityType: 'User',
            createdAt: new Date(),
            actor: { fullName: 'Yakunex Admin' },
          },
        ]),
      },
    } as unknown as PrismaService;

    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const workspace = new WorkspaceService(prismaStub, auditStub);
    return { dashboard: new DashboardService(prismaStub, workspace), workspace };
  }

  it('returns personal dashboard data with organization info and workspace counts', async () => {
    const { dashboard } = makeDashboard(true);
    const res = await dashboard.personal(adminActor);

    expect(res.user.fullName).toBe('Yakunex Admin');
    expect(res.organization.name).toBe('Yakunex Technologies');
    expect(res.organization.timezone).toBe('Asia/Colombo');
    expect(res.mustChangePassword).toBe(false);
    expect(typeof res.workspace.totalProjects).toBe('number');
    expect(typeof res.workspace.totalTasks).toBe('number');
  });

  it('throws NotFoundException when organization does not exist', async () => {
    const { dashboard } = makeDashboard(false);
    await expect(dashboard.personal(adminActor)).rejects.toThrow(NotFoundException);
  });

  it('aggregates admin summary counts by role, status, recent activity, and workspace', async () => {
    const { dashboard } = makeDashboard(true);
    const res = await dashboard.adminSummary(adminActor);

    expect(res.users.total).toBe(6);
    expect(res.users.admins).toBe(1);
    expect(res.users.projectManagers).toBe(1);
    expect(res.users.staff).toBe(2);
    expect(res.users.interns).toBe(1);
    expect(res.users.active).toBe(5);
    expect(res.users.suspended).toBe(1);
    expect(res.recentActivity).toHaveLength(1);
    expect(res.workspace.recentProjects.length).toBeLessThanOrEqual(3);
  });
});

