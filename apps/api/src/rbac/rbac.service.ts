import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  PermissionKey,
} from './permissions';

@Injectable()
export class RbacService {
  private readonly cache = new Map<string, { expiresAt: number; permissions: Set<string> }>();

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Effective permissions = role defaults (RolePermission)
   *   + per-user grants − per-user revocations (UserPermission).
   * Super Admin always holds every key, so a misconfigured table cannot lock out the platform owner.
   */
  async effectivePermissions(
    userId: string,
    organizationId: string,
    role: Role,
  ): Promise<Set<string>> {
    if (role === Role.SUPER_ADMIN) {
      return new Set(ALL_PERMISSION_KEYS);
    }

    const cacheKey = `${userId}:${organizationId}:${role}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.permissions;
    }

    const [defaults, overrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { organizationId, role },
        select: { permissionKey: true },
      }),
      this.prisma.userPermission.findMany({
        where: { userId },
        select: { permissionKey: true, granted: true },
      }),
    ]);

    const effective = new Set<string>(defaults.map((d) => d.permissionKey));
    for (const override of overrides) {
      if (override.granted) {
        effective.add(override.permissionKey);
      } else {
        effective.delete(override.permissionKey);
      }
    }
    this.cache.set(cacheKey, { expiresAt: now + 60_000, permissions: effective });
    return effective;
  }

  /** Writes the default role→permission matrix for an organization. Safe to re-run. */
  async seedDefaultsForOrganization(organizationId: string): Promise<void> {
    const rows = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]).flatMap((role) =>
      DEFAULT_ROLE_PERMISSIONS[role].map((permissionKey: PermissionKey) => ({
        organizationId,
        role,
        permissionKey,
      })),
    );
    await this.prisma.rolePermission.createMany({ data: rows, skipDuplicates: true });
  }
}
