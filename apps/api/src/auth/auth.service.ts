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
import { AuditService } from '../audit/audit.service';
import {
  JWT_ACCESS_AUDIENCE,
  JWT_ISSUER,
  JWT_RESET_AUDIENCE,
  buildOtpAuthUri,
  computeSessionFingerprint,
  decryptAtRest,
  deriveDomainSecret,
  encryptAtRest,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  revokeUserSessionsNow,
  verifyTotpCode,
} from '../common/security';
import type { AuthUser, RequestMeta } from '../common/types';
import { config } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';

const INVALID_CREDENTIALS = 'Email or password is incorrect.';
const MAX_REFRESH_CACHE_SIZE = 2_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface StoredTwoFactorPayload {
  secret: string;
  backupHashes: string[];
  pending?: boolean;
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
    companyId: user.companyId ?? null,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    organizationId: user.organizationId,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function validatePasswordStrength(password: string): void {
  if (password.length < 12) throw new ConflictException('Password must be at least 12 characters.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ConflictException('Password must include letters and numbers.');
  }
}

function parseTwoFactorPayload(encrypted: string | null | undefined): StoredTwoFactorPayload | null {
  if (!encrypted) return null;
  try {
    const raw = decryptAtRest(encrypted);
    const parsed = JSON.parse(raw) as Partial<StoredTwoFactorPayload>;
    if (typeof parsed.secret === 'string' && parsed.secret.length >= 16) {
      return {
        secret: parsed.secret,
        backupHashes: Array.isArray(parsed.backupHashes) ? parsed.backupHashes : [],
        pending: Boolean(parsed.pending),
      };
    }
  } catch {
    // Legacy / plain fallback never trusted unless valid base32
  }
  return null;
}

@Injectable()
export class AuthService {
  private readonly refreshTokenCache = new Map<
    string,
    {
      id: string;
      organizationId: string;
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      graceReplays?: number;
      user: User;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private pruneRefreshCache(): void {
    if (this.refreshTokenCache.size < MAX_REFRESH_CACHE_SIZE) return;
    const now = Date.now();
    for (const [k, v] of this.refreshTokenCache.entries()) {
      if (v.expiresAt.getTime() < now || (v.revokedAt && now - v.revokedAt.getTime() > 65_000)) {
        this.refreshTokenCache.delete(k);
      }
      if (this.refreshTokenCache.size < MAX_REFRESH_CACHE_SIZE * 0.8) return;
    }
    while (this.refreshTokenCache.size >= MAX_REFRESH_CACHE_SIZE) {
      const oldest = this.refreshTokenCache.keys().next().value;
      if (!oldest) break;
      this.refreshTokenCache.delete(oldest);
    }
  }

  async login(
    email: string,
    password: string,
    meta: RequestMeta,
    totpCode?: string,
  ): Promise<
    | { requiresTwoFactor: true; message: string; user?: undefined; tokens?: undefined }
    | { requiresTwoFactor?: false; user: AuthUser; tokens: TokenPair }
  > {
    const raw = email.trim();
    const normalizedEmail = raw.toLowerCase();
    const normalizedCompanyId = raw.toUpperCase();
    const emailCandidates = [normalizedEmail];

    const user = this.prisma.findUserByIdentifierCached
      ? await this.prisma.findUserByIdentifierCached(emailCandidates, normalizedCompanyId)
      : await this.prisma.user.findFirst({
          where: {
            deletedAt: null,
            OR: [
              { email: { in: emailCandidates } },
              { companyId: normalizedCompanyId },
            ],
          },
        });

    if (!user) {
      await argon2.verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        'This account is temporarily locked after too many failed attempts. Try again later.',
        423,
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

    // Enforce TOTP 2FA when enabled on the account
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tf = parseTwoFactorPayload(user.twoFactorSecret);
      if (tf && !tf.pending) {
        const cleanCode = String(totpCode ?? '').trim();
        if (!cleanCode) {
          return {
            requiresTwoFactor: true,
            message: 'Enter the 6-digit verification code from your authenticator app.',
          };
        }
        const totpValid = verifyTotpCode(user.id, tf.secret, cleanCode);
        let usedBackupHash: string | null = null;
        if (!totpValid) {
          const candidateHash = hashBackupCode(cleanCode);
          if (tf.backupHashes.includes(candidateHash)) {
            usedBackupHash = candidateHash;
          }
        }
        if (!totpValid && !usedBackupHash) {
          await this.recordFailedLogin(user, meta);
          throw new UnauthorizedException('Invalid two-factor authentication code.');
        }
        if (usedBackupHash) {
          const updatedTf: StoredTwoFactorPayload = {
            ...tf,
            backupHashes: tf.backupHashes.filter((h) => h !== usedBackupHash),
          };
          const reencrypted = encryptAtRest(JSON.stringify(updatedTf));
          user.twoFactorSecret = reencrypted;
          await this.prisma.user
            .update({ where: { id: user.id }, data: { twoFactorSecret: reencrypted } })
            .catch(() => undefined);
        }
      }
    }

    const now = new Date();
    const updatedUser: User = {
      ...user,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: now,
    };
    this.prisma.upsertUserInCache?.(updatedUser);

    const [tokens] = await Promise.all([
      this.issueTokens(updatedUser, randomUUID(), meta),
      this.prisma.user
        .update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
        })
        .catch(() => undefined),
      this.audit.log({
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'User',
        entityId: user.id,
        metadata: user.twoFactorEnabled ? { mfa: 'TOTP' } : undefined,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    ]);

    return { user: toAuthUser(updatedUser), tokens };
  }

  private async recordFailedLogin(user: User, meta: RequestMeta): Promise<void> {
    const failures = user.failedLoginCount + 1;
    const shouldLock = failures >= config.maxFailedLogins;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + config.lockoutMinutes * 60_000)
      : null;

    const updatedUser: User = {
      ...user,
      failedLoginCount: shouldLock ? 0 : failures,
      lockedUntil,
    };
    this.prisma.upsertUserInCache?.(updatedUser);

    await Promise.all([
      this.prisma.user
        .update({
          where: { id: user.id },
          data: {
            failedLoginCount: shouldLock ? 0 : failures,
            lockedUntil,
          },
        })
        .catch(() => undefined),
      this.audit.log({
        organizationId: user.organizationId,
        actorId: user.id,
        action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        metadata: { failures },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    ]);
  }

  /** Rotates a refresh token. Presenting an already-rotated token revokes the whole family. */
  async refresh(rawRefreshToken: string | undefined, meta: RequestMeta) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    const hashed = hashToken(rawRefreshToken);
    let record = this.refreshTokenCache.get(hashed) ?? null;
    if (!record) {
      const dbRec = await this.prisma.refreshToken.findUnique({
        where: { tokenHash: hashed },
        include: { user: true },
      });
      record = dbRec ? { ...dbRec, graceReplays: 0 } : null;
    }

    if (!record) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    if (record.revokedAt) {
      const revokedAgoMs = Date.now() - new Date(record.revokedAt).getTime();
      const graceReplays = record.graceReplays ?? 0;
      // Bounded 60s grace window (max 2 retries) for 3G/mobile networks where a retry or concurrent tab presents a just-rotated token
      if (revokedAgoMs <= 60_000 && graceReplays < 2) {
        record.graceReplays = graceReplays + 1;
        const graceUser = (await this.prisma.findActiveUserCached?.(record.userId)) ?? record.user;
        if (record.expiresAt >= new Date() && !graceUser.deletedAt && graceUser.status === UserStatus.ACTIVE) {
          const tokens = await this.issueTokens(graceUser, record.familyId, meta);
          return { user: toAuthUser(graceUser), tokens };
        }
      }
      for (const rt of this.refreshTokenCache.values()) {
        if (rt.familyId === record.familyId && !rt.revokedAt) {
          rt.revokedAt = new Date();
        }
      }
      void this.prisma.refreshToken
        .updateMany({
          where: { familyId: record.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
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

    const user = (await this.prisma.findActiveUserCached?.(record.userId)) ?? record.user;
    if (record.expiresAt < new Date() || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }

    record.revokedAt = new Date();
    const [, tokens] = await Promise.all([
      this.prisma.refreshToken
        .update({
          where: { id: record.id },
          data: { revokedAt: record.revokedAt },
        })
        .catch(() => undefined),
      this.issueTokens(user, record.familyId, meta),
    ]);
    return { user: toAuthUser(user), tokens };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const hashed = hashToken(rawRefreshToken);
    const cached = this.refreshTokenCache.get(hashed);
    const hardRevokedAt = new Date(0);
    if (cached) {
      for (const [key, rt] of this.refreshTokenCache.entries()) {
        if (rt.familyId === cached.familyId) {
          this.refreshTokenCache.delete(key);
        }
      }
    }
    try {
      const record =
        cached ??
        (await this.prisma.refreshToken.findUnique({
          where: { tokenHash: hashed },
        }));
      if (!record) return;
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: hardRevokedAt },
      });
    } catch {
      // Ignore logout background errors
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const user =
      (await this.prisma.findActiveUserCached?.(userId)) ??
      (await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));

    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (currentPassword === newPassword) {
      throw new ConflictException('New password must be different from the current password.');
    }
    validatePasswordStrength(newPassword);

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    this.prisma.upsertUserInCache?.({
      ...user,
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    });
    revokeUserSessionsNow(userId);
    for (const [key, rt] of this.refreshTokenCache.entries()) {
      if (rt.userId === userId) {
        this.refreshTokenCache.delete(key);
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    void this.prisma.refreshToken
      .updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(0) },
      })
      .catch(() => undefined);

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

  /**
   * Signs a domain-separated single-use password-reset/activation JWT.
   * Never returned to anonymous callers; only sent via verified email or issued to HR/Super Admin.
   */
  async signPasswordResetToken(
    user: { id: string; email: string; passwordHash: string },
    expiresIn: string | number = '1h',
  ): Promise<string> {
    const fp = createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 16);
    return this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        fp,
        typ: 'password-reset',
        purpose: 'password-reset',
      },
      {
        secret: deriveDomainSecret('password-reset-jwt'),
        issuer: JWT_ISSUER,
        audience: JWT_RESET_AUDIENCE,
        expiresIn,
      },
    );
  }

  async forgotPassword(
    email: string,
    meta: RequestMeta,
  ): Promise<{ ok: boolean; message: string; deliveryChannel: 'EMAIL' | 'ADMIN_APPROVAL' }> {
    const raw = email.trim();
    const normalizedEmail = raw.toLowerCase();
    const normalizedCompanyId = raw.toUpperCase();
    const emailCandidates = [normalizedEmail];

    const user = this.prisma.findUserByIdentifierCached
      ? await this.prisma.findUserByIdentifierCached(emailCandidates, normalizedCompanyId)
      : await this.prisma.user.findFirst({
          where: {
            deletedAt: null,
            OR: [
              { email: { in: emailCandidates } },
              { companyId: normalizedCompanyId },
            ],
          },
        });

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const deliveryChannel: 'EMAIL' | 'ADMIN_APPROVAL' = resendApiKey ? 'EMAIL' : 'ADMIN_APPROVAL';
    const defaultMessage = resendApiKey
      ? 'If an active account matches this Company ID or email, a single-use recovery link has been sent to the registered email.'
      : 'If an active account matches this Company ID or email, your recovery request has been logged for HR / Super Admin verification.';

    if (!user || user.status !== UserStatus.ACTIVE) {
      // Timing-safe delay to prevent account enumeration
      await argon2.verify(await getDummyHash(), normalizedEmail).catch(() => false);
      return { ok: true, message: defaultMessage, deliveryChannel };
    }

    const resetToken = await this.signPasswordResetToken(user, '1h');
    const origin = config.webOrigins[0] ?? 'http://localhost:3000';
    const resetUrl = `${origin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

    if (resendApiKey) {
      const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || 'security@yakunex.com';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Yakunex Hub Security <${fromEmail}>`,
          to: [user.email],
          subject: 'Reset your Yakunex Hub password',
          html: `<p>Hello ${user.fullName},</p><p>A password reset was requested for your Yakunex Hub account (${user.companyId ?? user.email}).</p><p><a href="${resetUrl}">Reset Password (valid for 1 hour)</a></p><p>If you did not request this, ignore this email.</p>`,
        }),
      }).catch(() => undefined);
    }

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: {
        identifier: normalizedEmail,
        companyId: user.companyId,
        deliveryChannel,
      },
    });

    // SECURITY: Never return resetToken or resetUrl in the HTTP response body!
    return {
      ok: true,
      message: defaultMessage,
      deliveryChannel,
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<{ ok: boolean; message: string }> {
    validatePasswordStrength(newPassword);

    let payload: { sub: string; email: string; fp: string; purpose?: string; typ?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: deriveDomainSecret('password-reset-jwt'),
        issuer: JWT_ISSUER,
        audience: JWT_RESET_AUDIENCE,
      });
    } catch {
      throw new BadRequestException('Password reset link is invalid or has expired. Please request a new one.');
    }

    if ((payload.purpose !== 'password-reset' && payload.typ !== 'password-reset') || !payload.sub) {
      throw new BadRequestException('Invalid password reset token.');
    }

    const user =
      (await this.prisma.findActiveUserCached?.(payload.sub)) ??
      (await this.prisma.user.findUnique({
        where: { id: payload.sub },
      }));

    if (!user || user.deletedAt) {
      throw new NotFoundException('User account no longer exists.');
    }

    const currentFp = createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 16);
    if (currentFp !== payload.fp) {
      throw new BadRequestException('This reset link has already been used. Please request a new one.');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    this.prisma.upsertUserInCache?.({
      ...user,
      passwordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    });
    revokeUserSessionsNow(user.id);
    for (const [k, rt] of this.refreshTokenCache.entries()) {
      if (rt.userId === user.id) {
        this.refreshTokenCache.delete(k);
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    void this.prisma.refreshToken
      .deleteMany({
        where: { userId: user.id },
      })
      .catch(() => undefined);

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

  // ─── Authenticator App Two-Factor Authentication (TOTP RFC 6238) ───────────

  async getTwoFactorStatus(userId: string) {
    const user =
      (await this.prisma.findActiveUserCached?.(userId)) ??
      (await this.prisma.user.findUnique({ where: { id: userId } }));
    if (!user) throw new NotFoundException('User not found.');
    const tf = parseTwoFactorPayload(user.twoFactorSecret);
    return {
      enabled: Boolean(user.twoFactorEnabled && tf && !tf.pending),
      remainingBackupCodes: user.twoFactorEnabled && tf ? tf.backupHashes.length : 0,
    };
  }

  async setupTwoFactor(actor: AuthUser, meta: RequestMeta) {
    const user =
      (await this.prisma.findActiveUserCached?.(actor.id)) ??
      (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } }));
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already enabled on your account.');
    }
    const secret = generateTotpSecret();
    const pendingPayload: StoredTwoFactorPayload = {
      secret,
      backupHashes: [],
      pending: true,
    };
    const encrypted = encryptAtRest(JSON.stringify(pendingPayload));
    this.prisma.upsertUserInCache?.({ ...user, twoFactorSecret: encrypted });
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { twoFactorSecret: encrypted, twoFactorEnabled: false },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'TWO_FACTOR_SETUP_STARTED',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return {
      secret,
      issuer: 'Yakunex Hub',
      account: actor.companyId ? `${actor.companyId} (${actor.email})` : actor.email,
      otpauthUri: buildOtpAuthUri(actor.companyId || actor.email, secret, 'Yakunex Hub'),
    };
  }

  async enableTwoFactor(actor: AuthUser, code: string, meta: RequestMeta) {
    const user =
      (await this.prisma.findActiveUserCached?.(actor.id)) ??
      (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } }));
    const tf = parseTwoFactorPayload(user.twoFactorSecret);
    if (!tf) {
      throw new BadRequestException('Start 2FA setup first before verifying a code.');
    }
    if (!verifyTotpCode(actor.id, tf.secret, code)) {
      throw new BadRequestException('Invalid 6-digit code. Check your authenticator app clock and try again.');
    }
    const backupCodes = generateBackupCodes(8);
    const activePayload: StoredTwoFactorPayload = {
      secret: tf.secret,
      backupHashes: backupCodes.map(hashBackupCode),
      pending: false,
    };
    const encrypted = encryptAtRest(JSON.stringify(activePayload));
    this.prisma.upsertUserInCache?.({
      ...user,
      twoFactorEnabled: true,
      twoFactorSecret: encrypted,
      updatedAt: new Date(),
    });
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { twoFactorEnabled: true, twoFactorSecret: encrypted },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'TWO_FACTOR_ENABLED',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return {
      ok: true,
      enabled: true,
      backupCodes,
      message: 'Two-factor authentication is now active. Save your recovery codes in a safe place.',
    };
  }

  async disableTwoFactor(actor: AuthUser, password: string, code: string | undefined, meta: RequestMeta) {
    const user =
      (await this.prisma.findActiveUserCached?.(actor.id)) ??
      (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } }));
    const passOk = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passOk) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const tf = parseTwoFactorPayload(user.twoFactorSecret);
    if (user.twoFactorEnabled && tf && !tf.pending && code) {
      const okTotp = verifyTotpCode(actor.id, tf.secret, code);
      const okBackup = tf.backupHashes.includes(hashBackupCode(code));
      if (!okTotp && !okBackup) {
        throw new UnauthorizedException('Invalid 2FA verification code.');
      }
    }
    this.prisma.upsertUserInCache?.({
      ...user,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      updatedAt: new Date(),
    });
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'TWO_FACTOR_DISABLED',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { ok: true, enabled: false };
  }

  /** Step-up re-authentication check for high-risk administrative actions. */
  async verifyStepUpPassword(actor: AuthUser, password: string, meta: RequestMeta) {
    const user =
      (await this.prisma.findActiveUserCached?.(actor.id)) ??
      (await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } }));
    const ok = await argon2.verify(user.passwordHash, String(password ?? '')).catch(() => false);
    if (!ok) {
      await this.audit.log({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: 'STEP_UP_VERIFICATION_FAILED',
        entityType: 'User',
        entityId: actor.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Incorrect password. High-security action cancelled.');
    }
    return { ok: true, verifiedAt: new Date().toISOString() };
  }

  async listActiveSessions(userId: string) {
    try {
      const rows = await this.prisma.refreshToken.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
        },
      });
      return rows;
    } catch {
      return [];
    }
  }

  async logoutAllDevices(actor: AuthUser, meta: RequestMeta) {
    revokeUserSessionsNow(actor.id);
    for (const [k, rt] of this.refreshTokenCache.entries()) {
      if (rt.userId === actor.id) {
        this.refreshTokenCache.delete(k);
      }
    }
    await this.prisma.refreshToken
      .updateMany({
        where: { userId: actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'LOGOUT_ALL_DEVICES',
      entityType: 'User',
      entityId: actor.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return { ok: true, message: 'Signed out from all active devices.' };
  }

  private async issueTokens(user: User, familyId: string, meta: RequestMeta): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        org: user.organizationId,
        role: user.role,
        typ: 'access',
        fp: computeSessionFingerprint(user),
      },
      {
        secret: deriveDomainSecret('access-jwt'),
        issuer: JWT_ISSUER,
        audience: JWT_ACCESS_AUDIENCE,
        expiresIn: config.accessTokenTtlSeconds,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000);
    const recordId = randomUUID();

    this.pruneRefreshCache();
    this.refreshTokenCache.set(tokenHash, {
      id: recordId,
      organizationId: user.organizationId,
      userId: user.id,
      familyId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      graceReplays: 0,
      user,
    });

    await this.prisma.refreshToken
      .create({
        data: {
          id: recordId,
          organizationId: user.organizationId,
          userId: user.id,
          familyId,
          tokenHash,
          userAgent: meta.userAgent?.slice(0, 500),
          ipAddress: meta.ipAddress,
          expiresAt,
        },
      })
      .catch(() => undefined);

    return { accessToken, refreshToken };
  }
}
