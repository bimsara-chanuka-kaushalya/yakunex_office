import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuditService } from '../audit/audit.service';
import {
  assertSafeAttachmentUrl,
  assertSafeAvatarUrl,
  generateSecureRoomCode,
  generateTotpCode,
} from '../common/security';
import { config } from '../config/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, hashToken, validatePasswordStrength } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('AuthService, HKDF JWT Separation, 2FA TOTP & Enterprise Security', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('YakunexHub2026!', { type: argon2.argon2id });
  });

  function createUser(overrides: Partial<User> = {}): User {
    return {
      id: 'usr_1',
      organizationId: 'org_1',
      companyId: 'YNX-STF-0001',
      email: 'staff@yakunex.local',
      fullName: 'Test Staff',
      phone: null,
      avatarUrl: null,
      title: 'Software Engineer',
      departmentId: null,
      timezone: 'Asia/Colombo',
      passwordHash,
      role: Role.STAFF,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createHarness(initialUser: User) {
    let userState = { ...initialUser };
    const refreshStore = new Map<
      string,
      {
        id: string;
        organizationId: string;
        userId: string;
        familyId: string;
        tokenHash: string;
        expiresAt: Date;
        revokedAt: Date | null;
        user: User;
      }
    >();

    const prismaStub = {
      findUserByIdentifierCached: jest.fn(async (emails: string[], companyId: string) => {
        if (userState.deletedAt) return null;
        if (emails.includes(userState.email) || userState.companyId === companyId) {
          return { ...userState };
        }
        return null;
      }),
      findActiveUserCached: jest.fn(async (id: string) => {
        if (userState.id === id && !userState.deletedAt) return { ...userState };
        return null;
      }),
      upsertUserInCache: jest.fn((u: User) => {
        userState = { ...u };
      }),
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          userState.id === where.id ? { ...userState } : null,
        ),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (userState.id !== where.id) throw new Error('Not found');
          return { ...userState };
        }),
        update: jest.fn(async ({ data }: { data: Partial<User> }) => {
          userState = { ...userState, ...data };
          return userState;
        }),
      },
      refreshToken: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = {
            id: String(data.id),
            organizationId: String(data.organizationId),
            userId: String(data.userId),
            familyId: String(data.familyId),
            tokenHash: String(data.tokenHash),
            expiresAt: data.expiresAt as Date,
            revokedAt: null,
            user: userState,
          };
          refreshStore.set(rec.tokenHash, rec);
          return rec;
        }),
        findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
          return refreshStore.get(where.tokenHash) ?? null;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: { revokedAt?: Date } }) => {
          for (const rec of refreshStore.values()) {
            if (rec.id === where.id) {
              if (data.revokedAt) rec.revokedAt = data.revokedAt;
              return rec;
            }
          }
          return null;
        }),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { familyId?: string; revokedAt?: null };
            data: { revokedAt: Date };
          }) => {
            let count = 0;
            for (const rec of refreshStore.values()) {
              if (where.familyId && rec.familyId !== where.familyId) continue;
              if (where.revokedAt === null && rec.revokedAt !== null) continue;
              rec.revokedAt = data.revokedAt;
              count += 1;
            }
            return { count };
          },
        ),
        deleteMany: jest.fn(async () => {
          refreshStore.clear();
          return { count: 1 };
        }),
      },
    } as unknown as PrismaService;

    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const jwt = new JwtService({ secret: config.jwtAccessSecret });
    const service = new AuthService(prismaStub, jwt, auditStub);

    return {
      service,
      jwt,
      prismaStub,
      auditStub,
      refreshStore,
      getUser: () => userState,
      setUser: (u: User) => {
        userState = u;
      },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enforces strong password rules', () => {
    expect(() => validatePasswordStrength('short1')).toThrow();
    expect(() => validatePasswordStrength('alllettersonlypassword')).toThrow();
    expect(() => validatePasswordStrength('12345678901234')).toThrow();
    expect(() => validatePasswordStrength('YakunexHub2026!')).not.toThrow();
  });

  it('logs in valid user, issues access + refresh tokens, and locks account on repeated failures', async () => {
    const user = createUser();
    const { service, getUser, auditStub } = createHarness(user);
    const meta = { ipAddress: '127.0.0.1', userAgent: 'Jest' };

    const result = await service.login('staff@yakunex.local', 'YakunexHub2026!', meta);
    expect(result.requiresTwoFactor).toBeFalsy();
    if (result.requiresTwoFactor) throw new Error('Unexpected 2FA');
    expect(result.user.email).toBe('staff@yakunex.local');
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
    expect(auditStub.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_SUCCESS' }));

    for (let i = 1; i <= config.maxFailedLogins; i += 1) {
      await expect(service.login('staff@yakunex.local', 'WrongPass123!', meta)).rejects.toThrow(
        UnauthorizedException,
      );
    }

    expect(getUser().lockedUntil).not.toBeNull();
    await expect(service.login('staff@yakunex.local', 'YakunexHub2026!', meta)).rejects.toThrow(
      HttpException,
    );
  });

  it('blocks login for suspended users with ForbiddenException', async () => {
    const suspended = createUser({ status: UserStatus.SUSPENDED });
    const { service } = createHarness(suspended);

    await expect(
      service.login('staff@yakunex.local', 'YakunexHub2026!', { ipAddress: '127.0.0.1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rotates refresh token, honors bounded 60s 3G retry grace window, and revokes family after grace expires', async () => {
    const user = createUser();
    const { service, auditStub, refreshStore } = createHarness(user);
    const meta = { ipAddress: '127.0.0.1', userAgent: '3G-Mobile' };

    const loginRes = await service.login('staff@yakunex.local', 'YakunexHub2026!', meta);
    if (loginRes.requiresTwoFactor) throw new Error('Unexpected 2FA');
    const rt1 = loginRes.tokens.refreshToken;

    const rot1 = await service.refresh(rt1, meta);
    expect(rot1.tokens.refreshToken).not.toBe(rt1);

    const graceRes = await service.refresh(rt1, meta);
    expect(graceRes.tokens.accessToken).toBeTruthy();
    expect(graceRes.tokens.refreshToken).toBeTruthy();
    expect(auditStub.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );

    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 65_000);
    await expect(service.refresh(rt1, meta)).rejects.toThrow(UnauthorizedException);
    expect(auditStub.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );

    const rt2Hash = hashToken(rot1.tokens.refreshToken);
    expect(refreshStore.get(rt2Hash)?.revokedAt).not.toBeNull();
  });

  it('never leaks resetToken in forgotPassword HTTP response and enforces single-use HKDF reset tokens', async () => {
    const user = createUser({ id: 'usr_reset_1', mustChangePassword: true });
    const { service, getUser } = createHarness(user);
    const meta = { ipAddress: '127.0.0.1', userAgent: 'Jest' };

    const loginById = await service.login('ynx-stf-0001', 'YakunexHub2026!', meta);
    if (loginById.requiresTwoFactor) throw new Error('Unexpected 2FA');
    expect(loginById.user.companyId).toBe('YNX-STF-0001');

    await expect(
      service.changePassword(user.id, 'YakunexHub2026!', 'YakunexHub2026!', meta),
    ).rejects.toThrow(ConflictException);
    await service.changePassword(user.id, 'YakunexHub2026!', 'NewPassword2026!', meta);
    expect(getUser().mustChangePassword).toBe(false);

    // Public forgotPassword must NEVER expose resetToken or resetUrl in JSON
    const forgot = await service.forgotPassword('YNX-STF-0001', meta);
    expect(forgot.ok).toBe(true);
    expect((forgot as Record<string, unknown>).resetToken).toBeUndefined();
    expect((forgot as Record<string, unknown>).resetUrl).toBeUndefined();

    // Admin/Email-issued HKDF reset token works once and fails on replay
    const signedToken = await service.signPasswordResetToken(getUser(), '1h');
    const reset = await service.resetPassword(signedToken, 'ResetPassword2026!', meta);
    expect(reset.ok).toBe(true);

    await expect(
      service.resetPassword(signedToken, 'AnotherPass2026!', meta),
    ).rejects.toThrow(BadRequestException);

    const relogin = await service.login('staff@yakunex.local', 'ResetPassword2026!', meta);
    if (relogin.requiresTwoFactor) throw new Error('Unexpected 2FA');
    await service.logout(relogin.tokens.refreshToken);
    await expect(service.refresh(relogin.tokens.refreshToken, meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects password-reset tokens in JwtAuthGuard and enforces mustChangePassword on API routes', async () => {
    const user = createUser({ id: 'usr_guard_1', mustChangePassword: true });
    const { service, jwt, prismaStub, getUser } = createHarness(user);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector, jwt, prismaStub);

    const makeCtx = (bearer: string) =>
      ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: `Bearer ${bearer}` }, cookies: {} }),
        }),
      }) as unknown as ExecutionContext;

    // 1. A password-reset / invite token CANNOT be used as an API access token
    const resetToken = await service.signPasswordResetToken(getUser(), '72h');
    await expect(guard.canActivate(makeCtx(resetToken))).rejects.toThrow(UnauthorizedException);

    // 2. A user with mustChangePassword=true is blocked from normal API routes with 403
    const loginRes = await service.login('staff@yakunex.local', 'YakunexHub2026!', {});
    if (loginRes.requiresTwoFactor) throw new Error('Unexpected 2FA');
    await expect(guard.canActivate(makeCtx(loginRes.tokens.accessToken))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('supports TOTP 2FA setup, OTP verification, backup codes, and disable flow', async () => {
    const user = createUser({ id: 'usr_2fa_1' });
    const { service } = createHarness(user);
    const meta = { ipAddress: '127.0.0.1', userAgent: 'Jest' };
    const actor = {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      organizationId: user.organizationId,
      mustChangePassword: false,
    };

    const setup = await service.setupTwoFactor(actor, meta);
    expect(setup.secret).toBeTruthy();
    expect(setup.otpauthUri).toContain('otpauth://totp/');

    const validCode = generateTotpCode(setup.secret, Date.now() - 30_000);
    const enabled = await service.enableTwoFactor(actor, validCode, meta);
    expect(enabled.enabled).toBe(true);
    expect(enabled.backupCodes).toHaveLength(8);

    // Login without totpCode returns requiresTwoFactor challenge without issuing tokens
    const step1 = await service.login(user.email, 'YakunexHub2026!', meta);
    expect(step1.requiresTwoFactor).toBe(true);

    // Login with backup code succeeds and consumes that backup code
    const backup = enabled.backupCodes[0];
    const step2 = await service.login(user.email, 'YakunexHub2026!', meta, backup);
    expect(step2.requiresTwoFactor).toBeFalsy();

    // Reusing the same backup code fails
    await expect(
      service.login(user.email, 'YakunexHub2026!', meta, backup),
    ).rejects.toThrow(UnauthorizedException);

    // Disable 2FA with password
    const disabled = await service.disableTwoFactor(actor, 'YakunexHub2026!', undefined, meta);
    expect(disabled.enabled).toBe(false);
  });

  it('blocks XSS data URLs in attachments/avatars and generates high-entropy room codes', () => {
    expect(() => assertSafeAttachmentUrl('javascript:alert(1)')).toThrow(BadRequestException);
    expect(() => assertSafeAttachmentUrl('data:text/html;base64,PHNjcmlwdD4=')).toThrow(BadRequestException);
    expect(() => assertSafeAttachmentUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(BadRequestException);
    expect(assertSafeAttachmentUrl('data:application/pdf;base64,JVBERi0xLjQK')).toContain('data:application/pdf');
    expect(() => assertSafeAvatarUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow(BadRequestException);
    expect(assertSafeAvatarUrl('data:image/png;base64,iVBORw0KGgo=')).toContain('data:image/png');
    expect(generateSecureRoomCode()).toMatch(/^YH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});
