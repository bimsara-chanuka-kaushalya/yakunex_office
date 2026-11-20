import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService Enterprise Waves 1-5 Coverage', () => {
  const adminActor: AuthUser = {
    id: 'usr_admin',
    organizationId: 'org_test',
    companyId: 'YNX-DIR-0001',
    email: 'admin@yakunx.com',
    fullName: 'Admin Director',
    role: Role.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  const staffActor: AuthUser = {
    id: 'usr_staff',
    organizationId: 'org_test',
    companyId: 'YNX-STF-0002',
    email: 'staff@yakunx.com',
    fullName: 'Kasun Perera',
    role: Role.STAFF,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  function makeService(): WorkspaceService {
    const prismaStub = {
      isConnected: () => false,
      user: { findMany: jest.fn(async () => []) },
      rolePermission: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      organization: { update: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return new WorkspaceService(prismaStub, auditStub);
  }

  it('computes Sri Lanka 2026 Poya holidays and live leave entitlements', async () => {
    const svc = makeService();
    const initial = await svc.getLeaveSummaryAndHolidays(staffActor);
    expect(initial.holidays2026.length).toBeGreaterThanOrEqual(15);
    expect(initial.entitlements.annual).toEqual({ total: 14, used: 0, remaining: 14 });
    expect(initial.entitlements.casual.total).toBe(7);
    expect(initial.entitlements.medical.total).toBe(7);

    const req = await svc.createLeave(staffActor, {
      type: 'ANNUAL',
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      days: 3,
      reason: 'Family trip',
    });
    await svc.decideLeave(adminActor, req.id, { status: 'APPROVED' });

    const after = await svc.getLeaveSummaryAndHolidays(staffActor);
    expect(after.entitlements.annual.used).toBe(3);
    expect(after.entitlements.annual.remaining).toBe(11);
  });

  it('calculates Sri Lanka OT (1.5x/2x), EPF (8%/12%) & ETF (3%) and submits weekly timesheets', async () => {
    const svc = makeService();
    await svc.logManualTime(staffActor, {
      durationMinutes: 600, // 8h regular + 2h weekday OT (1.5x)
      note: 'Core API build',
      billable: true,
    });

    const payroll = await svc.getSriLankaPayrollSummary(adminActor);
    expect(payroll.currency).toBe('LKR');
    const row = payroll.rows.find((r) => r.userId === staffActor.id);
    expect(row).toBeDefined();
    expect(row!.grossLkr).toBeGreaterThan(0);
    expect(row!.epfEmployee8).toBe(Math.round(row!.basePay * 0.08));
    expect(row!.epfEmployer12).toBe(Math.round(row!.basePay * 0.12));
    expect(row!.etfEmployer3).toBe(Math.round(row!.basePay * 0.03));
    expect(row!.netPayLkr).toBe(row!.grossLkr - row!.epfEmployee8);

    const submitted = await svc.submitWeeklyTimesheet(staffActor, { weekLabel: '2026-W47' });
    expect(submitted.ok).toBe(true);
    expect(submitted.submittedEntries).toBeGreaterThanOrEqual(1);
    expect(submitted.approval.type).toBe('TIMESHEET');
  });

  it('auto-recalculates project progress, handles GitHub PR webhooks, and serves public client portal', async () => {
    const svc = makeService();
    const client = await svc.createClient(adminActor, {
      name: 'LankaPay Solutions',
      contactName: 'Nuwan Jayasinghe',
      contactEmail: 'nuwan@lankapay.lk',
    });
    const project = await svc.createProject(adminActor, {
      name: 'Merchant QR Switch',
      clientId: client.id,
      budget: 9500000,
    });

    const t1 = await svc.createTask(adminActor, {
      projectId: project.id,
      title: 'Implement ISO-8583 parser',
      issueType: 'STORY',
    });
    const t2 = await svc.createTask(adminActor, {
      projectId: project.id,
      title: 'Add webhook signature check',
      issueType: 'TASK',
    });

    // GitHub PR opened transitions matching task to IN_REVIEW
    const opened = await svc.handleGithubWebhook({
      action: 'opened',
      pull_request: {
        title: `[${t1.code}] Add ISO-8583 parser`,
        merged: false,
        html_url: 'https://github.com/yakunex/core/pull/42',
        head: { ref: `feat/${t1.code.toLowerCase()}-iso8583` },
      },
    });
    expect(opened.matched).toBe(true);
    expect(opened.newStatus).toBe('IN_REVIEW');

    // GitHub PR merged transitions matching task to TESTING
    const merged = await svc.handleGithubWebhook({
      action: 'closed',
      pull_request: {
        title: `[${t1.code}] Add ISO-8583 parser`,
        merged: true,
        html_url: 'https://github.com/yakunex/core/pull/42',
        head: { ref: `feat/${t1.code.toLowerCase()}-iso8583` },
      },
    });
    expect(merged.newStatus).toBe('TESTING');

    // Completing 1 of 2 tasks recalculates project progressPercent to 50%
    svc.updateTask(t1.id, { status: 'COMPLETED' });
    const updatedProj = svc.listProjects(adminActor).find((p) => p.id === project.id);
    expect(updatedProj?.progressPercent).toBe(50);
    expect(t2.status).toBeDefined();

    // Public Client Portal returns live progress & milestones without internal budget
    const link = await svc.getOrCreateClientPortalLink(adminActor, client.id);
    expect(link.portalToken).toMatch(/^cp_/);
    const portal = await svc.getPublicClientPortal(link.portalToken);
    expect(portal.client.name).toBe('LankaPay Solutions');
    expect(portal.projects.length).toBe(1);
    expect(portal.projects[0].progressPercent).toBe(50);
    expect((portal.projects[0] as Record<string, unknown>).budget).toBeUndefined();
  });
});
