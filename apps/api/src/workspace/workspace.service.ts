import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, isPermissionKey, PERMISSIONS } from '../rbac/permissions';

export interface ClientItem {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface ProjectStageItem {
  id: string;
  position: number;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
}

export interface ProjectItem {
  id: string;
  code: string;
  name: string;
  description: string;
  clientId: string | null;
  clientName: string;
  category: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  budget: number;
  currency: string;
  startDate: string;
  expectedEndDate: string;
  managerName: string;
  techStack: string[];
  progressPercent: number;
  stages: ProjectStageItem[];
  createdAt: string;
}

export interface SprintItem {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  goal: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  startDate: string;
  endDate: string;
  retrospective: string;
}

export interface TaskItem {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  sprintId: string | null;
  sprintName: string | null;
  code: string;
  title: string;
  description: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'TESTING' | 'BLOCKED' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  storyPoints: number;
  estimatedHours: number;
  actualHours: number;
  assigneeName: string;
  assigneeEmail: string;
  dueDate: string;
  labels: string[];
}

export interface BugItem {
  id: string;
  projectId: string;
  projectName: string;
  code: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'FIXED' | 'TESTING' | 'VERIFIED' | 'CLOSED';
  reporterName: string;
  assigneeName: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  projectId: string | null;
  projectName: string;
  folder: string;
  title: string;
  type: string;
  version: number;
  mimeType: string;
  sizeBytes: number;
  visibility: string;
  uploadedByName: string;
  summary: string;
  updatedAt: string;
}

export interface TimeEntryItem {
  id: string;
  userId: string;
  userName: string;
  projectId: string | null;
  projectName: string;
  taskId: string | null;
  taskTitle: string;
  source: 'TIMER' | 'MANUAL';
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  billable: boolean;
  note: string;
}

export interface AttendanceItem {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  workDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  onBreak: boolean;
  breakMinutes: number;
  isLate: boolean;
  notes: string;
}

export interface LeaveRequestItem {
  id: string;
  userId: string;
  userName: string;
  type: 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approverName: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface InternItem {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  mentorName: string;
  university: string;
  programme: string;
  startDate: string;
  endDate: string;
  progressPercent: number;
  trainingTasks: Array<{
    id: string;
    weekNumber: number;
    title: string;
    completed: boolean;
  }>;
  evaluations: Array<{
    id: string;
    period: string;
    score: number;
    evaluatorName: string;
    strengths: string;
    improvements: string;
    feedback: string;
    createdAt: string;
  }>;
}

export interface ChatChannelItem {
  id: string;
  name: string;
  type: 'PROJECT' | 'DEPARTMENT' | 'GROUP' | 'DIRECT';
  description: string;
  projectName: string | null;
}

export interface ChatMessageItem {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export interface MeetingParticipant {
  userId: string;
  fullName: string;
  role: string;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  handRaised: boolean;
  joinedAt: string;
}

export interface MeetingChatMessage {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface MeetingItem {
  id: string;
  roomCode: string;
  projectId: string | null;
  projectName: string;
  organizerName: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'LIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  attendeeCount: number;
  notes: string;
  participants: MeetingParticipant[];
  chatMessages: MeetingChatMessage[];
}

export interface OrganizationSettings {
  name: string;
  slug: string;
  timezone: string;
  workDayStart: string;
  workDayEnd: string;
  idleTimeoutMinutes: number;
  enforceSingleTimer: boolean;
  requirePasswordRotationDays: number;
}

@Injectable()
export class WorkspaceService {
  private clients: ClientItem[] = [];

  private projects: ProjectItem[] = [];

  private sprints: SprintItem[] = [];

  private tasks: TaskItem[] = [];

  private bugs: BugItem[] = [];

  private documents: DocumentItem[] = [];

  private timeEntries: TimeEntryItem[] = [];
  private attendance: AttendanceItem[] = [];
  private leaveRequests: LeaveRequestItem[] = [];
  private interns: InternItem[] = [];

