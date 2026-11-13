import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  BugSeverity,
  BugStatus,
  ChannelType,
  DocumentType,
  LeaveType,
  MeetingStatus,
  Priority,
  Prisma,
  ProjectCategory,
  ProjectStatus,
  Role,
  SprintStatus,
  StageStatus,
  TaskStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, isPermissionKey } from '../rbac/permissions';

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
  screenStreamId?: string | null;
  handRaised: boolean;
  joinedAt: string;
}

export interface MeetingChatMessage {
  id: string;
  senderId?: string;
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

export interface MeetingSignalItem {
  id?: string;
  seq: number;
  fromUserId: string;
  fromUserName: string;
  toUserId: string; // '*' for broadcast (reactions/screen-meta), or specific userId for SDP/ICE
  type: string;
  payload: unknown;
  createdAt: number;
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
export class WorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceService.name);
  private defaultOrgId: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private auditLogsCache = new Map<string, { data: unknown; expiresAt: number }>();
  private lastMeetingsSyncAt = 0;
  private meetingSignals = new Map<string, { seq: number; items: MeetingSignalItem[] }>();

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
    name: 'Yakunex Hub',
    slug: 'yakunex-hub',
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

  async onModuleInit(): Promise<void> {
    await this.prisma.waitForReady?.();
    await this.hydrateFromSupabase();
  }

  private async resolveOrgId(organizationId?: string): Promise<string | null> {
    if (organizationId) {
      this.defaultOrgId = organizationId;
      return organizationId;
    }
    if (this.defaultOrgId) return this.defaultOrgId;
    try {
      const org = await this.prisma.organization.findFirst({ select: { id: true } });
      this.defaultOrgId = org?.id ?? null;
      return this.defaultOrgId;
    } catch {
      return null;
    }
  }

  private async hydrateFromSupabase(): Promise<void> {
    try {
      const org = await this.prisma.organization.findFirst({
        select: { id: true, name: true, slug: true, timezone: true },
      });
      if (!org) return;
      this.defaultOrgId = org.id;
      this.settings.name = org.name;
      this.settings.slug = org.slug;
      this.settings.timezone = org.timezone;

      // 1. Load saved workspace state snapshot from SystemSetting if present
      const stateRow = await this.prisma.systemSetting?.findUnique?.({
        where: { organizationId_key: { organizationId: org.id, key: 'workspace_state' } },
      });
      if (stateRow?.value && typeof stateRow.value === 'object') {
        const snap = stateRow.value as Record<string, unknown>;
        if (Array.isArray(snap.clients)) this.clients = snap.clients as ClientItem[];
        if (Array.isArray(snap.projects)) this.projects = snap.projects as ProjectItem[];
        if (Array.isArray(snap.sprints)) this.sprints = snap.sprints as SprintItem[];
        if (Array.isArray(snap.tasks)) this.tasks = snap.tasks as TaskItem[];
        if (Array.isArray(snap.bugs)) this.bugs = snap.bugs as BugItem[];
        if (Array.isArray(snap.documents)) this.documents = snap.documents as DocumentItem[];
        if (Array.isArray(snap.timeEntries)) this.timeEntries = snap.timeEntries as TimeEntryItem[];
        if (Array.isArray(snap.attendance)) this.attendance = snap.attendance as AttendanceItem[];
        if (Array.isArray(snap.leaveRequests)) this.leaveRequests = snap.leaveRequests as LeaveRequestItem[];
        if (Array.isArray(snap.interns)) this.interns = snap.interns as InternItem[];
        if (Array.isArray(snap.channels) && snap.channels.length > 0) {
          this.channels = snap.channels as ChatChannelItem[];
        }
        if (Array.isArray(snap.messages)) this.messages = snap.messages as ChatMessageItem[];
        if (Array.isArray(snap.meetings)) this.meetings = snap.meetings as MeetingItem[];
        if (snap.settings && typeof snap.settings === 'object') {
          this.settings = { ...this.settings, ...(snap.settings as Partial<OrganizationSettings>) };
        }
      }

      // 2. Load role permission matrix from Supabase RolePermission table
      const rolePerms = await this.prisma.rolePermission?.findMany?.({
        where: { organizationId: org.id },
        select: { role: true, permissionKey: true },
      });
      if (Array.isArray(rolePerms) && rolePerms.length > 0) {
        const grouped: Record<Role, string[]> = {
          SUPER_ADMIN: [...ALL_PERMISSION_KEYS],
          ADMIN: [],
          PROJECT_MANAGER: [],
          STAFF: [],
          INTERN: [],
        };
        for (const rp of rolePerms) {
          if (rp.role !== Role.SUPER_ADMIN) {
            grouped[rp.role].push(rp.permissionKey);
          }
        }
        this.roleMatrix = grouped;
      }

      // 3. Ensure #general channel exists in Supabase ChatChannel table
      await this.prisma.chatChannel?.upsert?.({
        where: { id: 'ch_general' },
        update: {},
        create: {
          id: 'ch_general',
          organizationId: org.id,
          name: 'general',
          type: ChannelType.GROUP,
        },
      });

      this.logger.log('✅ Workspace state hydrated from Supabase PostgreSQL.');
    } catch (err) {
      this.logger.warn(`Workspace hydration skipped (in-memory fallback): ${(err as Error).message}`);
    }
  }

