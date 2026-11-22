import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

const WEBHOOK_SECRET = 'test_webhook_secret_123';

/** Sends a webhook the way GitHub does: raw JSON bytes plus their HMAC-SHA256 signature. */
function sendSignedWebhook(svc: WorkspaceService, payload: Record<string, unknown>) {
  const raw = Buffer.from(JSON.stringify(payload));
  const sig = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`;
  return svc.handleGithubWebhook(JSON.parse(raw.toString()), sig, raw);
}

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

    // Without a configured salary no pay is invented; the row is flagged for HR instead.
    const unconfigured = await svc.getSriLankaPayrollSummary(adminActor);
    const pending = unconfigured.rows.find((r) => r.userId === staffActor.id);
    expect(pending?.salaryConfigured).toBe(false);
    expect(pending?.grossLkr).toBe(0);

    await svc.adminUpdateProfile(adminActor, staffActor.id, { monthlyBasicSalaryLkr: 200_000 });

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

    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    // GitHub PR opened transitions matching task to IN_REVIEW
    const opened = await sendSignedWebhook(svc, {
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
    const merged = await sendSignedWebhook(svc, {
      action: 'closed',
      pull_request: {
        title: `[${t1.code}] Add ISO-8583 parser`,
        merged: true,
        html_url: 'https://github.com/yakunex/core/pull/42',
        head: { ref: `feat/${t1.code.toLowerCase()}-iso8583` },
      },
    });
    expect(merged.newStatus).toBe('TESTING');
    delete process.env.GITHUB_WEBHOOK_SECRET;

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

    // Rotating Client Portal link revokes the old token immediately
    const rotated = await svc.rotateClientPortalLink(adminActor, client.id);
    expect(rotated.portalToken).not.toBe(link.portalToken);
    await expect(svc.getPublicClientPortal(link.portalToken)).rejects.toThrow();
    const portalAfterRotate = await svc.getPublicClientPortal(rotated.portalToken);
    expect(portalAfterRotate.client.name).toBe('LankaPay Solutions');
  });

  it('enforces GitHub webhook HMAC-SHA256 signatures, safe PR URLs, and blocks unsafe document MIME uploads', async () => {
    const svc = makeService();
    const project = await svc.createProject(adminActor, { name: 'Security Hardening' });
    const task = await svc.createTask(adminActor, { projectId: project.id, title: 'Verify webhook HMAC' });

    // Without a configured secret the webhook is disabled entirely.
    delete process.env.GITHUB_WEBHOOK_SECRET;
    await expect(
      svc.handleGithubWebhook({ action: 'opened' }, undefined, Buffer.from('{}')),
    ).rejects.toThrow(ForbiddenException);

    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    try {
      const payload = {
        action: 'opened',
        pull_request: {
          title: `[${task.code}] Harden webhook`,
          merged: false,
          html_url: 'https://evil-phishing.example/pull/1',
          head: { ref: `feat/${task.code.toLowerCase()}` },
        },
      };

      // Missing/invalid signature rejected
      await expect(svc.handleGithubWebhook(payload, undefined)).rejects.toThrow(ForbiddenException);
      await expect(svc.handleGithubWebhook(payload, 'sha256=deadbeef')).rejects.toThrow(ForbiddenException);

      // A signature over different bytes (e.g. re-formatted JSON) is rejected.
      const pretty = Buffer.from(JSON.stringify(payload, null, 2));
      const compactSig = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex')}`;
      await expect(svc.handleGithubWebhook(payload, compactSig, pretty)).rejects.toThrow(ForbiddenException);

      // Valid HMAC over the raw body passes, while non-GitHub phishing PR URL is ignored
      const res = await sendSignedWebhook(svc, payload);
      expect(res.matched).toBe(true);
      expect(res.newStatus).toBe('IN_REVIEW');
      const updatedTask = svc.listTasks().find((t) => t.id === task.id);
      expect(updatedTask?.prUrl).toBeFalsy();
    } finally {
      delete process.env.GITHUB_WEBHOOK_SECRET;
    }

    // Unsafe HTML/SVG document MIME types blocked
    await expect(
      svc.createDocument(adminActor, {
        title: 'XSS PoC',
        mimeType: 'text/html',
        fileDataUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces Intern 10-day leave cap, blocks Intern task deletion, and returns Intern dashboard insights', async () => {
    const svc = makeService();
    const internActor: AuthUser = {
      id: 'usr_intern_10d',
      organizationId: 'org_test',
      companyId: 'YNX-INT-0010',
      email: 'intern10@yakunx.com',
      fullName: 'Dinithi Fernando',
      role: Role.INTERN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    };

    const project = await svc.createProject(adminActor, { name: 'Intern Onboarding App' });
    const task = await svc.createTask(adminActor, {
      projectId: project.id,
      title: 'Build unit test fixtures',
      assigneeName: internActor.fullName,
    });

    // Intern cannot delete tasks
    expect(() => svc.deleteTask(task.id, internActor)).toThrow(ForbiddenException);

    // Intern leave cap: 10 days max
    await svc.createLeave(internActor, {
      type: 'ANNUAL',
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      days: 5,
      reason: 'University exams',
    });
    await expect(
      svc.createLeave(internActor, {
        type: 'CASUAL',
        startDate: '2026-11-10',
        endDate: '2026-11-17',
        days: 6,
        reason: 'Exceeds 10d cap',
      }),
    ).rejects.toThrow(BadRequestException);

    const insights = svc.getRoleInsights(internActor);
    expect(insights.persona).toBe('Intern & Trainee Workspace');
    expect(insights.cards.some((c) => c.label === 'Intern Leave Balance')).toBe(true);
  });

  it('calculates Sri Lanka IRD APIT progressive tax & Client Tax Invoices (SSCL 2.5% + VAT 18%) auto-posting to Ledger', async () => {
    const svc = makeService();
    // IRD APIT monthly progressive slabs (LKR 150,000 relief)
    expect(svc.computeSriLankaMonthlyApit(150_000)).toBe(0);
    expect(svc.computeSriLankaMonthlyApit(233_333)).toBe(Math.round(83_333 * 0.06));
    expect(svc.computeSriLankaMonthlyApit(400_000)).toBeGreaterThan(45_000);

    // Client Tax Invoice with SSCL 2.5% + VAT 18%
    const inv = await svc.createInvoice(adminActor, {
      clientName: 'Sampath Digital Ventures',
      projectName: 'Core Mobile Banking',
      currency: 'LKR',
      applySscl: true,
      applyVat: true,
      lineItems: [{ description: 'Sprint 14 Delivery', quantity: 1, unitPrice: 1_000_000 }],
    });
    expect(inv.invoiceNumber).toMatch(/^YNX-INV-\d{4}-\d{4}$/);
    expect(inv.subtotal).toBe(1_000_000);
    expect(inv.ssclAmount).toBe(25_000); // 2.5%
    expect(inv.vatAmount).toBe(184_500); // 18% of 1,025,000
    expect(inv.totalAmount).toBe(1_209_500);

    // Marking PAID auto-posts INCOME entry to Finance Ledger
    const beforeIncome = svc.getFinanceSummary().totalIncome;
    await svc.updateInvoiceStatus(adminActor, inv.id, 'PAID');
    const afterIncome = svc.getFinanceSummary().totalIncome;
    expect(afterIncome - beforeIncome).toBe(1_209_500);
  });
});
