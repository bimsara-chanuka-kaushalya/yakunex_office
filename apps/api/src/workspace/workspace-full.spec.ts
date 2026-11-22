import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import type { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PERMISSIONS } from '../rbac/permissions';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService Full-System Coverage (All 14 Modules)', () => {
  const adminActor: AuthUser = {
    id: 'usr_admin',
    organizationId: 'org_test',
    companyId: 'YNX-DIR-0001',
    email: 'admin@yakunex.local',
    fullName: 'Admin Director',
    role: Role.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  const staffActor: AuthUser = {
    id: 'usr_staff',
    organizationId: 'org_test',
    companyId: 'YNX-STF-0002',
    email: 'staff@yakunex.local',
    fullName: 'Staff Developer',
    role: Role.STAFF,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  const internActor: AuthUser = {
    id: 'usr_intern',
    organizationId: 'org_test',
    companyId: 'YNX-INT-0003',
    email: 'intern@yakunex.local',
    fullName: 'Intern Trainee',
    role: Role.INTERN,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
  };

  function makeService(): { svc: WorkspaceService; audit: AuditService } {
    const prismaStub = {
      isConnected: () => false,
      user: {
        findMany: jest.fn(async () => [
          {
            id: internActor.id,
            fullName: internActor.fullName,
            email: internActor.email,
            organizationId: internActor.organizationId,
          },
        ]),
      },
      rolePermission: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      organization: {
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;

    const auditStub = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { svc: new WorkspaceService(prismaStub, auditStub), audit: auditStub };
  }

  it('covers Clients & Projects CRUD with budget redaction for non-managers', async () => {
    const { svc } = makeService();

    await expect(svc.createClient(adminActor, { name: 'A' })).rejects.toThrow(BadRequestException);
    const client = await svc.createClient(adminActor, {
      name: 'Ceylon FinTech Ltd',
      contactEmail: 'cto@ceylonfintech.lk',
    });
    expect(svc.listClients(adminActor).some((c) => c.id === client.id)).toBe(true);

    const project = await svc.createProject(adminActor, {
      name: 'Core Payment Switch',
      clientId: client.id,
      budget: 5000000,
    });

    const adminView = svc.listProjects(adminActor).find((p) => p.id === project.id);
    const internView = svc.listProjects(internActor).find((p) => p.id === project.id);
    expect(adminView?.budget).toBe(5000000);
    expect(internView?.budget).toBe(0);

    const updated = await svc.updateProject(adminActor, project.id, {
      status: 'IN_PROGRESS',
      progressPercent: 45,
      stageId: project.stages[0].id,
      stageStatus: 'DONE',
    });
    expect(updated.progressPercent).toBe(45);
    expect(updated.stages[0].status).toBe('DONE');

    expect((await svc.deleteProject(project.id, adminActor)).ok).toBe(true);
    expect((await svc.deleteClient(client.id, adminActor)).ok).toBe(true);
    await expect(svc.deleteProject(project.id, adminActor)).rejects.toThrow();
  });

  it('covers Sprints, Tasks, Bugs, and Document visibility boundaries', async () => {
    const { svc } = makeService();
    const project = await svc.createProject(adminActor, { name: 'QA Verification Suite' });
    const sprint = await svc.createSprint(adminActor, {
      name: 'Sprint 99',
      projectId: project.id,
      status: 'ACTIVE',
    });

    const t1 = await svc.createTask(adminActor, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'Implement health checks',
      storyPoints: 5,
    });
    const t2 = await svc.createTask(staffActor, {
      projectId: project.id,
      sprintId: sprint.id,
      title: 'Write smoke tests',
      storyPoints: 3,
    });

    svc.updateTask(t1.id, { status: 'COMPLETED' });
    const sprintStats = svc.listSprints().find((s) => s.id === sprint.id);
    expect(sprintStats?.taskCount).toBe(2);
    expect(sprintStats?.completedTaskCount).toBe(1);
    expect(sprintStats?.totalPoints).toBe(8);
    expect(sprintStats?.completedPoints).toBe(5);

    svc.updateSprint(sprint.id, { status: 'COMPLETED', retrospective: 'Smooth release.' });
    expect(svc.deleteTask(t2.id).ok).toBe(true);

    const bug = await svc.createBug(staffActor, {
      projectId: project.id,
      title: 'Token timeout on 3G',
      severity: 'CRITICAL',
    });
    expect(svc.listBugs().some((b) => b.id === bug.id)).toBe(true);
    const updatedBug = svc.updateBug(bug.id, { status: 'FIXED', severity: 'MAJOR' });
    expect(updatedBug.status).toBe('FIXED');
    expect(updatedBug.severity).toBe('MAJOR');

    const secretDoc = await svc.createDocument(adminActor, {
      title: 'Executive Salary Sheet',
      visibility: 'ADMIN_ONLY',
    });
    const teamDoc = await svc.createDocument(adminActor, {
      title: 'API Architecture Guide',
      visibility: 'TEAM',
    });

    const adminDocs = svc.listDocuments(adminActor);
    const internDocs = svc.listDocuments(internActor);
    expect(adminDocs.some((d) => d.id === secretDoc.id)).toBe(true);
    expect(internDocs.some((d) => d.id === secretDoc.id)).toBe(false);
    expect(internDocs.some((d) => d.id === teamDoc.id)).toBe(true);
  });

  it('covers Time Tracker, Attendance, and Leave approval workflow', async () => {
    const { svc } = makeService();

    // Time Tracker
    const active = svc.startTimer(staffActor, { note: 'Working on API tests' });
    expect(active.endedAt).toBeNull();
    expect(() => svc.startTimer(staffActor, { note: 'Duplicate timer' })).toThrow(BadRequestException);

    const stopped = svc.stopTimer(staffActor);
    expect(stopped.endedAt).not.toBeNull();
    expect(stopped.durationMinutes).toBeGreaterThanOrEqual(1);

    const task = await svc.createTask(staffActor, { title: 'Timed task' });
    svc.logManualTime(staffActor, { taskId: task.id, durationMinutes: 90, billable: true });
    expect(task.actualHours).toBe(1.5);
    expect(svc.listTimeEntries(staffActor).entries.length).toBeGreaterThanOrEqual(2);

    // Attendance
    const clockedIn = svc.clockIn(staffActor, { notes: 'Morning shift' });
    expect(clockedIn.clockOutAt).toBeNull();
    expect(() => svc.clockIn(staffActor, {})).toThrow(BadRequestException);

    const onBreak = svc.toggleBreak(staffActor);
    expect(onBreak.onBreak).toBe(true);
    const offBreak = svc.toggleBreak(staffActor);
    expect(offBreak.onBreak).toBe(false);
    expect(offBreak.breakMinutes).toBe(15);

    const clockedOut = svc.clockOut(staffActor);
    expect(clockedOut.clockOutAt).not.toBeNull();
    expect(svc.listAttendance(staffActor).records.some((r) => r.id === clockedOut.id)).toBe(true);

    // Leave
    const leaveReq = await svc.createLeave(staffActor, {
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      days: 2,
      reason: 'Medical checkup',
    });
    expect(svc.listLeave(staffActor).some((l) => l.id === leaveReq.id)).toBe(true);
    const decided = await svc.decideLeave(adminActor, leaveReq.id, {
      status: 'APPROVED',
      decisionNote: 'Approved by Director.',
    });
    expect(decided.status).toBe('APPROVED');
    expect(decided.approverName).toBe(adminActor.fullName);
  });

  it('covers Interns, Chat, Meetings Host Controls, Reports, Settings & Role Matrix', async () => {
    const { svc } = makeService();

    // Interns
    const interns = await svc.listInterns(internActor);
    expect(interns.length).toBeGreaterThanOrEqual(1);
    const targetIntern = interns.find((i) => i.userId === internActor.id) ?? interns[0];
    const firstTaskId = targetIntern.trainingTasks[0].id;
    const toggled = svc.toggleInternTask(internActor, targetIntern.id, firstTaskId);
    expect(toggled.progressPercent).toBeGreaterThan(0);

    const otherIntern: AuthUser = { ...internActor, id: 'usr_other_intern', email: 'other@yakunex.local' };
    expect(() => svc.toggleInternTask(otherIntern, targetIntern.id, firstTaskId)).toThrow(ForbiddenException);
    expect(() =>
      svc.addInternEvaluation(internActor, targetIntern.id, { score: 5, feedback: 'Self' }),
    ).toThrow(ForbiddenException);

    const evaluated = svc.addInternEvaluation(adminActor, targetIntern.id, {
      period: '2026-W46',
      score: 5,
      strengths: 'Fast delivery',
    });
    expect(evaluated.evaluations.length).toBeGreaterThanOrEqual(1);

    // Chat
    const channel = svc.createChatChannel({ name: 'qa testing', description: 'QA room' });
    expect(channel.name).toBe('qa-testing');
    expect(svc.listChatChannels().some((c) => c.id === channel.id)).toBe(true);
    svc.postChatMessage(staffActor, channel.id, { body: 'All suites green!' });
    expect(svc.listChatMessages(channel.id).some((m) => m.body === 'All suites green!')).toBe(true);

    // Meetings & Host Controls
    const room = await svc.scheduleMeeting(adminActor, { title: 'System Audit Call', instant: true });
    const joined = await svc.joinMeetingByCode(staffActor, room.roomCode, { micOn: true, camOn: true });
    expect(joined.participants.some((p) => p.userId === staffActor.id)).toBe(true);
    // Participants share their screen after the host approves (the default rule).
    await svc.hostMeetingAction(adminActor, room.id, { action: 'approve-screenshare', targetUserId: staffActor.id });

    const updatedState = await svc.updateParticipantState(staffActor, room.id, {
      screenSharing: true,
      screenStreamId: 'stream_123',
      handRaised: true,
    });
    const staffParticipant = updatedState.participants.find((p) => p.userId === staffActor.id);
    expect(staffParticipant?.screenSharing).toBe(true);
    expect(staffParticipant?.handRaised).toBe(true);

    await svc.postMeetingChat(staffActor, room.id, { body: 'Sharing screen now' });
    const afterHostMute = await svc.hostMeetingAction(adminActor, room.id, {
      action: 'mute',
      targetUserId: staffActor.id,
    });
    expect(afterHostMute.participants.find((p) => p.userId === staffActor.id)?.micOn).toBe(false);

    const staffSignals = await svc.pollMeetingSignals(staffActor, room.id, 0);
    expect(staffSignals.signals.some((s) => s.type === 'host-mute')).toBe(true);

    await svc.leaveMeetingRoom(staffActor, room.id);
    const adminSignals = await svc.pollMeetingSignals(adminActor, room.id, 0);
    expect(adminSignals.signals.some((s) => s.type === 'peer-left' && s.fromUserId === staffActor.id)).toBe(true);

    const ended = await svc.updateMeeting(room.id, { status: 'COMPLETED' }, adminActor.organizationId);
    expect(ended.participants).toHaveLength(0);

    // Reports & Settings & Role Matrix
    const adminReport = svc.getReportsSummary(adminActor);
    const internReport = svc.getReportsSummary(internActor);
    if (adminReport.projectProgress.length > 0) {
      expect(internReport.projectProgress[0].budget).toBe(0);
    }

    const updatedSettings = await svc.updateSettings(adminActor, {
      name: 'Yakunex Hub Cloud',
      idleTimeoutMinutes: 30,
    });
    expect(updatedSettings.name).toBe('Yakunex Hub Cloud');
    expect(svc.getSettings().settings.idleTimeoutMinutes).toBe(30);

    await expect(svc.updateRolePermissions(adminActor, Role.SUPER_ADMIN, [])).rejects.toThrow(
      ForbiddenException,
    );
    await expect(svc.updateRolePermissions(staffActor, Role.ADMIN, [])).rejects.toThrow(
      ForbiddenException,
    );
    const matrixRes = await svc.updateRolePermissions(adminActor, Role.INTERN, [
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.CHAT_USE,
    ]);
    expect(matrixRes.permissions).toEqual([PERMISSIONS.TASKS_READ, PERMISSIONS.CHAT_USE]);
  });

  it('covers Organization, Approval Center, Finance & Payroll, Assets, Performance & Notifications', async () => {
    const { svc } = makeService();

    const dept = svc.createDepartment(adminActor, { name: 'R&D Lab', code: 'RND', headTitle: 'CTO' });
    expect(dept.code).toBe('RND');
    const orgOverview = await svc.getOrganizationOverview(adminActor);
    expect(orgOverview.departments.some((d) => d.code === 'RND')).toBe(true);
    expect(orgOverview.hierarchy.length).toBeGreaterThanOrEqual(7);

    const apr = svc.createApproval(staffActor, { type: 'EXPENSE', title: 'Cloud GPU', amount: 150 });
    expect(apr.status).toBe('PENDING');
    await svc.decideApproval(adminActor, apr.id, { status: 'APPROVED', comment: 'Approved by CEO' });
    expect(svc.listApprovals(staffActor).find((a) => a.id === apr.id)?.status).toBe('APPROVED');

    svc.createFinanceEntry(adminActor, { type: 'INCOME', category: 'Client Retainer', amount: 5000 });
    svc.createFinanceEntry(adminActor, { type: 'EXPENSE', category: 'Cloud Hosting', amount: 800 });
    const fin = svc.getFinanceSummary();
    expect(fin.totalIncome).toBe(5000);
    expect(fin.totalExpenses).toBe(800);
    expect(fin.netProfit).toBe(4200);

    const asset = svc.createAsset(adminActor, { name: 'MacBook Pro M4', category: 'LAPTOP', assignedToName: staffActor.fullName });
    expect(asset.status).toBe('ASSIGNED');
    expect(svc.listAssets().length).toBe(1);

    const review = svc.createPerformanceReview(adminActor, {
      employeeName: staffActor.fullName,
      goalTitle: 'Deliver Q4 API',
      completionPercent: 95,
      rating: 5,
    });
    expect(review.rating).toBe(5);
    expect(svc.listPerformanceReviews(staffActor).length).toBe(1);

    const ann = await svc.createAnnouncement(adminActor, { title: 'Townhall', body: 'Friday 4 PM' });
    const inbox = await svc.listNotifications(staffActor);
    expect(inbox.some((n) => n.id === ann.id)).toBe(true);
    await svc.markNotificationRead(staffActor, ann.id);
    const updatedInbox = await svc.listNotifications(staffActor);
    expect(updatedInbox.find((n) => n.id === ann.id)?.read).toBe(true);
  });

  it('covers upgraded Time Tracker (pause/resume/switch/submit & approval sync)', async () => {
    const { svc } = makeService();
    const prj = await svc.createProject(adminActor, { name: 'Core API', code: 'CORE' });

    const started = svc.startTimer(staffActor, {
      projectId: prj.id,
      workCategory: 'Development',
      note: 'Auth endpoints',
      billable: true,
    });
    expect(started.status).toBe('RUNNING');
    expect(started.workCategory).toBe('Development');

    const paused = svc.pauseTimer(staffActor);
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedAt).toBeTruthy();

    const resumed = svc.resumeTimer(staffActor);
    expect(resumed.status).toBe('RUNNING');
    expect(resumed.pausedAt).toBeNull();

    const switched = svc.switchTimer(staffActor, {
      projectId: prj.id,
      workCategory: 'Testing / QA',
      note: 'Integration tests',
    });
    expect(switched.status).toBe('RUNNING');
    expect(switched.workCategory).toBe('Testing / QA');

    const stopped = svc.stopTimer(staffActor);
    expect(stopped.status).toBe('SAVED');

    const submitted = svc.submitTimeEntry(staffActor, stopped.id);
    expect(submitted.status).toBe('SUBMITTED');
    const tsApproval = svc.listApprovals(adminActor).find((a) => a.type === 'TIMESHEET');
    expect(tsApproval).toBeDefined();

    await svc.decideApproval(adminActor, tsApproval!.id, { status: 'APPROVED', comment: 'Verified' });
    const afterList = svc.listTimeEntries(staffActor);
    expect(afterList.summary.todayMinutes).toBeGreaterThanOrEqual(0);
    expect(afterList.entries.find((e) => e.id === stopped.id)?.status).toBe('APPROVED');
  });

  it('covers Role-Based Team Chat, Confidential Isolation, DM, Reactions, Pin & Convert-to-Task', async () => {
    const { svc } = makeService();

    // Create a CONFIDENTIAL channel where Super Admin is NOT a member
    const conf = svc.createChatChannel(staffActor, {
      name: 'hr-confidential-test',
      description: 'HR Private',
      type: 'GROUP',
      category: 'CONFIDENTIAL',
      privacy: 'CONFIDENTIAL',
      memberIds: [staffActor.id],
    });

    // Super Admin cannot automatically see or read uninvited CONFIDENTIAL channels
    const adminChannels = svc.listChatChannels(adminActor);
    expect(adminChannels.some((c) => c.id === conf.id)).toBe(false);
    expect(() => svc.listChatMessages(conf.id, adminActor)).toThrow(ForbiddenException);

    // Staff can access and post
    const msg = svc.postChatMessage(staffActor, conf.id, { body: 'Prepare onboarding checklist' });
    const reacted = svc.reactChatMessage(staffActor, msg.id, '👍');
    expect(reacted.reactions?.['👍']).toContain(staffActor.id);

    const pinned = svc.togglePinChatMessage(staffActor, msg.id);
    expect(pinned.pinned).toBe(true);

    const converted = await svc.convertMessageToTask(staffActor, msg.id, {});
    expect(converted.task.title).toContain('Prepare onboarding checklist');

    const dm = svc.startDirectChat(staffActor, internActor.id, internActor.fullName);
    expect(dm.type).toBe('DIRECT');
    expect(svc.listChatChannels(internActor).some((c) => c.id === dm.id)).toBe(true);

    const mt = await svc.createMeetingFromChannel(staffActor, 'ch_general', { title: 'Quick Sync' });
    expect(mt.roomCode).toBeTruthy();
  });
});

