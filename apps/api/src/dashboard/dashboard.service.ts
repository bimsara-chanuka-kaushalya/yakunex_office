import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable()
export class DashboardService {
  private readonly orgCache = new Map<string, { data: { name: string; timezone: string }; expiresAt: number }>();
  private readonly auditCache = new Map<string, { data: unknown[]; expiresAt: number }>();

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
      this.orgCache.set(actor.organizationId, { data: organization, expiresAt: now + 300_000 });
    }

    return {
      user: { id: actor.id, companyId: actor.companyId, fullName: actor.fullName, role: actor.role },
      organization,
      mustChangePassword: actor.mustChangePassword,
      workspace: this.workspace.getWorkspaceCounts(actor),
    };
  }

  async adminSummary(actor: AuthUser) {
    const cachedUsers = this.prisma.getCachedUsers?.(actor.organizationId) ?? [];
    const byRole: Record<string, number> = Object.fromEntries(
      (Object.values(Role) as Role[]).map((role) => [role, 0]),
    );
    const byStatus: Record<string, number> = {};

    if (cachedUsers.length > 0) {
      for (const u of cachedUsers) {
        byRole[u.role] = (byRole[u.role] ?? 0) + 1;
        byStatus[u.status] = (byStatus[u.status] ?? 0) + 1;
      }
    } else {
      const scope = { organizationId: actor.organizationId, deletedAt: null };
      const byRoleRows = await this.prisma.user.groupBy({
        by: ['role'],
        where: scope,
        _count: { _all: true },
      });
      const byStatusRows = await this.prisma.user.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      });
      for (const row of byRoleRows) byRole[row.role] = row._count._all;
      for (const row of byStatusRows) byStatus[row.status] = row._count._all;
    }

    const now = Date.now();
    let recentAudit = this.auditCache.get(actor.organizationId)?.data;
    if (!recentAudit || (this.auditCache.get(actor.organizationId)?.expiresAt ?? 0) <= now) {
      recentAudit = await this.prisma.auditLog.findMany({
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
      });
      this.auditCache.set(actor.organizationId, { data: recentAudit, expiresAt: now + 15_000 });
    }

    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    return {
      users: {
        total,
        staff: byRole.STAFF ?? 0,
        interns: byRole.INTERN ?? 0,
        projectManagers: byRole.PROJECT_MANAGER ?? 0,
        admins: byRole.ADMIN ?? 0,
        active: byStatus.ACTIVE ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        byRole,
      },
      recentActivity: recentAudit,
      workspace: this.workspace.getWorkspaceCounts(actor),
    };
  }
}
