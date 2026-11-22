import type {
  AttendanceItem,
  BugItem,
  InternItem,
  LeaveRequestItem,
  MeetingItem,
  ProjectItem,
  SprintItem,
  TaskItem,
  TimeEntryItem,
} from './workspace.service';

/**
 * "My Day": one payload per signed-in user that answers "what do I need to do today?".
 * Pure functions over the workspace snapshot so the rules are easy to test.
 */

export type MyDayRole = 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT_MANAGER' | 'STAFF' | 'INTERN';

export interface MyDayViewer {
  id: string;
  fullName: string;
  email: string;
  role: MyDayRole;
}

export interface MyDayPerson {
  id: string;
  fullName: string;
  email?: string;
  companyId?: string | null;
  role: string;
  status: string;
  createdAt: string;
  birthday?: string;
}

export interface MyDayApproval {
  id: string;
  source: 'GENERAL' | 'LEAVE';
  type: string;
  title: string;
  description: string;
  requestedById: string;
  requestedByName: string;
  status: string;
  createdAt: string;
}

export interface MyDayInput {
  viewer: MyDayViewer;
  now: Date;
  /** Local calendar date (YYYY-MM-DD) in the organisation's timezone. */
  today: string;
  workDayStart: string;
  tasks: TaskItem[];
  projects: ProjectItem[];
  sprints: SprintItem[];
  bugs: BugItem[];
  timeEntries: TimeEntryItem[];
  attendance: AttendanceItem[];
  leaveRequests: LeaveRequestItem[];
  interns: InternItem[];
  meetings: MeetingItem[];
  approvals: MyDayApproval[];
  people: MyDayPerson[];
  unreadNotifications: number;
  leaveEntitlements?: Record<string, { total: number; used: number; remaining: number }>;
  finance?: {
    entries: Array<{ type: string; amount: number; status: string; recordedAt: string }>;
    invoices: Array<{ id: string; invoiceNumber: string; clientName: string; totalAmount: number; status: string; dueDate: string; currency: string }>;
  };
  assets?: Array<{ id: string; tag: string; name: string; status: string; condition: string; assignedToName?: string | null }>;
  sensitiveAudit?: Array<{ id: string; action: string; entityType: string; createdAt: string; actorName: string | null }>;
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DONE_TASK = new Set(['COMPLETED']);
const OPEN_BUG = (b: BugItem) => b.status !== 'CLOSED' && b.status !== 'VERIFIED';
const DAY_MS = 86_400_000;

function dayDiff(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** Tasks are assigned by email/name in the snapshot (no assignee id). */
export function isMine(task: TaskItem, viewer: Pick<MyDayViewer, 'fullName' | 'email'>): boolean {
  // Email is unique; names are not (two "Kasun Silva"s must not share tasks). Fall back to the
  // name only for older tasks saved without an email.
  if (task.assigneeEmail) return task.assigneeEmail.toLowerCase() === viewer.email.toLowerCase();
  return Boolean(task.assigneeName) && task.assigneeName.trim().toLowerCase() === viewer.fullName.trim().toLowerCase();
}

function taskOwner(task: TaskItem, people: MyDayPerson[]): MyDayPerson | undefined {
  const email = task.assigneeEmail?.trim().toLowerCase();
  if (email) {
    const byEmail = people.find((p) => p.email?.toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = task.assigneeName?.trim().toLowerCase();
  const sameName = name ? people.filter((p) => p.fullName.trim().toLowerCase() === name) : [];
  return sameName.length === 1 ? sameName[0] : undefined;
}

function onLeave(userId: string, date: string, leave: LeaveRequestItem[]): LeaveRequestItem | undefined {
  return leave.find(
    (l) => l.userId === userId && l.status === 'APPROVED' && l.startDate.slice(0, 10) <= date && l.endDate.slice(0, 10) >= date,
  );
}

function minutesOf(entry: TimeEntryItem, now: Date): number {
  if (entry.endedAt || entry.status === 'PAUSED') return entry.durationMinutes || 0;
  const started = Date.parse(entry.startedAt);
  if (Number.isNaN(started)) return entry.durationMinutes || 0;
  const paused = entry.pauseDurationSeconds ?? 0;
  return Math.max(0, Math.round((now.getTime() - started) / 60_000 - paused / 60));
}

export function buildPersonal(input: MyDayInput) {
  const { viewer, today, now } = input;
  const mine = input.tasks.filter((t) => isMine(t, viewer));
  const open = mine.filter((t) => !DONE_TASK.has(t.status));
  const ranked = [...open].sort((a, b) => {
    const da = a.dueDate ? a.dueDate.slice(0, 10) : '9999-12-31';
    const db = b.dueDate ? b.dueDate.slice(0, 10) : '9999-12-31';
    if (da !== db) return da.localeCompare(db);
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
  const todayTasks = ranked.slice(0, 12).map((t) => {
    const due = t.dueDate ? t.dueDate.slice(0, 10) : '';
    return {
      id: t.id,
      code: t.code,
      title: t.title,
      projectId: t.projectId,
      projectName: t.projectName,
      status: t.status,
      priority: t.priority,
      dueDate: due,
      overdue: Boolean(due) && due < today,
      dueToday: due === today,
    };
  });

  const attendanceToday = input.attendance.find((a) => a.userId === viewer.id && a.workDate === today) ?? null;
  const activeTimer =
    input.timeEntries.find((te) => te.userId === viewer.id && !te.endedAt && (te.status === 'RUNNING' || te.status === 'PAUSED' || !te.status)) ??
    null;

  const myEntriesToday = input.timeEntries.filter(
    (te) => te.userId === viewer.id && te.startedAt.slice(0, 10) === today,
  );
  const minutesToday = myEntriesToday.reduce((sum, te) => sum + minutesOf(te, now), 0);
  const unsubmitted = input.timeEntries.filter(
    (te) => te.userId === viewer.id && te.endedAt && (te.status === 'SAVED' || !te.status || te.status === 'REVISION_REQUIRED'),
  ).length;

  const meetingsToday = input.meetings
    .filter((m) => m.status !== 'CANCELLED' && (m.status === 'LIVE' || m.startsAt.slice(0, 10) === today))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      title: m.title,
      roomCode: m.roomCode,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      status: m.status,
      organizerName: m.organizerName,
      projectName: m.projectName,
    }));

  // Standup draft: yesterday = last working day before today.
  let prev = addDays(today, -1);
  while (isWeekend(prev)) prev = addDays(prev, -1);
  const workedYesterday = input.timeEntries
    .filter((te) => te.userId === viewer.id && te.startedAt.slice(0, 10) === prev && te.taskTitle)
    .map((te) => te.taskTitle);
  const yesterday = Array.from(new Set(workedYesterday)).slice(0, 6);
  const planned = open.filter((t) => t.status !== 'BLOCKED' && (t.status === 'IN_PROGRESS' || t.dueDate?.slice(0, 10) === today)).map((t) => `${t.code} ${t.title}`);
  const blockers = open.filter((t) => t.status === 'BLOCKED').map((t) => `${t.code} ${t.title}`);

  return {
    todayTasks,
    taskCounts: {
      open: open.length,
      overdue: todayTasks.filter((t) => t.overdue).length,
      dueToday: todayTasks.filter((t) => t.dueToday).length,
      blocked: blockers.length,
      inProgress: open.filter((t) => t.status === 'IN_PROGRESS').length,
    },
    attendance: attendanceToday
      ? {
          clockedIn: Boolean(attendanceToday.clockInAt),
          clockedOut: Boolean(attendanceToday.clockOutAt),
          onBreak: attendanceToday.onBreak,
          clockInAt: attendanceToday.clockInAt,
          clockOutAt: attendanceToday.clockOutAt,
          isLate: attendanceToday.isLate,
          workMode: attendanceToday.workMode ?? null,
        }
      : { clockedIn: false, clockedOut: false, onBreak: false, clockInAt: null, clockOutAt: null, isLate: false, workMode: null },
    activeTimer: activeTimer
      ? {
          id: activeTimer.id,
          taskId: activeTimer.taskId,
          taskTitle: activeTimer.taskTitle,
          projectName: activeTimer.projectName,
          startedAt: activeTimer.startedAt,
          status: activeTimer.status ?? 'RUNNING',
          minutes: minutesOf(activeTimer, now),
        }
      : null,
    hoursToday: Math.round((minutesToday / 60) * 10) / 10,
    unsubmittedTimeEntries: unsubmitted,
    meetingsToday,
    leave: input.leaveEntitlements ?? null,
    pendingLeave: input.leaveRequests.filter((l) => l.userId === viewer.id && l.status === 'PENDING').length,
    unreadNotifications: input.unreadNotifications,
    standupDraft: {
      previousWorkDay: prev,
      yesterday,
      today: planned.slice(0, 6),
      blockers,
    },
  };
}

export function buildIntern(input: MyDayInput) {
  const { viewer, today } = input;
  const profile = input.interns.find(
    (i) => i.userId === viewer.id || i.email.toLowerCase() === viewer.email.toLowerCase(),
  );
  if (!profile) return null;
  const elapsedDays = dayDiff(profile.startDate, today);
  const currentWeek = Number.isNaN(elapsedDays) ? 1 : Math.max(1, Math.floor(elapsedDays / 7) + 1);
  const weeks = profile.trainingTasks.map((t) => t.weekNumber);
  const lastWeek = weeks.length ? Math.max(...weeks) : currentWeek;
  const focusWeek = Math.min(currentWeek, lastWeek);
  const thisWeek = profile.trainingTasks.filter((t) => t.weekNumber === focusWeek);
  const overdueTraining = profile.trainingTasks.filter((t) => !t.completed && t.weekNumber < focusWeek);
  const daysLeft = dayDiff(today, profile.endDate);
  const lastEval = [...profile.evaluations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const reflections = (profile as InternItem & { reflections?: Array<{ date: string }> }).reflections ?? [];
  return {
    internId: profile.id,
    mentorName: profile.mentorName,
    programme: profile.programme,
    progressPercent: profile.progressPercent,
    currentWeek: focusWeek,
    totalWeeks: lastWeek,
    thisWeek,
    overdueTraining,
    daysLeft: Number.isNaN(daysLeft) ? null : daysLeft,
    endDate: profile.endDate,
    lastEvaluation: lastEval ? { period: lastEval.period, score: lastEval.score, createdAt: lastEval.createdAt } : null,
    reflectionSubmittedToday: reflections.some((r) => r.date === today),
  };
}

function sprintRisk(done: number, total: number, elapsedRatio: number, overdue: number, blocked: number) {
  const completion = total > 0 ? done / total : 1;
  const gap = elapsedRatio - completion;
  if (blocked >= 3 || gap > 0.3 || overdue >= 5) return 'RED' as const;
  if (blocked > 0 || gap > 0.15 || overdue > 0) return 'AMBER' as const;
  return 'GREEN' as const;
}

export function buildManager(input: MyDayInput) {
  const { today, people } = input;
  const team = people.filter(
    (p) =>
      p.id !== input.viewer.id &&
      p.status === 'ACTIVE' &&
      (p.role === 'STAFF' || p.role === 'INTERN' || p.role === 'PROJECT_MANAGER'),
  );
  const todayAtt = new Map(input.attendance.filter((a) => a.workDate === today).map((a) => [a.userId, a]));
  const openTasks = input.tasks.filter((t) => !DONE_TASK.has(t.status));

  const pulse = team.map((p) => {
    const att = todayAtt.get(p.id);
    const leave = onLeave(p.id, today, input.leaveRequests);
    const theirOpen = openTasks.filter((t) => taskOwner(t, people)?.id === p.id);
    const timer = input.timeEntries.find((te) => te.userId === p.id && !te.endedAt && te.status !== 'PAUSED');
    let state: 'WORKING' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ON_LEAVE' | 'NOT_IN' = 'NOT_IN';
    if (leave) state = 'ON_LEAVE';
    else if (att?.clockInAt && att.clockOutAt) state = 'CLOCKED_OUT';
    else if (att?.onBreak) state = 'ON_BREAK';
    else if (att?.clockInAt) state = 'WORKING';
    return {
      userId: p.id,
      fullName: p.fullName,
      companyId: p.companyId ?? null,
      role: p.role,
      state,
      isLate: Boolean(att?.isLate),
      clockInAt: att?.clockInAt ?? null,
      workMode: att?.workMode ?? null,
      currentTask: timer?.taskTitle || null,
      openTasks: theirOpen.length,
      blockedTasks: theirOpen.filter((t) => t.status === 'BLOCKED').map((t) => ({ id: t.id, code: t.code, title: t.title })),
      overdueTasks: theirOpen.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length,
    };
  });

  const sprints = input.sprints
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => {
      const st = input.tasks.filter((t) => t.sprintId === s.id);
      const points = (t: TaskItem) => (t.storyPoints > 0 ? t.storyPoints : 1);
      const total = st.reduce((n, t) => n + points(t), 0);
      const done = st.filter((t) => DONE_TASK.has(t.status)).reduce((n, t) => n + points(t), 0);
      const length = Math.max(1, dayDiff(s.startDate, s.endDate) || 1);
      const elapsed = Math.min(length, Math.max(0, dayDiff(s.startDate, today) || 0));
      const overdue = st.filter((t) => !DONE_TASK.has(t.status) && t.dueDate && t.dueDate.slice(0, 10) < today).length;
      const blocked = st.filter((t) => t.status === 'BLOCKED').length;
      return {
        id: s.id,
        name: s.name,
        projectName: s.projectName,
        endDate: s.endDate,
        daysLeft: dayDiff(today, s.endDate),
        totalPoints: total,
        donePoints: done,
        completionPercent: total ? Math.round((done / total) * 100) : 0,
        elapsedPercent: Math.round((elapsed / length) * 100),
        overdue,
        blocked,
        risk: sprintRisk(done, total, elapsed / length, overdue, blocked),
      };
    });

  const inbox = input.approvals
    .filter((a) => a.status === 'PENDING' && a.requestedById !== input.viewer.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    teamPulse: {
      summary: {
        total: pulse.length,
        working: pulse.filter((p) => p.state === 'WORKING').length,
        onBreak: pulse.filter((p) => p.state === 'ON_BREAK').length,
        onLeave: pulse.filter((p) => p.state === 'ON_LEAVE').length,
        notIn: pulse.filter((p) => p.state === 'NOT_IN').length,
        late: pulse.filter((p) => p.isLate).length,
        blocked: pulse.filter((p) => p.blockedTasks.length > 0).length,
      },
      people: pulse.sort((a, b) => b.blockedTasks.length - a.blockedTasks.length || a.fullName.localeCompare(b.fullName)),
    },
    sprints,
    approvalInbox: inbox,
  };
}

export function buildHrDesk(input: MyDayInput) {
  const { today, people } = input;
  const active = people.filter((p) => p.status === 'ACTIVE' && p.role !== 'SUPER_ADMIN');
  const todayAtt = new Map(input.attendance.filter((a) => a.workDate === today).map((a) => [a.userId, a]));
  const late = active
    .filter((p) => todayAtt.get(p.id)?.isLate)
    .map((p) => ({ userId: p.id, fullName: p.fullName, clockInAt: todayAtt.get(p.id)?.clockInAt ?? null }));
  const leaveToday = active.filter((p) => onLeave(p.id, today, input.leaveRequests));
  const workday = !isWeekend(today);
  const [h, m] = input.workDayStart.split(':').map(Number);
  // Colombo is UTC+05:30; only call someone "absent" once the work day has started.
  const localMinutes = (input.now.getUTCHours() * 60 + input.now.getUTCMinutes() + 330) % 1440;
  const dayStarted = localMinutes >= (h || 8) * 60 + (m || 30);
  const absent =
    workday && dayStarted
      ? active
          .filter((p) => !todayAtt.get(p.id)?.clockInAt && !onLeave(p.id, today, input.leaveRequests))
          .map((p) => ({ userId: p.id, fullName: p.fullName, role: p.role }))
      : [];

  // Days in the next 14 where 2+ people from the team are on approved/pending leave.
  const clashes: Array<{ date: string; names: string[] }> = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const names = input.leaveRequests
      .filter((l) => l.status !== 'REJECTED' && l.startDate.slice(0, 10) <= d && l.endDate.slice(0, 10) >= d)
      .map((l) => l.userName);
    const unique = Array.from(new Set(names));
    if (unique.length >= 2) clashes.push({ date: d, names: unique });
  }

  const within7 = (mmdd: string) => {
    for (let i = 0; i < 7; i++) if (addDays(today, i).slice(5) === mmdd) return i;
    return -1;
  };
  const celebrations: Array<{ userId: string; fullName: string; kind: 'BIRTHDAY' | 'ANNIVERSARY'; inDays: number; years?: number }> = [];
  for (const p of active) {
    if (p.birthday && /^\d{4}-\d{2}-\d{2}/.test(p.birthday)) {
      const inDays = within7(p.birthday.slice(5, 10));
      if (inDays >= 0) celebrations.push({ userId: p.id, fullName: p.fullName, kind: 'BIRTHDAY', inDays });
    }
    const joined = p.createdAt?.slice(0, 10);
    if (joined) {
      const inDays = within7(joined.slice(5));
      const years = Number(addDays(today, Math.max(inDays, 0)).slice(0, 4)) - Number(joined.slice(0, 4));
      if (inDays >= 0 && years >= 1) celebrations.push({ userId: p.id, fullName: p.fullName, kind: 'ANNIVERSARY', inDays, years });
    }
  }
  celebrations.sort((a, b) => a.inDays - b.inDays);

  const endingInterns = input.interns
    .map((i) => ({ id: i.id, fullName: i.fullName, endDate: i.endDate, daysLeft: dayDiff(today, i.endDate) }))
    .filter((i) => i.daysLeft >= 0 && i.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    lateToday: late,
    absentToday: absent,
    onLeaveToday: leaveToday.map((p) => ({ userId: p.id, fullName: p.fullName })),
    leaveClashes: clashes,
    celebrations,
    pendingLeave: input.leaveRequests.filter((l) => l.status === 'PENDING').length,
    profileChangeRequests: input.approvals.filter((a) => a.status === 'PENDING' && a.type === 'PROFILE_CHANGE').length,
    assetsNeedingAttention: (input.assets ?? []).filter((a) => a.status === 'REPAIR' || a.condition === 'MAINTENANCE'),
    internsEndingSoon: endingInterns,
    headcount: {
      active: active.length,
      byRole: active.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.role]: (acc[p.role] ?? 0) + 1 }), {}),
    },
  };
}

