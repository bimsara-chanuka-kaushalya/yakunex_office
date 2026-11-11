import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class DashboardService {
  private readonly orgCache = new Map<string, { data: { name: string; timezone: string }; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async personal(actor: AuthUser) {
    const now = Date.now();
    let organization = this.orgCache.get(actor.organizationId)?.data;
    if (!organization || (this.orgCache.get(actor.organizationId)?.expiresAt ?? 0) <= now) {
      const found = await this.prisma.organization.findUnique({
        where: { id: actor.organizationId },
        select: { name: true, timezone: true },
      });
      if (!found) throw new NotFoundException('Organization not found.');
      organization = found;
      this.orgCache.set(actor.organizationId, { data: organization, expiresAt: now + 60_000 });
    }

    return {
      user: { id: actor.id, fullName: actor.fullName, role: actor.role },
      organization,
      mustChangePassword: actor.mustChangePassword,
      workspace: this.workspace.getWorkspaceCounts(actor),
    };
  }

  async adminSummary(actor: AuthUser) {
    const scope = { organizationId: actor.organizationId, deletedAt: null };

    const [byRoleRows, byStatusRows, recentAudit] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['role'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId: actor.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entityType: true,
          createdAt: true,
          actor: { select: { fullName: true } },
        },
      }),
    ]);

    const total = byStatusRows.reduce((sum, row) => sum + row._count._all, 0);

    const byRole = Object.fromEntries(
      (Object.values(Role) as Role[]).map((role) => [
        role,
        byRoleRows.find((row) => row.role === role)?._count._all ?? 0,
      ]),
    );
    const byStatus = Object.fromEntries(
      byStatusRows.map((row) => [row.status, row._count._all]),
    );

    return {
      users: {
        total,
        staff: byRole.STAFF,
        interns: byRole.INTERN,
        projectManagers: byRole.PROJECT_MANAGER,
        admins: byRole.ADMIN,
        active: byStatus.ACTIVE ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        byRole,
      },
      recentActivity: recentAudit,
      workspace: this.workspace.getWorkspaceCounts(actor),
    };
  }
}