  private channels: ChatChannelItem[] = [
    {
      id: 'ch_general',
      name: 'general',
      type: 'GROUP',
      description: 'Company-wide announcements and team updates.',
      projectName: null,
    },
  ];

  private messages: ChatMessageItem[] = [];
  private meetings: MeetingItem[] = [];

  private settings: OrganizationSettings = {
    name: 'ProjectFlow Workspace',
    slug: 'projectflow',
    timezone: 'Asia/Colombo',
    workDayStart: '08:30',
    workDayEnd: '17:30',
    idleTimeoutMinutes: 10,
    enforceSingleTimer: true,
    requirePasswordRotationDays: 90,
  };

  private roleMatrix: Record<Role, string[]> = {
    SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
    ADMIN: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
    PROJECT_MANAGER: [...DEFAULT_ROLE_PERMISSIONS.PROJECT_MANAGER],
    STAFF: [...DEFAULT_ROLE_PERMISSIONS.STAFF],
    INTERN: [...DEFAULT_ROLE_PERMISSIONS.INTERN],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Overview counts for Dashboard ────────────────────────────────────────
  getWorkspaceCounts(actor: AuthUser) {
    const activeProjects = this.projects.filter((p) => p.status === 'IN_PROGRESS' || p.status === 'TESTING').length;
    const openTasks = this.tasks.filter((t) => t.status !== 'COMPLETED').length;
    const completedTasks = this.tasks.filter((t) => t.status === 'COMPLETED').length;
    const myTasks = this.tasks.filter(
      (t) => t.assigneeEmail === actor.email || t.assigneeName === actor.fullName,
    );
    const openBugs = this.bugs.filter((b) => b.status !== 'CLOSED' && b.status !== 'VERIFIED').length;
    const activeTimer = this.timeEntries.find((te) => te.userId === actor.id && te.endedAt === null) ?? null;
    const totalHoursLogged =
      Math.round(
        (this.timeEntries.reduce((acc, t) => acc + t.durationMinutes, 0) / 60) * 10,
      ) / 10;

    return {
      totalProjects: this.projects.length,
      activeProjects,
      totalTasks: this.tasks.length,
      openTasks,
      completedTasks,
      openBugs,
      totalHoursLogged,
      activeTimer,
      myTasks,
      recentProjects: this.projects.slice(0, 3),
    };
  }

  // ─── Clients ──────────────────────────────────────────────────────────────
  listClients() {
    return this.clients.map((c) => {
      const clientProjects = this.projects.filter((p) => p.clientId === c.id);
      const totalBudget = clientProjects.reduce((sum, p) => sum + p.budget, 0);
      return {
        ...c,
        projectCount: clientProjects.length,
        totalBudget,
      };
    });
  }

  async createClient(actor: AuthUser, body: Partial<ClientItem>) {
    if (!body.name || body.name.trim().length < 2) {
      throw new BadRequestException('Client name is required.');
    }
    const created: ClientItem = {
      id: `cli_${randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      contactName: body.contactName?.trim() || 'Primary Contact',
      contactEmail: body.contactEmail?.trim() || 'info@client.lk',
      contactPhone: body.contactPhone?.trim() || '+94 11 000 0000',
      address: body.address?.trim() || 'Colombo, Sri Lanka',
      notes: body.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    this.clients.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'CLIENT_CREATED',
      entityType: 'Client',
      entityId: created.id,
      metadata: { name: created.name },
    });
    return created;
  }

  deleteClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
    return { ok: true };
  }

  // ─── Projects ─────────────────────────────────────────────────────────────
  listProjects() {
    return this.projects;
  }

  async createProject(actor: AuthUser, body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Project name is required.');
    const nextNum = String(this.projects.length + 1).padStart(3, '0');
    const code = String(body.code ?? `PRJ-2026-${nextNum}`).trim();
    const client = this.clients.find((c) => c.id === body.clientId);
    const created: ProjectItem = {
      id: `prj_${randomUUID().slice(0, 8)}`,
      code,
      name,
      description: String(body.description ?? '').trim(),
      clientId: client?.id ?? null,
      clientName: client?.name ?? String(body.clientName || 'Internal / Yakunex'),
      category: String(body.category || 'WEB_DEVELOPMENT'),
      status: String(body.status || 'PLANNING'),
      priority: (body.priority as ProjectItem['priority']) || 'MEDIUM',
      budget: Number(body.budget) || 2500000,
      currency: 'LKR',
      startDate: String(body.startDate || new Date().toISOString().slice(0, 10)),
      expectedEndDate: String(body.expectedEndDate || '2026-12-31'),
      managerName: actor.fullName,
      techStack: Array.isArray(body.techStack)
        ? body.techStack.map(String)
        : String(body.techStack || 'Next.js, NestJS, PostgreSQL')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      progressPercent: Number(body.progressPercent) || 10,
      stages: [
        { id: randomUUID(), position: 1, name: 'Client Request & SRS', status: 'IN_PROGRESS' },
        { id: randomUUID(), position: 2, name: 'UI/UX & Architecture', status: 'PENDING' },
        { id: randomUUID(), position: 3, name: 'Core Development', status: 'PENDING' },
        { id: randomUUID(), position: 4, name: 'QA Testing & Handover', status: 'PENDING' },
      ],
      createdAt: new Date().toISOString(),
    };
    this.projects.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'PROJECT_CREATED',
      entityType: 'Project',
      entityId: created.id,
      metadata: { code: created.code, name: created.name },
    });
    return created;
  }

  async updateProject(actor: AuthUser, id: string, body: Record<string, unknown>) {
    const project = this.projects.find((p) => p.id === id);
    if (!project) throw new NotFoundException('Project not found.');
    if (body.status !== undefined) project.status = String(body.status);
    if (body.priority !== undefined) project.priority = body.priority as ProjectItem['priority'];
    if (body.progressPercent !== undefined) {
      project.progressPercent = Math.max(0, Math.min(100, Number(body.progressPercent)));
    }
    if (body.stageId && body.stageStatus) {
      const stage = project.stages.find((s) => s.id === body.stageId);
      if (stage) stage.status = body.stageStatus as ProjectStageItem['status'];
    }
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'PROJECT_UPDATED',
      entityType: 'Project',
      entityId: project.id,
      metadata: { status: project.status, progressPercent: project.progressPercent },
    });
    return project;
  }

  deleteProject(id: string) {
    this.projects = this.projects.filter((p) => p.id !== id);
    return { ok: true };
  }

  // ─── Sprints ──────────────────────────────────────────────────────────────
  listSprints() {
    return this.sprints.map((s) => {
      const sprintTasks = this.tasks.filter((t) => t.sprintId === s.id);
      const completedTasks = sprintTasks.filter((t) => t.status === 'COMPLETED').length;
      const totalPoints = sprintTasks.reduce((sum, t) => sum + t.storyPoints, 0);
      const completedPoints = sprintTasks
        .filter((t) => t.status === 'COMPLETED')
        .reduce((sum, t) => sum + t.storyPoints, 0);
      return {
        ...s,
        taskCount: sprintTasks.length,
        completedTaskCount: completedTasks,
        totalPoints,
        completedPoints,
      };
    });
  }

  async createSprint(actor: AuthUser, body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Sprint name is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const created: SprintItem = {
      id: `spr_${randomUUID().slice(0, 8)}`,
      projectId: project?.id ?? 'gen',
      projectName: project?.name ?? 'General Delivery',
      name,
      goal: String(body.goal ?? '').trim(),
      status: (body.status as SprintItem['status']) || 'PLANNED',
      startDate: String(body.startDate || new Date().toISOString().slice(0, 10)),
      endDate: String(body.endDate || '2026-11-30'),
      retrospective: '',
    };
    this.sprints.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'SPRINT_CREATED',
      entityType: 'Sprint',
      entityId: created.id,
      metadata: { name: created.name },
    });
    return created;
  }

  updateSprint(id: string, body: Record<string, unknown>) {
    const sprint = this.sprints.find((s) => s.id === id);
    if (!sprint) throw new NotFoundException('Sprint not found.');
    if (body.status) sprint.status = body.status as SprintItem['status'];
    if (body.retrospective !== undefined) sprint.retrospective = String(body.retrospective);
    return sprint;
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────
  listTasks() {
    return this.tasks;
  }

  async createTask(actor: AuthUser, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Task title is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const sprint = this.sprints.find((s) => s.id === body.sprintId) ?? null;
    const projId = project?.id ?? 'gen';
    const projCode = project?.code ?? 'GEN';
    const projName = project?.name ?? 'General Work';
    const countInProject = this.tasks.filter((t) => t.projectId === projId).length + 1;
    const created: TaskItem = {
      id: `tsk_${randomUUID().slice(0, 8)}`,
      projectId: projId,
      projectCode: projCode,
      projectName: projName,
      sprintId: sprint?.id ?? null,
      sprintName: sprint?.name ?? null,
      code: `${projCode}-T${String(countInProject).padStart(2, '0')}`,
      title,
      description: String(body.description ?? '').trim(),
      status: (body.status as TaskItem['status']) || 'TODO',
      priority: (body.priority as TaskItem['priority']) || 'MEDIUM',
      storyPoints: Number(body.storyPoints) || 3,
      estimatedHours: Number(body.estimatedHours) || 6,
      actualHours: 0,
      assigneeName: String(body.assigneeName || actor.fullName),
      assigneeEmail: String(body.assigneeEmail || actor.email),
      dueDate: String(body.dueDate || '2026-11-20'),
      labels: Array.isArray(body.labels)
        ? body.labels.map(String)
        : String(body.labels || 'feature')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    };
    this.tasks.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: created.id,
      metadata: { code: created.code, title: created.title },
    });
    return created;
  }

  updateTask(id: string, body: Record<string, unknown>) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundException('Task not found.');
    if (body.status) task.status = body.status as TaskItem['status'];
    if (body.priority) task.priority = body.priority as TaskItem['priority'];
    if (body.assigneeName) task.assigneeName = String(body.assigneeName);
    return task;
  }

  deleteTask(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    return { ok: true };
  }

  // ─── Bugs ─────────────────────────────────────────────────────────────────
  listBugs() {
    return this.bugs;
  }

  async createBug(actor: AuthUser, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Bug title is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const nextCode = `BUG-${String(this.bugs.length + 1).padStart(3, '0')}`;
    const created: BugItem = {
      id: `bug_${randomUUID().slice(0, 8)}`,
      projectId: project?.id ?? 'gen',
      projectName: project?.name ?? 'General Work',
      code: nextCode,
      title,
      description: String(body.description ?? '').trim(),
      stepsToReproduce: String(body.stepsToReproduce ?? '').trim(),
      expectedResult: String(body.expectedResult ?? '').trim(),
      actualResult: String(body.actualResult ?? '').trim(),
      severity: (body.severity as BugItem['severity']) || 'MAJOR',
      priority: (body.priority as BugItem['priority']) || 'HIGH',
      status: 'NEW',
      reporterName: actor.fullName,
      assigneeName: String(body.assigneeName || actor.fullName),
      createdAt: new Date().toISOString(),
    };
    this.bugs.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'BUG_REPORTED',
      entityType: 'Bug',
      entityId: created.id,
      metadata: { code: created.code, severity: created.severity },
    });
    return created;
  }

  updateBug(id: string, body: Record<string, unknown>) {
    const bug = this.bugs.find((b) => b.id === id);
    if (!bug) throw new NotFoundException('Bug not found.');
    if (body.status) bug.status = body.status as BugItem['status'];
    if (body.severity) bug.severity = body.severity as BugItem['severity'];
    if (body.assigneeName) bug.assigneeName = String(body.assigneeName);
    return bug;
  }

  // ─── Documents ────────────────────────────────────────────────────────────
  listDocuments() {
    return this.documents;
  }

  async createDocument(actor: AuthUser, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Document title is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const created: DocumentItem = {
      id: `doc_${randomUUID().slice(0, 8)}`,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General Workspace',
      folder: String(body.folder || '/specification'),
      title,
      type: String(body.type || 'TECHNICAL_DOC'),
      version: Number(body.version) || 1,
      mimeType: String(body.mimeType || 'application/pdf'),
      sizeBytes: Number(body.sizeBytes) || 524288,
      visibility: String(body.visibility || 'TEAM'),
      uploadedByName: actor.fullName,
      summary: String(body.summary ?? '').trim(),
      updatedAt: new Date().toISOString(),
    };
    this.documents.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'DOCUMENT_UPLOADED',
      entityType: 'Document',
      entityId: created.id,
      metadata: { title: created.title, type: created.type },
    });
    return created;
  }

  // ─── Time Tracker ─────────────────────────────────────────────────────────
  listTimeEntries(actor: AuthUser) {
    const activeTimer = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null) ?? null;
    return {
      activeTimer,
      entries: this.timeEntries,
    };
  }

  startTimer(actor: AuthUser, body: Record<string, unknown>) {
    const existing = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (existing) {
      throw new BadRequestException('You already have a running timer. Stop it before starting a new one.');
    }
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const task = this.tasks.find((t) => t.id === body.taskId) ?? null;
    const entry: TimeEntryItem = {
      id: `te_${randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.fullName,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General project work',
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? 'General project work',
      source: 'TIMER',
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMinutes: 0,
      billable: body.billable !== false,
      note: String(body.note ?? '').trim() || 'Active timer session',
    };
    this.timeEntries.unshift(entry);
    return entry;
  }

  stopTimer(actor: AuthUser) {
    const running = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (!running) {
      throw new BadRequestException('No running timer found.');
    }
    const endedAt = new Date();
    const startedAt = new Date(running.startedAt);
    const elapsedMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    running.endedAt = endedAt.toISOString();
    running.durationMinutes = elapsedMinutes;
    if (running.taskId) {
      const task = this.tasks.find((t) => t.id === running.taskId);
      if (task) {
        task.actualHours = Math.round((task.actualHours + elapsedMinutes / 60) * 10) / 10;
      }
    }
    return running;
  }

  logManualTime(actor: AuthUser, body: Record<string, unknown>) {
    const minutes = Number(body.durationMinutes) || 60;
    if (minutes <= 0 || minutes > 1440) {
      throw new BadRequestException('Duration must be between 1 and 1440 minutes.');
    }
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const task = this.tasks.find((t) => t.id === body.taskId) ?? null;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - minutes * 60000);
    const entry: TimeEntryItem = {
      id: `te_${randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.fullName,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General project work',
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? 'General project work',
      source: 'MANUAL',
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMinutes: minutes,
      billable: body.billable !== false,
      note: String(body.note ?? '').trim() || 'Manual time entry',
    };
    this.timeEntries.unshift(entry);
    if (task) {
      task.actualHours = Math.round((task.actualHours + minutes / 60) * 10) / 10;
    }
    return entry;
  }

  // ─── Attendance ───────────────────────────────────────────────────────────
  listAttendance(actor: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const myToday =
      this.attendance.find((a) => a.userId === actor.id && a.workDate === today) ??
      this.attendance.find((a) => a.userName === actor.fullName && a.workDate === '2026-11-08') ??
      null;
    return {
      todayRecord: myToday,
      records: this.attendance,
    };
  }

  clockIn(actor: AuthUser, body: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10);
    let record = this.attendance.find((a) => a.userId === actor.id && a.workDate === today);
    if (record && record.clockInAt && !record.clockOutAt) {
      throw new BadRequestException('You are already clocked in for today.');
    }
    if (!record) {
      record = {
        id: `att_${randomUUID().slice(0, 8)}`,
        userId: actor.id,
        userName: actor.fullName,
        userRole: actor.role,
        workDate: today,
        clockInAt: new Date().toISOString(),
        clockOutAt: null,
        onBreak: false,
        breakMinutes: 0,
        isLate: false,
        notes: String(body.notes ?? '').trim() || 'Clocked in from web workspace.',
      };
      this.attendance.unshift(record);
    } else {
      record.clockOutAt = null;
    }
    return record;
  }

  toggleBreak(actor: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const record =
      this.attendance.find((a) => a.userId === actor.id && a.workDate === today) ??
      this.attendance.find((a) => a.userName === actor.fullName && !a.clockOutAt);
    if (!record) throw new BadRequestException('Clock in first before starting a break.');
    if (record.onBreak) {
      record.onBreak = false;
      record.breakMinutes += 15;
    } else {
      record.onBreak = true;
    }
    return record;
  }

  clockOut(actor: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const record =
      this.attendance.find((a) => a.userId === actor.id && a.workDate === today) ??
      this.attendance.find((a) => a.userName === actor.fullName && !a.clockOutAt);
    if (!record) throw new BadRequestException('No active clock-in record found.');
    record.onBreak = false;
    record.clockOutAt = new Date().toISOString();
    return record;
  }

  // ─── Leave ────────────────────────────────────────────────────────────────
  listLeave() {
    return this.leaveRequests;
  }

  async createLeave(actor: AuthUser, body: Record<string, unknown>) {
    const startDate = String(body.startDate || '');
    const endDate = String(body.endDate || '');
    if (!startDate || !endDate) throw new BadRequestException('Start and end dates are required.');
    const created: LeaveRequestItem = {
      id: `lv_${randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.fullName,
      type: (body.type as LeaveRequestItem['type']) || 'ANNUAL',
      startDate,
      endDate,
      days: Math.max(0.5, Number(body.days) || 1),
      reason: String(body.reason ?? '').trim() || 'Personal leave',
      status: 'PENDING',
      approverName: null,
      decisionNote: null,
      createdAt: new Date().toISOString(),
    };
    this.leaveRequests.unshift(created);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'LEAVE_REQUESTED',
      entityType: 'LeaveRequest',
      entityId: created.id,
      metadata: { type: created.type, days: created.days },
    });
    return created;
  }

