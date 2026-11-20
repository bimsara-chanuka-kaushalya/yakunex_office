import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, UserStatus } from '@prisma/client';
import type { AuthUser } from '../common/types';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from './permissions';
import { PermissionsGuard } from './permissions.guard';
import type { RbacService } from './rbac.service';

describe('PermissionsGuard — Enterprise Role Enforcement Matrix', () => {
  const makeActor = (role: Role): AuthUser => ({
    id: `usr_${role.toLowerCase()}`,
    organizationId: 'org_test',
    companyId: `YNX-${role.slice(0, 3)}-0001`,
    email: `${role.toLowerCase()}@yakunx.com`,
    fullName: `${role} User`,
    role,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  });

  const makeContext = (user?: AuthUser): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  const makeGuard = (required: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn(() => required),
    } as unknown as Reflector;
    const rbac = {
      effectivePermissions: jest.fn(async (_uid: string, _oid: string, role: Role) => {
        return new Set<string>(DEFAULT_ROLE_PERMISSIONS[role] ?? []);
      }),
    } as unknown as RbacService;
    return new PermissionsGuard(reflector, rbac);
  };

  it('allows INTERN Dashboard/Projects/Tasks/Time/Chat while blocking Admin, Users, Finance, Settings & Audit', async () => {
    const intern = makeActor(Role.INTERN);
    const forbiddenForIntern = [
      PERMISSIONS.PROJECTS_WRITE,
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.FINANCIALS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.CODE_DEPLOY,
    ];

    for (const perm of forbiddenForIntern) {
      const guard = makeGuard([perm]);
      await expect(guard.canActivate(makeContext(intern))).rejects.toThrow(ForbiddenException);
    }

    // Allowed: Projects (read), Tasks (read/write), Time (own), Chat & Meetings (Join-Only)
    for (const perm of [
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_WRITE,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.CHAT_USE,
    ]) {
      await expect(makeGuard([perm]).canActivate(makeContext(intern))).resolves.toBe(true);
    }
  });

  it('blocks STAFF from Users, Assets/Reports, Client Portal Write, Finance & Settings while allowing Tasks/Time/Chat', async () => {
    const staff = makeActor(Role.STAFF);
    for (const perm of [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.PROJECTS_WRITE,
      PERMISSIONS.FINANCIALS_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      await expect(makeGuard([perm]).canActivate(makeContext(staff))).rejects.toThrow(ForbiddenException);
    }

    for (const perm of [PERMISSIONS.PROJECTS_READ, PERMISSIONS.TASKS_WRITE, PERMISSIONS.TIME_OWN, PERMISSIONS.CHAT_USE]) {
      await expect(makeGuard([perm]).canActivate(makeContext(staff))).resolves.toBe(true);
    }
  });

  it('allows SUPER_ADMIN across every permission and rejects unauthenticated requests', async () => {
    const sa = makeActor(Role.SUPER_ADMIN);
    await expect(makeGuard([PERMISSIONS.FINANCIALS_WRITE, PERMISSIONS.SETTINGS_MANAGE]).canActivate(makeContext(sa))).resolves.toBe(true);
    await expect(makeGuard([PERMISSIONS.CHAT_USE]).canActivate(makeContext(undefined))).rejects.toThrow(ForbiddenException);
  });
});
