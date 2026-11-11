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
  constructor(private readonly prisma: PrismaService) {}

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
