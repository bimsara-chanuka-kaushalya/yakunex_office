import { config } from '../config/config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  AuditLog,
  Department,
  Organization,
  Prisma,
  PrismaClient,
  RefreshToken,
  Role,
  RolePermission,
  User,
  UserPermission,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { DEFAULT_ROLE_PERMISSIONS, PermissionKey } from '../rbac/permissions';

function buildPooledDatabaseUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const parsed = new URL(rawUrl);
    // Keep a single warm TCP+SSL connection so Prisma never blocks 10-15s opening a 2nd cold socket to remote pooler
    parsed.searchParams.set('connection_limit', '1');
    if (!parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '30');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '30');
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const ROLE_ORDER: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PROJECT_MANAGER,
  Role.STAFF,
  Role.INTERN,
];

function pickSelect<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) out[key] = row[key];
  }
  return out;
}

function matchesUserWhere(user: User, where?: Prisma.UserWhereInput): boolean {
  if (!where) return true;
  if (where.id !== undefined && typeof where.id === 'string' && user.id !== where.id) return false;
  if (
    where.organizationId !== undefined &&
    typeof where.organizationId === 'string' &&
    user.organizationId !== where.organizationId
  ) {
    return false;
  }
  if (where.email !== undefined && typeof where.email === 'string' && user.email !== where.email) {
    return false;
  }
  if (where.companyId !== undefined && typeof where.companyId === 'string' && user.companyId !== where.companyId) {
    return false;
  }
  if (where.deletedAt === null && user.deletedAt !== null) return false;
  if (where.role !== undefined && typeof where.role === 'string' && user.role !== where.role) {
    return false;
  }
  if (where.status !== undefined && typeof where.status === 'string' && user.status !== where.status) {
    return false;
  }
  if (Array.isArray(where.OR) && where.OR.length > 0) {
    const matchedOr = where.OR.some((clause) => {
      const fullNameFilter = clause.fullName as { contains?: string } | undefined;
      const emailFilter = clause.email as { contains?: string; in?: string[] } | string | undefined;
      const companyIdFilter = clause.companyId as { contains?: string } | string | undefined;
      if (fullNameFilter?.contains) {
        if (user.fullName.toLowerCase().includes(fullNameFilter.contains.toLowerCase())) return true;
      }
      if (typeof emailFilter === 'string') {
        if (user.email.toLowerCase() === emailFilter.toLowerCase()) return true;
      } else if (emailFilter?.in) {
        if (emailFilter.in.some((e) => e.toLowerCase() === user.email.toLowerCase())) return true;
      } else if (emailFilter?.contains) {
        if (user.email.toLowerCase().includes(emailFilter.contains.toLowerCase())) return true;
      }
      if (typeof companyIdFilter === 'string') {
        if ((user.companyId ?? '').toUpperCase() === companyIdFilter.toUpperCase()) return true;
      } else if (companyIdFilter?.contains) {
        if ((user.companyId ?? '').toLowerCase().includes(companyIdFilter.contains.toLowerCase())) return true;
      }
      return false;
    });
    if (!matchedOr) return false;
  }
  return true;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private usingInMemory = false;
  private initPromise: Promise<void> | null = null;
  private readonly userCache = new Map<string, { expiresAt: number; user: User | null }>();
  private readonly allUsersCache = new Map<string, User>();

  constructor() {
    const dbUrl = buildPooledDatabaseUrl(config.databaseUrl);
    super({
      datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    });
  }

  upsertUserInCache(user: User): void {
    if (user.deletedAt) {
      this.allUsersCache.delete(user.id);
      this.userCache.delete(user.id);
      return;
    }
    this.allUsersCache.set(user.id, user);
    this.userCache.set(user.id, { expiresAt: Date.now() + 300_000, user });
  }

  getCachedUsers(organizationId?: string): User[] {
    const list = Array.from(this.allUsersCache.values()).filter(
      (u) => !u.deletedAt && (!organizationId || u.organizationId === organizationId),
    );
    return list;
  }

  async findUserByIdentifierCached(emailCandidates: string[], companyId: string): Promise<User | null> {
    const lowerEmails = new Set(emailCandidates.map((e) => e.toLowerCase()));
    const upperCompany = companyId.toUpperCase();
    for (const u of this.allUsersCache.values()) {
      if (u.deletedAt) continue;
      if (lowerEmails.has(u.email.toLowerCase()) || (u.companyId && u.companyId.toUpperCase() === upperCompany)) {
        return u;
      }
    }
    const user = await this.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: { in: emailCandidates } },
          { companyId: upperCompany },
        ],
      },
    });
    if (user) {
      this.upsertUserInCache(user);
    }
    return user;
  }

  async findActiveUserCached(userId: string): Promise<User | null> {
    const memUser = this.allUsersCache.get(userId);
    if (memUser && !memUser.deletedAt) {
      return memUser;
    }
    const now = Date.now();
    const cached = this.userCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }
    const user = await this.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (user) {
      this.upsertUserInCache(user);
    } else {
      this.userCache.set(userId, { expiresAt: now + 60_000, user: null });
    }
    return user;
  }

  invalidateUserCache(userId?: string): void {
    if (userId) {
      this.userCache.delete(userId);
      this.allUsersCache.delete(userId);
    } else {
      this.userCache.clear();
      this.allUsersCache.clear();
    }
  }

  async waitForReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async onModuleInit(): Promise<void> {
    this.initPromise = this.connectAndInitialize();
    await this.initPromise;
  }

  private async connectAndInitialize(): Promise<void> {
    if (!config.databaseUrl) {
      this.usingInMemory = true;
      this.logger.warn('No DATABASE_URL configured; running with in-memory store.');
      await this.enableInMemoryStore();
      return;
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.$connect();
        this.logger.log('✅ Connected to PostgreSQL / Supabase database successfully.');
        await this.ensureCompanyIds();
        await this.ensureDatabaseRls();
        return;
      } catch (error) {
        this.logger.warn(
          `Supabase connection attempt ${attempt}/5 failed: ${(error as Error).message}`,
        );
        if (attempt < 5) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
    this.logger.error(
      'Could not connect on initial boot; Prisma will continue retrying on incoming requests against Supabase PostgreSQL.',
    );
  }

  /** Ensures every user in the database has a unique Company ID (e.g., YNX-0001) and warms the in-memory user cache. */
  private async ensureCompanyIds(): Promise<void> {
    try {
      await this.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
      await this.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_key" ON "User"("companyId");`);
      const allUsers = await this.user.findMany({
        orderBy: { createdAt: 'asc' },
      });
      const used = new Set<string>();
      let maxNum = 0;
      for (const u of allUsers) {
        if (u.companyId) {
          used.add(u.companyId.toUpperCase());
          const match = u.companyId.match(/^YNX-(\d+)$/i);
          if (match) {
            const n = parseInt(match[1], 10);
            if (n > maxNum) maxNum = n;
          }
        }
      }
      for (const u of allUsers) {
        if (!u.companyId) {
          let assigned = '';
          if (
            (u.email === 'admin@yakunexhub.local' || u.email === 'admin@projectflow.local') &&
            !used.has('YNX-0001')
          ) {
            assigned = 'YNX-0001';
            if (maxNum < 1) maxNum = 1;
          } else {
            do {
              maxNum += 1;
              assigned = `YNX-${String(maxNum).padStart(4, '0')}`;
            } while (used.has(assigned));
          }
          used.add(assigned);
          const updated = await this.user.update({
            where: { id: u.id },
            data: { companyId: assigned },
          });
          this.upsertUserInCache(updated);
        } else {
          this.upsertUserInCache(u);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not backfill companyId automatically: ${(err as Error).message}`);
    }
  }

  /**
   * Enforces PostgreSQL Row Level Security (RLS) and revokes anonymous PostgREST access
   * across every table in the public schema so no data can leak outside the API.
   */
  private async ensureDatabaseRls(): Promise<void> {
    try {
      await this.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;`);
      await this.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, PUBLIC;`);
      await this.$executeRawUnsafe(`
        DO $$
        DECLARE
          tbl RECORD;
          has_org_id BOOLEAN;
          has_user_id BOOLEAN;
        BEGIN
          FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
            EXECUTE format('DROP POLICY IF EXISTS "backend_service_full_access" ON public.%I;', tbl.tablename);
            EXECUTE format(
              'CREATE POLICY "backend_service_full_access" ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);',
              tbl.tablename
            );

            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = tbl.tablename AND column_name = 'organizationId'
            ) INTO has_org_id;

            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = tbl.tablename AND column_name = 'userId'
            ) INTO has_user_id;

            IF has_org_id THEN
              EXECUTE format('DROP POLICY IF EXISTS "org_tenant_isolation_policy" ON public.%I;', tbl.tablename);
              EXECUTE format(
                'CREATE POLICY "org_tenant_isolation_policy" ON public.%I FOR SELECT TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''org'') = "organizationId"::text);',
                tbl.tablename
              );
            END IF;

            IF tbl.tablename IN ('RefreshToken', 'UserPermission', 'TimeEntry', 'Attendance', 'LeaveRequest', 'Notification') AND has_user_id THEN
              EXECUTE format('DROP POLICY IF EXISTS "user_self_isolation_policy" ON public.%I;', tbl.tablename);
              EXECUTE format(
                'CREATE POLICY "user_self_isolation_policy" ON public.%I FOR ALL TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "userId"::text) WITH CHECK ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "userId"::text);',
                tbl.tablename
              );
            ELSIF tbl.tablename = 'User' THEN
              EXECUTE format('DROP POLICY IF EXISTS "user_self_read_policy" ON public.%I;', tbl.tablename);
              EXECUTE format(
                'CREATE POLICY "user_self_read_policy" ON public.%I FOR SELECT TO authenticated USING ((current_setting(''request.jwt.claims'', true)::jsonb ->> ''sub'') = "id"::text);',
                tbl.tablename
              );
            END IF;
          END LOOP;
        END $$;
      `);
      this.logger.log('🛡️ Supabase Row Level Security (RLS) verified and active across all public tables.');
    } catch (err) {
      this.logger.warn(`RLS verification note: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.usingInMemory) {
      await this.$disconnect();
    }
  }

  private async enableInMemoryStore(): Promise<void> {
    const now = new Date();
    const org: Organization = {
      id: 'org_yh',
      name: 'Yakunex Hub',
      slug: 'yakunex-hub',
      timezone: 'Asia/Colombo',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const dept: Department = {
      id: 'dept_engineering',
      organizationId: org.id,
      name: 'Engineering',
      description: 'Core software engineering department',
      createdAt: now,
      updatedAt: now,
    };

    const organizations: Organization[] = [org];
    const departments: Department[] = [dept];
    const rolePermissions: RolePermission[] = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as Role[]).flatMap(
      (role) =>
        DEFAULT_ROLE_PERMISSIONS[role].map((permissionKey: PermissionKey) => ({
          id: randomUUID(),
          organizationId: org.id,
          role,
          permissionKey,
          createdAt: now,
        })),
    );
    const userPermissions: UserPermission[] = [];
    const refreshTokens: RefreshToken[] = [];
    const auditLogs: AuditLog[] = [];

    const seedPassword = process.env.SEED_PASSWORD || 'ChangeMe!2026';
    const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });

    // Clean initial admin accounts without fake staff/interns
    const initialAccounts: Array<{ id: string; companyId: string; email: string; fullName: string; title: string; role: Role; departmentId: string | null }> = [
      { id: 'usr_admin', companyId: 'YNX-0001', email: 'admin@yakunexhub.local', fullName: 'Workspace Admin', title: 'System Administrator', role: Role.SUPER_ADMIN, departmentId: dept.id },
      { id: 'usr_yakunex', companyId: 'YNX-0002', email: 'admin@yakunex.com', fullName: 'System Admin', title: 'Administrator', role: Role.SUPER_ADMIN, departmentId: dept.id },
    ];

    const users: User[] = initialAccounts.map((acc) => ({
      id: acc.id,
      organizationId: org.id,
      companyId: acc.companyId,
      email: acc.email,
      passwordHash,
      fullName: acc.fullName,
      phone: null,
      avatarUrl: null,
      title: acc.title,
      role: acc.role,
      status: UserStatus.ACTIVE,
      departmentId: acc.departmentId,
      timezone: 'Asia/Colombo',
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

    const self = this as unknown as Record<string, unknown>;

    self.$queryRaw = async () => [{ '?column?': 1 }];
    self.$disconnect = async () => undefined;
    self.$transaction = async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaService) => Promise<unknown>)(this);
      }
      return [];
    };

    self.organization = {
      findUnique: async ({ where, select }: { where: { id?: string; slug?: string }; select?: Record<string, unknown> }) => {
        const found = organizations.find(
          (o) => (where.id && o.id === where.id) || (where.slug && o.slug === where.slug),
        );
        if (!found) return null;
        return pickSelect(found as unknown as Record<string, unknown>, select);
      },
    };

    self.department = {
      findFirst: async ({ where }: { where: { id?: string; organizationId?: string } }) => {
        return (
          departments.find(
            (d) =>
              (!where.id || d.id === where.id) &&
              (!where.organizationId || d.organizationId === where.organizationId),
          ) ?? null
        );
      },
    };

    self.rolePermission = {
      findMany: async ({
        where,
        select,
      }: {
        where: { organizationId: string; role?: Role };
        select?: Record<string, unknown>;
      }) => {
        return rolePermissions
          .filter(
            (rp) =>
              rp.organizationId === where.organizationId &&
              (!where.role || rp.role === where.role),
          )
          .map((rp) => pickSelect(rp as unknown as Record<string, unknown>, select));
      },
      deleteMany: async ({ where }: { where: { organizationId: string; role: Role } }) => {
        let count = 0;
        for (let i = rolePermissions.length - 1; i >= 0; i--) {
          if (
            rolePermissions[i].organizationId === where.organizationId &&
            rolePermissions[i].role === where.role
          ) {
            rolePermissions.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      createMany: async ({
        data,
      }: {
        data: Array<{ organizationId: string; role: Role; permissionKey: string }>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const item of data) {
          const exists = rolePermissions.some(
            (rp) =>
              rp.organizationId === item.organizationId &&
              rp.role === item.role &&
              rp.permissionKey === item.permissionKey,
          );
          if (!exists) {
            rolePermissions.push({
              id: randomUUID(),
              organizationId: item.organizationId,
              role: item.role,
              permissionKey: item.permissionKey,
              createdAt: new Date(),
            });
            count++;
          }
        }
        return { count };
      },
    };

    self.userPermission = {
      findMany: async ({
        where,
        select,
      }: {
        where: { userId: string };
        select?: Record<string, unknown>;
      }) => {
        return userPermissions
          .filter((up) => up.userId === where.userId)
          .map((up) => pickSelect(up as unknown as Record<string, unknown>, select));
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        let count = 0;
        for (let i = userPermissions.length - 1; i >= 0; i--) {
          if (userPermissions[i].userId === where.userId) {
            userPermissions.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      createMany: async ({
        data,
      }: {
        data: Array<{ userId: string; permissionKey: string; granted: boolean; grantedById?: string | null }>;
      }) => {
        for (const item of data) {
          userPermissions.push({
            id: randomUUID(),
            userId: item.userId,
            permissionKey: item.permissionKey,
            granted: item.granted,
            grantedById: item.grantedById ?? null,
            createdAt: new Date(),
          });
        }
        return { count: data.length };
      },
    };

    self.user = {
      findFirst: async ({ where }: { where?: Prisma.UserWhereInput }) => {
        const found = users.find((u) => matchesUserWhere(u, where));
        return found ? { ...found } : null;
      },
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        const found = users.find(
          (u) => (where.id && u.id === where.id) || (where.email && u.email === where.email),
        );
        return found ? { ...found } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id?: string; email?: string } }) => {
        const found = users.find(
          (u) => (where.id && u.id === where.id) || (where.email && u.email === where.email),
        );
        if (!found) throw new Error('User not found');
        return { ...found };
      },
      findMany: async ({
        where,
        select,
        skip = 0,
        take = 20,
      }: {
        where?: Prisma.UserWhereInput;
        select?: Record<string, unknown>;
        orderBy?: unknown;
        skip?: number;
        take?: number;
      }) => {
        const filtered = users.filter((u) => matchesUserWhere(u, where));
        filtered.sort((a, b) => {
          const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
          if (roleDiff !== 0) return roleDiff;
          return a.fullName.localeCompare(b.fullName);
        });
        return filtered
          .slice(skip, skip + take)
          .map((u) => pickSelect(u as unknown as Record<string, unknown>, select));
      },
      count: async ({ where }: { where?: Prisma.UserWhereInput } = {}) => {
        return users.filter((u) => matchesUserWhere(u, where)).length;
      },
      groupBy: async ({
        by,
        where,
      }: {
        by: Array<'role' | 'status'>;
        where?: Prisma.UserWhereInput;
        _count?: { _all?: boolean };
      }) => {
        const field = by[0];
        const filtered = users.filter((u) => matchesUserWhere(u, where));
        const counts = new Map<string, number>();
        for (const u of filtered) {
          const key = String(u[field]);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([key, count]) => ({
          [field]: key,
          _count: { _all: count },
        }));
      },
      create: async ({
        data,
        select,
      }: {
        data: Partial<User> & { organizationId: string; email: string; fullName: string; passwordHash: string };
        select?: Record<string, unknown>;
      }) => {
        const createdAt = new Date();
        const created: User = {
          id: randomUUID(),
          organizationId: data.organizationId,
          companyId: data.companyId ?? null,
          email: data.email,
          passwordHash: data.passwordHash,
          fullName: data.fullName,
          phone: data.phone ?? null,
          avatarUrl: data.avatarUrl ?? null,
          title: data.title ?? null,
          role: data.role ?? Role.STAFF,
          status: data.status ?? UserStatus.ACTIVE,
          departmentId: data.departmentId ?? null,
          timezone: data.timezone ?? 'Asia/Colombo',
          mustChangePassword: data.mustChangePassword ?? false,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: null,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        };
        users.push(created);
        return pickSelect(created as unknown as Record<string, unknown>, select);
      },
      update: async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Partial<User>;
        select?: Record<string, unknown>;
      }) => {
        const idx = users.findIndex((u) => u.id === where.id);
        if (idx === -1) throw new Error('User not found');
        const updated: User = {
          ...users[idx],
          ...data,
          updatedAt: new Date(),
        };
        users[idx] = updated;
        return pickSelect(updated as unknown as Record<string, unknown>, select);
      },
    };

    self.refreshToken = {
      create: async ({ data }: { data: Omit<RefreshToken, 'id' | 'createdAt' | 'revokedAt'> }) => {
        const record: RefreshToken = {
          id: randomUUID(),
          organizationId: data.organizationId,
          userId: data.userId,
          familyId: data.familyId,
          tokenHash: data.tokenHash,
          userAgent: data.userAgent ?? null,
          ipAddress: data.ipAddress ?? null,
          expiresAt: data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        };
        refreshTokens.push(record);
        return { ...record };
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { tokenHash?: string; id?: string };
        include?: { user?: boolean };
      }) => {
        const record = refreshTokens.find(
          (rt) => (where.tokenHash && rt.tokenHash === where.tokenHash) || (where.id && rt.id === where.id),
        );
        if (!record) return null;
        if (include?.user) {
          const user = users.find((u) => u.id === record.userId);
          return user ? { ...record, user: { ...user } } : null;
        }
        return { ...record };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RefreshToken> }) => {
        const idx = refreshTokens.findIndex((rt) => rt.id === where.id);
        if (idx === -1) throw new Error('RefreshToken not found');
        refreshTokens[idx] = { ...refreshTokens[idx], ...data };
        return { ...refreshTokens[idx] };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { familyId?: string; userId?: string; revokedAt?: Date | null };
        data: Partial<RefreshToken>;
      }) => {
        let count = 0;
        for (let i = 0; i < refreshTokens.length; i++) {
          const rt = refreshTokens[i];
          if (where.familyId !== undefined && rt.familyId !== where.familyId) continue;
          if (where.userId !== undefined && rt.userId !== where.userId) continue;
          if (where.revokedAt === null && rt.revokedAt !== null) continue;
          refreshTokens[i] = { ...rt, ...data };
          count++;
        }
        return { count };
      },
    };

    self.auditLog = {
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          actorId?: string | null;
          action: string;
          entityType: string;
          entityId?: string | null;
          metadata?: unknown;
          ipAddress?: string;
          userAgent?: string;
        };
      }) => {
        const entry: AuditLog = {
          id: randomUUID(),
          organizationId: data.organizationId,
          actorId: data.actorId ?? null,
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId ?? null,
          metadata: (data.metadata as Prisma.JsonValue) ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          createdAt: new Date(),
        };
        auditLogs.push(entry);
        return { ...entry };
      },
      findMany: async ({
        where,
        take = 10,
      }: {
        where: { organizationId: string };
        orderBy?: unknown;
        take?: number;
        select?: unknown;
      }) => {
        return auditLogs
          .filter((a) => a.organizationId === where.organizationId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)
          .map((a) => {
            const actor = a.actorId ? users.find((u) => u.id === a.actorId) : null;
            return {
              id: a.id,
              action: a.action,
              entityType: a.entityType,
              entityId: a.entityId,
              ipAddress: a.ipAddress,
              userAgent: a.userAgent,
              metadata: a.metadata,
              createdAt: a.createdAt,
              actor: actor ? { fullName: actor.fullName } : null,
            };
          });
      },
    };
  }
}
