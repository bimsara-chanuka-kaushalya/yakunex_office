import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { isPermissionKey, PERMISSIONS } from '../rbac/permissions';
import { assertCanAssignRole, assertCanManageTarget } from './role-rules';
import { ChangeRoleDto, CreateUserDto, ListUsersQuery, SetPermissionsDto } from './dto/users.dto';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  title: true,
  role: true,
  status: true,
  departmentId: true,
  lastLoginAt: true,
  createdAt: true,
  mustChangePassword: true,
} satisfies Prisma.UserSelect;

/** Readable temporary password: letters and digits, always includes both. */
function generateTemporaryPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const alphabet = letters + digits;
  while (true) {
    const bytes = randomBytes(14);
    let value = '';
    for (const byte of bytes) value += alphabet[byte % alphabet.length];
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) {
      return value;
    }
  }
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async list(actor: AuthUser, query: ListUsersQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.UserWhereInput = {
      organizationId: actor.organizationId,
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async create(actor: AuthUser, dto: CreateUserDto, meta: { ipAddress?: string; userAgent?: string }) {
    assertCanAssignRole(actor.role, dto.role);

    const fullName = dto.fullName.trim();
    if (fullName.length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters.');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists.');
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: actor.organizationId },
      });
      if (!department) throw new BadRequestException('Department not found.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        organizationId: actor.organizationId,
        email,
        fullName: dto.fullName.trim(),
        title: dto.title,
        role: dto.role,
        departmentId: dto.departmentId ?? null,
        passwordHash,
        mustChangePassword: true,
      },
      select: publicUserSelect,
    });

    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { role: dto.role },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Returned exactly once. It is never stored in plain text or logged.
    return { user, temporaryPassword };
  }

  async changeRole(actor: AuthUser, targetId: string, dto: ChangeRoleDto, meta: { ipAddress?: string; userAgent?: string }) {
    if (targetId === actor.id) {
      throw new BadRequestException('You cannot change your own role.');
    }
    const target = await this.findTargetOrFail(actor, targetId);
    assertCanManageTarget(actor.role, target.role);
    assertCanAssignRole(actor.role, dto.role);

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { role: dto.role },
      select: publicUserSelect,
    });
    this.prisma.invalidateUserCache?.(target.id);
    this.rbac.invalidateCache?.(target.id);

    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: target.id,
      metadata: { from: target.role, to: dto.role },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return updated;
  }

  async changeStatus(
    actor: AuthUser,
    targetId: string,
    status: UserStatus,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    if (targetId === actor.id) {
      throw new BadRequestException('You cannot suspend or deactivate your own account.');
    }
    const target = await this.findTargetOrFail(actor, targetId);
    assertCanManageTarget(actor.role, target.role);

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: target.id },
        data: { status },
        select: publicUserSelect,
      });
      if (status !== UserStatus.ACTIVE) {
        // Revoke sessions immediately so the account is locked out, not just on next refresh.
        await tx.refreshToken.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return user;
    });
    this.prisma.invalidateUserCache?.(target.id);

    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: target.id,
      metadata: { from: target.status, to: status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return updated;
  }

  async getPermissionOverrides(actor: AuthUser, targetId: string) {
    const target = await this.findTargetOrFail(actor, targetId);
    const [overrides, roleDefaults] = await Promise.all([
      this.prisma.userPermission.findMany({
        where: { userId: target.id },
        select: { permissionKey: true, granted: true },
      }),
      this.prisma.rolePermission.findMany({
        where: { organizationId: actor.organizationId, role: target.role },
        select: { permissionKey: true },
      }),
    ]);
    return {
      userId: target.id,
      role: target.role,
      roleDefaults: roleDefaults.map((r) => r.permissionKey),
      grants: overrides.filter((o) => o.granted).map((o) => o.permissionKey),
      revokes: overrides.filter((o) => !o.granted).map((o) => o.permissionKey),
    };
  }

  async setPermissionOverrides(
    actor: AuthUser,
    targetId: string,
    dto: SetPermissionsDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const grants = [...new Set(dto.grants)];
    const revokes = [...new Set(dto.revokes)];
    const invalid = [...grants, ...revokes].filter((key) => !isPermissionKey(key));
    if (invalid.length > 0) {
      throw new BadRequestException(`Unknown permission keys: ${invalid.join(', ')}`);
    }
    const overlap = grants.filter((key) => revokes.includes(key));
    if (overlap.length > 0) {
      throw new BadRequestException(`Cannot both grant and revoke the same permission: ${overlap.join(', ')}`);
    }

    const target = await this.findTargetOrFail(actor, targetId);
    assertCanManageTarget(actor.role, target.role);

    // Privilege-escalation guard: you can only grant what you already hold.
    const actorPermissions = await this.rbac.effectivePermissions(
      actor.id,
      actor.organizationId,
      actor.role,
    );
    const notHeld = grants.filter((key) => !actorPermissions.has(key));
    if (notHeld.length > 0) {
      throw new ForbiddenException(`You cannot grant permissions you do not hold: ${notHeld.join(', ')}`);
    }
    if (target.id === actor.id) {
      throw new BadRequestException('You cannot change your own permission overrides.');
    }

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: target.id } }),
      this.prisma.userPermission.createMany({
        data: [
          ...grants.map((permissionKey) => ({
            userId: target.id,
            permissionKey,
            granted: true,
            grantedById: actor.id,
          })),
          ...revokes.map((permissionKey) => ({
            userId: target.id,
            permissionKey,
            granted: false,
            grantedById: actor.id,
          })),
        ],
      }),
    ]);
    this.rbac.invalidateCache?.(target.id);

    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'USER_PERMISSIONS_CHANGED',
      entityType: 'User',
      entityId: target.id,
      metadata: { grants, revokes },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { userId: target.id, grants, revokes };
  }

  permissionCatalog() {
    return Object.values(PERMISSIONS);
  }

  private async findTargetOrFail(actor: AuthUser, targetId: string): Promise<User> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!target) throw new NotFoundException('User not found.');
    return target;
  }
}