export function buildCockpit(input: MyDayInput) {
  const { today, now } = input;
  const month = today.slice(0, 7);
  const entries = input.finance?.entries ?? [];
  const inMonth = entries.filter((e) => e.recordedAt?.slice(0, 7) === month);
  const income = inMonth.filter((e) => e.type === 'INCOME' || (e.type === 'INVOICE' && e.status === 'PAID')).reduce((s, e) => s + (e.amount || 0), 0);
  const expense = inMonth.filter((e) => e.type === 'EXPENSE' || e.type === 'PAYROLL').reduce((s, e) => s + (e.amount || 0), 0);
  const invoices = input.finance?.invoices ?? [];
  const unpaid = invoices.filter((i) => i.status === 'SENT' || i.status === 'OVERDUE');
  const overdueInvoices = unpaid.filter((i) => i.status === 'OVERDUE' || (i.dueDate && i.dueDate.slice(0, 10) < today));

  const since = now.getTime() - 30 * DAY_MS;
  const recent = input.timeEntries.filter((te) => Date.parse(te.startedAt) >= since);
  const totalMin = recent.reduce((s, te) => s + minutesOf(te, now), 0);
  const billableMin = recent.filter((te) => te.billable).reduce((s, te) => s + minutesOf(te, now), 0);

  const openBugs = input.bugs.filter(OPEN_BUG);
  const projectRisk = input.projects
    .filter((p) => p.status !== 'COMPLETED' && p.status !== 'CANCELLED' && p.status !== 'ON_HOLD')
    .map((p) => {
      const pt = input.tasks.filter((t) => t.projectId === p.id && !DONE_TASK.has(t.status));
      const blocked = pt.filter((t) => t.status === 'BLOCKED').length;
      const overdueTasks = pt.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today).length;
      const critical = openBugs.filter((b) => b.projectId === p.id && (b.severity === 'CRITICAL' || b.severity === 'BLOCKER')).length;
      const daysToEnd = p.expectedEndDate ? dayDiff(today, p.expectedEndDate) : Number.NaN;
      const pastDeadline = !Number.isNaN(daysToEnd) && daysToEnd < 0;
      const behind = !Number.isNaN(daysToEnd) && daysToEnd <= 14 && p.progressPercent < 80;
      const score = blocked * 3 + overdueTasks * 2 + critical * 4 + (pastDeadline ? 8 : 0) + (behind ? 4 : 0);
      const reasons: string[] = [];
      if (pastDeadline) reasons.push(`${-daysToEnd}d past deadline`);
      else if (behind) reasons.push(`${p.progressPercent}% done, ${daysToEnd}d left`);
      if (critical) reasons.push(`${critical} critical bug(s)`);
      if (blocked) reasons.push(`${blocked} blocked task(s)`);
      if (overdueTasks) reasons.push(`${overdueTasks} overdue task(s)`);
      return { id: p.id, code: p.code, name: p.name, clientName: p.clientName, progressPercent: p.progressPercent, score, reasons };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    month,
    income,
    expense,
    net: income - expense,
    outstandingInvoices: { count: unpaid.length, total: unpaid.reduce((s, i) => s + (i.totalAmount || 0), 0) },
    overdueInvoices: overdueInvoices.slice(0, 5).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      clientName: i.clientName,
      totalAmount: i.totalAmount,
      currency: i.currency,
      dueDate: i.dueDate,
    })),
    utilisation: {
      billableHours: Math.round((billableMin / 60) * 10) / 10,
      totalHours: Math.round((totalMin / 60) * 10) / 10,
      percent: totalMin ? Math.round((billableMin / totalMin) * 100) : 0,
    },
    riskiestProjects: projectRisk,
    activeProjects: input.projects.filter((p) => p.status === 'IN_PROGRESS' || p.status === 'TESTING').length,
    openCriticalBugs: openBugs.filter((b) => b.severity === 'CRITICAL' || b.severity === 'BLOCKER').length,
    sensitiveAudit: input.sensitiveAudit ?? [],
  };
}

export function buildMyDay(input: MyDayInput) {
  const role = input.viewer.role;
  const isManager = role === 'PROJECT_MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  const isHr = role === 'ADMIN' || role === 'SUPER_ADMIN';
  return {
    date: input.today,
    role,
    personal: buildPersonal(input),
    intern: role === 'INTERN' ? buildIntern(input) : null,
    manager: isManager ? buildManager(input) : null,
    hr: isHr ? buildHrDesk(input) : null,
    cockpit: role === 'SUPER_ADMIN' ? buildCockpit(input) : null,
  };
}

export function formatStandup(fullName: string, draft: { yesterday: string[]; today: string[]; blockers: string[] }): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `• ${i}`).join('\n') : '• —');
  return [
    `🧭 Daily standup — ${fullName}`,
    `Yesterday:\n${list(draft.yesterday)}`,
    `Today:\n${list(draft.today)}`,
    `Blockers:\n${list(draft.blockers)}`,
  ].join('\n\n');
}
