import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
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

    const [, tokens] = await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
      this.issueTokens(user, randomUUID(), meta),
    ]);
    this.prisma.invalidateUserCache?.(user.id);
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
    this.prisma.invalidateUserCache?.(userId);

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

  async forgotPassword(
    email: string,
    meta: RequestMeta,
  ): Promise<{ ok: boolean; message: string; resetToken?: string; resetUrl?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalizedEmail, deletedAt: null },
    });

    const defaultMessage = 'If an account exists with this email, a password reset link has been generated.';
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { ok: true, message: defaultMessage };
    }

    const secret = config.jwtAccessSecret;
    const fp = createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 16);
    const resetToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        fp,
        purpose: 'password-reset',
      },
      {
        secret,
        expiresIn: '1h',
      },
    );

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { email: normalizedEmail },
    });

    const resetUrl = `/reset-password?token=${encodeURIComponent(resetToken)}`;

    return {
      ok: true,
      message: defaultMessage,
      resetToken,
      resetUrl,
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<{ ok: boolean; message: string }> {
    validatePasswordStrength(newPassword);

    let payload: { sub: string; email: string; fp: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: config.jwtAccessSecret });
    } catch {
      throw new BadRequestException('Password reset link is invalid or has expired. Please request a new one.');
    }

    if (payload.purpose !== 'password-reset' || !payload.sub) {
      throw new BadRequestException('Invalid password reset token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('User account no longer exists.');
    }

    const currentFp = createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 16);
    if (currentFp !== payload.fp) {
      throw new BadRequestException('This reset link has already been used. Please request a new one.');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: user.id },
      }),
    ]);
    this.prisma.invalidateUserCache?.(user.id);

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { ok: true, message: 'Password has been reset successfully. You can now sign in.' };
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
