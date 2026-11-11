import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { config } from '../config/config';
import type { AuthUser, RequestMeta } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const INVALID_CREDENTIALS = 'Email or password is incorrect.';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Hash used to keep response time similar when the email does not exist. */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  return (dummyHash ??= argon2.hash(randomBytes(24).toString('hex'), { type: argon2.argon2id }));
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    organizationId: user.organizationId,
    mustChangePassword: user.mustChangePassword,
  };
}

export function validatePasswordStrength(password: string): void {
  if (password.length < 12) throw new ConflictException('Password must be at least 12 characters.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ConflictException('Password must include letters and numbers.');
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    if (!user) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'This account is temporarily locked after too many failed attempts. Try again later.',
        423, // HTTP 423 Locked
      );
    }

    const passwordOk = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordOk) {
      await this.recordFailedLogin(user, meta);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('This account is not active. Contact your administrator.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user, randomUUID(), meta);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { user: toAuthUser(user), tokens };
  }

  private async recordFailedLogin(user: User, meta: RequestMeta): Promise<void> {
    const failures = user.failedLoginCount + 1;
    const shouldLock = failures >= config.maxFailedLogins;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + config.lockoutMinutes * 60_000)
      : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : failures,
        lockedUntil,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      metadata: { failures },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  /** Rotates a refresh token. Presenting an already-rotated token revokes the whole family. */
  async refresh(rawRefreshToken: string | undefined, meta: RequestMeta) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({
        organizationId: record.organizationId,
        actorId: record.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'User',
        entityId: record.userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    const user = record.user;
    if (record.expiresAt < new Date() || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user, record.familyId, meta);
    return { user: toAuthUser(user), tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawRefreshToken) },
    });
    if (!record) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (currentPassword === newPassword) {
      throw new ConflictException('New password must be different from the current password.');
    }
    validatePasswordStrength(newPassword);

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      // Sign out every session, including this one, so a changed password takes effect everywhere.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private async issueTokens(user: User, familyId: string, meta: RequestMeta): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, org: user.organizationId, role: user.role },
      { secret: config.jwtAccessSecret, expiresIn: config.accessTokenTtlSeconds },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        userAgent: meta.userAgent?.slice(0, 500),
        ipAddress: meta.ipAddress,
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
      },
    });

    return { accessToken, refreshToken };
  }
}
