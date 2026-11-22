export type Risk = 'GREEN' | 'AMBER' | 'RED';

export interface MyDayTask {
  id: string;
  code: string;
  title: string;
  projectId: string;
  projectName: string;
  status: string;
  priority: string;
  dueDate: string;
  overdue: boolean;
  dueToday: boolean;
}

export interface MyDayPersonal {
  todayTasks: MyDayTask[];
  taskCounts: { open: number; overdue: number; dueToday: number; blocked: number; inProgress: number };
  attendance: {
    clockedIn: boolean;
    clockedOut: boolean;
    onBreak: boolean;
    clockInAt: string | null;
    clockOutAt: string | null;
    isLate: boolean;
    workMode: string | null;
  };
  activeTimer: {
    id: string;
    taskId: string | null;
    taskTitle: string;
    projectName: string;
    startedAt: string;
    status: string;
    minutes: number;
  } | null;
  hoursToday: number;
  unsubmittedTimeEntries: number;
  meetingsToday: Array<{
    id: string;
    title: string;
    roomCode: string;
    startsAt: string;
    endsAt: string;
    status: string;
    organizerName: string;
    projectName: string;
  }>;
  leave: Record<string, { total: number; used: number; remaining: number }> | null;
  pendingLeave: number;
  unreadNotifications: number;
  standupDraft: { previousWorkDay: string; yesterday: string[]; today: string[]; blockers: string[] };
}

export interface MyDayIntern {
  internId: string;
  mentorName: string;
  mentorUserId?: string | null;
  programme: string;
  progressPercent: number;
  currentWeek: number;
  totalWeeks: number;
  thisWeek: Array<{ id: string; weekNumber: number; title: string; completed: boolean }>;
  overdueTraining: Array<{ id: string; weekNumber: number; title: string; completed: boolean }>;
  daysLeft: number | null;
  endDate: string;
  lastEvaluation: { period: string; score: number; createdAt: string } | null;
  reflectionSubmittedToday: boolean;
}

export interface PulsePerson {
  userId: string;
  fullName: string;
  companyId: string | null;
  role: string;
  state: 'WORKING' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ON_LEAVE' | 'NOT_IN';
  isLate: boolean;
  clockInAt: string | null;
  workMode: string | null;
  currentTask: string | null;
  openTasks: number;
  blockedTasks: Array<{ id: string; code: string; title: string }>;
  overdueTasks: number;
}

export interface InboxItem {
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

export interface MyDayManager {
  teamPulse: {
    summary: { total: number; working: number; onBreak: number; onLeave: number; notIn: number; late: number; blocked: number };
    people: PulsePerson[];
  };
  sprints: Array<{
    id: string;
    name: string;
    projectName: string;
    endDate: string;
    daysLeft: number;
    totalPoints: number;
    donePoints: number;
    completionPercent: number;
    elapsedPercent: number;
    overdue: number;
    blocked: number;
    risk: Risk;
  }>;
  approvalInbox: InboxItem[];
}

export interface MyDayHr {
  lateToday: Array<{ userId: string; fullName: string; clockInAt: string | null }>;
  absentToday: Array<{ userId: string; fullName: string; role: string }>;
  onLeaveToday: Array<{ userId: string; fullName: string }>;
  leaveClashes: Array<{ date: string; names: string[] }>;
  celebrations: Array<{ userId: string; fullName: string; kind: 'BIRTHDAY' | 'ANNIVERSARY'; inDays: number; years?: number }>;
  pendingLeave: number;
  profileChangeRequests: number;
  assetsNeedingAttention: Array<{ id: string; tag: string; name: string; status: string; condition: string; assignedToName?: string | null }>;
  internsEndingSoon: Array<{ id: string; fullName: string; endDate: string; daysLeft: number }>;
  headcount: { active: number; byRole: Record<string, number> };
}

export interface MyDayCockpit {
  month: string;
  income: number;
  expense: number;
  net: number;
  outstandingInvoices: { count: number; total: number };
  overdueInvoices: Array<{ id: string; invoiceNumber: string; clientName: string; totalAmount: number; currency: string; dueDate: string }>;
  utilisation: { billableHours: number; totalHours: number; percent: number };
  riskiestProjects: Array<{ id: string; code: string; name: string; clientName: string; progressPercent: number; score: number; reasons: string[] }>;
  activeProjects: number;
  openCriticalBugs: number;
  sensitiveAudit: Array<{ id: string; action: string; entityType: string; createdAt: string; actorName: string | null }>;
}

export interface MyDayData {
  date: string;
  role: string;
  personal: MyDayPersonal;
  intern: MyDayIntern | null;
  manager: MyDayManager | null;
  hr: MyDayHr | null;
  cockpit: MyDayCockpit | null;
}

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = Math.max(0, Math.round(m % 60));
  return h ? `${h}h ${mm}m` : `${mm}m`;
};

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
