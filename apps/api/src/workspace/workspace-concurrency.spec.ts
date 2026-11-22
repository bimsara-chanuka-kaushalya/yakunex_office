import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

/**
 * Two API instances (e.g. two Vercel lambdas) sharing one workspace_state row.
 * Before the fix, the second save overwrote the first and deleted rows came back.
 */
describe('WorkspaceService shared snapshot concurrency', () => {
  const admin: AuthUser = {
    id: 'usr_admin',
    organizationId: 'org_test',
    companyId: 'YNX-DIR-0001',
    email: 'admin@yakunex.local',
    fullName: 'Admin Director',
    role: Role.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  type Row = { organizationId: string; key: string; value: unknown; updatedAt: Date };

  function makeDb() {
    const db: { row: Row | null; writes: number } = { row: null, writes: 0 };
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const systemSetting = {
      findUnique: jest.fn(async () => (db.row ? { ...db.row, value: clone(db.row.value) } : null)),
      create: jest.fn(async ({ data }: { data: { organizationId: string; key: string; value: unknown } }) => {
        if (db.row) throw new Error('Unique constraint failed');
        db.row = { ...data, value: clone(data.value), updatedAt: new Date(Date.now() + db.writes) };
        db.writes += 1;
        return db.row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: { updatedAt?: Date }; data: { value: unknown; updatedAt: Date } }) => {
          if (!db.row) return { count: 0 };
          if (where.updatedAt && where.updatedAt.getTime() !== db.row.updatedAt.getTime()) return { count: 0 };
          db.row = { ...db.row, value: clone(data.value), updatedAt: data.updatedAt };
          db.writes += 1;
          return { count: 1 };
        },
      ),
      upsert: jest.fn(),
    };
    return { db, systemSetting };
  }

  function makeService(systemSetting: unknown): WorkspaceService {
    const prismaStub = {
      isConnected: () => false,
      systemSetting,
      organization: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return new WorkspaceService(prismaStub, auditStub);
  }

  it('keeps clients created on two instances at the same time', async () => {
    const { db, systemSetting } = makeDb();
    const a = makeService(systemSetting);
    const b = makeService(systemSetting);

    await Promise.all([
      a.createClient(admin, { name: 'Client from A' }),
      b.createClient(admin, { name: 'Client from B' }),
    ]);
    // Let the fire-and-forget saves finish.
    await (a as unknown as { persistStateNow: (o: string) => Promise<void> }).persistStateNow(admin.organizationId);
    await (b as unknown as { persistStateNow: (o: string) => Promise<void> }).persistStateNow(admin.organizationId);

    const stored = (db.row?.value as { clients: Array<{ name: string }> }).clients.map((c) => c.name).sort();
    expect(stored).toEqual(['Client from A', 'Client from B']);
  });

  it('does not bring a deleted project back from another instance', async () => {
    const { db, systemSetting } = makeDb();
    const a = makeService(systemSetting);
    const b = makeService(systemSetting);

    const project = await a.createProject(admin, { name: 'Short-lived' });
    await (a as unknown as { persistStateNow: (o: string) => Promise<void> }).persistStateNow(admin.organizationId);

    // B loads the project, A deletes it, then B saves an unrelated change.
    await b.getOrCreateClientPortalLink(admin, (await b.createClient(admin, { name: 'Other' })).id);
    expect(b.listProjects(admin).some((p) => p.id === project.id)).toBe(true);
    await a.deleteProject(project.id, admin);
    await (b as unknown as { persistStateNow: (o: string) => Promise<void> }).persistStateNow(admin.organizationId);

    const stored = db.row?.value as { projects: Array<{ id: string }>; clients: Array<{ name: string }> };
    expect(stored.projects.some((p) => p.id === project.id)).toBe(false);
    expect(stored.clients.some((c) => c.name === 'Other')).toBe(true);
  });
});
