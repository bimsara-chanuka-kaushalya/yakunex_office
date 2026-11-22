import { ForbiddenException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

describe('Super Admin data manager & sidebar access', () => {
  const user = (id: string, role: Role, fullName: string): AuthUser => ({
    id,
    organizationId: 'org_test',
    companyId: `YNX-${id}`,
    email: `${id}@yakunex.local`,
    fullName,
    role,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  });
  const admin = user('usr_sa', Role.SUPER_ADMIN, 'Super Admin');
  const hr = user('usr_ad', Role.ADMIN, 'Admin User');
  const pm = user('usr_pm', Role.PROJECT_MANAGER, 'Project Manager');

  function makeService() {
    const prismaStub = { isConnected: () => false } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { svc: new WorkspaceService(prismaStub, audit as unknown as AuditService), audit };
  }

  it('only a Super Admin can browse or delete data', async () => {
    const { svc } = makeService();
    expect(() => svc.listDataCollections(hr)).toThrow(ForbiddenException);
    await expect(svc.deleteDataRecords(pm, 'tasks', { ids: ['x'] })).rejects.toThrow(ForbiddenException);
    const cols = svc.listDataCollections(admin);
    expect(cols.map((c) => c.key)).toEqual(expect.arrayContaining(['projects', 'tasks', 'meetings', 'messages', 'leaveRequests']));
  });

  it('deletes a project together with its tasks, and reports what it skipped', async () => {
    const { svc, audit } = makeService();
    const project = await svc.createProject(pm, { name: 'Portal Revamp', code: 'PRV' });
    const other = await svc.createProject(pm, { name: 'Keep Me', code: 'KEP' });
    await svc.createTask(pm, { title: 'Login page', projectId: project.id });
    await svc.createTask(pm, { title: 'Stays', projectId: other.id });

    const listed = await svc.listDataRecords(admin, 'projects', { q: 'portal' });
    expect(listed.items.map((i) => i.id)).toEqual([project.id]);
    expect(listed.items[0].title).toContain('Portal Revamp');

    const res = await svc.deleteDataRecords(admin, 'projects', { ids: [project.id, 'nope'] });
    expect(res.deleted).toBe(1);
    expect(res.skipped).toEqual([{ id: 'nope', reason: 'Not found' }]);
    expect(svc.listProjects(admin).map((p) => p.id)).toEqual([other.id]);
    expect(svc.listTasks().map((t) => t.title)).toEqual(['Stays']);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DATA_DELETED' }));
  });

  it('protects system chat channels and live meetings with people in them', async () => {
    const { svc } = makeService();
    const res = await svc.deleteDataRecords(admin, 'channels', { ids: ['ch_general'] });
    expect(res.deleted).toBe(0);
    expect(res.skipped[0].reason).toMatch(/System channel/);

    const mtg = await svc.scheduleMeeting(admin, { title: 'Live now', instant: true });
    const live = await svc.deleteDataRecords(admin, 'meetings', { ids: [mtg.id] });
    expect(live.deleted).toBe(0);
    await svc.updateMeeting(mtg.id, { status: 'COMPLETED' }, 'org_test', admin);
    expect((await svc.deleteDataRecords(admin, 'meetings', { ids: [mtg.id] })).deleted).toBe(1);
  });

  it('lets only a Super Admin hide or lock intern sidebar modules', async () => {
    const { svc } = makeService();
    await expect(svc.updateModuleAccess(hr, 'INTERN', { access: { chat: 'HIDDEN' } })).rejects.toThrow(ForbiddenException);
    await expect(svc.updateModuleAccess(admin, 'STAFF', { access: {} })).rejects.toThrow(/INTERN/);
    await expect(svc.updateModuleAccess(admin, 'INTERN', { access: { chat: 'GONE' } })).rejects.toThrow(/Invalid state/);

    const saved = await svc.updateModuleAccess(admin, 'INTERN', {
      access: { chat: 'HIDDEN', meetings: 'LOCKED', bugs: 'SHOWN', profile: 'HIDDEN' },
    });
    // Profile can never be hidden.
    expect(saved).toEqual({ INTERN: { chat: 'HIDDEN', meetings: 'LOCKED', bugs: 'SHOWN' } });
    expect(svc.getModuleAccess()).toEqual(saved);
  });
});
