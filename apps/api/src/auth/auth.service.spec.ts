import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuditService } from '../audit/audit.service';
import { config } from '../config/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService, hashToken, validatePasswordStrength } from './auth.service';

describe('AuthService & 3G Refresh Grace Window', () => {
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
      },
    } as unknown as PrismaService;

    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const jwt = new JwtService({ secret: config.jwtAccessSecret });
    const service = new AuthService(prismaStub, jwt, auditStub);

    return {
      service,
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

  it('rotates refresh token, honors 60s 3G retry grace window, and revokes family after grace expires', async () => {
    const user = createUser();
    const { service, auditStub, refreshStore } = createHarness(user);
    const meta = { ipAddress: '127.0.0.1', userAgent: '3G-Mobile' };

    const loginRes = await service.login('staff@yakunex.local', 'YakunexHub2026!', meta);
    const rt1 = loginRes.tokens.refreshToken;

    // First rotation revokes rt1 and issues rt2
    const rot1 = await service.refresh(rt1, meta);
    expect(rot1.tokens.refreshToken).not.toBe(rt1);

    // Simulated 3G retry with already-rotated rt1 within 60s grace window succeeds cleanly
    const graceRes = await service.refresh(rt1, meta);
    expect(graceRes.tokens.accessToken).toBeTruthy();
    expect(graceRes.tokens.refreshToken).toBeTruthy();
    expect(auditStub.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );

    // Simulate replay beyond the 60s grace window (+65 seconds)
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 65_000);
    await expect(service.refresh(rt1, meta)).rejects.toThrow(UnauthorizedException);
    expect(auditStub.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );

    // Entire token family should now be revoked
    const rt2Hash = hashToken(rot1.tokens.refreshToken);
    expect(refreshStore.get(rt2Hash)?.revokedAt).not.toBeNull();
  });
});