  private persistState(organizationId?: string): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistStateNow(organizationId);
    }, 400);
  }

  private async persistStateNow(organizationId?: string): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (!orgId || !this.prisma.systemSetting?.upsert) return;
      const payload = {
        clients: this.clients,
        projects: this.projects,
        sprints: this.sprints,
        tasks: this.tasks,
        bugs: this.bugs,
        documents: this.documents,
        timeEntries: this.timeEntries,
        attendance: this.attendance,
        leaveRequests: this.leaveRequests,
        interns: this.interns,
        channels: this.channels,
        messages: this.messages,
        meetings: this.meetings,
        settings: this.settings,
      } as unknown as Prisma.InputJsonValue;

      await this.prisma.systemSetting.upsert({
        where: { organizationId_key: { organizationId: orgId, key: 'workspace_state' } },
        update: { value: payload },
        create: {
          organizationId: orgId,
          key: 'workspace_state',
          value: payload,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist workspace_state to Supabase: ${(err as Error).message}`);
    }
  }

  /** Ensures a valid Project row exists in PostgreSQL when tasks/sprints/bugs use 'gen' or a projectId. */
  private async ensureDbProjectId(organizationId: string, projectId: string | null | undefined): Promise<string> {
    if (projectId && projectId !== 'gen') {
      const exists = await this.prisma.project?.findUnique?.({ where: { id: projectId }, select: { id: true } });
      if (exists) return projectId;
    }
    const genId = `prj_general_${organizationId.slice(0, 8)}`;
    await this.prisma.project?.upsert?.({
      where: { id: genId },
      update: {},
      create: {
        id: genId,
        organizationId,
        code: 'GEN-000',
        name: 'General Workspace',
        category: ProjectCategory.OTHER,
        status: ProjectStatus.IN_PROGRESS,
        priority: Priority.MEDIUM,
      },
    });
    return genId;
  }

  private isManagerOrAdmin(actor?: AuthUser): boolean {
    if (!actor) return true;
    return (
      actor.role === Role.SUPER_ADMIN ||
      actor.role === Role.ADMIN ||
      actor.role === Role.PROJECT_MANAGER
    );
  }

  // ─── Overview counts for Dashboard ────────────────────────────────────────
  getWorkspaceCounts(actor: AuthUser) {
    const canSeeAllTime = this.isManagerOrAdmin(actor);
    const visibleTimeEntries = canSeeAllTime
      ? this.timeEntries
      : this.timeEntries.filter((te) => te.userId === actor.id || te.userName === actor.fullName);

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
        (visibleTimeEntries.reduce((acc, t) => acc + t.durationMinutes, 0) / 60) * 10,
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
      recentProjects: this.listProjects(actor).slice(0, 3),
    };
  }

  // ─── Clients ──────────────────────────────────────────────────────────────
  listClients(actor?: AuthUser) {
    const showFinancials = this.isManagerOrAdmin(actor);
    return this.clients.map((c) => {
      const clientProjects = this.projects.filter((p) => p.clientId === c.id);
      const totalBudget = showFinancials ? clientProjects.reduce((sum, p) => sum + p.budget, 0) : 0;
      return {
        ...c,
        notes: showFinancials ? c.notes : '',
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
    this.persistState(actor.organizationId);
    void this.prisma.client?.upsert?.({
      where: { id: created.id },
      update: {
        name: created.name,
        contactName: created.contactName,
        contactEmail: created.contactEmail,
        contactPhone: created.contactPhone,
        address: created.address,
        notes: created.notes,
      },
      create: {
        id: created.id,
        organizationId: actor.organizationId,
        name: created.name,
        contactName: created.contactName,
        contactEmail: created.contactEmail,
        contactPhone: created.contactPhone,
        address: created.address,
        notes: created.notes,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Client sync: ${err.message}`));

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
    this.persistState();
    void this.prisma.client?.deleteMany?.({ where: { id } }).catch(() => undefined);
    return { ok: true };
  }

  // ─── Projects ─────────────────────────────────────────────────────────────
  listProjects(actor?: AuthUser) {
    if (this.isManagerOrAdmin(actor)) {
      return this.projects;
    }
    // Redact confidential contract budgets for Staff & Interns
    return this.projects.map((p) => ({
      ...p,
      budget: 0,
    }));
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
    this.persistState(actor.organizationId);

    void this.prisma.project?.upsert?.({
      where: { id: created.id },
      update: {},
      create: {
        id: created.id,
        organizationId: actor.organizationId,
        code: created.code,
        name: created.name,
        description: created.description,
        clientId: created.clientId,
        category: (created.category in ProjectCategory ? created.category : 'WEB_DEVELOPMENT') as ProjectCategory,
        status: (created.status in ProjectStatus ? created.status : 'PLANNING') as ProjectStatus,
        priority: (created.priority in Priority ? created.priority : 'MEDIUM') as Priority,
        budget: created.budget,
        currency: created.currency,
        startDate: new Date(created.startDate),
        expectedEndDate: new Date(created.expectedEndDate),
        managerId: actor.id,
        techStack: created.techStack,
        progressPercent: created.progressPercent,
        stages: {
          create: created.stages.map((s) => ({
            id: s.id,
            position: s.position,
            name: s.name,
            status: s.status as StageStatus,
          })),
        },
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Project sync: ${err.message}`));

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
    this.persistState(actor.organizationId);

    void this.prisma.project?.updateMany?.({
      where: { id: project.id },
      data: {
        status: (project.status in ProjectStatus ? project.status : 'PLANNING') as ProjectStatus,
        priority: (project.priority in Priority ? project.priority : 'MEDIUM') as Priority,
        progressPercent: project.progressPercent,
      },
    }).catch(() => undefined);

    if (body.stageId && body.stageStatus) {
      void this.prisma.projectStage?.updateMany?.({
        where: { id: String(body.stageId) },
        data: { status: String(body.stageStatus) as StageStatus },
      }).catch(() => undefined);
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
    this.persistState();
    void this.prisma.project?.deleteMany?.({ where: { id } }).catch(() => undefined);
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
    this.persistState(actor.organizationId);

    void (async () => {
      try {
        const dbProjId = await this.ensureDbProjectId(actor.organizationId, created.projectId);
        await this.prisma.sprint?.upsert?.({
          where: { id: created.id },
          update: {},
          create: {
            id: created.id,
            organizationId: actor.organizationId,
            projectId: dbProjId,
            name: created.name,
            goal: created.goal,
            status: (created.status in SprintStatus ? created.status : 'PLANNED') as SprintStatus,
            startDate: new Date(created.startDate),
            endDate: new Date(created.endDate),
            retrospective: created.retrospective,
          },
        });
      } catch (err) {
        this.logger.warn(`Supabase Sprint sync: ${(err as Error).message}`);
      }
    })();

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
    this.persistState();
    void this.prisma.sprint?.updateMany?.({
      where: { id: sprint.id },
      data: {
        status: (sprint.status in SprintStatus ? sprint.status : 'PLANNED') as SprintStatus,
        retrospective: sprint.retrospective,
      },
    }).catch(() => undefined);
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
    this.persistState(actor.organizationId);

    void (async () => {
      try {
        const dbProjId = await this.ensureDbProjectId(actor.organizationId, created.projectId);
        await this.prisma.task?.upsert?.({
          where: { id: created.id },
          update: {},
          create: {
            id: created.id,
            organizationId: actor.organizationId,
            projectId: dbProjId,
            sprintId: created.sprintId,
            code: `${created.code}-${created.id.slice(-4)}`,
            title: created.title,
            description: created.description,
            status: (created.status in TaskStatus ? created.status : 'TODO') as TaskStatus,
            priority: (created.priority in Priority ? created.priority : 'MEDIUM') as Priority,
            storyPoints: created.storyPoints,
            estimatedHours: created.estimatedHours,
            actualHours: created.actualHours,
            labels: created.labels,
            dueDate: new Date(created.dueDate),
            createdById: actor.id,
          },
        });
      } catch (err) {
        this.logger.warn(`Supabase Task sync: ${(err as Error).message}`);
      }
    })();

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
    this.persistState();
    void this.prisma.task?.updateMany?.({
      where: { id: task.id },
      data: {
        status: (task.status in TaskStatus ? task.status : 'TODO') as TaskStatus,
        priority: (task.priority in Priority ? task.priority : 'MEDIUM') as Priority,
        completedAt: task.status === 'COMPLETED' ? new Date() : null,
      },
    }).catch(() => undefined);
    return task;
  }

  deleteTask(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.persistState();
    void this.prisma.task?.deleteMany?.({ where: { id } }).catch(() => undefined);
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
    this.persistState(actor.organizationId);

    void (async () => {
      try {
        const dbProjId = await this.ensureDbProjectId(actor.organizationId, created.projectId);
        await this.prisma.bug?.upsert?.({
          where: { id: created.id },
          update: {},
          create: {
            id: created.id,
            organizationId: actor.organizationId,
            projectId: dbProjId,
            code: `${created.code}-${created.id.slice(-4)}`,
            title: created.title,
            description: created.description,
            stepsToReproduce: created.stepsToReproduce,
            expectedResult: created.expectedResult,
            actualResult: created.actualResult,
            severity: (created.severity in BugSeverity ? created.severity : 'MAJOR') as BugSeverity,
            priority: (created.priority in Priority ? created.priority : 'HIGH') as Priority,
            status: BugStatus.NEW,
            reportedById: actor.id,
            assigneeId: actor.id,
          },
        });
      } catch (err) {
        this.logger.warn(`Supabase Bug sync: ${(err as Error).message}`);
      }
    })();

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
    this.persistState();
    void this.prisma.bug?.updateMany?.({
      where: { id: bug.id },
      data: {
        status: (bug.status in BugStatus ? bug.status : 'NEW') as BugStatus,
        severity: (bug.severity in BugSeverity ? bug.severity : 'MAJOR') as BugSeverity,
      },
    }).catch(() => undefined);
    return bug;
  }

  // ─── Documents ────────────────────────────────────────────────────────────
  listDocuments(actor?: AuthUser) {
    if (this.isManagerOrAdmin(actor)) {
      return this.documents;
    }
    return this.documents.filter(
      (doc) => doc.visibility !== 'ADMIN_ONLY' && doc.visibility !== 'CONFIDENTIAL',
    );
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
    this.persistState(actor.organizationId);

    void this.prisma.document?.upsert?.({
      where: { id: created.id },
      update: {},
      create: {
        id: created.id,
        organizationId: actor.organizationId,
        projectId: created.projectId && created.projectId !== 'gen' ? created.projectId : null,
        folder: created.folder,
        title: created.title,
        type: (created.type in DocumentType ? created.type : 'TECHNICAL_DOC') as DocumentType,
        version: created.version,
        storageKey: `documents/${actor.organizationId}/${created.id}`,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        visibility: created.visibility,
        uploadedById: actor.id,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Document sync: ${err.message}`));

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
    const entries = this.isManagerOrAdmin(actor)
      ? this.timeEntries
      : this.timeEntries.filter((t) => t.userId === actor.id || t.userName === actor.fullName);
    return {
      activeTimer,
      entries,
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
    this.persistState(actor.organizationId);

    void this.prisma.timeEntry?.upsert?.({
      where: { id: entry.id },
      update: {},
      create: {
        id: entry.id,
        organizationId: actor.organizationId,
        userId: actor.id,
        projectId: entry.projectId && entry.projectId !== 'gen' ? entry.projectId : null,
        taskId: entry.taskId,
        source: 'TIMER',
        startedAt: new Date(entry.startedAt),
        endedAt: null,
        billable: entry.billable,
        note: entry.note,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase TimeEntry sync: ${err.message}`));

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
    this.persistState(actor.organizationId);
    void this.prisma.timeEntry?.updateMany?.({
      where: { id: running.id },
      data: { endedAt },
    }).catch(() => undefined);
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
    this.persistState(actor.organizationId);

    void this.prisma.timeEntry?.upsert?.({
      where: { id: entry.id },
      update: {},
      create: {
        id: entry.id,
        organizationId: actor.organizationId,
        userId: actor.id,
        projectId: entry.projectId && entry.projectId !== 'gen' ? entry.projectId : null,
        taskId: entry.taskId,
        source: 'MANUAL',
        startedAt,
        endedAt,
        billable: entry.billable,
        note: entry.note,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Manual TimeEntry sync: ${err.message}`));

    return entry;
  }

  // ─── Attendance ───────────────────────────────────────────────────────────
  listAttendance(actor: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const myToday =
      this.attendance.find((a) => a.userId === actor.id && a.workDate === today) ??
      this.attendance.find((a) => a.userName === actor.fullName && a.workDate === '2026-11-08') ??
      null;
    const records = this.isManagerOrAdmin(actor)
      ? this.attendance
      : this.attendance.filter((a) => a.userId === actor.id || a.userName === actor.fullName);
    return {
      todayRecord: myToday,
      records,
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
    this.persistState(actor.organizationId);

    const rec = record;
    void this.prisma.attendance?.upsert?.({
      where: {
        userId_workDate: {
          userId: actor.id,
          workDate: new Date(`${rec.workDate}T00:00:00.000Z`),
        },
      },
      update: {
        clockInAt: rec.clockInAt ? new Date(rec.clockInAt) : null,
        clockOutAt: null,
        notes: rec.notes,
      },
      create: {
        id: rec.id,
        organizationId: actor.organizationId,
        userId: actor.id,
        workDate: new Date(`${rec.workDate}T00:00:00.000Z`),
        clockInAt: rec.clockInAt ? new Date(rec.clockInAt) : new Date(),
        clockOutAt: null,
        isLate: rec.isLate,
        notes: rec.notes,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Attendance sync: ${err.message}`));

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
    this.persistState(actor.organizationId);
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
    this.persistState(actor.organizationId);

    void this.prisma.attendance?.updateMany?.({
      where: { userId: actor.id, workDate: new Date(`${record.workDate}T00:00:00.000Z`) },
      data: { clockOutAt: new Date(record.clockOutAt) },
    }).catch(() => undefined);

    return record;
  }

  // ─── Leave ────────────────────────────────────────────────────────────────
  listLeave(actor?: AuthUser) {
    if (!actor || this.isManagerOrAdmin(actor)) {
      return this.leaveRequests;
    }
    return this.leaveRequests.filter(
      (l) => l.userId === actor.id || l.userName === actor.fullName,
    );
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
    this.persistState(actor.organizationId);

    void this.prisma.leaveRequest?.upsert?.({
      where: { id: created.id },
      update: {},
      create: {
        id: created.id,
        organizationId: actor.organizationId,
        userId: actor.id,
        type: (created.type in LeaveType ? created.type : 'ANNUAL') as LeaveType,
        startDate: new Date(`${created.startDate}T00:00:00.000Z`),
        endDate: new Date(`${created.endDate}T00:00:00.000Z`),
        days: created.days,
        reason: created.reason,
        status: 'PENDING',
      },
    }).catch((err: Error) => this.logger.warn(`Supabase LeaveRequest sync: ${err.message}`));

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
    this.persistState(actor.organizationId);

    void this.prisma.leaveRequest?.updateMany?.({
      where: { id: req.id },
      data: {
        status,
        approverId: actor.id,
        decidedAt: new Date(),
        decisionNote: req.decisionNote,
      },
    }).catch(() => undefined);

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
  async listInterns(actor?: AuthUser) {
    try {
      const internUsers = await this.prisma.user.findMany({
        where: { role: Role.INTERN, deletedAt: null },
        select: { id: true, fullName: true, email: true, organizationId: true },
      });
      let changed = false;
      for (const u of internUsers) {
        if (!this.interns.some((i) => i.userId === u.id || i.email === u.email)) {
          const today = new Date().toISOString().slice(0, 10);
          const endDate = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
          const item: InternItem = {
            id: `int_${u.id.slice(0, 8)}`,
            userId: u.id,
            fullName: u.fullName,
            email: u.email,
            mentorName: 'Engineering Lead',
            university: 'University / Institute',
            programme: 'Software Engineering Internship',
            startDate: today,
            endDate,
            progressPercent: 0,
            trainingTasks: [
              { id: randomUUID(), weekNumber: 1, title: 'Workspace & Git Workflow Onboarding', completed: false },
              { id: randomUUID(), weekNumber: 2, title: 'TypeScript, React & NestJS Architecture', completed: false },
              { id: randomUUID(), weekNumber: 3, title: 'Database Schema & API Integration', completed: false },
              { id: randomUUID(), weekNumber: 4, title: 'Sprint Feature Delivery & Code Review', completed: false },
            ],
            evaluations: [],
          };
          this.interns.push(item);
          changed = true;
          void this.prisma.internProfile?.upsert?.({
            where: { userId: u.id },
            update: {},
            create: {
              id: item.id,
              organizationId: u.organizationId,
              userId: u.id,
              university: item.university,
              programme: item.programme,
              startDate: new Date(`${today}T00:00:00.000Z`),
              endDate: new Date(`${endDate}T00:00:00.000Z`),
              progressPercent: 0,
            },
          }).catch(() => undefined);
        }
      }
      if (changed) this.persistState();
    } catch {
      // Fallback to in-memory interns
    }
    if (actor && actor.role === Role.INTERN) {
      return this.interns.filter(
        (i) => i.userId === actor.id || i.email.toLowerCase() === actor.email.toLowerCase(),
      );
    }
    return this.interns;
  }

  toggleInternTask(actor: AuthUser | string, internIdOrTaskId: string, maybeTaskId?: string) {
    const internId = typeof actor === 'string' ? actor : internIdOrTaskId;
    const taskId = typeof actor === 'string' ? internIdOrTaskId : (maybeTaskId ?? '');
    const intern = this.interns.find((i) => i.id === internId);
    if (!intern) throw new NotFoundException('Intern profile not found.');
    if (
      typeof actor !== 'string' &&
      actor.role === Role.INTERN &&
      intern.userId !== actor.id &&
      intern.email.toLowerCase() !== actor.email.toLowerCase()
    ) {
      throw new ForbiddenException('Interns can only update their own training tasks.');
    }
    const task = intern.trainingTasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Training task not found.');
    task.completed = !task.completed;
    const done = intern.trainingTasks.filter((t) => t.completed).length;
    intern.progressPercent = Math.round((done / Math.max(1, intern.trainingTasks.length)) * 100);
    this.persistState();
    void this.prisma.internProfile?.updateMany?.({
      where: { userId: intern.userId },
      data: { progressPercent: intern.progressPercent },
    }).catch(() => undefined);
    return intern;
  }

  addInternEvaluation(actor: AuthUser, internId: string, body: Record<string, unknown>) {
    if (actor.role === Role.INTERN) {
      throw new ForbiddenException('Interns cannot submit evaluations.');
    }
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
    this.persistState(actor.organizationId);
    void this.prisma.evaluation?.create?.({
      data: {
        id: evalItem.id,
        organizationId: actor.organizationId,
        internProfileId: intern.id,
        evaluatorId: actor.id,
        period: evalItem.period,
        score: evalItem.score,
        strengths: evalItem.strengths,
        improvements: evalItem.improvements,
        feedback: evalItem.feedback,
      },
    }).catch(() => undefined);
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
    this.persistState(actor.organizationId);

    void (async () => {
      try {
        await this.prisma.chatChannel?.upsert?.({
          where: { id: channelId },
          update: {},
          create: {
            id: channelId,
            organizationId: actor.organizationId,
            name: this.channels.find((c) => c.id === channelId)?.name ?? 'general',
            type: ChannelType.GROUP,
          },
        });
        await this.prisma.message?.create?.({
          data: {
            id: msg.id,
            channelId: msg.channelId,
            senderId: actor.id,
            body: msg.body,
            mentions: [],
          },
        });
      } catch (err) {
        this.logger.warn(`Supabase Chat Message sync: ${(err as Error).message}`);
      }
    })();

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
    this.persistState();

    void (async () => {
      try {
        const orgId = await this.resolveOrgId();
        if (!orgId) return;
        await this.prisma.chatChannel?.upsert?.({
          where: { id: created.id },
          update: {},
          create: {
            id: created.id,
            organizationId: orgId,
            name: created.name,
            type: (created.type in ChannelType ? created.type : 'GROUP') as ChannelType,
          },
        });
      } catch {
        // Ignore if offline
      }
    })();

    return created;
  }

  // ─── Meetings (Built-in Yakunex Hub Meet Engine + WebRTC Signaling) ──────
  private async syncMeetingsFromDb(organizationId?: string, force = false): Promise<void> {
    if (!force && Date.now() - this.lastMeetingsSyncAt < 800) {
      return;
    }
    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (!orgId || !this.prisma.systemSetting?.findUnique) return;
      const setting = await this.prisma.systemSetting.findUnique({
        where: { organizationId_key: { organizationId: orgId, key: 'workspace_state' } },
      });
      const val = (setting?.value ?? null) as Record<string, unknown> | null;
      if (val && Array.isArray(val.meetings)) {
        this.meetings = val.meetings as MeetingItem[];
      }
      this.lastMeetingsSyncAt = Date.now();
    } catch {
      // Fallback to in-memory state if DB is temporarily unreachable
    }
  }

  private async appendMeetingSignal(
    meetingId: string,
    signal: Omit<MeetingSignalItem, 'id' | 'seq' | 'createdAt'>,
    organizationId?: string,
  ): Promise<number> {
    const now = Date.now();
    const sigId = `sig_${now}_${randomUUID().slice(0, 6)}`;
    const item: MeetingSignalItem = {
      id: sigId,
      ...signal,
      seq: now,
      createdAt: now,
    };

    const cached = this.meetingSignals.get(meetingId) ?? { seq: 0, items: [] };
    cached.items = [...cached.items.filter((x) => now - x.createdAt < 90_000).slice(-199), item];
    cached.seq = now;
    this.meetingSignals.set(meetingId, cached);

    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (orgId && this.prisma.systemSetting?.create) {
        const key = `msig:${meetingId}:${String(now).padStart(14, '0')}:${randomUUID().slice(0, 6)}`;
        await this.prisma.systemSetting.create({
          data: {
            organizationId: orgId,
            key,
            value: item as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch {
      // Non-fatal fallback to in-memory cache
    }
    return now;
  }

  async listMeetings(organizationId?: string) {
    await this.syncMeetingsFromDb(organizationId);
    return this.meetings;
  }

  async getMeetingRoom(id: string, organizationId?: string) {
    await this.syncMeetingsFromDb(organizationId);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting room not found.');
    return mtg;
  }

  async scheduleMeeting(actor: AuthUser, body: Record<string, unknown>) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Meeting title is required.');
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    let roomCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
    while (this.meetings.some((m) => m.roomCode === roomCode)) {
      roomCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
    }
    const instant = Boolean(body.instant);
    const micOn = body.micOn !== undefined ? Boolean(body.micOn) : true;
    const camOn = body.camOn !== undefined ? Boolean(body.camOn) : true;
    const created: MeetingItem = {
      id: `mtg_${randomUUID().slice(0, 8)}`,
      roomCode,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General / All-Hands',
      organizerName: actor.fullName,
      title,
      agenda: String(body.agenda ?? '').trim() || 'Live team sync & screen share session',
      startsAt: String(body.startsAt || new Date().toISOString()),
      endsAt: String(body.endsAt || new Date(Date.now() + 3600000).toISOString()),
      status: instant ? 'LIVE' : 'SCHEDULED',
      attendeeCount: instant ? 1 : 0,
      notes: String(body.notes ?? '').trim(),
      participants: instant
        ? [
            {
              userId: actor.id,
              fullName: actor.fullName,
              role: actor.role,
              micOn,
              camOn,
              screenSharing: false,
              handRaised: false,
              joinedAt: new Date().toISOString(),
            },
          ]
        : [],
      chatMessages: [],
    };
    this.meetings.unshift(created);
    await this.persistStateNow(actor.organizationId);

    void this.prisma.meeting?.upsert?.({
      where: { id: created.id },
      update: {},
      create: {
        id: created.id,
        organizationId: actor.organizationId,
        projectId: created.projectId && created.projectId !== 'gen' ? created.projectId : null,
        organizerId: actor.id,
        title: created.title,
        agenda: created.agenda,
        startsAt: new Date(created.startsAt),
        endsAt: new Date(created.endsAt),
        status: MeetingStatus.SCHEDULED,
        joinUrl: `/meetings?room=${created.roomCode}`,
      },
    }).catch((err: Error) => this.logger.warn(`Supabase Meeting sync: ${err.message}`));

    return created;
  }

  async updateMeeting(id: string, body: Record<string, unknown>, organizationId?: string) {
    await this.syncMeetingsFromDb(organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    if (body.status) {
      mtg.status = body.status as MeetingItem['status'];
      if (mtg.status === 'COMPLETED' || mtg.status === 'CANCELLED') {
        mtg.participants = [];
      }
    }
    if (body.title !== undefined && String(body.title).trim().length >= 2) {
      mtg.title = String(body.title).trim();
    }
    if (body.agenda !== undefined) mtg.agenda = String(body.agenda).trim();
    if (body.notes !== undefined) mtg.notes = String(body.notes);
    await this.persistStateNow(organizationId);
    if (mtg.status === 'COMPLETED' || mtg.status === 'CANCELLED') {
      await this.appendMeetingSignal(
        mtg.id,
        {
          fromUserId: 'system',
          fromUserName: 'Yakunex Meet Host',
          toUserId: '*',
          type: 'meeting-ended',
          payload: { status: mtg.status },
        },
        organizationId,
      );
    }
    void this.prisma.meeting?.updateMany?.({
      where: { id: mtg.id },
      data: {
        status:
          mtg.status === 'COMPLETED'
            ? MeetingStatus.COMPLETED
            : mtg.status === 'CANCELLED'
              ? MeetingStatus.CANCELLED
              : MeetingStatus.SCHEDULED,
      },
    }).catch(() => undefined);
    return mtg;
  }

  async joinMeetingRoom(
    actor: AuthUser,
    id: string,
    body?: { micOn?: boolean; camOn?: boolean },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    if (mtg.status === 'SCHEDULED' || mtg.status === 'COMPLETED') {
      mtg.status = 'LIVE';
    }
    const micOn = body?.micOn !== undefined ? Boolean(body.micOn) : true;
    const camOn = body?.camOn !== undefined ? Boolean(body.camOn) : true;
    const existing = mtg.participants.find((p) => p.userId === actor.id);
    if (existing) {
      if (body?.micOn !== undefined) existing.micOn = micOn;
      if (body?.camOn !== undefined) existing.camOn = camOn;
      existing.joinedAt = new Date().toISOString();
    } else {
      mtg.participants.push({
        userId: actor.id,
        fullName: actor.fullName,
        role: actor.role,
        micOn,
        camOn,
        screenSharing: false,
        handRaised: false,
        joinedAt: new Date().toISOString(),
      });
    }
    mtg.attendeeCount = Math.max(mtg.attendeeCount, mtg.participants.length);
    await this.persistStateNow(actor.organizationId);
    return mtg;
  }

  async joinMeetingByCode(
    actor: AuthUser,
    roomCode: string,
    body?: { micOn?: boolean; camOn?: boolean },
  ) {
    const normalized = String(roomCode ?? '').trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Room code is required.');
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find(
      (m) => m.roomCode.toUpperCase() === normalized || m.id.toUpperCase() === normalized,
    );
    if (!mtg) throw new NotFoundException(`No meeting room found for code "${normalized}".`);
    return this.joinMeetingRoom(actor, mtg.id, body);
  }

  async leaveMeetingRoom(actor: AuthUser, id: string) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    mtg.participants = mtg.participants.filter((p) => p.userId !== actor.id);
    await this.persistStateNow(actor.organizationId);
    await this.appendMeetingSignal(
      id,
      {
        fromUserId: actor.id,
        fromUserName: actor.fullName,
        toUserId: '*',
        type: 'peer-left',
        payload: { userId: actor.id },
      },
      actor.organizationId,
    );
    return mtg;
  }

  async updateParticipantState(actor: AuthUser, id: string, body: Record<string, unknown>) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
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
    if (body.screenSharing !== undefined) {
      participant.screenSharing = Boolean(body.screenSharing);
      if (!participant.screenSharing) participant.screenStreamId = null;
    }
    if (body.screenStreamId !== undefined) {
      participant.screenStreamId = body.screenStreamId ? String(body.screenStreamId) : null;
    }
    if (body.handRaised !== undefined) participant.handRaised = Boolean(body.handRaised);
    await this.persistStateNow(actor.organizationId);
    return mtg;
  }

  async hostMeetingAction(
    actor: AuthUser,
    id: string,
    body: { action: 'mute' | 'mute-all'; targetUserId?: string },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    const canHost = this.isManagerOrAdmin(actor) || mtg.organizerName === actor.fullName;
    if (!canHost) {
      throw new BadRequestException('Only the host or a manager/admin can run host controls.');
    }

    if (body.action === 'mute') {
      if (!body.targetUserId) throw new BadRequestException('targetUserId is required.');
      const target = mtg.participants.find((p) => p.userId === body.targetUserId);
      if (target) target.micOn = false;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'host-mute',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'mute-all') {
      for (const participant of mtg.participants) {
        if (participant.userId !== actor.id) {
          participant.micOn = false;
        }
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'host-mute',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    throw new BadRequestException('Unsupported host action.');
  }

  async sendMeetingSignal(
    actor: AuthUser,
    id: string,
    body: { toUserId?: string; type: string; payload: unknown },
  ) {
    const type = String(body?.type ?? '').trim();
    if (!type) throw new BadRequestException('Signal type is required.');
    const seq = await this.appendMeetingSignal(
      id,
      {
        fromUserId: actor.id,
        fromUserName: actor.fullName,
        toUserId: String(body?.toUserId || '*'),
        type,
        payload: body?.payload ?? null,
      },
      actor.organizationId,
    );
    return { ok: true, seq };
  }

  async pollMeetingSignals(actor: AuthUser, id: string, after: number) {
    const now = Date.now();
    let items: MeetingSignalItem[] = [];

    const floor = after > 0 ? Math.max(0, after - 4000) : Math.max(0, now - 6000);

    try {
      const orgId = await this.resolveOrgId(actor.organizationId);
      if (orgId && this.prisma.systemSetting?.findMany) {
        const prefix = `msig:${id}:`;
        const keyFilter: Prisma.StringFilter =
          floor > 0
            ? { startsWith: prefix, gte: `${prefix}${String(floor).padStart(14, '0')}` }
            : { startsWith: prefix };
        const rows = await this.prisma.systemSetting.findMany({
          where: { organizationId: orgId, key: keyFilter },
          orderBy: { key: 'asc' },
          take: 300,
        });
        items = rows
          .map((r) => r.value as unknown as MeetingSignalItem | null)
          .filter((v): v is MeetingSignalItem => Boolean(v && typeof v.createdAt === 'number'));

        // Prune expired signal rows (>90s) in background
        const cutoffKey = `${prefix}${String(now - 90_000).padStart(14, '0')}`;
        void this.prisma.systemSetting
          .deleteMany?.({
            where: {
              organizationId: orgId,
              key: { startsWith: prefix, lt: cutoffKey },
            },
          })
          .catch(() => undefined);
      }
    } catch {
      // Fallback to in-memory bucket
    }

    if (items.length === 0) {
      items = this.meetingSignals.get(id)?.items ?? [];
    }

    // 4-second overlap window ensures signals arriving near boundary timestamps across Lambdas are never missed;
    // client deduplicates cleanly via signal id.
    const signals = items.filter(
      (item) =>
        item.createdAt >= floor &&
        item.fromUserId !== actor.id &&
        (item.toUserId === '*' || item.toUserId === actor.id),
    );
    const baseSeq = after > 0 ? after : Math.max(0, now - 500);
    const maxTs = items.reduce((max, item) => Math.max(max, item.createdAt), baseSeq);
    return { seq: maxTs, signals };
  }

  async postMeetingChat(actor: AuthUser, id: string, body: Record<string, unknown>) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty.');
    mtg.chatMessages.push({
      id: `mc_${randomUUID().slice(0, 8)}`,
      senderId: actor.id,
      senderName: actor.fullName,
      body: text,
      createdAt: new Date().toISOString(),
    });
    await this.persistStateNow(actor.organizationId);
    return mtg;
  }

  // ─── Reports ──────────────────────────────────────────────────────────────
  getReportsSummary(actor?: AuthUser) {
    const canSeeFinancials = this.isManagerOrAdmin(actor);
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
        budget: canSeeFinancials ? p.budget : 0,
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
    const now = Date.now();
    const cached = this.auditLogsCache.get(actor.organizationId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
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
    this.auditLogsCache.set(actor.organizationId, { data: dbLogs, expiresAt: now + 10_000 });
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
    this.persistState(actor.organizationId);
    void this.prisma.organization?.update?.({
      where: { id: actor.organizationId },
      data: {
        name: this.settings.name,
        timezone: this.settings.timezone,
      },
    }).catch(() => undefined);

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