  async decideLeave(actor: AuthUser, id: string, body: Record<string, unknown>) {
    const req = this.leaveRequests.find((l) => l.id === id);
    if (!req) throw new NotFoundException('Leave request not found.');
    const status = body.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    req.status = status;
    req.approverName = actor.fullName;
    req.decisionNote = String(body.decisionNote ?? '').trim() || (status === 'APPROVED' ? 'Approved.' : 'Declined.');
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: `LEAVE_${status}`,
      entityType: 'LeaveRequest',
      entityId: req.id,
      metadata: { status },
    });
    return req;
  }

  // ─── Interns ──────────────────────────────────────────────────────────────
  listInterns() {
    return this.interns;
  }

  toggleInternTask(internId: string, taskId: string) {
    const intern = this.interns.find((i) => i.id === internId);
    if (!intern) throw new NotFoundException('Intern profile not found.');
    const task = intern.trainingTasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Training task not found.');
    task.completed = !task.completed;
    const done = intern.trainingTasks.filter((t) => t.completed).length;
    intern.progressPercent = Math.round((done / Math.max(1, intern.trainingTasks.length)) * 100);
    return intern;
  }

  addInternEvaluation(actor: AuthUser, internId: string, body: Record<string, unknown>) {
    const intern = this.interns.find((i) => i.id === internId);
    if (!intern) throw new NotFoundException('Intern profile not found.');
    const evalItem = {
      id: `ev_${randomUUID().slice(0, 8)}`,
      period: String(body.period || '2026-W45'),
      score: Math.max(1, Math.min(5, Number(body.score) || 5)),
      evaluatorName: actor.fullName,
      strengths: String(body.strengths ?? '').trim(),
      improvements: String(body.improvements ?? '').trim(),
      feedback: String(body.feedback ?? '').trim(),
      createdAt: new Date().toISOString(),
    };
    intern.evaluations.unshift(evalItem);
    return intern;
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  listChatChannels() {
    return this.channels;
  }

  listChatMessages(channelId: string) {
    return this.messages.filter((m) => m.channelId === channelId);
  }

  postChatMessage(actor: AuthUser, channelId: string, body: Record<string, unknown>) {
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    const msg: ChatMessageItem = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      channelId,
      senderId: actor.id,
      senderName: actor.fullName,
      senderRole: actor.role,
      body: text,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(msg);
    return msg;
  }

  createChatChannel(body: Record<string, unknown>) {
    const rawName = String(body.name ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (rawName.length < 2) throw new BadRequestException('Channel name is required.');
    const created: ChatChannelItem = {
      id: `ch_${randomUUID().slice(0, 8)}`,
      name: rawName,
      type: (body.type as ChatChannelItem['type']) || 'GROUP',
      description: String(body.description ?? '').trim() || 'Team discussion channel',
      projectName: body.projectName ? String(body.projectName) : null,
    };
    this.channels.push(created);
    return created;
  }

  // ─── Meetings (Built-in ProjectFlow Meet Engine) ──────────────────────────
  listMeetings() {
    return this.meetings;
  }

  getMeetingRoom(id: string) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting room not found.');
    return mtg;
  }

  scheduleMeeting(actor: AuthUser, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Meeting title is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const roomNum = Math.floor(100 + Math.random() * 900);
    const instant = Boolean(body.instant);
    const created: MeetingItem = {
      id: `mtg_${randomUUID().slice(0, 8)}`,
      roomCode: `PF-ROOM-${roomNum}`,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General / All-Hands',
      organizerName: actor.fullName,
      title,
      agenda: String(body.agenda ?? '').trim() || 'Live team sync & screen share session',
      startsAt: String(body.startsAt || new Date().toISOString()),
      endsAt: String(body.endsAt || new Date(Date.now() + 3600000).toISOString()),
      status: instant ? 'LIVE' : 'SCHEDULED',
      attendeeCount: 1,
      notes: String(body.notes ?? '').trim(),
      participants: instant
        ? [
            {
              userId: actor.id,
              fullName: actor.fullName,
              role: actor.role,
              micOn: true,
              camOn: true,
              screenSharing: false,
              handRaised: false,
              joinedAt: new Date().toISOString(),
            },
          ]
        : [],
      chatMessages: [],
    };
    this.meetings.unshift(created);
    return created;
  }

  updateMeeting(id: string, body: Record<string, unknown>) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    if (body.status) mtg.status = body.status as MeetingItem['status'];
    if (body.notes !== undefined) mtg.notes = String(body.notes);
    return mtg;
  }

  joinMeetingRoom(actor: AuthUser, id: string) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    if (mtg.status === 'SCHEDULED') mtg.status = 'LIVE';
    const existing = mtg.participants.find((p) => p.userId === actor.id);
    if (!existing) {
      mtg.participants.push({
        userId: actor.id,
        fullName: actor.fullName,
        role: actor.role,
        micOn: true,
        camOn: true,
        screenSharing: false,
        handRaised: false,
        joinedAt: new Date().toISOString(),
      });
    }
    mtg.attendeeCount = Math.max(mtg.attendeeCount, mtg.participants.length);
    return mtg;
  }

  leaveMeetingRoom(actor: AuthUser, id: string) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    mtg.participants = mtg.participants.filter((p) => p.userId !== actor.id);
    return mtg;
  }

  updateParticipantState(actor: AuthUser, id: string, body: Record<string, unknown>) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    let participant = mtg.participants.find((p) => p.userId === actor.id);
    if (!participant) {
      participant = {
        userId: actor.id,
        fullName: actor.fullName,
        role: actor.role,
        micOn: true,
        camOn: true,
        screenSharing: false,
        handRaised: false,
        joinedAt: new Date().toISOString(),
      };
      mtg.participants.push(participant);
    }
    if (body.micOn !== undefined) participant.micOn = Boolean(body.micOn);
    if (body.camOn !== undefined) participant.camOn = Boolean(body.camOn);
    if (body.screenSharing !== undefined) participant.screenSharing = Boolean(body.screenSharing);
    if (body.handRaised !== undefined) participant.handRaised = Boolean(body.handRaised);
    return mtg;
  }

  postMeetingChat(actor: AuthUser, id: string, body: Record<string, unknown>) {
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    mtg.chatMessages.push({
      id: `mc_${randomUUID().slice(0, 8)}`,
      senderName: actor.fullName,
      body: text,
      createdAt: new Date().toISOString(),
    });
    return mtg;
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  getReportsSummary() {
    const projectProgress = this.projects.map((p) => {
      const pTasks = this.tasks.filter((t) => t.projectId === p.id);
      const pHours = this.timeEntries
        .filter((te) => te.projectId === p.id)
        .reduce((sum, te) => sum + te.durationMinutes, 0);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        clientName: p.clientName,
        status: p.status,
        budget: p.budget,
        progressPercent: p.progressPercent,
        totalTasks: pTasks.length,
        completedTasks: pTasks.filter((t) => t.status === 'COMPLETED').length,
        hoursLogged: Math.round((pHours / 60) * 10) / 10,
      };
    });

    const bugsBySeverity = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR'].map((sev) => ({
      severity: sev,
      count: this.bugs.filter((b) => b.severity === sev).length,
    }));

    const tasksByStatus = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'TESTING', 'COMPLETED'].map((st) => ({
      status: st,
      count: this.tasks.filter((t) => t.status === st).length,
    }));

    return {
      projectProgress,
      bugsBySeverity,
      tasksByStatus,
      totalBillableMinutes: this.timeEntries.filter((t) => t.billable).reduce((s, t) => s + t.durationMinutes, 0),
      totalNonBillableMinutes: this.timeEntries.filter((t) => !t.billable).reduce((s, t) => s + t.durationMinutes, 0),
    };
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────
  async listAuditLogs(actor: AuthUser) {
    const dbLogs = await this.prisma.auditLog.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
    });
    return dbLogs;
  }

  // ─── Settings & Role Permission Matrix ────────────────────────────────────
  getSettings() {
    return {
      settings: this.settings,
      roleMatrix: this.roleMatrix,
      permissionCatalog: ALL_PERMISSION_KEYS,
    };
  }

  async updateSettings(actor: AuthUser, body: Partial<OrganizationSettings>) {
    this.settings = {
      ...this.settings,
      ...(body.name ? { name: String(body.name).trim() } : {}),
      ...(body.timezone ? { timezone: String(body.timezone).trim() } : {}),
      ...(body.workDayStart ? { workDayStart: String(body.workDayStart) } : {}),
      ...(body.workDayEnd ? { workDayEnd: String(body.workDayEnd) } : {}),
      ...(body.idleTimeoutMinutes !== undefined ? { idleTimeoutMinutes: Number(body.idleTimeoutMinutes) } : {}),
      ...(body.enforceSingleTimer !== undefined ? { enforceSingleTimer: Boolean(body.enforceSingleTimer) } : {}),
      ...(body.requirePasswordRotationDays !== undefined
        ? { requirePasswordRotationDays: Number(body.requirePasswordRotationDays) }
        : {}),
    };
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'Organization',
      entityId: actor.organizationId,
    });
    return this.settings;
  }

  async updateRolePermissions(actor: AuthUser, role: Role, permissions: string[]) {
    if (role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin permissions cannot be restricted.');
    }
    if (role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can modify Admin role permissions.');
    }
    const valid = permissions.filter(isPermissionKey);
    this.roleMatrix[role] = [...new Set(valid)];
    await this.prisma.rolePermission.deleteMany({
      where: { organizationId: actor.organizationId, role },
    });
    await this.prisma.rolePermission.createMany({
      data: this.roleMatrix[role].map((permissionKey) => ({
        organizationId: actor.organizationId,
        role,
        permissionKey,
      })),
      skipDuplicates: true,
    });
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'ROLE_PERMISSIONS_UPDATED',
      entityType: 'RolePermission',
      entityId: role,
      metadata: { role, count: this.roleMatrix[role].length },
    });
    return { role, permissions: this.roleMatrix[role] };
  }
}

