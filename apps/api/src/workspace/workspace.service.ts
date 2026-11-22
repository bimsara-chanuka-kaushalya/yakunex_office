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
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';
import { AccessToken } from 'livekit-server-sdk';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { deepClone, mergeSnapshots } from './workspace-state-merge';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_ROLE_PERMISSIONS,
  DESIGNATION_TIER_PRESETS,
  TIER_ACCESS_MATRIX,
  isPermissionKey,
} from '../rbac/permissions';

export interface ClientItem {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  notes: string;
  portalToken?: string;
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
  issueType?: 'EPIC' | 'STORY' | 'TASK' | 'BUG';
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
  blockedByIds?: string[];
  prUrl?: string | null;
  branchName?: string | null;
  subtasks?: Array<{ id: string; title: string; done: boolean }>;
  comments?: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
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
  fileDataUrl?: string | null;
  fileName?: string | null;
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
  workCategory?: string;
  source: 'TIMER' | 'MANUAL';
  startedAt: string;
  endedAt: string | null;
  pausedAt?: string | null;
  pauseDurationSeconds?: number;
  durationMinutes: number;
  billable: boolean;
  note: string;
  status?: 'RUNNING' | 'PAUSED' | 'SAVED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED';
  approvedByName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  workMode?: 'OFFICE' | 'WFH' | 'CLIENT_SITE';
  selfieUrl?: string | null;
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
  workMode?: 'OFFICE' | 'REMOTE' | 'FIELD';
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationLabel?: string | null;
  deviceType?: string | null;
  geofenceStatus?: 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'REMOTE_APPROVED' | 'NO_GPS';
  distanceMeters?: number | null;
  lastLocationAt?: string | null;
  locationTrail?: Array<{ lat: number; lon: number; at: string }>;
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
  type: 'PROJECT' | 'DEPARTMENT' | 'GROUP' | 'DIRECT' | 'MANAGEMENT' | 'ANNOUNCEMENT' | 'PRIVATE' | 'EXTERNAL';
  category?: 'ANNOUNCEMENTS' | 'MANAGEMENT' | 'DEPARTMENTS' | 'TECHNICAL' | 'PROJECTS' | 'PRIVATE' | 'DIRECT';
  privacy?: 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  description: string;
  projectName: string | null;
  department?: string | null;
  allowedRoles?: Role[];
  allowedTitleKeywords?: string[];
  memberIds?: string[];
  ownerId?: string | null;
  allowInvites?: boolean;
}

export interface ChatMessageItem {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatarUrl?: string | null;
  body: string;
  replyToId?: string | null;
  replyPreview?: string | null;
  pinned?: boolean;
  editedAt?: string | null;
  deleted?: boolean;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  reactions?: Record<string, string[]>; // emoji -> userIds
  linkedTaskId?: string | null;
  linkedMeetingCode?: string | null;
  poll?: { question: string; options: Array<{ id: string; label: string; votes: string[] }> } | null;
  createdAt: string;
}

export interface MeetingParticipant {
  userId: string;
  companyId?: string | null;
  fullName: string;
  role: string;
  isGuest?: boolean;
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  screenStreamId?: string | null;
  handRaised: boolean;
  breakoutRoomId?: string | null;
  joinedAt: string;
}

export interface MeetingChatMessage {
  id: string;
  senderId?: string;
  senderName: string;
  body: string;
  createdAt: string;
  replyToId?: string | null;
  replyPreview?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

export interface MeetingPollItem {
  id: string;
  question: string;
  multipleChoice: boolean;
  options: Array<{ id: string; label: string; votes: string[] }>;
  status: 'OPEN' | 'CLOSED';
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface MeetingQaItem {
  id: string;
  authorId: string;
  authorName: string;
  question: string;
  upvoterIds: string[];
  answered: boolean;
  answerText?: string | null;
  answeredByName?: string | null;
  createdAt: string;
}

export interface BreakoutRoomItem {
  id: string;
  name: string;
  roomCode: string;
  participantIds: string[];
  active: boolean;
  endsAt?: string | null;
}

export interface MeetingAttendanceEntry {
  userId: string;
  fullName: string;
  companyId?: string | null;
  role: string;
  isGuest?: boolean;
  joinedAt: string;
  leftAt?: string | null;
  durationSec?: number;
}

export interface MeetingItem {
  id: string;
  roomCode: string;
  projectId: string | null;
  projectName: string;
  organizerId?: string;
  organizerName: string;
  title: string;
  agenda: string;
  startsAt: string;
  endsAt: string;
  status: 'LIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  meetingScope?: 'BOARD' | 'LEGAL' | 'DEPT' | 'PROJECT' | 'HR' | 'INTERNAL';
  allowedRoles?: string[];
  invitedUserIds?: string[];
  removedUserIds?: string[];
  allowExternalGuests?: boolean;
  recordingAllowed?: boolean;
  waitingRoomEnabled?: boolean;
  waitingRoomMessage?: string | null;
  passcode?: string | null;
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  isLocked?: boolean;
  suspendedActivities?: boolean;
  muteUponEntry?: boolean;
  allowUnmuteSelf?: boolean;
  allowStartVideo?: boolean;
  allowRenameSelf?: boolean;
  chatPermission?: 'EVERYONE_DM' | 'EVERYONE_PUBLIC' | 'HOST_ONLY' | 'DISABLED';
  screenShareMode?: 'ALL' | 'HOST_ONLY' | 'APPROVAL_REQUIRED';
  spotlightUserId?: string | null;
  recordingActive?: boolean;
  recordingByName?: string | null;
  waitingRoom?: Array<{
    userId: string;
    fullName: string;
    companyId?: string | null;
    role: string;
    isGuest?: boolean;
    requestedAt: string;
  }>;
  coHostIds?: string[];
  screenShareApprovedIds?: string[];
  polls?: MeetingPollItem[];
  qaItems?: MeetingQaItem[];
  breakoutRooms?: BreakoutRoomItem[];
  breakoutBroadcast?: { message: string; sentAt: string } | null;
  attendanceLog?: MeetingAttendanceEntry[];
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
  officeLatitude?: number;
  officeLongitude?: number;
  officeRadiusMeters?: number;
}

export interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MeetingIceConfig {
  iceServers: IceServerEntry[];
  hasTurn: boolean;
  iceCandidatePoolSize: number;
}

const DEFAULT_STUN_SERVERS: IceServerEntry[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const TASK_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'TESTING', 'BLOCKED', 'COMPLETED'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const ISSUE_TYPES = ['EPIC', 'STORY', 'TASK', 'BUG'] as const;
const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;
const BUG_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'FIXED', 'TESTING', 'VERIFIED', 'CLOSED'] as const;
const BUG_SEVERITIES = ['MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'] as const;
const PROJECT_STATUSES = Object.values(ProjectStatus) as string[];
const MEETING_STATUSES = ['LIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
const APPROVAL_DECISIONS = ['APPROVED', 'REJECTED', 'RETURNED'] as const;
const FINANCE_TYPES = ['INCOME', 'EXPENSE', 'INVOICE', 'PAYROLL'] as const;
const FINANCE_STATUSES = ['PAID', 'PENDING', 'APPROVED'] as const;
const ASSET_CONDITIONS = ['GOOD', 'MAINTENANCE', 'RETIRED'] as const;
const ASSET_STATUSES = ['ASSIGNED', 'AVAILABLE', 'REPAIR'] as const;

/**
 * Validates an enum-like request field. Empty values return `fallback`; anything outside
 * `allowed` is rejected with 400 instead of being stored as an invalid state.
 */
function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T,
): T;
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined;
function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback?: T,
): T | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toUpperCase();
  if (!(allowed as readonly string[]).includes(normalized)) {
    throw new BadRequestException(`Invalid ${field} "${String(value)}". Allowed: ${allowed.join(', ')}.`);
  }
  return normalized as T;
}

/** Built-in Sri Lanka public / Poya holidays. Add later years in the PublicHoliday table. */
const BUILTIN_HOLIDAYS: Array<{ date: string; name: string; type: string }> = [
  { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', type: 'POYA' },
  { date: '2026-01-15', name: 'Tamil Thai Pongal Day', type: 'MERCANTILE' },
  { date: '2026-02-01', name: 'Navam Full Moon Poya Day', type: 'POYA' },
  { date: '2026-02-04', name: 'Independence Day', type: 'MERCANTILE' },
  { date: '2026-03-02', name: 'Madin Full Moon Poya Day', type: 'POYA' },
  { date: '2026-04-01', name: 'Bak Full Moon Poya Day', type: 'POYA' },
  { date: '2026-04-13', name: 'Sinhala & Tamil New Year Eve', type: 'MERCANTILE' },
  { date: '2026-04-14', name: 'Sinhala & Tamil New Year Day', type: 'MERCANTILE' },
  { date: '2026-05-01', name: 'May Day & Vesak Full Moon Poya', type: 'MERCANTILE' },
  { date: '2026-05-02', name: 'Day Following Vesak Poya', type: 'POYA' },
  { date: '2026-05-30', name: 'Adhi Poson Full Moon Poya', type: 'POYA' },
  { date: '2026-06-29', name: 'Poson Full Moon Poya Day', type: 'POYA' },
  { date: '2026-07-29', name: 'Esala Full Moon Poya Day', type: 'POYA' },
  { date: '2026-08-27', name: 'Nikini Full Moon Poya Day', type: 'POYA' },
  { date: '2026-09-26', name: 'Binara Full Moon Poya Day', type: 'POYA' },
  { date: '2026-10-25', name: 'Vap Full Moon Poya Day', type: 'POYA' },
  { date: '2026-11-24', name: 'Il Full Moon Poya Day', type: 'POYA' },
  { date: '2026-12-23', name: 'Unduvap Full Moon Poya Day', type: 'POYA' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'MERCANTILE' },
];

/** Sri Lanka time (UTC+05:30) – payroll days must follow the local calendar, not UTC. */
const COLOMBO_OFFSET_MS = 330 * 60_000;
function colomboDate(iso: string): { date: string; dayOfWeek: number } {
  const local = new Date(Date.parse(iso) + COLOMBO_OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), dayOfWeek: local.getUTCDay() };
}

function containsTurnUrl(entry: IceServerEntry): boolean {
  const list = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
  return list.some((u) => typeof u === 'string' && /^turns?:/i.test(u.trim()));
}

@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(WorkspaceService.name);
  private defaultOrgId: string | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private auditLogsCache = new Map<string, { data: unknown; expiresAt: number }>();
  private iceConfigCache: { data: MeetingIceConfig; expiresAt: number } | null = null;
  private lastMeetingsSyncAt = 0;
  private lastSnapshotSyncAt = 0;
  /** Snapshot last read from / written to workspace_state (the merge base). */
  private baseSnapshot: Record<string, unknown> = {};
  /** updatedAt of the workspace_state row that `baseSnapshot` represents (optimistic lock). */
  private baseUpdatedAt: Date | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private persistQueued: Promise<void> | null = null;
  /** Profile pictures live in User.avatarUrl, never in the shared JSON snapshot. */
  private avatarCache = new Map<string, string>();
  private lastAvatarRefreshAt = 0;
  private lastSignalPruneAt = new Map<string, number>();
  private meetingMutationChain: Promise<unknown> = Promise.resolve();
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
      id: 'ch_announcements',
      name: 'company-announcements',
      type: 'ANNOUNCEMENT',
      category: 'ANNOUNCEMENTS',
      privacy: 'PUBLIC',
      description: 'Official company-wide notices & leadership updates.',
      projectName: null,
    },
    {
      id: 'ch_general',
      name: 'general',
      type: 'GROUP',
      category: 'ANNOUNCEMENTS',
      privacy: 'PUBLIC',
      description: 'All-employees general discussion and team updates.',
      projectName: null,
    },
    {
      id: 'ch_board_md',
      name: 'board-md-governance',
      type: 'MANAGEMENT',
      category: 'MANAGEMENT',
      privacy: 'CONFIDENTIAL',
      description: 'Board of Directors / MD & Company Secretary governance channel.',
      projectName: null,
      allowedTitleKeywords: ['md', 'managing director', 'ceo', 'company secretary', 'board'],
    },
    {
      id: 'ch_exec_mgmt',
      name: 'executive-management',
      type: 'MANAGEMENT',
      category: 'MANAGEMENT',
      privacy: 'PRIVATE',
      description: 'CEO, CTO, COO, CFO & HR Manager leadership sync.',
      projectName: null,
      allowedTitleKeywords: ['md', 'ceo', 'cto', 'coo', 'cfo', 'hr', 'director'],
    },
    {
      id: 'ch_dept_tech',
      name: 'technology-department',
      type: 'DEPARTMENT',
      category: 'DEPARTMENTS',
      privacy: 'PRIVATE',
      description: 'CTO, Tech Leads, SE, QA, UI/UX, DevOps & Interns.',
      projectName: null,
      allowedRoles: [Role.STAFF, Role.INTERN],
      allowedTitleKeywords: ['cto', 'tech lead', 'software', 'engineer', 'qa', 'ui/ux', 'devops', 'intern', 'dev'],
    },
    {
      id: 'ch_dept_ops',
      name: 'operations-delivery',
      type: 'DEPARTMENT',
      category: 'DEPARTMENTS',
      privacy: 'PRIVATE',
      description: 'COO, Project Managers, Business Analysts & Product Owners.',
      projectName: null,
      allowedRoles: [Role.PROJECT_MANAGER],
      allowedTitleKeywords: ['coo', 'project manager', 'pm', 'ba', 'po', 'business analyst', 'product owner'],
    },
    {
      id: 'ch_dept_finance',
      name: 'finance-confidential',
      type: 'DEPARTMENT',
      category: 'PRIVATE',
      privacy: 'CONFIDENTIAL',
      description: 'CFO & Accountant confidential finance & payroll channel.',
      projectName: null,
      allowedTitleKeywords: ['cfo', 'accountant', 'finance', 'md', 'ceo'],
    },
    {
      id: 'ch_dept_hr',
      name: 'hr-confidential',
      type: 'DEPARTMENT',
      category: 'PRIVATE',
      privacy: 'CONFIDENTIAL',
      description: 'HR Manager & Admin confidential people operations channel.',
      projectName: null,
      allowedTitleKeywords: ['hr', 'human resources', 'admin', 'ceo', 'md'],
    },
    {
      id: 'ch_dept_legal',
      name: 'legal-governance',
      type: 'DEPARTMENT',
      category: 'DEPARTMENTS',
      privacy: 'CONFIDENTIAL',
      description: 'Legal Admin & Company Secretary compliance & governance.',
      projectName: null,
      allowedTitleKeywords: ['company secretary', 'legal', 'md', 'ceo'],
    },
    {
      id: 'ch_tech_eng',
      name: 'software-engineering',
      type: 'GROUP',
      category: 'TECHNICAL',
      privacy: 'PUBLIC',
      description: 'Architecture, PR reviews, APIs & frontend engineering.',
      projectName: null,
      allowedRoles: [Role.STAFF, Role.INTERN, Role.PROJECT_MANAGER, Role.ADMIN, Role.SUPER_ADMIN],
    },
    {
      id: 'ch_tech_qa',
      name: 'qa-testing',
      type: 'GROUP',
      category: 'TECHNICAL',
      privacy: 'PUBLIC',
      description: 'QA coordination, test plans & release sign-off.',
      projectName: null,
      allowedRoles: [Role.STAFF, Role.INTERN, Role.PROJECT_MANAGER, Role.ADMIN, Role.SUPER_ADMIN],
    },
    {
      id: 'ch_tech_interns',
      name: 'interns-mentorship',
      type: 'GROUP',
      category: 'TECHNICAL',
      privacy: 'PUBLIC',
      description: 'Intern cohort, training plans & mentor Q&A.',
      projectName: null,
      allowedRoles: [Role.INTERN, Role.STAFF, Role.PROJECT_MANAGER, Role.ADMIN, Role.SUPER_ADMIN],
    },
  ];

  private messages: ChatMessageItem[] = [];
  private meetings: MeetingItem[] = [];

  private departments: Array<{
    id: string;
    name: string;
    code: string;
    headTitle: string;
    description: string;
    createdAt: string;
  }> = [
    { id: 'dept_exec', name: 'Executive Board', code: 'EXEC', headTitle: 'CEO / MD', description: 'Board of Directors, MD & Executive Operations', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dept_eng', name: 'Engineering & Product', code: 'ENG', headTitle: 'CTO', description: 'Tech Leads, Software Engineers, QA, UI/UX, DevOps & Interns', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dept_ops', name: 'Operations & Delivery', code: 'OPS', headTitle: 'COO', description: 'Project Managers, Business Analysts & Delivery Teams', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dept_fin', name: 'Finance & Accounting', code: 'FIN', headTitle: 'CFO', description: 'Financial Planning, Payroll, Invoices & Accounting', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dept_hr', name: 'HR & Administration', code: 'HR', headTitle: 'HR Manager', description: 'People Operations, Recruitment, Attendance & Office Admin', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'dept_legal', name: 'Legal & Governance', code: 'LEGAL', headTitle: 'Company Secretary', description: 'Board Resolutions, Compliance & Governance', createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  private reportingManagers: Record<string, string | null> = {};

  private approvals: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    requestedById: string;
    requestedByName: string;
    amount?: number;
    meta?: { targetUserId?: string; field?: 'nicNumber' | 'phone'; newValue?: string };
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED';
    decidedByName?: string | null;
    comment?: string | null;
    createdAt: string;
    decidedAt?: string | null;
  }> = [];

  private financeEntries: Array<{
    id: string;
    type: 'INCOME' | 'EXPENSE' | 'INVOICE' | 'PAYROLL';
    category: string;
    description: string;
    projectName?: string | null;
    amount: number;
    status: 'PAID' | 'PENDING' | 'APPROVED';
    recordedByName: string;
    recordedAt: string;
  }> = [];

  private clientInvoices: Array<{
    id: string;
    invoiceNumber: string;
    clientId?: string | null;
    clientName: string;
    projectId?: string | null;
    projectName?: string | null;
    issueDate: string;
    dueDate: string;
    currency: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
    subtotal: number;
    ssclRate: number;
    ssclAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
    notes: string;
    createdByName: string;
    paidAt?: string | null;
    createdAt: string;
  }> = [];

  private assets: Array<{
    id: string;
    tag: string;
    name: string;
    category: 'LAPTOP' | 'MONITOR' | 'LICENSE' | 'MOBILE' | 'OFFICE';
    assignedToName?: string | null;
    condition: 'GOOD' | 'MAINTENANCE' | 'RETIRED';
    status: 'ASSIGNED' | 'AVAILABLE' | 'REPAIR';
    updatedAt: string;
  }> = [];

  private performanceReviews: Array<{
    id: string;
    employeeName: string;
    period: string;
    goalTitle: string;
    completionPercent: number;
    rating: number;
    feedback: string;
    reviewerName: string;
    createdAt: string;
  }> = [];

  private readonly notificationBus = new EventEmitter();
  private readonly workspaceBus = new EventEmitter();
  private workspaceVersion = Date.now();

  private notifications: Array<{
    id: string;
    type: 'ANNOUNCEMENT' | 'APPROVAL' | 'MEETING' | 'TASK' | 'SYSTEM';
    title: string;
    body: string;
    targetUserId: string; // '*' for company-wide
    allowedRoles?: string[];
    targetUserIds?: string[];
    meetingId?: string | null;
    roomCode?: string | null;
    actionUrl?: string | null;
    hostName?: string | null;
    isLiveMeeting?: boolean;
    readByIds: string[];
    authorName: string;
    createdAt: string;
  }> = [];

  private userProfiles: Record<
    string,
    {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      nicNumber?: string;
      address?: string;
      birthday?: string;
      phone?: string;
      role?: Role;
      title?: string;
      monthlyBasicSalaryLkr?: number;
      fixedAllowancesLkr?: number;
      epfNumber?: string;
      bankName?: string;
      bankBranch?: string;
      bankAccountNo?: string;
    }
  > = {};

  private settings: OrganizationSettings = {
    name: 'Yakunex Hub',
    slug: 'yakunex-hub',
    timezone: 'Asia/Colombo',
    workDayStart: '08:30',
    workDayEnd: '17:30',
    idleTimeoutMinutes: 10,
    enforceSingleTimer: true,
    requirePasswordRotationDays: 90,
    officeLatitude: 6.9271,
    officeLongitude: 79.8612,
    officeRadiusMeters: 250,
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

  /**
   * The in-memory workspace holds exactly one organization's data. Requests from any other
   * organization are rejected by WorkspaceTenantGuard so their data can never mix.
   */
  async getPrimaryOrgId(): Promise<string | null> {
    return this.resolveOrgId();
  }

  private async resolveOrgId(organizationId?: string): Promise<string | null> {
    if (this.defaultOrgId) return this.defaultOrgId;
    if (organizationId) {
      this.defaultOrgId = organizationId;
      return organizationId;
    }
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
        const snap = this.normalizeSnapshot(stateRow.value);
        this.baseSnapshot = deepClone(snap);
        this.baseUpdatedAt = stateRow.updatedAt ?? null;
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
          const merged = new Map<string, ChatChannelItem>(this.channels.map((c) => [c.id, c]));
          for (const saved of snap.channels as ChatChannelItem[]) {
            if (saved?.id) {
              const base = merged.get(saved.id);
              merged.set(
                saved.id,
                base
                  ? {
                      ...base,
                      ...saved,
                      category: saved.category ?? base.category,
                      privacy: saved.privacy ?? base.privacy,
                      allowedRoles: saved.allowedRoles ?? base.allowedRoles,
                      allowedTitleKeywords: saved.allowedTitleKeywords ?? base.allowedTitleKeywords,
                    }
                  : saved,
              );
            }
          }
          this.channels = Array.from(merged.values());
        }
        if (Array.isArray(snap.messages)) this.messages = snap.messages as ChatMessageItem[];
        if (Array.isArray(snap.meetings)) this.meetings = snap.meetings as MeetingItem[];
        if (Array.isArray(snap.departments) && snap.departments.length > 0) this.departments = snap.departments as WorkspaceService['departments'];
        if (snap.reportingManagers && typeof snap.reportingManagers === 'object') this.reportingManagers = snap.reportingManagers as Record<string, string | null>;
        if (Array.isArray(snap.approvals)) this.approvals = snap.approvals as WorkspaceService['approvals'];
        if (Array.isArray(snap.financeEntries)) this.financeEntries = snap.financeEntries as WorkspaceService['financeEntries'];
        if (Array.isArray(snap.clientInvoices)) this.clientInvoices = snap.clientInvoices as WorkspaceService['clientInvoices'];
        if (Array.isArray(snap.assets)) this.assets = snap.assets as WorkspaceService['assets'];
        if (Array.isArray(snap.performanceReviews)) this.performanceReviews = snap.performanceReviews as WorkspaceService['performanceReviews'];
        if (Array.isArray(snap.notifications)) this.notifications = snap.notifications as WorkspaceService['notifications'];
        if (snap.userProfiles && typeof snap.userProfiles === 'object') {
          this.userProfiles = snap.userProfiles as WorkspaceService['userProfiles'];
        }
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

      await this.refreshAvatarCache(org.id, true);

      this.logger.log('✅ Workspace state hydrated from Supabase PostgreSQL.');
    } catch (err) {
      this.logger.warn(`Workspace hydration skipped (in-memory fallback): ${(err as Error).message}`);
    }
  }

  // ─── Shared snapshot (workspace_state) synchronisation ───────────────────
  // Every load merges the stored snapshot with this instance's unsaved changes, and every
  // save is an optimistic, compare-and-swap write on SystemSetting.updatedAt. Concurrent
  // writers therefore merge instead of overwriting each other (no lost updates, and deleted
  // rows can no longer reappear from a stale read).

  private static readonly STATE_KEYS = [
    'clients',
    'projects',
    'sprints',
    'tasks',
    'bugs',
    'documents',
    'timeEntries',
    'attendance',
    'leaveRequests',
    'interns',
    'channels',
    'messages',
    'meetings',
    'departments',
    'reportingManagers',
    'approvals',
    'financeEntries',
    'clientInvoices',
    'assets',
    'performanceReviews',
    'notifications',
    'userProfiles',
    'settings',
  ] as const;

  private static readonly MAX_MESSAGES_PER_CHANNEL = 2000;
  private static readonly MAX_NOTIFICATIONS = 1000;

  private captureState(): Record<string, unknown> {
    const self = this as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of WorkspaceService.STATE_KEYS) out[key] = self[key];
    return out;
  }

  private applyState(snap: Record<string, unknown>): void {
    const self = this as unknown as Record<string, unknown>;
    for (const key of WorkspaceService.STATE_KEYS) {
      const value = snap[key];
      if (value === undefined) continue;
      if (key === 'settings') {
        if (value && typeof value === 'object') {
          this.settings = { ...this.settings, ...(value as Partial<OrganizationSettings>) };
        }
        continue;
      }
      if (key === 'reportingManagers' || key === 'userProfiles') {
        if (value && typeof value === 'object' && !Array.isArray(value)) self[key] = value;
        continue;
      }
      if (Array.isArray(value)) self[key] = value;
    }
  }

  /**
   * Moves inline profile pictures out of the shared snapshot (they belong in User.avatarUrl)
   * and drops base64 avatars that older versions copied into every chat message.
   */
  private normalizeSnapshot(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const snap = value as Record<string, unknown>;
    const profiles = snap.userProfiles;
    if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
      for (const [userId, profile] of Object.entries(profiles as Record<string, Record<string, unknown>>)) {
        if (profile && typeof profile === 'object' && 'avatarDataUrl' in profile) {
          const avatar = profile.avatarDataUrl;
          if (typeof avatar === 'string' && avatar.trim() && !this.avatarCache.has(userId)) {
            this.avatarCache.set(userId, avatar);
          }
          delete profile.avatarDataUrl;
        }
      }
    }
    if (Array.isArray(snap.messages)) {
      for (const m of snap.messages as Array<Record<string, unknown>>) {
        if (m && typeof m.senderAvatarUrl === 'string' && m.senderAvatarUrl.startsWith('data:')) {
          m.senderAvatarUrl = null;
        }
      }
    }
    return snap;
  }

  /** Keeps the shared snapshot bounded: chat history per channel and the notification feed. */
  private pruneState(): void {
    const maxPerChannel = WorkspaceService.MAX_MESSAGES_PER_CHANNEL;
    const counts = new Map<string, number>();
    for (const m of this.messages) counts.set(m.channelId, (counts.get(m.channelId) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > maxPerChannel)) {
      const keepFrom = new Map<string, number>();
      for (const [ch, n] of counts) keepFrom.set(ch, Math.max(0, n - maxPerChannel));
      const seen = new Map<string, number>();
      this.messages = this.messages.filter((m) => {
        const idx = seen.get(m.channelId) ?? 0;
        seen.set(m.channelId, idx + 1);
        return m.pinned || idx >= (keepFrom.get(m.channelId) ?? 0);
      });
    }
    if (this.notifications.length > WorkspaceService.MAX_NOTIFICATIONS) {
      this.notifications = [...this.notifications]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, WorkspaceService.MAX_NOTIFICATIONS);
    }
  }

  /** Merges a stored snapshot into memory without discarding this instance's unsaved changes. */
  private mergeRemoteSnapshot(value: unknown, updatedAt: Date | null): void {
    const remote = this.normalizeSnapshot(value);
    const merged = mergeSnapshots(
      this.baseSnapshot,
      this.captureState(),
      remote,
      WorkspaceService.STATE_KEYS,
    );
    this.applyState(merged);
    this.baseSnapshot = deepClone(remote);
    this.baseUpdatedAt = updatedAt;
  }

  private async loadRemoteSnapshot(organizationId?: string): Promise<boolean> {
    const orgId = await this.resolveOrgId(organizationId);
    if (!orgId || !this.prisma.systemSetting?.findUnique) return false;
    const row = await this.prisma.systemSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'workspace_state' } },
    });
    if (!row?.value || typeof row.value !== 'object') return true;
    const rowUpdatedAt = row.updatedAt instanceof Date ? row.updatedAt : null;
    if (rowUpdatedAt && this.baseUpdatedAt && rowUpdatedAt.getTime() === this.baseUpdatedAt.getTime()) {
      return true; // nothing new in the database
    }
    this.mergeRemoteSnapshot(row.value, rowUpdatedAt);
    return true;
  }

  private async refreshAvatarCache(organizationId?: string, force = false): Promise<void> {
    if (!force && Date.now() - this.lastAvatarRefreshAt < 60_000) return;
    this.lastAvatarRefreshAt = Date.now();
    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (!orgId || !this.prisma.user?.findMany) return;
      const rows = (await this.prisma.user.findMany({
        where: { organizationId: orgId, avatarUrl: { not: null } },
        select: { id: true, avatarUrl: true },
      })) as Array<{ id: string; avatarUrl: string | null }>;
      for (const r of rows ?? []) {
        if (r.avatarUrl) this.avatarCache.set(r.id, r.avatarUrl);
      }
    } catch {
      // Avatars are cosmetic; keep the cached values.
    }
  }

  private avatarOf(userId: string, fallback?: string | null): string | null {
    return this.avatarCache.get(userId) ?? fallback ?? null;
  }

  private async syncSnapshotFromSupabase(organizationId?: string, force = false): Promise<void> {
    if (!force && Date.now() - this.lastSnapshotSyncAt < 2000) return;
    try {
      const done = await this.loadRemoteSnapshot(organizationId);
      if (done) this.lastSnapshotSyncAt = Date.now();
      if (force) {
        await this.refreshAvatarCache(organizationId, true);
      } else {
        void this.refreshAvatarCache(organizationId);
      }
    } catch {
      // Non-fatal fallback
    }
  }

  private persistState(organizationId?: string): void {
    if (!this.prisma.systemSetting?.upsert) return;
    void this.persistStateNow(organizationId);
  }

  /**
   * Serialises saves within this instance. A save that is queued but not yet started already
   * includes every change made before it starts, so later callers share it.
   */
  private persistStateNow(organizationId?: string): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistQueued) return this.persistQueued;
    const run = this.persistChain.then(() => {
      this.persistQueued = null;
      return this.writeSnapshot(organizationId);
    });
    this.persistQueued = run;
    this.persistChain = run.catch(() => undefined);
    return run;
  }

  private async writeSnapshot(organizationId?: string): Promise<void> {
    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (!orgId || !this.prisma.systemSetting?.upsert) return;
      const where = { organizationId_key: { organizationId: orgId, key: 'workspace_state' } };
      const canCompareAndSwap =
        typeof this.prisma.systemSetting.findUnique === 'function' &&
        typeof this.prisma.systemSetting.updateMany === 'function';

      if (!canCompareAndSwap) {
        this.pruneState();
        const payload = deepClone(this.captureState());
        await this.prisma.systemSetting.upsert({
          where,
          update: { value: payload as Prisma.InputJsonValue },
          create: { organizationId: orgId, key: 'workspace_state', value: payload as Prisma.InputJsonValue },
        });
        this.baseSnapshot = payload;
      } else {
        let written = false;
        for (let attempt = 0; attempt < 6 && !written; attempt += 1) {
          const row = await this.prisma.systemSetting.findUnique({ where });
          const rowUpdatedAt = row?.updatedAt instanceof Date ? row.updatedAt : null;
          if (row && (!this.baseUpdatedAt || !rowUpdatedAt || rowUpdatedAt.getTime() !== this.baseUpdatedAt.getTime())) {
            this.mergeRemoteSnapshot(row.value, rowUpdatedAt);
          }
          this.pruneState();
          const payload = deepClone(this.captureState());

          if (!row) {
            try {
              const created = await this.prisma.systemSetting.create({
                data: { organizationId: orgId, key: 'workspace_state', value: payload as Prisma.InputJsonValue },
              });
              this.baseSnapshot = payload;
              this.baseUpdatedAt = created?.updatedAt instanceof Date ? created.updatedAt : null;
              written = true;
            } catch {
              // Another writer created the row first – retry as an update.
            }
            continue;
          }

          const nextUpdatedAt = new Date(Math.max(Date.now(), (rowUpdatedAt?.getTime() ?? 0) + 1));
          const res = await this.prisma.systemSetting.updateMany({
            where: {
              organizationId: orgId,
              key: 'workspace_state',
              ...(rowUpdatedAt ? { updatedAt: rowUpdatedAt } : {}),
            },
            data: { value: payload as Prisma.InputJsonValue, updatedAt: nextUpdatedAt },
          });
          if ((res?.count ?? 0) > 0) {
            this.baseSnapshot = payload;
            this.baseUpdatedAt = nextUpdatedAt;
            written = true;
          }
          // count === 0 → someone else saved in between; loop re-reads, merges and retries.
        }
        if (!written) {
          this.logger.warn('workspace_state save kept conflicting with other writers; changes stay in memory and are retried on the next save.');
          return;
        }
      }

      this.lastMeetingsSyncAt = Date.now();
      this.lastSnapshotSyncAt = Date.now();
      this.workspaceVersion = Date.now();
      this.workspaceBus.emit('mutated', { organizationId: orgId, version: this.workspaceVersion });
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

  async deleteClient(id: string, actor: AuthUser) {
    if (!this.clients.some((c) => c.id === id)) throw new NotFoundException('Client not found.');
    this.clients = this.clients.filter((c) => c.id !== id);
    await this.persistStateNow(actor.organizationId);
    await this.prisma.client
      ?.deleteMany?.({ where: { id, organizationId: actor.organizationId } })
      ?.catch(() => undefined);
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
      status: pickEnum(body.status, PROJECT_STATUSES, 'project status', 'PLANNING'),
      priority: pickEnum(body.priority, PRIORITIES, 'priority', 'MEDIUM'),
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
    if (body.status !== undefined) project.status = pickEnum(body.status, PROJECT_STATUSES, 'project status', project.status);
    if (body.priority !== undefined) project.priority = pickEnum(body.priority, PRIORITIES, 'priority', project.priority);
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

  async deleteProject(id: string, actor: AuthUser) {
    if (!this.projects.some((p) => p.id === id)) throw new NotFoundException('Project not found.');
    this.projects = this.projects.filter((p) => p.id !== id);
    await this.persistStateNow(actor.organizationId);
    await this.prisma.project
      ?.deleteMany?.({ where: { id, organizationId: actor.organizationId } })
      ?.catch(() => undefined);
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
      status: pickEnum(body.status, SPRINT_STATUSES, 'sprint status', 'PLANNED'),
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
    if (body.status) sprint.status = pickEnum(body.status, SPRINT_STATUSES, 'sprint status', sprint.status);
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
      issueType: (['EPIC', 'STORY', 'TASK', 'BUG'].includes(String(body.issueType ?? '').toUpperCase())
        ? String(body.issueType).toUpperCase()
        : 'TASK') as TaskItem['issueType'],
      title,
      description: String(body.description ?? '').trim(),
      status: pickEnum(body.status, TASK_STATUSES, 'task status', 'TODO'),
      priority: pickEnum(body.priority, PRIORITIES, 'priority', 'MEDIUM'),
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
      blockedByIds: Array.isArray(body.blockedByIds) ? body.blockedByIds.map(String) : [],
      prUrl: body.prUrl ? String(body.prUrl) : null,
      branchName: body.branchName
        ? String(body.branchName)
        : `feat/${projCode.toLowerCase()}-t${String(countInProject).padStart(2, '0')}-${title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 28)}`,
    };
    this.tasks.unshift(created);
    this.recalculateProjectProgress(projId);
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

  private recalculateProjectProgress(projectId: string): void {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;
    const pTasks = this.tasks.filter((t) => t.projectId === projectId);
    if (pTasks.length === 0) return;
    const totalPts = pTasks.reduce((sum, t) => sum + Math.max(1, t.storyPoints || 1), 0);
    const donePts = pTasks
      .filter((t) => t.status === 'COMPLETED')
      .reduce((sum, t) => sum + Math.max(1, t.storyPoints || 1), 0);
    project.progressPercent = Math.min(100, Math.round((donePts / totalPts) * 100));
  }

  updateTask(id: string, body: Record<string, unknown>) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) throw new NotFoundException('Task not found.');
    if (body.status) task.status = pickEnum(body.status, TASK_STATUSES, 'task status', task.status);
    if (body.priority) task.priority = pickEnum(body.priority, PRIORITIES, 'priority', task.priority);
    if (body.issueType) task.issueType = pickEnum(body.issueType, ISSUE_TYPES, 'issue type');
    if (body.assigneeName !== undefined) task.assigneeName = String(body.assigneeName);
    if (body.title !== undefined && String(body.title).trim()) task.title = String(body.title).trim();
    if (body.description !== undefined) task.description = String(body.description);
    if (body.dueDate !== undefined) task.dueDate = String(body.dueDate);
    if (body.storyPoints !== undefined) task.storyPoints = Number(body.storyPoints) || 0;
    if (body.estimatedHours !== undefined) task.estimatedHours = Number(body.estimatedHours) || 0;
    if (body.actualHours !== undefined) task.actualHours = Number(body.actualHours) || 0;
    if (body.prUrl !== undefined) task.prUrl = body.prUrl ? String(body.prUrl) : null;
    if (body.branchName !== undefined) task.branchName = body.branchName ? String(body.branchName) : null;
    if (Array.isArray(body.blockedByIds)) task.blockedByIds = body.blockedByIds.map(String);
    if (Array.isArray(body.labels)) task.labels = body.labels.map(String);
    if (Array.isArray(body.subtasks)) task.subtasks = body.subtasks as TaskItem['subtasks'];
    if (Array.isArray(body.comments)) task.comments = body.comments as TaskItem['comments'];
    this.recalculateProjectProgress(task.projectId);
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

  deleteTask(id: string, actor?: AuthUser) {
    if (actor?.role === Role.INTERN) {
      throw new ForbiddenException('Interns cannot delete tasks.');
    }
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
      severity: pickEnum(body.severity, BUG_SEVERITIES, 'bug severity', 'MAJOR'),
      priority: pickEnum(body.priority, PRIORITIES, 'priority', 'HIGH'),
      status: 'NEW',
      reporterName: actor.fullName,
      assigneeName: String(body.assigneeName || actor.fullName),
      createdAt: new Date().toISOString(),
    };
    this.bugs.unshift(created);
    if (created.severity === 'CRITICAL' || created.severity === 'BLOCKER') {
      const alert = {
        id: `ntf_${randomUUID().slice(0, 8)}`,
        type: 'TASK' as const,
        title: `🚨 ${created.severity} Bug Logged: ${created.code}`,
        body: `${actor.fullName} reported "${created.title}" in ${created.projectName}.`,
        targetUserId: '*',
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF'],
        actionUrl: '/bugs',
        readByIds: [actor.id],
        authorName: actor.fullName,
        createdAt: new Date().toISOString(),
      };
      this.notifications.unshift(alert);
      this.notificationBus.emit('notification', {
        organizationId: actor.organizationId,
        notification: alert,
      });
    }
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
    if (body.status) bug.status = pickEnum(body.status, BUG_STATUSES, 'bug status', bug.status);
    if (body.severity) bug.severity = pickEnum(body.severity, BUG_SEVERITIES, 'bug severity', bug.severity);
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
    const mimeType = String(body.mimeType || 'application/pdf').toLowerCase().trim();
    const blockedMimePatterns = ['text/html', 'image/svg', 'javascript', 'x-msdownload', 'x-sh', 'x-executable'];
    if (blockedMimePatterns.some((pat) => mimeType.includes(pat))) {
      throw new BadRequestException('Unsupported or unsafe file MIME type. Upload PDF, Office docs, CSV, or PNG/JPG images.');
    }
    const rawFileDataUrl =
      typeof body.fileDataUrl === 'string' && body.fileDataUrl.startsWith('data:')
        ? body.fileDataUrl
        : null;
    if (rawFileDataUrl && /^data:(text\/html|image\/svg|application\/javascript|text\/javascript)/i.test(rawFileDataUrl)) {
      throw new BadRequestException('Executable or HTML/SVG data URLs are blocked for security.');
    }
    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    const created: DocumentItem = {
      id: `doc_${randomUUID().slice(0, 8)}`,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General Workspace',
      folder: String(body.folder || '/specification'),
      title,
      type: String(body.type || 'TECHNICAL_DOC'),
      version: Number(body.version) || 1,
      mimeType,
      sizeBytes: Number(body.sizeBytes) || 524288,
      visibility: String(body.visibility || 'TEAM'),
      uploadedByName: actor.fullName,
      summary: String(body.summary ?? '').trim(),
      fileDataUrl: rawFileDataUrl,
      fileName: typeof body.fileName === 'string' && body.fileName.trim() ? body.fileName.trim() : null,
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

    const own = this.timeEntries.filter((t) => t.userId === actor.id && t.endedAt !== null);
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const weekStartMs = now.getTime() - 7 * 86_400_000;
    const monthPrefix = now.toISOString().slice(0, 7);

    const todayMinutes = own
      .filter((t) => t.startedAt.startsWith(todayPrefix))
      .reduce((s, t) => s + t.durationMinutes, 0);
    const weekMinutes = own
      .filter((t) => new Date(t.startedAt).getTime() >= weekStartMs)
      .reduce((s, t) => s + t.durationMinutes, 0);
    const monthMinutes = own
      .filter((t) => t.startedAt.startsWith(monthPrefix))
      .reduce((s, t) => s + t.durationMinutes, 0);
    const approvedMinutes = own
      .filter((t) => t.status === 'APPROVED')
      .reduce((s, t) => s + t.durationMinutes, 0);

    return {
      activeTimer,
      entries,
      summary: { todayMinutes, weekMinutes, monthMinutes, approvedMinutes },
    };
  }

  startTimer(actor: AuthUser, body: Record<string, unknown>) {
    const existing = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (existing) {
      throw new BadRequestException('You already have a running timer. Stop or switch it before starting a new one.');
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
      workCategory: String(body.workCategory ?? 'Development').trim(),
      source: 'TIMER',
      startedAt: new Date().toISOString(),
      endedAt: null,
      pausedAt: null,
      pauseDurationSeconds: 0,
      durationMinutes: 0,
      billable: body.billable !== false,
      note: String(body.note ?? '').trim() || 'Active timer session',
      latitude: typeof body.latitude === 'number' ? body.latitude : null,
      longitude: typeof body.longitude === 'number' ? body.longitude : null,
      locationLabel: body.locationLabel ? String(body.locationLabel).trim() : null,
      status: 'RUNNING',
      approvedByName: null,
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

  pauseTimer(actor: AuthUser) {
    const running = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (!running) throw new BadRequestException('No running timer found.');
    if (running.pausedAt) throw new BadRequestException('Timer is already paused.');
    running.pausedAt = new Date().toISOString();
    running.status = 'PAUSED';
    this.persistState(actor.organizationId);
    return running;
  }

  resumeTimer(actor: AuthUser) {
    const running = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (!running) throw new BadRequestException('No active timer found.');
    if (!running.pausedAt) throw new BadRequestException('Timer is not paused.');
    const addedPauseSec = Math.max(0, Math.round((Date.now() - new Date(running.pausedAt).getTime()) / 1000));
    running.pauseDurationSeconds = (running.pauseDurationSeconds ?? 0) + addedPauseSec;
    running.pausedAt = null;
    running.status = 'RUNNING';
    this.persistState(actor.organizationId);
    return running;
  }

  switchTimer(actor: AuthUser, body: Record<string, unknown>) {
    const existing = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (existing) {
      this.stopTimer(actor);
    }
    return this.startTimer(actor, body);
  }

  stopTimer(actor: AuthUser) {
    const running = this.timeEntries.find((t) => t.userId === actor.id && t.endedAt === null);
    if (!running) {
      throw new BadRequestException('No running timer found.');
    }
    const endedAt = new Date();
    const startedAt = new Date(running.startedAt);
    let totalPauseSec = running.pauseDurationSeconds ?? 0;
    if (running.pausedAt) {
      totalPauseSec += Math.max(0, Math.round((endedAt.getTime() - new Date(running.pausedAt).getTime()) / 1000));
      running.pausedAt = null;
    }
    running.pauseDurationSeconds = totalPauseSec;
    const netMs = Math.max(0, endedAt.getTime() - startedAt.getTime() - totalPauseSec * 1000);
    const elapsedMinutes = Math.max(1, Math.round(netMs / 60000));
    running.endedAt = endedAt.toISOString();
    running.durationMinutes = elapsedMinutes;
    running.status = 'SAVED';
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

  submitTimeEntry(actor: AuthUser, id: string) {
    const entry = this.timeEntries.find((t) => t.id === id && t.userId === actor.id);
    if (!entry) throw new NotFoundException('Time entry not found.');
    if (entry.endedAt === null) throw new BadRequestException('Stop the active timer before submitting.');
    if (entry.status === 'APPROVED') throw new BadRequestException('Approved timesheets cannot be modified.');
    entry.status = 'SUBMITTED';
    this.approvals.unshift({
      id: `apr_ts_${entry.id}`,
      type: 'TIMESHEET',
      title: `${actor.fullName} · ${entry.projectName} (${entry.durationMinutes}m)`,
      description: `${entry.workCategory || 'Work'}: ${entry.note}`,
      requestedById: actor.id,
      requestedByName: actor.fullName,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    this.persistState(actor.organizationId);
    return entry;
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
      workCategory: String(body.workCategory ?? 'Development').trim(),
      durationMinutes: minutes,
      billable: body.billable !== false,
      note: String(body.note ?? '').trim() || 'Manual time entry',
      status: 'SAVED',
      approvedByName: null,
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

  // ─── Attendance & Yakunex Live Location ────────────────────────────────────
  listAttendance(actor: AuthUser) {
    const today = new Date().toISOString().slice(0, 10);
    const myToday =
      this.attendance.find((a) => a.userId === actor.id && a.workDate === today) ??
      this.attendance.find((a) => a.userName === actor.fullName && a.workDate === '2026-11-08') ??
      null;
    const records = this.isManagerOrAdmin(actor)
      ? this.attendance
      : this.attendance.filter((a) => a.userId === actor.id || a.userName === actor.fullName);
    const liveBoard = this.attendance
      .filter((a) => a.workDate === today && a.clockInAt && !a.clockOutAt)
      .map((a) => ({
        userId: a.userId,
        userName: a.userName,
        userRole: a.userRole,
        clockInAt: a.clockInAt,
        onBreak: a.onBreak,
        workMode: a.workMode ?? 'OFFICE',
        latitude: a.latitude ?? null,
        longitude: a.longitude ?? null,
        accuracyMeters: a.accuracyMeters ?? null,
        locationLabel: a.locationLabel ?? null,
        geofenceStatus: a.geofenceStatus ?? 'NO_GPS',
        distanceMeters: a.distanceMeters ?? null,
        lastLocationAt: a.lastLocationAt ?? a.clockInAt ?? null,
        locationTrail: a.locationTrail ?? [],
      }));
    return {
      todayRecord: myToday,
      records,
      liveBoard,
      officeGeofence: {
        latitude: this.settings.officeLatitude ?? 6.9271,
        longitude: this.settings.officeLongitude ?? 79.8612,
        radiusMeters: this.settings.officeRadiusMeters ?? 250,
      },
    };
  }

  clockIn(actor: AuthUser, body: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10);
    let record = this.attendance.find((a) => a.userId === actor.id && a.workDate === today);
    if (record && record.clockInAt && !record.clockOutAt) {
      throw new BadRequestException('You are already clocked in for today.');
    }
    const workModeRaw = String(body.workMode ?? 'OFFICE').toUpperCase();
    const workMode: AttendanceItem['workMode'] =
      workModeRaw === 'REMOTE' || workModeRaw === 'FIELD' ? workModeRaw : 'OFFICE';
    const latitude = typeof body.latitude === 'number' ? body.latitude : null;
    const longitude = typeof body.longitude === 'number' ? body.longitude : null;
    const accuracyMeters = typeof body.accuracyMeters === 'number' ? body.accuracyMeters : null;
    const locationLabel = body.locationLabel
      ? String(body.locationLabel).trim()
      : latitude !== null && longitude !== null
        ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        : workMode === 'OFFICE'
          ? 'Colombo HQ'
          : 'Remote';
    const deviceType = body.deviceType ? String(body.deviceType).trim() : 'Web Workspace';

    // Geofence check against configured office coordinates
    let distanceMeters: number | null = null;
    let geofenceStatus: AttendanceItem['geofenceStatus'] = 'NO_GPS';
    if (workMode === 'REMOTE') {
      geofenceStatus = 'REMOTE_APPROVED';
    } else if (latitude !== null && longitude !== null) {
      const officeLat = this.settings.officeLatitude ?? 6.9271;
      const officeLon = this.settings.officeLongitude ?? 79.8612;
      const radius = this.settings.officeRadiusMeters ?? 250;
      distanceMeters = Math.round(this.haversineMeters(latitude, longitude, officeLat, officeLon));
      geofenceStatus = distanceMeters <= radius ? 'INSIDE_OFFICE' : 'OUTSIDE_OFFICE';
    }

    // Check Colombo local time against workDayStart (08:30 default)
    const nowColombo = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Colombo',
    });
    const isLate = nowColombo > (this.settings.workDayStart || '08:30');

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
        isLate,
        notes: String(body.notes ?? '').trim() || 'Clocked in from web workspace.',
        workMode,
        latitude,
        longitude,
        accuracyMeters,
        locationLabel,
        deviceType,
        geofenceStatus,
        distanceMeters,
        lastLocationAt: new Date().toISOString(),
        locationTrail:
          latitude !== null && longitude !== null
            ? [{ lat: latitude, lon: longitude, at: new Date().toISOString() }]
            : [],
      };
      this.attendance.unshift(record);
    } else {
      record.clockOutAt = null;
      record.workMode = workMode;
      record.latitude = latitude;
      record.longitude = longitude;
      record.accuracyMeters = accuracyMeters;
      record.locationLabel = locationLabel;
      record.deviceType = deviceType;
      record.geofenceStatus = geofenceStatus;
      record.distanceMeters = distanceMeters;
      record.lastLocationAt = new Date().toISOString();
      if (latitude !== null && longitude !== null) {
        record.locationTrail = [
          ...(record.locationTrail ?? []),
          { lat: latitude, lon: longitude, at: new Date().toISOString() },
        ].slice(-100);
      }
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

  kioskClockAction(actor: AuthUser, body: Record<string, unknown>) {
    const targetUserId = String(body.targetUserId ?? '').trim();
    const targetUserName = String(body.targetUserName ?? '').trim();
    const action = String(body.action ?? 'CLOCK_IN').toUpperCase();
    if (!targetUserId || !targetUserName) {
      throw new BadRequestException('Target employee is required for Kiosk attendance.');
    }
    const targetActor: AuthUser = {
      ...actor,
      id: targetUserId,
      fullName: targetUserName,
    };
    if (action === 'BREAK') return this.toggleBreak(targetActor);
    if (action === 'CLOCK_OUT') return this.clockOut(targetActor);
    return this.clockIn(targetActor, {
      ...body,
      notes: String(body.notes ?? '').trim() || `Kiosk check-in by ${actor.fullName}`,
      deviceType: 'Yakunex Kiosk Terminal',
    });
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
    const requestedDays = Math.max(0.5, Number(body.days) || 1);
    if (actor.role === Role.INTERN) {
      const committedDays = this.leaveRequests
        .filter((l) => l.userId === actor.id && (l.status === 'APPROVED' || l.status === 'PENDING'))
        .reduce((sum, l) => sum + (Number(l.days) || 1), 0);
      if (committedDays + requestedDays > 10) {
        const remaining = Math.max(0, 10 - committedDays);
        throw new BadRequestException(
          `Interns have a maximum 10-day leave allowance. You have ${remaining} day(s) remaining.`,
        );
      }
    }
    const created: LeaveRequestItem = {
      id: `lv_${randomUUID().slice(0, 8)}`,
      userId: actor.id,
      userName: actor.fullName,
      type: (body.type as LeaveRequestItem['type']) || 'ANNUAL',
      startDate,
      endDate,
      days: requestedDays,
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

  // ─── Chat (Role-Based Enterprise Communication) ───────────────────────────
  private canAccessChannel(actor: AuthUser | undefined, ch: ChatChannelItem): boolean {
    if (!actor) return true;
    if (ch.ownerId === actor.id || ch.memberIds?.includes(actor.id)) return true;

    // Direct messages & private/confidential groups with explicit memberIds are strictly restricted
    if (ch.type === 'DIRECT') {
      return Boolean(ch.memberIds?.includes(actor.id));
    }
    if (ch.privacy === 'PUBLIC' || (!ch.allowedRoles && !ch.allowedTitleKeywords && ch.privacy !== 'CONFIDENTIAL')) {
      return true;
    }

    const titleLower = String((actor as AuthUser & { title?: string | null }).title ?? '').toLowerCase();
    const companyUpper = String(actor.companyId ?? '').toUpperCase();

    // Super Admin cannot read CONFIDENTIAL groups unless explicitly matched/invited
    if (actor.role === Role.SUPER_ADMIN && ch.privacy !== 'CONFIDENTIAL') {
      return true;
    }

    if (ch.allowedRoles?.includes(actor.role)) return true;
    if (ch.allowedTitleKeywords?.some((kw) => titleLower.includes(kw))) return true;
    if (companyUpper.includes('-SEC-') && ch.id === 'ch_dept_legal') return true;
    if (companyUpper.includes('-CFO-') && ch.id === 'ch_dept_finance') return true;
    if (companyUpper.includes('-ACC-') && ch.id === 'ch_dept_finance') return true;
    if (companyUpper.includes('-HR-') && ch.id === 'ch_dept_hr') return true;
    return false;
  }

  listChatChannels(actor?: AuthUser) {
    return this.channels.filter((ch) => this.canAccessChannel(actor, ch));
  }

  listChatMessages(channelId: string, actor?: AuthUser) {
    const ch = this.channels.find((c) => c.id === channelId);
    if (ch && actor && !this.canAccessChannel(actor, ch)) {
      throw new ForbiddenException('You do not have permission to view this channel.');
    }
    return this.messages
      .filter((m) => m.channelId === channelId && !m.deleted)
      .map((m) => ({
        ...m,
        senderAvatarUrl: this.avatarOf(m.senderId, m.senderAvatarUrl),
      }));
  }

  postChatMessage(actor: AuthUser, channelId: string, body: Record<string, unknown>) {
    const ch = this.channels.find((c) => c.id === channelId);
    if (ch && !this.canAccessChannel(actor, ch)) {
      throw new ForbiddenException('You do not have permission to post in this channel.');
    }
    const text = String(body.body ?? '').trim();
    if (!text && !body.attachmentUrl) throw new BadRequestException('Message cannot be empty.');
    const replyTo = body.replyToId ? this.messages.find((m) => m.id === body.replyToId) : null;
    const msg: ChatMessageItem = {
      id: `msg_${randomUUID().slice(0, 8)}`,
      channelId,
      senderId: actor.id,
      senderName: actor.companyId ? `${actor.fullName.trim().split(/\s+/).pop() || actor.fullName} · ${actor.companyId}` : actor.fullName,
      senderRole: actor.role,
      // Resolved at read time (avatarOf); never copy base64 images into every message.
      senderAvatarUrl: actor.avatarUrl && !actor.avatarUrl.startsWith('data:') ? actor.avatarUrl : null,
      body: text,
      replyToId: replyTo?.id ?? null,
      replyPreview: replyTo ? `${replyTo.senderName}: ${replyTo.body.slice(0, 60)}` : null,
      pinned: false,
      editedAt: null,
      deleted: false,
      attachmentUrl: body.attachmentUrl ? String(body.attachmentUrl) : null,
      attachmentName: body.attachmentName ? String(body.attachmentName) : null,
      reactions: {},
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

  createChatChannel(actorOrBody: AuthUser | Record<string, unknown>, maybeBody?: Record<string, unknown>) {
    const actor = maybeBody ? (actorOrBody as AuthUser) : undefined;
    const body = maybeBody ?? (actorOrBody as Record<string, unknown>);
    const rawName = String(body.name ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (rawName.length < 2) throw new BadRequestException('Channel name is required.');
    const type = ((body.type as ChatChannelItem['type']) || 'GROUP').toUpperCase() as ChatChannelItem['type'];
    const privacy = ((body.privacy as ChatChannelItem['privacy']) || 'PUBLIC').toUpperCase() as ChatChannelItem['privacy'];
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    if (actor && !memberIds.includes(actor.id)) memberIds.push(actor.id);

    const created: ChatChannelItem = {
      id: `ch_${randomUUID().slice(0, 8)}`,
      name: rawName,
      type,
      category:
        (body.category as ChatChannelItem['category']) ||
        (type === 'MANAGEMENT'
          ? 'MANAGEMENT'
          : type === 'DEPARTMENT'
            ? 'DEPARTMENTS'
            : type === 'PROJECT'
              ? 'PROJECTS'
              : type === 'ANNOUNCEMENT'
                ? 'ANNOUNCEMENTS'
                : privacy !== 'PUBLIC'
                  ? 'PRIVATE'
                  : 'TECHNICAL'),
      privacy,
      description: String(body.description ?? '').trim() || 'Team discussion channel',
      projectName: body.projectName ? String(body.projectName) : null,
      department: body.department ? String(body.department) : null,
      memberIds: memberIds.length > 0 ? memberIds : undefined,
      ownerId: actor?.id ?? null,
      allowInvites: body.allowInvites !== false,
    };
    this.channels.push(created);
    this.persistState(actor?.organizationId);

    void (async () => {
      try {
        const orgId = await this.resolveOrgId(actor?.organizationId);
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

  startDirectChat(actor: AuthUser, targetUserId: string, targetUserName?: string) {
    if (!targetUserId || targetUserId === actor.id) {
      throw new BadRequestException('Select another employee to message.');
    }
    const existing = this.channels.find(
      (c) =>
        c.type === 'DIRECT' &&
        c.memberIds?.includes(actor.id) &&
        c.memberIds?.includes(targetUserId),
    );
    if (existing) return existing;

    const dm: ChatChannelItem = {
      id: `dm_${randomUUID().slice(0, 8)}`,
      name: targetUserName ? `DM: ${targetUserName}` : 'Direct Message',
      type: 'DIRECT',
      category: 'DIRECT',
      privacy: 'PRIVATE',
      description: `Private conversation with ${targetUserName || 'colleague'}`,
      projectName: null,
      memberIds: [actor.id, targetUserId],
      ownerId: actor.id,
    };
    this.channels.push(dm);
    this.persistState(actor.organizationId);
    return dm;
  }

  editChatMessage(actor: AuthUser, messageId: string, newBody: string) {
    const msg = this.messages.find((m) => m.id === messageId && !m.deleted);
    if (!msg) throw new NotFoundException('Message not found.');
    if (msg.senderId !== actor.id) throw new ForbiddenException('You can only edit your own messages.');
    const trimmed = String(newBody ?? '').trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty.');
    msg.body = trimmed;
    msg.editedAt = new Date().toISOString();
    this.persistState(actor.organizationId);
    return msg;
  }

  deleteChatMessage(actor: AuthUser, messageId: string) {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) throw new NotFoundException('Message not found.');
    if (msg.senderId !== actor.id && !this.isManagerOrAdmin(actor)) {
      throw new ForbiddenException('You can only delete your own messages.');
    }
    msg.deleted = true;
    msg.body = 'Message deleted';
    this.persistState(actor.organizationId);
    return { ok: true, id: messageId };
  }

  reactChatMessage(actor: AuthUser, messageId: string, emoji: string) {
    const msg = this.messages.find((m) => m.id === messageId && !m.deleted);
    if (!msg) throw new NotFoundException('Message not found.');
    const map = msg.reactions ?? {};
    const list = new Set(map[emoji] ?? []);
    if (list.has(actor.id)) list.delete(actor.id);
    else list.add(actor.id);
    map[emoji] = [...list];
    msg.reactions = map;
    this.persistState(actor.organizationId);
    return msg;
  }

  togglePinChatMessage(actor: AuthUser, messageId: string) {
    const msg = this.messages.find((m) => m.id === messageId && !m.deleted);
    if (!msg) throw new NotFoundException('Message not found.');
    msg.pinned = !msg.pinned;
    this.persistState(actor.organizationId);
    return msg;
  }

  async convertMessageToTask(actor: AuthUser, messageId: string, body: Record<string, unknown>) {
    const msg = this.messages.find((m) => m.id === messageId && !m.deleted);
    if (!msg) throw new NotFoundException('Source message not found.');
    const created = await this.createTask(actor, {
      title: String(body.title ?? '').trim() || msg.body.slice(0, 80),
      description: `Converted from Chat (${msg.senderName}): ${msg.body}`,
      projectId: body.projectId,
      priority: body.priority || 'MEDIUM',
      status: 'TODO',
    });
    msg.linkedTaskId = created.id;
    this.persistState(actor.organizationId);
    return { task: created, message: msg };
  }

  async createMeetingFromChannel(actor: AuthUser, channelId: string, body: Record<string, unknown>) {
    const ch = this.channels.find((c) => c.id === channelId);
    const mtg = await this.scheduleMeeting(actor, {
      title: String(body.title ?? '').trim() || `${ch?.name ?? 'Team'} Sync`,
      agenda: String(body.agenda ?? '').trim() || `Instant sync launched from #${ch?.name ?? 'chat'}`,
      instant: true,
    });
    this.postChatMessage(actor, channelId, {
      body: `Started a live meeting (${mtg.roomCode}): ${mtg.title}`,
    });
    return mtg;
  }

  // ─── Meetings (Built-in Yakunex Hub Meet Engine + WebRTC Signaling) ──────
  private withMeetingLock<T>(task: () => Promise<T>): Promise<T> {
    const next = this.meetingMutationChain.then(task, task);
    this.meetingMutationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async syncMeetingsFromDb(organizationId?: string, force = false): Promise<void> {
    if (!force && Date.now() - this.lastMeetingsSyncAt < 1200) {
      return;
    }
    try {
      const done = await this.loadRemoteSnapshot(organizationId);
      if (done) this.lastMeetingsSyncAt = Date.now();
    } catch {
      // Fallback to in-memory state if DB is temporarily unreachable
    }
  }

  private async appendMeetingSignalsBatch(
    meetingId: string,
    signals: Array<Omit<MeetingSignalItem, 'id' | 'seq' | 'createdAt'>>,
    organizationId?: string,
  ): Promise<number> {
    if (signals.length === 0) return Date.now();
    const baseNow = Date.now();
    const cached = this.meetingSignals.get(meetingId) ?? { seq: 0, items: [] };
    const createdItems: MeetingSignalItem[] = signals.map((signal, idx) => {
      const ts = baseNow + idx;
      return {
        id: `sig_${ts}_${randomUUID().slice(0, 6)}`,
        ...signal,
        seq: ts,
        createdAt: ts,
      };
    });

    const lastSeq = createdItems[createdItems.length - 1]?.seq ?? baseNow;
    cached.items = [
      ...cached.items.filter((x) => baseNow - x.createdAt < 90_000).slice(-(10000 - createdItems.length)),
      ...createdItems,
    ];
    cached.seq = lastSeq;
    this.meetingSignals.set(meetingId, cached);

    try {
      const orgId = await this.resolveOrgId(organizationId);
      if (orgId) {
        const rows = createdItems.map((item) => ({
          organizationId: orgId,
          key: `msig:${meetingId}:${String(item.createdAt).padStart(14, '0')}:${randomUUID().slice(0, 6)}`,
          value: item as unknown as Prisma.InputJsonValue,
        }));
        if (rows.length > 1 && this.prisma.systemSetting?.createMany) {
          await this.prisma.systemSetting.createMany({ data: rows, skipDuplicates: true });
        } else if (this.prisma.systemSetting?.create) {
          await Promise.all(rows.map((data) => this.prisma.systemSetting.create({ data })));
        }
      }
    } catch {
      // Non-fatal fallback to in-memory cache
    }
    return lastSeq;
  }

  private async appendMeetingSignal(
    meetingId: string,
    signal: Omit<MeetingSignalItem, 'id' | 'seq' | 'createdAt'>,
    organizationId?: string,
  ): Promise<number> {
    return this.appendMeetingSignalsBatch(meetingId, [signal], organizationId);
  }

  resolveMeetingAccessPolicy(actor: AuthUser) {
    const titleLower = String((actor as AuthUser & { title?: string | null }).title ?? '').toLowerCase();
    const cid = String(actor.companyId ?? '').toUpperCase();

    // Tier 1: Super Admin (MD, CEO)
    if (actor.role === Role.SUPER_ADMIN || cid.includes('-MD-') || cid.includes('-CEO-') || /\b(md|managing director|ceo)\b/.test(titleLower)) {
      return {
        tier: 'Tier 1: Super Admin',
        rolesLabel: 'MD, CEO',
        canCreate: true,
        createLabel: 'Full Access (All Meetings)',
        allowedScopes: ['BOARD', 'LEGAL', 'DEPT', 'PROJECT', 'HR', 'INTERNAL'] as const,
        waitingRoomControl: 'AUTO_OVERRIDE' as const,
        waitingRoomLabel: 'Full Control (Auto Admin Override)',
        canInviteExternal: true,
        recordingScope: 'ALL' as const,
        externalAndRecordingLabel: 'External Invite + All Recordings',
        screenShareRequiresApproval: false,
      };
    }

    // Tier 1B: Legal Admin (Company Secretary)
    if (cid.includes('-SEC-') || cid.includes('-LGL-') || /\b(company secretary|legal)\b/.test(titleLower)) {
      return {
        tier: 'Tier 1B: Legal Admin',
        rolesLabel: 'Company Secretary',
        canCreate: true,
        createLabel: 'Board & Legal Meetings Only',
        allowedScopes: ['BOARD', 'LEGAL', 'INTERNAL'] as const,
        waitingRoomControl: 'BOARD_HOST' as const,
        waitingRoomLabel: 'Host / Co-Host Control (Board Only)',
        canInviteExternal: true,
        recordingScope: 'LEGAL' as const,
        externalAndRecordingLabel: 'Board Guests + Legal Recordings',
        screenShareRequiresApproval: false,
      };
    }

    // Tier 2: C-Level / Dept Heads (CTO, COO, CFO)
    if (
      actor.role === Role.ADMIN ||
      cid.includes('-CTO-') ||
      cid.includes('-COO-') ||
      cid.includes('-CFO-') ||
      /\b(cto|coo|cfo|department head)\b/.test(titleLower)
    ) {
      return {
        tier: 'Tier 2: C-Level / Dept Heads',
        rolesLabel: 'CTO, COO, CFO',
        canCreate: true,
        createLabel: 'Full Access (Dept & Cross-Dept)',
        allowedScopes: ['DEPT', 'PROJECT', 'HR', 'INTERNAL'] as const,
        waitingRoomControl: 'HOSTED' as const,
        waitingRoomLabel: 'Full Control (In Hosted Meetings)',
        canInviteExternal: true,
        recordingScope: 'DEPT' as const,
        externalAndRecordingLabel: 'External Invite + Dept Recordings',
        screenShareRequiresApproval: false,
      };
    }

    // Tier 3: Management (HR, PM, BA, PO)
    if (
      actor.role === Role.PROJECT_MANAGER ||
      cid.includes('-HR-') ||
      cid.includes('-PM-') ||
      cid.includes('-BA-') ||
      cid.includes('-PO-') ||
      /\b(hr|human resource|project manager|business analyst|product owner)\b/.test(titleLower)
    ) {
      return {
        tier: 'Tier 3: Management',
        rolesLabel: 'HR, PM, BA, PO',
        canCreate: true,
        createLabel: 'Full Create & Host (Project / HR)',
        allowedScopes: ['PROJECT', 'HR', 'INTERNAL'] as const,
        waitingRoomControl: 'HOST_COHOST' as const,
        waitingRoomLabel: 'Full Control (Host / Assigned Co-Host)',
        canInviteExternal: true,
        recordingScope: 'OWN' as const,
        externalAndRecordingLabel: 'Client / Candidate Invite + Own Recordings',
        screenShareRequiresApproval: false,
      };
    }

    // Tier 5: Trainees (Interns)
    if (actor.role === Role.INTERN || cid.includes('-INT-')) {
      return {
        tier: 'Tier 5: Trainees',
        rolesLabel: 'Interns',
        canCreate: false,
        createLabel: 'Join Only (Invited Meetings)',
        allowedScopes: [] as const,
        waitingRoomControl: 'NONE' as const,
        waitingRoomLabel: 'None (Cannot Admit or Remove)',
        canInviteExternal: false,
        recordingScope: 'NONE' as const,
        externalAndRecordingLabel: 'Internal Join Only (Screen Share: Host Approval)',
        screenShareRequiresApproval: true,
      };
    }

    // Tier 4: Core Staff (Tech Lead, SE, QA, UI/UX, DevOps)
    const isTechLead = cid.includes('-TL-') || /\btech\s*lead\b/.test(titleLower);
    return {
      tier: 'Tier 4: Core Staff',
      rolesLabel: 'Tech Lead, SE, QA, UI/UX, DevOps',
      canCreate: true,
      createLabel: isTechLead ? 'Tech Lead: Full' : 'Internal Calls Only',
      allowedScopes: (isTechLead ? ['PROJECT', 'INTERNAL'] : ['INTERNAL']) as readonly string[],
      waitingRoomControl: (isTechLead ? 'HOST' : 'COHOST') as 'HOST' | 'COHOST',
      waitingRoomLabel: isTechLead ? 'Tech Lead: Host Control' : 'Co-Host Only',
      canInviteExternal: false,
      recordingScope: 'NONE' as const,
      externalAndRecordingLabel: 'Internal Only (No External / No Recording)',
      screenShareRequiresApproval: false,
    };
  }

  private canActorSeeMeeting(mtg: MeetingItem, actor?: AuthUser): boolean {
    if (!actor) return true;
    if (
      actor.role === Role.SUPER_ADMIN ||
      mtg.organizerId === actor.id ||
      mtg.organizerName === actor.fullName ||
      (mtg.coHostIds ?? []).includes(actor.id) ||
      mtg.participants.some((p) => p.userId === actor.id) ||
      (mtg.waitingRoom ?? []).some((w) => w.userId === actor.id) ||
      (mtg.invitedUserIds ?? []).includes(actor.id)
    ) {
      return true;
    }
    if (mtg.meetingScope === 'BOARD' || mtg.meetingScope === 'LEGAL') {
      const policy = this.resolveMeetingAccessPolicy(actor);
      if (policy.tier !== 'Tier 1: Super Admin' && policy.tier !== 'Tier 1B: Legal Admin') {
        const roleExplicitlyAllowed =
          Array.isArray(mtg.allowedRoles) &&
          !mtg.allowedRoles.includes('ALL') &&
          mtg.allowedRoles.includes(actor.role);
        if (!roleExplicitlyAllowed) return false;
      }
    }
    const hasCustomRoles =
      Array.isArray(mtg.allowedRoles) &&
      mtg.allowedRoles.length > 0 &&
      !mtg.allowedRoles.includes('ALL');
    const hasInvitedUsers =
      Array.isArray(mtg.invitedUserIds) && mtg.invitedUserIds.length > 0;
    if (hasCustomRoles) {
      return mtg.allowedRoles!.includes(actor.role);
    }
    if (hasInvitedUsers) {
      return mtg.invitedUserIds!.includes(actor.id);
    }
    return true;
  }

  async listMeetings(organizationId?: string, actor?: AuthUser) {
    await this.syncMeetingsFromDb(organizationId);
    if (!actor) return this.meetings;
    return this.meetings.filter((m) => this.canActorSeeMeeting(m, actor));
  }

  async getMeetingRoom(id: string, organizationId?: string) {
    await this.syncMeetingsFromDb(organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting room not found.');
    return mtg;
  }

  private getGuestTokenSecret(): string {
    return (
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET ||
      'yakunex-hub-guest-meeting-secret-2026'
    );
  }

  private signGuestToken(payload: {
    guestId: string;
    meetingId: string;
    roomCode: string;
    fullName: string;
    organizationId: string;
    exp: number;
  }): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = createHmac('sha256', this.getGuestTokenSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifyGuestToken(token: string): {
    guestId: string;
    meetingId: string;
    roomCode: string;
    fullName: string;
    organizationId: string;
    exp: number;
  } {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 2) throw new ForbiddenException('Invalid guest meeting token.');
    const [encoded, sig] = parts;
    const expected = createHmac('sha256', this.getGuestTokenSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid guest meeting token.');
    }
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      guestId: string;
      meetingId: string;
      roomCode: string;
      fullName: string;
      organizationId: string;
      exp: number;
    };
    if (!parsed.exp || Date.now() > parsed.exp) {
      throw new ForbiddenException('Guest meeting session expired. Please rejoin.');
    }
    return parsed;
  }

  private createGuestActor(token: string): AuthUser {
    const g = this.verifyGuestToken(token);
    return {
      id: g.guestId,
      email: `${g.guestId}@guest.yakunex.com`,
      fullName: g.fullName,
      companyId: 'GUEST',
      role: Role.INTERN,
      status: 'ACTIVE',
      mustChangePassword: false,
      organizationId: g.organizationId,
      permissions: [],
    } as AuthUser;
  }

  private recordAttendanceJoin(
    mtg: MeetingItem,
    user: { userId: string; fullName: string; companyId?: string | null; role: string; isGuest?: boolean },
    joinedAt: string,
  ): void {
    mtg.attendanceLog = mtg.attendanceLog ?? [];
    const openEntry = mtg.attendanceLog.find((a) => a.userId === user.userId && !a.leftAt);
    if (!openEntry) {
      mtg.attendanceLog.push({
        userId: user.userId,
        fullName: user.fullName,
        companyId: user.companyId ?? null,
        role: user.role,
        isGuest: user.isGuest,
        joinedAt,
        leftAt: null,
        durationSec: 0,
      });
    }
  }

  private recordAttendanceLeave(mtg: MeetingItem, userId: string, leftAtIso = new Date().toISOString()): void {
    if (!Array.isArray(mtg.attendanceLog)) return;
    const leftMs = new Date(leftAtIso).getTime();
    for (const entry of mtg.attendanceLog) {
      if (entry.userId === userId && !entry.leftAt) {
        entry.leftAt = leftAtIso;
        entry.durationSec = Math.max(0, Math.round((leftMs - new Date(entry.joinedAt).getTime()) / 1000));
      }
    }
  }

  private isMeetingHostOrCoHost(mtg: MeetingItem, actor: AuthUser): boolean {
    if (!actor || actor.id.startsWith('guest_')) return false;
    if (actor.role === Role.SUPER_ADMIN) return true;
    return (
      mtg.organizerId === actor.id ||
      mtg.organizerName === actor.fullName ||
      Boolean(mtg.coHostIds?.includes(actor.id))
    );
  }

  private canControlMeeting(mtg: MeetingItem, actor: AuthUser): boolean {
    if (!actor || actor.id.startsWith('guest_')) return false;
    if (actor.role === Role.SUPER_ADMIN) return true;
    const policy = this.resolveMeetingAccessPolicy(actor);
    if (policy.waitingRoomControl === 'NONE') return false;
    const isHostOrCoHost = this.isMeetingHostOrCoHost(mtg, actor);
    return (
      policy.waitingRoomControl === 'AUTO_OVERRIDE' ||
      (policy.waitingRoomControl === 'BOARD_HOST' &&
        isHostOrCoHost &&
        (mtg.meetingScope === 'BOARD' || mtg.meetingScope === 'LEGAL')) ||
      ((policy.waitingRoomControl === 'HOSTED' ||
        policy.waitingRoomControl === 'HOST_COHOST' ||
        policy.waitingRoomControl === 'HOST' ||
        policy.waitingRoomControl === 'COHOST') &&
        isHostOrCoHost) ||
      this.isManagerOrAdmin(actor)
    );
  }

  private async pushMeetingNotification(
    actor: AuthUser,
    mtg: MeetingItem,
    kind: 'STARTED' | 'SCHEDULED',
  ): Promise<void> {
    const isLive = kind === 'STARTED';
    const item = {
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'MEETING' as const,
      title: isLive ? `LIVE Meeting Started: ${mtg.title}` : `Meeting Scheduled: ${mtg.title}`,
      body: isLive
        ? `${actor.fullName} started "${mtg.title}" (${mtg.roomCode}). Join now!`
        : `${actor.fullName} scheduled "${mtg.title}" (${mtg.roomCode}) for ${new Date(mtg.startsAt).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo' })}.`,
      targetUserId: '*',
      allowedRoles: mtg.allowedRoles && mtg.allowedRoles.length > 0 ? mtg.allowedRoles : ['ALL'],
      targetUserIds: mtg.invitedUserIds && mtg.invitedUserIds.length > 0 ? mtg.invitedUserIds : undefined,
      meetingId: mtg.id,
      roomCode: mtg.roomCode,
      actionUrl: `/meet?room=${mtg.roomCode}`,
      hostName: mtg.organizerName,
      isLiveMeeting: isLive,
      readByIds: [actor.id],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(item);
    if (this.notifications.length > 150) {
      this.notifications = this.notifications.slice(0, 150);
    }
    this.notificationBus.emit('notification', {
      organizationId: actor.organizationId,
      notification: item,
    });
    await this.persistStateNow(actor.organizationId);
  }

  async getMeetingByCode(actor: AuthUser, roomCode: string) {
    const normalized = String(roomCode ?? '').trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Room code is required.');
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find(
      (m) => m.roomCode.toUpperCase() === normalized || m.id.toUpperCase() === normalized,
    );
    if (!mtg) throw new NotFoundException(`Meeting room "${normalized}" was not found.`);
    return mtg;
  }

  async scheduleMeeting(actor: AuthUser, body: Record<string, unknown>) {
    const policy = this.resolveMeetingAccessPolicy(actor);
    if (!policy.canCreate) {
      throw new ForbiddenException('Trainees / Interns have Join Only meeting access and cannot create meetings.');
    }
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Meeting title is required.');

    const defaultScope = (policy.allowedScopes as readonly string[]).includes('INTERNAL')
      ? 'INTERNAL'
      : policy.allowedScopes[0] ?? 'INTERNAL';
    const requestedScope = String(body.meetingScope ?? defaultScope).toUpperCase() as NonNullable<MeetingItem['meetingScope']>;
    if (!(policy.allowedScopes as readonly string[]).includes(requestedScope)) {
      throw new ForbiddenException(`${policy.tier} cannot create ${requestedScope} meetings (${policy.createLabel}).`);
    }

    const allowExternalGuests = Boolean(body.allowExternalGuests) && policy.canInviteExternal;
    const recordingAllowed = Boolean(body.recordingAllowed) && policy.recordingScope !== 'NONE';
    const waitingRoomEnabled = body.waitingRoomEnabled !== undefined ? Boolean(body.waitingRoomEnabled) : false;
    const passcodeRaw = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    const passcode = passcodeRaw.length > 0 ? passcodeRaw.slice(0, 16) : null;
    const allowedRecurrences = ['NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
    const recurrenceRaw = String(body.recurrence ?? 'NONE').toUpperCase();
    const recurrence = (allowedRecurrences as readonly string[]).includes(recurrenceRaw)
      ? (recurrenceRaw as MeetingItem['recurrence'])
      : 'NONE';
    const chatPermRaw = String(body.chatPermission ?? 'EVERYONE_DM').toUpperCase();
    const chatPermission = (['EVERYONE_DM', 'EVERYONE_PUBLIC', 'HOST_ONLY', 'DISABLED'] as const).includes(
      chatPermRaw as 'EVERYONE_DM',
    )
      ? (chatPermRaw as MeetingItem['chatPermission'])
      : 'EVERYONE_DM';
    const shareModeRaw = String(body.screenShareMode ?? 'ALL').toUpperCase();
    const screenShareMode = (['ALL', 'HOST_ONLY', 'APPROVAL_REQUIRED'] as const).includes(
      shareModeRaw as 'ALL',
    )
      ? (shareModeRaw as MeetingItem['screenShareMode'])
      : 'ALL';

    const project = this.projects.find((p) => p.id === body.projectId) ?? null;
    let roomCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
    while (this.meetings.some((m) => m.roomCode === roomCode)) {
      roomCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
    }
    const instant = Boolean(body.instant);
    const micOn = body.micOn !== undefined ? Boolean(body.micOn) : true;
    const camOn = body.camOn !== undefined ? Boolean(body.camOn) : true;
    const nowIso = new Date().toISOString();
    const durationMins = Math.max(15, Math.min(480, Number(body.durationMinutes) || 60));
    const startsAtIso = String(body.startsAt || nowIso);
    const endsAtIso = String(
      body.endsAt || new Date(new Date(startsAtIso).getTime() + durationMins * 60_000).toISOString(),
    );

    const created: MeetingItem = {
      id: `mtg_${randomUUID().slice(0, 8)}`,
      roomCode,
      projectId: project?.id ?? null,
      projectName: project?.name ?? 'General / All-Hands',
      organizerId: actor.id,
      organizerName: actor.fullName,
      title,
      agenda: String(body.agenda ?? '').trim() || 'Live team sync & screen share session',
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      status: instant ? 'LIVE' : 'SCHEDULED',
      meetingScope: requestedScope,
      allowedRoles:
        Array.isArray(body.allowedRoles) && body.allowedRoles.length > 0
          ? body.allowedRoles.map(String)
          : ['ALL'],
      invitedUserIds: Array.isArray(body.invitedUserIds) ? body.invitedUserIds.map(String) : [],
      removedUserIds: [],
      allowExternalGuests,
      recordingAllowed,
      waitingRoomEnabled,
      waitingRoomMessage: null,
      passcode,
      recurrence,
      isLocked: false,
      suspendedActivities: false,
      muteUponEntry: Boolean(body.muteUponEntry),
      allowUnmuteSelf: body.allowUnmuteSelf !== undefined ? Boolean(body.allowUnmuteSelf) : true,
      allowStartVideo: body.allowStartVideo !== undefined ? Boolean(body.allowStartVideo) : true,
      allowRenameSelf: body.allowRenameSelf !== undefined ? Boolean(body.allowRenameSelf) : true,
      chatPermission,
      screenShareMode,
      spotlightUserId: null,
      recordingActive: false,
      recordingByName: null,
      waitingRoom: [],
      coHostIds: Array.isArray(body.coHostIds) ? body.coHostIds.map(String) : [],
      screenShareApprovedIds: [],
      polls: [],
      qaItems: [],
      breakoutRooms: [],
      breakoutBroadcast: null,
      attendanceLog: instant
        ? [
            {
              userId: actor.id,
              fullName: actor.fullName,
              companyId: actor.companyId ?? null,
              role: actor.role,
              joinedAt: nowIso,
              leftAt: null,
              durationSec: 0,
            },
          ]
        : [],
      attendeeCount: instant ? 1 : 0,
      notes: String(body.notes ?? '').trim(),
      participants: instant
        ? [
            {
              userId: actor.id,
              companyId: actor.companyId ?? null,
              fullName: actor.fullName,
              role: actor.role,
              micOn,
              camOn,
              screenSharing: false,
              handRaised: false,
              joinedAt: nowIso,
            },
          ]
        : [],
      chatMessages: [],
    };
    this.meetings.unshift(created);
    await this.pushMeetingNotification(actor, created, instant ? 'STARTED' : 'SCHEDULED');

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

  async updateMeeting(
    id: string,
    body: Record<string, unknown>,
    organizationId?: string,
    actor?: AuthUser,
  ) {
    await this.syncMeetingsFromDb(organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    if (body.status) {
      const nextStatus = pickEnum(body.status, MEETING_STATUSES, 'meeting status', mtg.status);
      if (actor && (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED')) {
        const canEnd =
          mtg.organizerId === actor.id ||
          mtg.organizerName === actor.fullName ||
          (mtg.coHostIds ?? []).includes(actor.id) ||
          this.isManagerOrAdmin(actor);
        if (!canEnd) {
          throw new ForbiddenException(
            'Only the meeting host, co-host, or manager can end the meeting for everyone.',
          );
        }
      }
      mtg.status = nextStatus;
      if (mtg.status === 'COMPLETED' || mtg.status === 'CANCELLED') {
        const nowIso = new Date().toISOString();
        for (const p of mtg.participants) {
          this.recordAttendanceLeave(mtg, p.userId, nowIso);
        }
        mtg.participants = [];
        mtg.waitingRoom = [];
        mtg.recordingActive = false;
        mtg.recordingByName = null;
        mtg.spotlightUserId = null;

        // If recurring meeting completed, auto-schedule next occurrence
        if (mtg.status === 'COMPLETED' && mtg.recurrence && mtg.recurrence !== 'NONE') {
          const stepDays =
            mtg.recurrence === 'DAILY'
              ? 1
              : mtg.recurrence === 'WEEKLY'
                ? 7
                : mtg.recurrence === 'BIWEEKLY'
                  ? 14
                  : 30;
          const prevStart = new Date(mtg.startsAt).getTime();
          const prevEnd = new Date(mtg.endsAt).getTime();
          const dur = Math.max(15 * 60_000, prevEnd - prevStart);
          const nextStart = new Date(Math.max(Date.now(), prevStart) + stepDays * 86400_000);
          let nextCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
          while (this.meetings.some((m) => m.roomCode === nextCode)) {
            nextCode = `YH-ROOM-${Math.floor(100 + Math.random() * 900)}`;
          }
          const alreadySpawned = this.meetings.some(
            (m) =>
              m.status === 'SCHEDULED' &&
              m.title === mtg.title &&
              m.organizerId === mtg.organizerId &&
              Math.abs(new Date(m.startsAt).getTime() - nextStart.getTime()) < 3600_000,
          );
          if (!alreadySpawned) {
            this.meetings.unshift({
              ...mtg,
              id: `mtg_${randomUUID().slice(0, 8)}`,
              roomCode: nextCode,
              startsAt: nextStart.toISOString(),
              endsAt: new Date(nextStart.getTime() + dur).toISOString(),
              status: 'SCHEDULED',
              isLocked: false,
              suspendedActivities: false,
              waitingRoom: [],
              participants: [],
              chatMessages: [],
              polls: [],
              qaItems: [],
              breakoutRooms: [],
              attendanceLog: [],
              attendeeCount: 0,
            });
          }
        }
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
    body?: { micOn?: boolean; camOn?: boolean; passcode?: string; isGuest?: boolean },
  ) {
    return this.withMeetingLock(async () => {
      await this.syncMeetingsFromDb(actor.organizationId, true);
      const mtg = this.meetings.find((m) => m.id === id);
      if (!mtg) throw new NotFoundException('Meeting not found.');

      const isGuest = Boolean(body?.isGuest || actor.id.startsWith('guest_'));
      const existing = mtg.participants.find((p) => p.userId === actor.id);
      const isHostOrManager =
        !isGuest &&
        (mtg.organizerId === actor.id ||
          mtg.organizerName === actor.fullName ||
          actor.role === Role.SUPER_ADMIN ||
          actor.role === Role.ADMIN ||
          actor.role === Role.PROJECT_MANAGER ||
          (mtg.coHostIds ?? []).includes(actor.id));

      // Enforce explicit Role-Based Target Audience for internal users
      const hasExplicitRoleRestriction =
        Array.isArray(mtg.allowedRoles) &&
        mtg.allowedRoles.length > 0 &&
        !mtg.allowedRoles.includes('ALL');
      if (
        !isGuest &&
        !isHostOrManager &&
        !existing &&
        hasExplicitRoleRestriction &&
        !mtg.allowedRoles!.includes(actor.role) &&
        !(mtg.invitedUserIds ?? []).includes(actor.id)
      ) {
        throw new ForbiddenException('You do not have permission to join this role-restricted meeting.');
      }

      // Enforce Security Lock
      if (mtg.isLocked && !isHostOrManager && !existing) {
        throw new ForbiddenException('This meeting has been locked by the host. No new participants can join.');
      }

      // Enforce Passcode (unless host/co-host/SuperAdmin or already in room)
      if (mtg.passcode && !isHostOrManager && !existing) {
        const supplied = String(body?.passcode ?? '').trim();
        if (!supplied || supplied !== mtg.passcode) {
          throw new ForbiddenException('PASSCODE_REQUIRED: Invalid or missing meeting passcode.');
        }
      }

      const wasNotLive = mtg.status === 'SCHEDULED' || mtg.status === 'COMPLETED';
      if (wasNotLive) {
        mtg.status = 'LIVE';
      }

      let micOn = body?.micOn !== undefined ? Boolean(body.micOn) : true;
      let camOn = body?.camOn !== undefined ? Boolean(body.camOn) : true;
      if (!isHostOrManager) {
        if (mtg.muteUponEntry || mtg.suspendedActivities || mtg.allowUnmuteSelf === false) micOn = false;
        if (mtg.suspendedActivities || mtg.allowStartVideo === false) camOn = false;
      }
      const joinedAt = new Date().toISOString();
      const wasRemoved = (mtg.removedUserIds ?? []).includes(actor.id);

      // If user was previously removed by Host, or Waiting Room is enabled for non-host, hold them in Waiting Room
      if ((wasRemoved && !isHostOrManager) || (mtg.waitingRoomEnabled && !isHostOrManager && !existing)) {
        if (existing) {
          mtg.participants = mtg.participants.filter((p) => p.userId !== actor.id);
        }
        mtg.waitingRoom = mtg.waitingRoom ?? [];
        if (!mtg.waitingRoom.some((w) => w.userId === actor.id)) {
          mtg.waitingRoom.push({
            userId: actor.id,
            fullName: actor.fullName,
            companyId: actor.companyId ?? null,
            role: isGuest ? 'GUEST' : actor.role,
            isGuest,
            requestedAt: joinedAt,
          });
          await this.persistStateNow(actor.organizationId);
          await this.appendMeetingSignal(
            mtg.id,
            {
              fromUserId: actor.id,
              fromUserName: actor.fullName,
              toUserId: '*',
              type: 'waiting-room-updated',
              payload: { userId: actor.id, fullName: actor.fullName, role: isGuest ? 'GUEST' : actor.role, isGuest },
            },
            actor.organizationId,
          );
        }
        return mtg;
      }

      if (existing) {
        if (actor.companyId) existing.companyId = actor.companyId;
        existing.fullName = actor.fullName;
        existing.screenSharing = false;
        existing.screenStreamId = null;
        if (body?.micOn !== undefined) existing.micOn = micOn;
        if (body?.camOn !== undefined) existing.camOn = camOn;
        existing.joinedAt = joinedAt;
      } else {
        mtg.participants.push({
          userId: actor.id,
          companyId: actor.companyId ?? null,
          fullName: actor.fullName,
          role: isGuest ? 'GUEST' : actor.role,
          isGuest,
          micOn,
          camOn,
          screenSharing: false,
          handRaised: false,
          joinedAt,
        });
      }
      this.recordAttendanceJoin(
        mtg,
        {
          userId: actor.id,
          fullName: actor.fullName,
          companyId: actor.companyId ?? null,
          role: isGuest ? 'GUEST' : actor.role,
          isGuest,
        },
        joinedAt,
      );
      mtg.attendeeCount = Math.max(mtg.attendeeCount, mtg.participants.length);

      if (wasNotLive && !isGuest) {
        await this.pushMeetingNotification(actor, mtg, 'STARTED');
      } else {
        await this.persistStateNow(actor.organizationId);
      }

      await this.appendMeetingSignal(
        mtg.id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'peer-joined',
          payload: { userId: actor.id, joinedAt },
        },
        actor.organizationId,
      );
      return mtg;
    });
  }

  async joinMeetingByCode(
    actor: AuthUser,
    roomCode: string,
    body?: { micOn?: boolean; camOn?: boolean; passcode?: string },
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
    return this.withMeetingLock(async () => {
      await this.syncMeetingsFromDb(actor.organizationId, true);
      const mtg = this.meetings.find((m) => m.id === id);
      if (!mtg) throw new NotFoundException('Meeting not found.');
      mtg.participants = mtg.participants.filter((p) => p.userId !== actor.id);
      mtg.waitingRoom = (mtg.waitingRoom ?? []).filter((w) => w.userId !== actor.id);
      if (mtg.spotlightUserId === actor.id) mtg.spotlightUserId = null;
      this.recordAttendanceLeave(mtg, actor.id);
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
    });
  }

  async updateParticipantState(actor: AuthUser, id: string, body: Record<string, unknown>) {
    return this.withMeetingLock(async () => {
      await this.syncMeetingsFromDb(actor.organizationId, true);
      const mtg = this.meetings.find((m) => m.id === id);
      if (!mtg) throw new NotFoundException('Meeting not found.');
      const isHost = this.canControlMeeting(mtg, actor);
      let participant = mtg.participants.find((p) => p.userId === actor.id);
      if (!participant) {
        participant = {
          userId: actor.id,
          companyId: actor.companyId ?? null,
          fullName: actor.fullName,
          role: actor.id.startsWith('guest_') ? 'GUEST' : actor.role,
          isGuest: actor.id.startsWith('guest_'),
          micOn: !mtg.muteUponEntry,
          camOn: mtg.allowStartVideo !== false,
          screenSharing: false,
          handRaised: false,
          joinedAt: new Date().toISOString(),
        };
        mtg.participants.push(participant);
      }
      if (body.micOn !== undefined) {
        const wantMic = Boolean(body.micOn);
        if (wantMic && !isHost && (mtg.suspendedActivities || mtg.allowUnmuteSelf === false)) {
          throw new ForbiddenException('Host has disabled unmuting yourself.');
        }
        participant.micOn = wantMic;
      }
      if (body.camOn !== undefined) {
        const wantCam = Boolean(body.camOn);
        if (wantCam && !isHost && (mtg.suspendedActivities || mtg.allowStartVideo === false)) {
          throw new ForbiddenException('Host has disabled starting video.');
        }
        participant.camOn = wantCam;
      }
      if (body.screenSharing !== undefined) {
        const wantShare = Boolean(body.screenSharing);
        const policy = this.resolveMeetingAccessPolicy(actor);
        if (wantShare && !isHost) {
          if (mtg.suspendedActivities || mtg.screenShareMode === 'HOST_ONLY') {
            throw new ForbiddenException('Only the host can share their screen right now.');
          }
          if (
            (policy.screenShareRequiresApproval || mtg.screenShareMode === 'APPROVAL_REQUIRED') &&
            !mtg.screenShareApprovedIds?.includes(actor.id)
          ) {
            throw new ForbiddenException('Host Approval is required before screen sharing.');
          }
        }
        participant.screenSharing = wantShare;
        if (!participant.screenSharing) participant.screenStreamId = null;
      }
      if (body.screenStreamId !== undefined) {
        participant.screenStreamId = body.screenStreamId ? String(body.screenStreamId) : null;
      }
      if (body.handRaised !== undefined) participant.handRaised = Boolean(body.handRaised);
      await this.persistStateNow(actor.organizationId);
      return mtg;
    });
  }

  async hostMeetingAction(
    actor: AuthUser,
    id: string,
    body: {
      action:
        | 'mute'
        | 'mute-all'
        | 'admit'
        | 'admit-all'
        | 'waiting-room-message'
        | 'remove'
        | 'approve-screenshare'
        | 'toggle-cohost'
        | 'ask-unmute'
        | 'stop-video'
        | 'spotlight'
        | 'lower-all-hands'
        | 'rename'
        | 'transfer-host'
        | 'update-security'
        | 'panic-suspend'
        | 'recording-status';
      targetUserId?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');

    // Recording status toggle allowed for tiers with recordingScope !== 'NONE'
    if (body.action === 'recording-status') {
      const policy = this.resolveMeetingAccessPolicy(actor);
      if (policy.recordingScope === 'NONE') {
        throw new ForbiddenException('Your tier does not have recording permission.');
      }
      const active = Boolean(body.payload?.active);
      mtg.recordingActive = active;
      mtg.recordingByName = active ? actor.fullName : null;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'recording-updated',
          payload: { active, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    const policy = this.resolveMeetingAccessPolicy(actor);
    if (policy.waitingRoomControl === 'NONE') {
      throw new ForbiddenException('Trainees cannot run host or waiting room controls.');
    }
    if (!this.canControlMeeting(mtg, actor)) {
      throw new ForbiddenException('You do not have host or waiting room control for this meeting.');
    }

    if (body.action === 'admit' && body.targetUserId) {
      const waiting = mtg.waitingRoom ?? [];
      const entry = waiting.find((w) => w.userId === body.targetUserId);
      mtg.waitingRoom = waiting.filter((w) => w.userId !== body.targetUserId);
      mtg.removedUserIds = (mtg.removedUserIds ?? []).filter((uid) => uid !== body.targetUserId);
      if (entry && !mtg.participants.some((p) => p.userId === entry.userId)) {
        const nowIso = new Date().toISOString();
        mtg.participants.push({
          userId: entry.userId,
          companyId: entry.companyId ?? null,
          fullName: entry.fullName,
          role: entry.role,
          isGuest: entry.isGuest,
          micOn: !mtg.muteUponEntry && mtg.allowUnmuteSelf !== false,
          camOn: mtg.allowStartVideo !== false,
          screenSharing: false,
          handRaised: false,
          joinedAt: nowIso,
        });
        this.recordAttendanceJoin(mtg, entry, nowIso);
        mtg.attendeeCount = Math.max(mtg.attendeeCount, mtg.participants.length);
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'waiting-room-admitted',
          payload: { userId: body.targetUserId },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'admit-all') {
      const waiting = [...(mtg.waitingRoom ?? [])];
      const nowIso = new Date().toISOString();
      for (const entry of waiting) {
        mtg.removedUserIds = (mtg.removedUserIds ?? []).filter((uid) => uid !== entry.userId);
        if (!mtg.participants.some((p) => p.userId === entry.userId)) {
          mtg.participants.push({
            userId: entry.userId,
            companyId: entry.companyId ?? null,
            fullName: entry.fullName,
            role: entry.role,
            isGuest: entry.isGuest,
            micOn: !mtg.muteUponEntry && mtg.allowUnmuteSelf !== false,
            camOn: mtg.allowStartVideo !== false,
            screenSharing: false,
            handRaised: false,
            joinedAt: nowIso,
          });
          this.recordAttendanceJoin(mtg, entry, nowIso);
        }
      }
      mtg.waitingRoom = [];
      mtg.attendeeCount = Math.max(mtg.attendeeCount, mtg.participants.length);
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'waiting-room-admitted',
          payload: { all: true },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'waiting-room-message') {
      const msg = String(body.payload?.message ?? '').trim().slice(0, 300);
      mtg.waitingRoomMessage = msg || null;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'waiting-room-message',
          payload: { message: mtg.waitingRoomMessage, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'remove' && body.targetUserId) {
      const removedFromCall = mtg.participants.find((p) => p.userId === body.targetUserId);
      mtg.participants = mtg.participants.filter((p) => p.userId !== body.targetUserId);
      this.recordAttendanceLeave(mtg, body.targetUserId);
      mtg.removedUserIds = Array.from(new Set([...(mtg.removedUserIds ?? []), body.targetUserId]));
      if (removedFromCall) {
        mtg.waitingRoom = mtg.waitingRoom ?? [];
        if (!mtg.waitingRoom.some((w) => w.userId === removedFromCall.userId)) {
          mtg.waitingRoom.push({
            userId: removedFromCall.userId,
            fullName: removedFromCall.fullName,
            companyId: removedFromCall.companyId ?? null,
            role: removedFromCall.role,
            isGuest: removedFromCall.isGuest,
            requestedAt: new Date().toISOString(),
          });
        }
      } else {
        mtg.waitingRoom = (mtg.waitingRoom ?? []).filter((w) => w.userId !== body.targetUserId);
      }
      if (mtg.spotlightUserId === body.targetUserId) mtg.spotlightUserId = null;
      mtg.attendeeCount = mtg.participants.length;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'host-removed',
          payload: { targetUserId: body.targetUserId, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'toggle-cohost' && body.targetUserId) {
      const cur = new Set(mtg.coHostIds ?? []);
      if (cur.has(body.targetUserId)) cur.delete(body.targetUserId);
      else cur.add(body.targetUserId);
      mtg.coHostIds = Array.from(cur);
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'cohost-updated',
          payload: { coHostIds: mtg.coHostIds, targetUserId: body.targetUserId },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'approve-screenshare' && body.targetUserId) {
      mtg.screenShareApprovedIds = Array.from(
        new Set([...(mtg.screenShareApprovedIds ?? []), body.targetUserId]),
      );
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'screenshare-approved',
          payload: { targetUserId: body.targetUserId, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
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

    if (body.action === 'ask-unmute' && body.targetUserId) {
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'host-ask-unmute',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'stop-video' && body.targetUserId) {
      const target = mtg.participants.find((p) => p.userId === body.targetUserId);
      if (target) target.camOn = false;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: body.targetUserId,
          type: 'host-stop-video',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'spotlight') {
      mtg.spotlightUserId = body.targetUserId ? String(body.targetUserId) : null;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'spotlight-updated',
          payload: { spotlightUserId: mtg.spotlightUserId, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'lower-all-hands') {
      for (const participant of mtg.participants) {
        participant.handRaised = false;
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'hands-lowered',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'rename' && body.targetUserId) {
      const newName = String(body.payload?.newName ?? '').trim().slice(0, 60);
      if (newName.length < 2) throw new BadRequestException('Name must be at least 2 characters.');
      const target = mtg.participants.find((p) => p.userId === body.targetUserId);
      if (target) target.fullName = newName;
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'participant-renamed',
          payload: { userId: body.targetUserId, newName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'transfer-host' && body.targetUserId) {
      const target = mtg.participants.find((p) => p.userId === body.targetUserId);
      if (!target || target.isGuest) {
        throw new BadRequestException('Host role can only be transferred to an active internal participant.');
      }
      mtg.organizerId = target.userId;
      mtg.organizerName = target.fullName;
      mtg.coHostIds = Array.from(new Set([...(mtg.coHostIds ?? []), actor.id]));
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'host-transferred',
          payload: { newHostId: target.userId, newHostName: target.fullName, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'update-security') {
      const p = body.payload ?? {};
      if (p.isLocked !== undefined) mtg.isLocked = Boolean(p.isLocked);
      if (p.waitingRoomEnabled !== undefined) mtg.waitingRoomEnabled = Boolean(p.waitingRoomEnabled);
      if (p.muteUponEntry !== undefined) mtg.muteUponEntry = Boolean(p.muteUponEntry);
      if (p.allowUnmuteSelf !== undefined) mtg.allowUnmuteSelf = Boolean(p.allowUnmuteSelf);
      if (p.allowStartVideo !== undefined) mtg.allowStartVideo = Boolean(p.allowStartVideo);
      if (p.allowRenameSelf !== undefined) mtg.allowRenameSelf = Boolean(p.allowRenameSelf);
      if (p.suspendedActivities !== undefined) mtg.suspendedActivities = Boolean(p.suspendedActivities);
      if (p.chatPermission !== undefined) {
        const cp = String(p.chatPermission).toUpperCase();
        if (['EVERYONE_DM', 'EVERYONE_PUBLIC', 'HOST_ONLY', 'DISABLED'].includes(cp)) {
          mtg.chatPermission = cp as MeetingItem['chatPermission'];
        }
      }
      if (p.screenShareMode !== undefined) {
        const sm = String(p.screenShareMode).toUpperCase();
        if (['ALL', 'HOST_ONLY', 'APPROVAL_REQUIRED'].includes(sm)) {
          mtg.screenShareMode = sm as MeetingItem['screenShareMode'];
        }
      }
      if (p.passcode !== undefined) {
        const pc = String(p.passcode ?? '').trim();
        mtg.passcode = pc.length > 0 ? pc.slice(0, 16) : null;
      }
      if (p.allowExternalGuests !== undefined && policy.canInviteExternal) {
        mtg.allowExternalGuests = Boolean(p.allowExternalGuests);
      }
      if (p.recordingAllowed !== undefined && policy.recordingScope !== 'NONE') {
        mtg.recordingAllowed = Boolean(p.recordingAllowed);
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'security-updated',
          payload: {
            isLocked: mtg.isLocked,
            waitingRoomEnabled: mtg.waitingRoomEnabled,
            muteUponEntry: mtg.muteUponEntry,
            allowUnmuteSelf: mtg.allowUnmuteSelf,
            allowStartVideo: mtg.allowStartVideo,
            allowRenameSelf: mtg.allowRenameSelf,
            chatPermission: mtg.chatPermission,
            screenShareMode: mtg.screenShareMode,
            suspendedActivities: mtg.suspendedActivities,
            by: actor.fullName,
          },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'panic-suspend') {
      mtg.isLocked = true;
      mtg.suspendedActivities = true;
      mtg.allowUnmuteSelf = false;
      mtg.allowStartVideo = false;
      mtg.allowRenameSelf = false;
      mtg.chatPermission = 'DISABLED';
      mtg.screenShareMode = 'HOST_ONLY';
      for (const participant of mtg.participants) {
        if (participant.userId !== actor.id) {
          participant.micOn = false;
          participant.camOn = false;
          participant.screenSharing = false;
          participant.screenStreamId = null;
        }
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'panic-suspended',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    throw new BadRequestException('Unsupported host action.');
  }

  async renameSelfInMeeting(actor: AuthUser, id: string, newNameRaw: string) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    const isHost = this.canControlMeeting(mtg, actor);
    if (!isHost && (mtg.allowRenameSelf === false || mtg.suspendedActivities)) {
      throw new ForbiddenException('Host has disabled renaming yourself.');
    }
    const newName = String(newNameRaw ?? '').trim().slice(0, 60);
    if (newName.length < 2) throw new BadRequestException('Name must be at least 2 characters.');
    const target = mtg.participants.find((p) => p.userId === actor.id);
    if (target) target.fullName = newName;
    await this.persistStateNow(actor.organizationId);
    await this.appendMeetingSignal(
      id,
      {
        fromUserId: actor.id,
        fromUserName: newName,
        toUserId: '*',
        type: 'participant-renamed',
        payload: { userId: actor.id, newName },
      },
      actor.organizationId,
    );
    return mtg;
  }

  async manageMeetingPoll(
    actor: AuthUser,
    id: string,
    body: {
      action: 'create' | 'vote' | 'close';
      question?: string;
      options?: string[];
      multipleChoice?: boolean;
      pollId?: string;
      optionIds?: string[];
    },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    mtg.polls = mtg.polls ?? [];

    if (body.action === 'create') {
      if (!this.canControlMeeting(mtg, actor)) {
        throw new ForbiddenException('Only hosts or co-hosts can launch polls.');
      }
      const question = String(body.question ?? '').trim();
      const opts = (Array.isArray(body.options) ? body.options : [])
        .map((o) => String(o ?? '').trim())
        .filter(Boolean);
      if (question.length < 2 || opts.length < 2) {
        throw new BadRequestException('Poll question and at least 2 options are required.');
      }
      const poll: MeetingPollItem = {
        id: `poll_${randomUUID().slice(0, 8)}`,
        question,
        multipleChoice: Boolean(body.multipleChoice),
        options: opts.map((label, idx) => ({ id: `opt_${idx + 1}`, label, votes: [] })),
        status: 'OPEN',
        createdById: actor.id,
        createdByName: actor.fullName,
        createdAt: new Date().toISOString(),
      };
      mtg.polls.unshift(poll);
    } else if (body.action === 'vote') {
      const poll = mtg.polls.find((p) => p.id === body.pollId);
      if (!poll) throw new NotFoundException('Poll not found.');
      if (poll.status !== 'OPEN') throw new BadRequestException('Poll is closed.');
      const chosen = Array.isArray(body.optionIds) ? body.optionIds.map(String) : [];
      if (chosen.length === 0) throw new BadRequestException('Select at least one option.');
      const targetIds = poll.multipleChoice ? chosen : [chosen[0]];
      for (const opt of poll.options) {
        opt.votes = opt.votes.filter((uid) => uid !== actor.id);
        if (targetIds.includes(opt.id)) opt.votes.push(actor.id);
      }
    } else if (body.action === 'close') {
      if (!this.canControlMeeting(mtg, actor)) {
        throw new ForbiddenException('Only hosts or co-hosts can close polls.');
      }
      const poll = mtg.polls.find((p) => p.id === body.pollId);
      if (!poll) throw new NotFoundException('Poll not found.');
      poll.status = 'CLOSED';
    } else {
      throw new BadRequestException('Unsupported poll action.');
    }

    await this.persistStateNow(actor.organizationId);
    await this.appendMeetingSignal(
      id,
      {
        fromUserId: actor.id,
        fromUserName: actor.fullName,
        toUserId: '*',
        type: 'polls-updated',
        payload: { polls: mtg.polls },
      },
      actor.organizationId,
    );
    return mtg;
  }

  async manageMeetingQa(
    actor: AuthUser,
    id: string,
    body: {
      action: 'ask' | 'upvote' | 'answer';
      question?: string;
      qaId?: string;
      answerText?: string;
    },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    mtg.qaItems = mtg.qaItems ?? [];

    if (body.action === 'ask') {
      if (mtg.suspendedActivities) throw new ForbiddenException('Activities are suspended by the host.');
      const q = String(body.question ?? '').trim();
      if (q.length < 2) throw new BadRequestException('Question cannot be empty.');
      mtg.qaItems.unshift({
        id: `qa_${randomUUID().slice(0, 8)}`,
        authorId: actor.id,
        authorName: actor.fullName,
        question: q,
        upvoterIds: [actor.id],
        answered: false,
        answerText: null,
        answeredByName: null,
        createdAt: new Date().toISOString(),
      });
    } else if (body.action === 'upvote') {
      const item = mtg.qaItems.find((q) => q.id === body.qaId);
      if (!item) throw new NotFoundException('Question not found.');
      if (item.upvoterIds.includes(actor.id)) {
        item.upvoterIds = item.upvoterIds.filter((uid) => uid !== actor.id);
      } else {
        item.upvoterIds.push(actor.id);
      }
    } else if (body.action === 'answer') {
      if (!this.canControlMeeting(mtg, actor)) {
        throw new ForbiddenException('Only hosts or co-hosts can answer Q&A items.');
      }
      const item = mtg.qaItems.find((q) => q.id === body.qaId);
      if (!item) throw new NotFoundException('Question not found.');
      item.answered = true;
      item.answerText = String(body.answerText ?? '').trim() || 'Answered live';
      item.answeredByName = actor.fullName;
    } else {
      throw new BadRequestException('Unsupported Q&A action.');
    }

    await this.persistStateNow(actor.organizationId);
    await this.appendMeetingSignal(
      id,
      {
        fromUserId: actor.id,
        fromUserName: actor.fullName,
        toUserId: '*',
        type: 'qa-updated',
        payload: { qaItems: mtg.qaItems },
      },
      actor.organizationId,
    );
    return mtg;
  }

  async manageBreakoutRooms(
    actor: AuthUser,
    id: string,
    body: {
      action: 'configure' | 'open' | 'broadcast' | 'close-all' | 'join-room' | 'leave-room';
      rooms?: Array<{ id?: string; name: string; participantIds?: string[] }>;
      durationMinutes?: number;
      message?: string;
      roomId?: string;
    },
  ) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    mtg.breakoutRooms = mtg.breakoutRooms ?? [];

    if (body.action === 'join-room' && body.roomId) {
      const p = mtg.participants.find((x) => x.userId === actor.id);
      if (p) p.breakoutRoomId = body.roomId;
      await this.persistStateNow(actor.organizationId);
      return mtg;
    }
    if (body.action === 'leave-room') {
      const p = mtg.participants.find((x) => x.userId === actor.id);
      if (p) p.breakoutRoomId = null;
      await this.persistStateNow(actor.organizationId);
      return mtg;
    }

    if (!this.canControlMeeting(mtg, actor)) {
      throw new ForbiddenException('Only hosts or co-hosts can manage breakout rooms.');
    }

    if (body.action === 'configure' || body.action === 'open') {
      const list = Array.isArray(body.rooms) ? body.rooms : [];
      const endsAt =
        body.durationMinutes && Number(body.durationMinutes) > 0
          ? new Date(Date.now() + Number(body.durationMinutes) * 60_000).toISOString()
          : null;
      if (list.length > 0) {
        mtg.breakoutRooms = list.map((r, idx) => ({
          id: r.id || `br_${idx + 1}_${randomUUID().slice(0, 4)}`,
          name: String(r.name || `Breakout Room ${idx + 1}`).trim(),
          roomCode: `${mtg.roomCode}-BR${idx + 1}`,
          participantIds: Array.isArray(r.participantIds) ? r.participantIds.map(String) : [],
          active: body.action === 'open',
          endsAt: body.action === 'open' ? endsAt : null,
        }));
      } else if (body.action === 'open') {
        for (const br of mtg.breakoutRooms) {
          br.active = true;
          br.endsAt = endsAt;
        }
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'breakout-updated',
          payload: { breakoutRooms: mtg.breakoutRooms, opened: body.action === 'open' },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'broadcast') {
      const message = String(body.message ?? '').trim().slice(0, 300);
      if (!message) throw new BadRequestException('Broadcast message cannot be empty.');
      mtg.breakoutBroadcast = { message, sentAt: new Date().toISOString() };
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'breakout-broadcast',
          payload: { message, by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    if (body.action === 'close-all') {
      for (const br of mtg.breakoutRooms) {
        br.active = false;
        br.endsAt = null;
      }
      for (const p of mtg.participants) {
        p.breakoutRoomId = null;
      }
      await this.persistStateNow(actor.organizationId);
      await this.appendMeetingSignal(
        id,
        {
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: '*',
          type: 'breakout-closed',
          payload: { by: actor.fullName },
        },
        actor.organizationId,
      );
      return mtg;
    }

    throw new BadRequestException('Unsupported breakout action.');
  }

  async getMeetingAttendance(actor: AuthUser, id: string) {
    await this.syncMeetingsFromDb(actor.organizationId, true);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting not found.');
    const nowMs = Date.now();
    const entries = (mtg.attendanceLog ?? []).map((entry) => ({
      ...entry,
      durationSec: entry.leftAt
        ? entry.durationSec ?? Math.max(0, Math.round((new Date(entry.leftAt).getTime() - new Date(entry.joinedAt).getTime()) / 1000))
        : Math.max(0, Math.round((nowMs - new Date(entry.joinedAt).getTime()) / 1000)),
    }));
    return {
      meetingId: mtg.id,
      roomCode: mtg.roomCode,
      title: mtg.title,
      organizerName: mtg.organizerName,
      startsAt: mtg.startsAt,
      status: mtg.status,
      notes: mtg.notes,
      entries,
    };
  }

  // ─── External Guest Public Meeting Access (No Company Login Required) ─────
  async getPublicMeetingInfo(roomCode: string) {
    const normalized = String(roomCode ?? '').trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Room code is required.');
    await this.syncMeetingsFromDb(undefined, true);
    const mtg = this.meetings.find(
      (m) => m.roomCode.toUpperCase() === normalized || m.id.toUpperCase() === normalized,
    );
    if (!mtg) throw new NotFoundException(`Meeting room "${normalized}" was not found.`);
    if (!mtg.allowExternalGuests) {
      throw new ForbiddenException('INTERNAL_ONLY: This Yakunex meeting requires a company account login.');
    }
    return {
      id: mtg.id,
      roomCode: mtg.roomCode,
      title: mtg.title,
      agenda: mtg.agenda,
      organizerName: mtg.organizerName,
      status: mtg.status,
      allowExternalGuests: true,
      requiresPasscode: Boolean(mtg.passcode),
      waitingRoomEnabled: Boolean(mtg.waitingRoomEnabled),
      isLocked: Boolean(mtg.isLocked),
    };
  }

  async joinPublicMeetingAsGuest(
    roomCode: string,
    body: { fullName: string; passcode?: string; micOn?: boolean; camOn?: boolean },
  ) {
    const normalized = String(roomCode ?? '').trim().toUpperCase();
    const fullName = String(body?.fullName ?? '').trim().slice(0, 60);
    if (fullName.length < 2) throw new BadRequestException('Please enter your display name.');
    await this.syncMeetingsFromDb(undefined, true);
    const mtg = this.meetings.find(
      (m) => m.roomCode.toUpperCase() === normalized || m.id.toUpperCase() === normalized,
    );
    if (!mtg) throw new NotFoundException(`Meeting room "${normalized}" was not found.`);
    if (!mtg.allowExternalGuests) {
      throw new ForbiddenException('External guest access is not enabled for this meeting.');
    }
    const orgId = (await this.resolveOrgId()) ?? 'org_default';
    const guestId = `guest_${randomUUID().slice(0, 10)}`;
    const guestToken = this.signGuestToken({
      guestId,
      meetingId: mtg.id,
      roomCode: mtg.roomCode,
      fullName: `${fullName} (Guest)`,
      organizationId: orgId,
      exp: Date.now() + 6 * 3600_000,
    });
    const guestActor = this.createGuestActor(guestToken);
    const joined = await this.joinMeetingRoom(guestActor, mtg.id, {
      micOn: body.micOn,
      camOn: body.camOn,
      passcode: body.passcode,
      isGuest: true,
    });
    return {
      guestToken,
      guestUser: {
        id: guestId,
        companyId: 'GUEST',
        fullName: `${fullName} (Guest)`,
        role: 'GUEST',
      },
      room: joined,
    };
  }

  async getGuestMeetingRoom(token: string, id: string) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.getMeetingRoom(id, g.organizationId);
  }

  async getGuestSfuToken(token: string, id: string) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.getMeetingSfuToken(this.createGuestActor(token), id);
  }

  async guestUpdateParticipant(token: string, id: string, body: Record<string, unknown>) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.updateParticipantState(this.createGuestActor(token), id, body);
  }

  async guestPostChat(token: string, id: string, body: Record<string, unknown>) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.postMeetingChat(this.createGuestActor(token), id, body);
  }

  async guestSendSignal(
    token: string,
    id: string,
    body: { toUserId?: string; type?: string; payload?: unknown; batch?: Array<{ toUserId?: string; type: string; payload?: unknown }> },
  ) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.sendMeetingSignal(this.createGuestActor(token), id, body);
  }

  async guestPollSignals(token: string, id: string, after: number) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.pollMeetingSignals(this.createGuestActor(token), id, after);
  }

  async guestLeaveMeeting(token: string, id: string) {
    const g = this.verifyGuestToken(token);
    if (g.meetingId !== id) throw new ForbiddenException('Token does not match meeting room.');
    return this.leaveMeetingRoom(this.createGuestActor(token), id);
  }

  async sendMeetingSignal(
    actor: AuthUser,
    id: string,
    body: {
      toUserId?: string;
      type?: string;
      payload?: unknown;
      batch?: Array<{ toUserId?: string; type: string; payload?: unknown }>;
    },
  ) {
    if (Array.isArray(body?.batch) && body.batch.length > 0) {
      const valid = body.batch
        .map((entry) => ({
          fromUserId: actor.id,
          fromUserName: actor.fullName,
          toUserId: String(entry?.toUserId || '*'),
          type: String(entry?.type ?? '').trim(),
          payload: entry?.payload ?? null,
        }))
        .filter((entry) => entry.type.length > 0)
        .slice(0, 120);
      if (valid.length === 0) {
        throw new BadRequestException('Signal batch must contain at least one valid signal.');
      }
      const seq = await this.appendMeetingSignalsBatch(id, valid, actor.organizationId);
      return { ok: true, seq, count: valid.length };
    }

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
    let dbItems: MeetingSignalItem[] = [];

    const floor = after > 0 ? Math.max(0, after - 4000) : Math.max(0, now - 8000);

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
          take: 3000,
        });
        dbItems = rows
          .map((r) => r.value as unknown as MeetingSignalItem | null)
          .filter((v): v is MeetingSignalItem => Boolean(v && typeof v.createdAt === 'number'));

        // Prune expired signal rows (>90s) in background at most once every 15s per room
        const lastPruned = this.lastSignalPruneAt.get(id) ?? 0;
        if (now - lastPruned > 15_000) {
          this.lastSignalPruneAt.set(id, now);
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
      }
    } catch {
      // Fallback to in-memory bucket
    }

    const memItems = this.meetingSignals.get(id)?.items ?? [];
    const seenIds = new Set<string>();
    const items: MeetingSignalItem[] = [];
    for (const item of [...dbItems, ...memItems]) {
      const key = item.id ?? `${item.seq}_${item.fromUserId}_${item.type}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        items.push(item);
      }
    }
    items.sort((a, b) => a.createdAt - b.createdAt);

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

    const isHost = this.canControlMeeting(mtg, actor);
    const chatPerm = mtg.chatPermission ?? 'EVERYONE_DM';
    const recipientId = body.recipientId ? String(body.recipientId) : null;
    const recipientName = body.recipientName ? String(body.recipientName) : null;

    if (!isHost) {
      if (mtg.suspendedActivities || chatPerm === 'DISABLED') {
        throw new ForbiddenException('Chat is currently disabled by the host.');
      }
      if (chatPerm === 'HOST_ONLY') {
        const isToHost =
          recipientId &&
          (recipientId === mtg.organizerId || (mtg.coHostIds ?? []).includes(recipientId));
        if (!isToHost) {
          throw new ForbiddenException('Host has restricted chat to Host-only messages.');
        }
      }
      if (chatPerm === 'EVERYONE_PUBLIC' && recipientId) {
        throw new ForbiddenException('Private direct messages are disabled by the host.');
      }
    }

    const text = String(body.body ?? '').trim();
    const attachmentUrl =
      typeof body.attachmentUrl === 'string' && body.attachmentUrl.startsWith('data:')
        ? body.attachmentUrl
        : null;
    const attachmentName =
      typeof body.attachmentName === 'string' && body.attachmentName.trim()
        ? body.attachmentName.trim()
        : null;
    if (!text && !attachmentUrl) throw new BadRequestException('Message cannot be empty.');
    const senderParts = actor.fullName.trim().split(/\s+/).filter(Boolean);
    const senderLast = senderParts[senderParts.length - 1] || actor.fullName;
    const replyToId = body.replyToId ? String(body.replyToId) : null;
    const replyTarget = replyToId ? mtg.chatMessages.find((m) => m.id === replyToId) : null;
    const replyPreview = replyTarget
      ? `${replyTarget.senderName}: ${replyTarget.body.slice(0, 60)}${replyTarget.body.length > 60 ? '…' : ''}`
      : null;

    mtg.chatMessages.push({
      id: `mc_${randomUUID().slice(0, 8)}`,
      senderId: actor.id,
      senderName: actor.companyId ? `${senderLast} · ${actor.companyId}` : senderLast,
      body: text || (attachmentName ? `Attachment: ${attachmentName}` : 'Attachment'),
      createdAt: new Date().toISOString(),
      replyToId,
      replyPreview,
      recipientId,
      recipientName,
      attachmentUrl,
      attachmentName,
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

    // Jibble-style per-employee Timesheet & Attendance Summary
    const byUser = new Map<
      string,
      {
        userId: string;
        userName: string;
        totalMinutes: number;
        regularMinutes: number;
        overtimeMinutes: number;
        billableMinutes: number;
        approvedMinutes: number;
        breakMinutes: number;
        lateCount: number;
        gpsVerifiedCount: number;
      }
    >();
    const ensureEmp = (userId: string, userName: string) => {
      let row = byUser.get(userId);
      if (!row) {
        row = {
          userId,
          userName,
          totalMinutes: 0,
          regularMinutes: 0,
          overtimeMinutes: 0,
          billableMinutes: 0,
          approvedMinutes: 0,
          breakMinutes: 0,
          lateCount: 0,
          gpsVerifiedCount: 0,
        };
        byUser.set(userId, row);
      }
      return row;
    };

    const dailyMinutes = new Map<string, number>();
    for (const te of this.timeEntries) {
      const row = ensureEmp(te.userId, te.userName);
      row.totalMinutes += te.durationMinutes;
      if (te.billable) row.billableMinutes += te.durationMinutes;
      if (te.status === 'APPROVED') row.approvedMinutes += te.durationMinutes;
      if (te.latitude != null && te.longitude != null) row.gpsVerifiedCount += 1;
      const dayKey = `${te.userId}::${te.startedAt.slice(0, 10)}`;
      dailyMinutes.set(dayKey, (dailyMinutes.get(dayKey) ?? 0) + te.durationMinutes);
    }
    for (const [dayKey, mins] of dailyMinutes.entries()) {
      const [uid] = dayKey.split('::');
      const row = byUser.get(uid);
      if (row) {
        const reg = Math.min(480, mins);
        const ot = Math.max(0, mins - 480);
        row.regularMinutes += reg;
        row.overtimeMinutes += ot;
      }
    }
    for (const att of this.attendance) {
      const row = ensureEmp(att.userId, att.userName);
      row.breakMinutes += att.breakMinutes;
      if (att.isLate) row.lateCount += 1;
      if (att.latitude != null && att.longitude != null) row.gpsVerifiedCount += 1;
    }

    return {
      projectProgress,
      bugsBySeverity,
      tasksByStatus,
      timesheetSummary: Array.from(byUser.values()),
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
      tierAccessMatrix: TIER_ACCESS_MATRIX,
      designationPresets: DESIGNATION_TIER_PRESETS,
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
      ...(body.officeLatitude !== undefined ? { officeLatitude: Number(body.officeLatitude) } : {}),
      ...(body.officeLongitude !== undefined ? { officeLongitude: Number(body.officeLongitude) } : {}),
      ...(body.officeRadiusMeters !== undefined
        ? { officeRadiusMeters: Math.max(25, Number(body.officeRadiusMeters) || 250) }
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

  /**
   * Resolves STUN + optional TURN relay servers from environment configuration.
   * Supports WEBRTC_ICE_SERVERS_JSON, static TURN_URLS, Cloudflare Calls TURN, or Metered TURN.
   */
  async getMeetingIceConfig(): Promise<MeetingIceConfig> {
    const now = Date.now();
    if (this.iceConfigCache && this.iceConfigCache.expiresAt > now) {
      return this.iceConfigCache.data;
    }

    const servers: IceServerEntry[] = [...DEFAULT_STUN_SERVERS];

    const rawJson = process.env.WEBRTC_ICE_SERVERS_JSON?.trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item === 'object' && 'urls' in item) {
              servers.push(item as IceServerEntry);
            }
          }
        }
      } catch {
        this.logger.warn('Ignoring malformed WEBRTC_ICE_SERVERS_JSON environment value');
      }
    }

    const turnUrlsRaw = process.env.TURN_URLS?.trim();
    if (turnUrlsRaw) {
      const urls = turnUrlsRaw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      if (urls.length > 0) {
        const entry: IceServerEntry = { urls };
        if (process.env.TURN_USERNAME?.trim()) entry.username = process.env.TURN_USERNAME.trim();
        if (process.env.TURN_CREDENTIAL?.trim()) entry.credential = process.env.TURN_CREDENTIAL.trim();
        servers.push(entry);
      }
    }

    const cfKeyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
    const cfToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
    if (cfKeyId && cfToken) {
      try {
        const res = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfKeyId)}/credentials/generate-ice-servers`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${cfToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ttl: 86400 }),
            signal: AbortSignal.timeout(4000),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as { iceServers?: IceServerEntry[] | IceServerEntry };
          const list = Array.isArray(data.iceServers)
            ? data.iceServers
            : data.iceServers
              ? [data.iceServers]
              : [];
          servers.push(...list);
        }
      } catch {
        this.logger.warn('Failed to fetch Cloudflare TURN ICE servers; continuing with fallback servers');
      }
    }

    const meteredDomain = process.env.METERED_DOMAIN?.trim();
    const meteredKey = process.env.METERED_SECRET_KEY?.trim();
    if (meteredDomain && meteredKey) {
      try {
        const res = await fetch(
          `https://${meteredDomain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`,
          { signal: AbortSignal.timeout(4000) },
        );
        if (res.ok) {
          const data = (await res.json()) as unknown;
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item && typeof item === 'object' && 'urls' in item) {
                servers.push(item as IceServerEntry);
              }
            }
          }
        }
      } catch {
        this.logger.warn('Failed to fetch Metered TURN ICE servers; continuing with fallback servers');
      }
    }

    const result: MeetingIceConfig = {
      iceServers: servers,
      hasTurn: servers.some(containsTurnUrl),
      iceCandidatePoolSize: 4,
    };
    // Cache shorter (30s) when TURN failed/absent so newly added transient fetch recovers fast, 5m with TURN.
    this.iceConfigCache = {
      data: result,
      expiresAt: now + (result.hasTurn ? 5 * 60_000 : 30_000),
    };
    return result;
  }

  /**
   * Issues a scoped LiveKit SFU access token when LIVEKIT_URL, LIVEKIT_API_KEY, and
   * LIVEKIT_API_SECRET are configured, enabling 100+ simultaneous cameras & mics with zero lag.
   * Falls back cleanly to `{ enabled: false, provider: 'mesh' }` when no SFU is configured.
   */
  async getMeetingSfuToken(actor: AuthUser, id: string, breakoutRoomCode?: string) {
    await this.syncMeetingsFromDb(actor.organizationId);
    const mtg = this.meetings.find((m) => m.id === id);
    if (!mtg) throw new NotFoundException('Meeting room not found.');

    const targetRoomName =
      breakoutRoomCode && mtg.breakoutRooms?.some((b) => b.roomCode === breakoutRoomCode && b.active)
        ? breakoutRoomCode
        : mtg.roomCode;

    const url = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    if (!url || !apiKey || !apiSecret) {
      return {
        enabled: false,
        provider: 'mesh' as const,
        url: null,
        token: null,
        roomName: targetRoomName,
      };
    }

    const nameParts = actor.fullName.trim().split(/\s+/).filter(Boolean);
    const lastName = nameParts[nameParts.length - 1] || actor.fullName;
    const at = new AccessToken(apiKey, apiSecret, {
      identity: actor.id,
      name: actor.companyId ? `${lastName} · ${actor.companyId}` : lastName,
      ttl: '4h',
      metadata: JSON.stringify({ role: actor.role, companyId: actor.companyId ?? null }),
    });
    at.addGrant({
      roomJoin: true,
      room: targetRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();
    return {
      enabled: true,
      provider: 'livekit' as const,
      url,
      token,
      roomName: targetRoomName,
    };
  }

  // ─── Organization & Hierarchy ─────────────────────────────────────────────
  async getOrganizationOverview(actor: AuthUser) {
    let employees: Array<{
      id: string;
      companyId: string | null;
      fullName: string;
      email: string;
      role: Role;
      title: string | null;
      status: string;
      avatarUrl?: string | null;
      managerId: string | null;
      department: { id: string; name: string } | null;
    }> = [];
    try {
      if (this.prisma.user?.findMany) {
        const rows = await this.prisma.user.findMany({
          where: { organizationId: actor.organizationId, deletedAt: null },
          orderBy: { fullName: 'asc' },
          select: {
            id: true,
            companyId: true,
            fullName: true,
            email: true,
            role: true,
            title: true,
            status: true,
            avatarUrl: true,
            department: { select: { id: true, name: true } },
          },
        });
        employees = rows.map((r) => ({
          ...r,
          avatarUrl: this.avatarOf(r.id, (r as { avatarUrl?: string | null }).avatarUrl),
          managerId: this.reportingManagers[r.id] ?? null,
        }));
      }
    } catch {
      // Non-fatal fallback
    }
    return {
      departments: this.departments,
      employees,
      hierarchy: [
        { level: 'Board of Directors / MD', leads: 'MD, Board', reportsTo: null },
        { level: 'Executive Operations', leads: 'CEO', reportsTo: 'Board of Directors / MD' },
        { level: 'Legal & Governance', leads: 'Company Secretary (External)', reportsTo: 'Board of Directors / MD' },
        { level: 'Technology (CTO)', leads: 'Tech Lead -> SE, QA, UI/UX, DevOps, Interns', reportsTo: 'CEO' },
        { level: 'Operations (COO)', leads: 'Project Manager, Business Analyst, Project Teams', reportsTo: 'CEO' },
        { level: 'Finance (CFO)', leads: 'Accountant', reportsTo: 'CEO' },
        { level: 'HR & Admin', leads: 'HR Manager -> Admin', reportsTo: 'CEO' },
      ],
    };
  }

  createDepartment(actor: AuthUser, body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    const code = String(body.code ?? '').trim().toUpperCase();
    if (name.length < 2 || code.length < 2) {
      throw new BadRequestException('Department name and code are required.');
    }
    const created = {
      id: `dept_${randomUUID().slice(0, 8)}`,
      name,
      code,
      headTitle: String(body.headTitle ?? '').trim() || 'Department Head',
      description: String(body.description ?? '').trim() || 'Company department',
      createdAt: new Date().toISOString(),
    };
    this.departments.push(created);
    this.persistState(actor.organizationId);
    return created;
  }

  async assignReportingManager(actor: AuthUser, userId: string, managerId: string | null) {
    if (!userId) throw new BadRequestException('userId is required.');
    if (userId === managerId) throw new BadRequestException('An employee cannot report to themselves.');
    this.reportingManagers[userId] = managerId || null;
    this.persistState(actor.organizationId);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'REPORTING_MANAGER_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { managerId },
    });
    return { ok: true, userId, managerId };
  }

  // ─── Approval Center ──────────────────────────────────────────────────────
  listApprovals(actor: AuthUser) {
    const isApprover = this.isManagerOrAdmin(actor);
    const customApprovals = isApprover
      ? this.approvals
      : this.approvals.filter((a) => a.requestedById === actor.id);
    const leaveAsApprovals = (isApprover
      ? this.leaveRequests
      : this.leaveRequests.filter((l) => l.userId === actor.id)
    ).map((l) => ({
      id: l.id,
      source: 'LEAVE' as const,
      type: `LEAVE (${l.type})`,
      title: `${l.userName} · ${l.days} day(s)`,
      description: `${l.startDate} to ${l.endDate} — ${l.reason}`,
      requestedById: l.userId,
      requestedByName: l.userName,
      status: l.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED',
      decidedByName: l.approverName,
      createdAt: l.startDate,
    }));
    return [
      ...customApprovals.map((a) => ({ ...a, source: 'GENERAL' as const })),
      ...leaveAsApprovals,
    ];
  }

  createApproval(actor: AuthUser, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2) throw new BadRequestException('Approval title is required.');
    const item = {
      id: `apr_${randomUUID().slice(0, 8)}`,
      type: String(body.type ?? 'EXPENSE').toUpperCase(),
      title,
      description: String(body.description ?? '').trim() || title,
      requestedById: actor.id,
      requestedByName: actor.fullName,
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };
    this.approvals.unshift(item);
    this.notifications.unshift({
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'APPROVAL',
      title: `New Approval Request: ${item.title}`,
      body: `${actor.fullName} submitted a ${item.type} request.`,
      targetUserId: '*',
      readByIds: [actor.id],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    });
    this.persistState(actor.organizationId);
    return item;
  }

  async decideApproval(
    actor: AuthUser,
    id: string,
    body: { status: 'APPROVED' | 'REJECTED' | 'RETURNED'; comment?: string; source?: string },
  ) {
    if (!this.isManagerOrAdmin(actor)) {
      throw new ForbiddenException('Only managers or admins can decide approvals.');
    }
    if (body.source === 'LEAVE' || this.leaveRequests.some((l) => l.id === id)) {
      if (body.status === 'APPROVED' || body.status === 'REJECTED') {
        return this.decideLeave(actor, id, { status: body.status });
      }
    }
    const decision = pickEnum(body.status, APPROVAL_DECISIONS, 'approval decision');
    if (!decision) throw new BadRequestException('Approval decision is required.');
    body = { ...body, status: decision };
    const item = this.approvals.find((a) => a.id === id);
    if (!item) throw new NotFoundException('Approval request not found.');
    item.status = body.status;
    item.decidedByName = actor.fullName;
    item.comment = body.comment ?? null;
    item.decidedAt = new Date().toISOString();

    if (item.type === 'TIMESHEET' && item.id.startsWith('apr_ts_')) {
      const teId = item.id.replace('apr_ts_', '');
      const te = this.timeEntries.find((t) => t.id === teId);
      if (te) {
        te.status =
          body.status === 'APPROVED'
            ? 'APPROVED'
            : body.status === 'REJECTED'
              ? 'REJECTED'
              : 'REVISION_REQUIRED';
        te.approvedByName = actor.fullName;
      }
    }

    if (body.status === 'APPROVED' && item.type === 'PROFILE_CHANGE' && item.meta?.targetUserId && item.meta?.field && item.meta?.newValue !== undefined) {
      const uid = item.meta.targetUserId;
      const prev = this.userProfiles[uid] ?? {};
      if (item.meta.field === 'nicNumber') {
        this.userProfiles[uid] = { ...prev, nicNumber: item.meta.newValue };
      } else if (item.meta.field === 'phone') {
        await this.prisma.user?.update?.({
          where: { id: uid },
          data: { phone: item.meta.newValue },
        }).catch(() => undefined);
      }
    }
    this.notifications.unshift({
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'APPROVAL',
      title: `Request ${body.status}: ${item.title}`,
      body: `${actor.fullName} marked your ${item.type} request as ${body.status}.`,
      targetUserId: item.requestedById,
      readByIds: [],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    });
    this.persistState(actor.organizationId);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: `APPROVAL_${body.status}`,
      entityType: 'Approval',
      entityId: item.id,
      metadata: { comment: body.comment },
    });
    return item;
  }

  // ─── Finance & Payroll ────────────────────────────────────────────────────
  getFinanceSummary() {
    const income = this.financeEntries
      .filter((e) => e.type === 'INCOME' || e.type === 'INVOICE')
      .reduce((s, e) => s + e.amount, 0);
    const expenses = this.financeEntries
      .filter((e) => e.type === 'EXPENSE')
      .reduce((s, e) => s + e.amount, 0);
    const payroll = this.financeEntries
      .filter((e) => e.type === 'PAYROLL')
      .reduce((s, e) => s + e.amount, 0);
    return {
      totalIncome: income,
      totalExpenses: expenses,
      totalPayroll: payroll,
      netProfit: income - expenses - payroll,
      entries: this.financeEntries,
    };
  }

  createFinanceEntry(actor: AuthUser, body: Record<string, unknown>) {
    const amount = Number(body.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    const entry = {
      id: `fin_${randomUUID().slice(0, 8)}`,
      type: pickEnum(body.type, FINANCE_TYPES, 'finance entry type', 'EXPENSE'),
      category: String(body.category ?? 'General').trim(),
      description: String(body.description ?? '').trim() || 'Financial record',
      projectName: body.projectName ? String(body.projectName).trim() : null,
      amount,
      status: pickEnum(body.status, FINANCE_STATUSES, 'finance entry status', 'APPROVED'),
      recordedByName: actor.fullName,
      recordedAt: new Date().toISOString(),
    };
    this.financeEntries.unshift(entry);
    this.persistState(actor.organizationId);
    return entry;
  }

  listInvoices() {
    return this.clientInvoices;
  }

  async createInvoice(actor: AuthUser, body: Record<string, unknown>) {
    const clientName = String(body.clientName ?? '').trim();
    if (clientName.length < 2) throw new BadRequestException('Client name is required.');
    const rawItems = Array.isArray(body.lineItems) ? body.lineItems : [];
    const lineItems = rawItems
      .map((item) => {
        const rec = item as Record<string, unknown>;
        const description = String(rec.description ?? '').trim();
        const quantity = Math.max(0.1, Number(rec.quantity) || 1);
        const unitPrice = Math.max(0, Number(rec.unitPrice) || 0);
        return { description, quantity, unitPrice, amount: Math.round(quantity * unitPrice) };
      })
      .filter((i) => i.description.length > 0 && i.amount > 0);
    if (lineItems.length === 0) {
      throw new BadRequestException('At least one billable line item is required.');
    }

    const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
    const applySscl = body.applySscl !== false;
    const applyVat = body.applyVat !== false;
    const ssclRate = applySscl ? 2.5 : 0;
    const ssclAmount = Math.round(subtotal * (ssclRate / 100));
    const vatRate = applyVat ? 18 : 0;
    const vatAmount = Math.round((subtotal + ssclAmount) * (vatRate / 100));
    const totalAmount = subtotal + ssclAmount + vatAmount;

    const year = new Date().getFullYear();
    const seq = String(this.clientInvoices.length + 1).padStart(4, '0');
    const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10));
    const dueDate = String(
      body.dueDate || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
    );

    const invoice = {
      id: `inv_${randomUUID().slice(0, 8)}`,
      invoiceNumber: `YNX-INV-${year}-${seq}`,
      clientId: body.clientId ? String(body.clientId) : null,
      clientName,
      projectId: body.projectId ? String(body.projectId) : null,
      projectName: body.projectName ? String(body.projectName).trim() : null,
      issueDate,
      dueDate,
      currency: String(body.currency || 'LKR').toUpperCase(),
      lineItems,
      subtotal,
      ssclRate,
      ssclAmount,
      vatRate,
      vatAmount,
      totalAmount,
      status: 'SENT' as const,
      notes: String(body.notes ?? '').trim(),
      createdByName: actor.fullName,
      paidAt: null as string | null,
      createdAt: new Date().toISOString(),
    };

    this.clientInvoices.unshift(invoice);
    await this.persistStateNow(actor.organizationId);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, clientName, totalAmount },
    });
    return invoice;
  }

  async updateInvoiceStatus(
    actor: AuthUser,
    id: string,
    status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE',
  ) {
    const inv = this.clientInvoices.find((i) => i.id === id);
    if (!inv) throw new NotFoundException('Invoice not found.');
    const wasPaid = inv.status === 'PAID';
    inv.status = status;
    if (status === 'PAID' && !wasPaid) {
      inv.paidAt = new Date().toISOString();
      this.financeEntries.unshift({
        id: `fin_${randomUUID().slice(0, 8)}`,
        type: 'INCOME',
        category: `Client Invoice (${inv.invoiceNumber})`,
        description: `Settled tax invoice for ${inv.clientName}${inv.projectName ? ` — ${inv.projectName}` : ''}`,
        projectName: inv.projectName ?? null,
        amount: inv.totalAmount,
        status: 'PAID',
        recordedByName: actor.fullName,
        recordedAt: inv.paidAt,
      });
    }
    await this.persistStateNow(actor.organizationId);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: status === 'PAID' ? 'INVOICE_PAID' : 'INVOICE_UPDATED',
      entityType: 'Invoice',
      entityId: inv.id,
      metadata: { invoiceNumber: inv.invoiceNumber, status, totalAmount: inv.totalAmount },
    });
    return inv;
  }

  // ─── Assets ───────────────────────────────────────────────────────────────
  listAssets() {
    return this.assets;
  }

  createAsset(actor: AuthUser, body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Asset name is required.');
    const item = {
      id: `ast_${randomUUID().slice(0, 8)}`,
      tag: String(body.tag ?? `YNX-AST-${String(this.assets.length + 1).padStart(3, '0')}`).toUpperCase(),
      name,
      category: (String(body.category ?? 'LAPTOP').toUpperCase() as 'LAPTOP' | 'MONITOR' | 'LICENSE' | 'MOBILE' | 'OFFICE'),
      assignedToName: body.assignedToName ? String(body.assignedToName).trim() : null,
      condition: pickEnum(body.condition, ASSET_CONDITIONS, 'asset condition', 'GOOD'),
      status: body.assignedToName ? ('ASSIGNED' as const) : ('AVAILABLE' as const),
      updatedAt: new Date().toISOString(),
    };
    this.assets.unshift(item);
    this.persistState(actor.organizationId);
    return item;
  }

  updateAsset(actor: AuthUser, id: string, body: Record<string, unknown>) {
    const item = this.assets.find((a) => a.id === id);
    if (!item) throw new NotFoundException('Asset not found.');
    if (body.assignedToName !== undefined) {
      item.assignedToName = body.assignedToName ? String(body.assignedToName).trim() : null;
      item.status = item.assignedToName ? 'ASSIGNED' : 'AVAILABLE';
    }
    if (body.condition) item.condition = pickEnum(body.condition, ASSET_CONDITIONS, 'asset condition', item.condition);
    if (body.status) item.status = pickEnum(body.status, ASSET_STATUSES, 'asset status', item.status);
    item.updatedAt = new Date().toISOString();
    this.persistState(actor.organizationId);
    return item;
  }

  // ─── Performance & Goals ──────────────────────────────────────────────────
  listPerformanceReviews(actor: AuthUser) {
    if (this.isManagerOrAdmin(actor)) return this.performanceReviews;
    return this.performanceReviews.filter(
      (r) => r.employeeName === actor.fullName || r.reviewerName === actor.fullName,
    );
  }

  createPerformanceReview(actor: AuthUser, body: Record<string, unknown>) {
    const goalTitle = String(body.goalTitle ?? '').trim();
    if (goalTitle.length < 2) throw new BadRequestException('Goal title is required.');
    const item = {
      id: `prf_${randomUUID().slice(0, 8)}`,
      employeeName: String(body.employeeName ?? actor.fullName).trim(),
      period: String(body.period ?? '2026-Q4').trim(),
      goalTitle,
      completionPercent: Math.min(100, Math.max(0, Number(body.completionPercent ?? 0))),
      rating: Math.min(5, Math.max(1, Number(body.rating ?? 4))),
      feedback: String(body.feedback ?? '').trim() || 'On track',
      reviewerName: actor.fullName,
      createdAt: new Date().toISOString(),
    };
    this.performanceReviews.unshift(item);
    this.persistState(actor.organizationId);
    return item;
  }

  // ─── Notifications & Announcements ────────────────────────────────────────
  isNotificationVisibleToActor(
    n: WorkspaceService['notifications'][number],
    actor: AuthUser,
  ): boolean {
    if (n.targetUserId !== '*' && n.targetUserId !== actor.id) return false;
    if (actor.role === Role.SUPER_ADMIN) return true;
    const hasSpecificUsers = Array.isArray(n.targetUserIds) && n.targetUserIds.length > 0;
    const hasCustomRoles =
      Array.isArray(n.allowedRoles) &&
      n.allowedRoles.length > 0 &&
      !n.allowedRoles.includes('ALL');
    if (hasSpecificUsers && n.targetUserIds!.includes(actor.id)) return true;
    if (hasCustomRoles) return n.allowedRoles!.includes(actor.role);
    if (hasSpecificUsers) return false;
    return true;
  }

  async listNotifications(actor: AuthUser, forceFresh = true) {
    await this.syncSnapshotFromSupabase(actor.organizationId, forceFresh);
    return this.notifications
      .filter((n) => this.isNotificationVisibleToActor(n, actor))
      .map((n) => ({
        ...n,
        read: n.readByIds.includes(actor.id),
      }));
  }

  onNotificationEvent(
    listener: (evt: { organizationId?: string; notification: WorkspaceService['notifications'][number] }) => void,
  ): () => void {
    this.notificationBus.setMaxListeners(200);
    this.notificationBus.on('notification', listener);
    return () => {
      this.notificationBus.off('notification', listener);
    };
  }

  async createAnnouncement(actor: AuthUser, body: Record<string, unknown>) {
    await this.syncSnapshotFromSupabase(actor.organizationId, true);
    const title = String(body.title ?? '').trim();
    const message = String(body.body ?? '').trim();
    if (title.length < 2 || !message) {
      throw new BadRequestException('Announcement title and message are required.');
    }
    const item = {
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'ANNOUNCEMENT' as const,
      title,
      body: message,
      targetUserId: '*',
      readByIds: [actor.id],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(item);
    this.notificationBus.emit('notification', {
      organizationId: actor.organizationId,
      notification: item,
    });
    await this.persistStateNow(actor.organizationId);
    return item;
  }

  async markNotificationRead(actor: AuthUser, id: string) {
    await this.syncSnapshotFromSupabase(actor.organizationId, true);
    const item = this.notifications.find((n) => n.id === id);
    if (!item) throw new NotFoundException('Notification not found.');
    if (!item.readByIds.includes(actor.id)) {
      item.readByIds.push(actor.id);
      await this.persistStateNow(actor.organizationId);
    }
    return { ok: true, id };
  }

  // ─── Employee Personal Profiles & Field-Level Permissions ─────────────────
  private isHrOrSuperAdmin(actor: AuthUser): boolean {
    if (actor.role === Role.SUPER_ADMIN || actor.role === Role.ADMIN) return true;
    const t = String((actor as AuthUser & { title?: string | null }).title ?? '').toLowerCase();
    return (
      /\b(hr|human\s*resources?)\b/.test(t) ||
      Boolean(actor.companyId && /^YNX-(HR|ADM|DIR|CEO|MD)-/i.test(actor.companyId))
    );
  }

  async getEmployeeProfile(actor: AuthUser, targetUserId?: string, skipSync = false) {
    if (!skipSync) {
      await this.syncSnapshotFromSupabase(actor.organizationId, true);
    }
    const uid = targetUserId || actor.id;
    let dbUser: {
      id: string;
      companyId: string | null;
      email: string;
      fullName: string;
      title: string | null;
      role: Role;
      phone?: string | null;
      avatarUrl?: string | null;
      status: string;
    } | null = null;

    try {
      dbUser =
        (await this.prisma.user?.findFirst?.({
          where: { id: uid, organizationId: actor.organizationId, deletedAt: null },
          select: {
            id: true,
            companyId: true,
            email: true,
            fullName: true,
            title: true,
            role: true,
            phone: true,
            avatarUrl: true,
            status: true,
          },
        })) ?? null;
    } catch {
      try {
        dbUser =
          (await this.prisma.user?.findFirst?.({
            where: { id: uid, organizationId: actor.organizationId, deletedAt: null },
            select: {
              id: true,
              companyId: true,
              email: true,
              fullName: true,
              title: true,
              role: true,
              status: true,
            },
          })) ?? null;
      } catch {
        dbUser = null;
      }
    }

    const base = dbUser ?? {
      id: uid,
      companyId: uid === actor.id ? (actor.companyId ?? null) : null,
      email: uid === actor.id ? actor.email : '',
      fullName: uid === actor.id ? actor.fullName : 'Employee',
      title: uid === actor.id ? ((actor as AuthUser & { title?: string | null }).title ?? null) : null,
      role: uid === actor.id ? actor.role : Role.STAFF,
      phone: null,
      avatarUrl: null,
      status: uid === actor.id ? actor.status : 'ACTIVE',
    };
    const ext = this.userProfiles[base.id] ?? {};
    const effectiveFullName = ext.fullName || base.fullName;
    const nameParts = effectiveFullName.trim().split(/\s+/).filter(Boolean);
    const derivedLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] ?? '';
    const derivedInitials =
      nameParts.length > 1
        ? `${nameParts
            .slice(0, -1)
            .map((w) => `${w[0].toUpperCase()}.`)
            .join(' ')} ${derivedLast}`
        : effectiveFullName;

    const pendingRequests = this.approvals.filter(
      (a) => a.type === 'PROFILE_CHANGE' && a.status === 'PENDING' && a.meta?.targetUserId === base.id,
    );

    const canViewComp = uid === actor.id || this.isHrOrSuperAdmin(actor);

    return {
      id: base.id,
      companyId: base.companyId,
      email: base.email,
      fullName: effectiveFullName,
      firstName: ext.firstName || derivedInitials,
      lastName: ext.lastName || derivedLast,
      nicNumber: ext.nicNumber ?? '',
      address: ext.address ?? '',
      birthday: ext.birthday ?? '',
      phone: ext.phone ?? base.phone ?? '',
      avatarUrl: this.avatarOf(uid, base.avatarUrl),
      role: ext.role ?? base.role,
      ...(canViewComp
        ? {
            monthlyBasicSalaryLkr: ext.monthlyBasicSalaryLkr ?? 0,
            fixedAllowancesLkr: ext.fixedAllowancesLkr ?? 0,
            epfNumber: ext.epfNumber ?? '',
            bankName: ext.bankName ?? '',
            bankBranch: ext.bankBranch ?? '',
            bankAccountNo: ext.bankAccountNo ?? '',
          }
        : {}),
      title: ext.title ?? base.title ?? '',
      status: base.status,
      pendingRequests: pendingRequests.map((p) => ({
        id: p.id,
        field: p.meta?.field,
        newValue: p.meta?.newValue,
        createdAt: p.createdAt,
      })),
    };
  }

  async updateOwnDp(actor: AuthUser, avatarUrl: string) {
    const clean = String(avatarUrl ?? '').trim();
    if (!clean) throw new BadRequestException('Profile picture data or URL is required.');
    if (clean.length > 2_000_000) {
      throw new BadRequestException('Profile image is too large (max ~1.5 MB).');
    }
    this.avatarCache.set(actor.id, clean);
    await this.prisma.user?.update?.({
      where: { id: actor.id },
      data: { avatarUrl: clean },
    }).catch(() => undefined);
    this.prisma.invalidateUserCache?.(actor.id);
    this.workspaceVersion = Date.now();
    this.workspaceBus.emit('mutated', { organizationId: actor.organizationId, version: this.workspaceVersion });
    return this.getEmployeeProfile(actor, actor.id);
  }

  requestProfileFieldChange(
    actor: AuthUser,
    body: { field: 'nicNumber' | 'phone'; newValue: string },
  ) {
    if (body.field !== 'nicNumber' && body.field !== 'phone') {
      throw new BadRequestException('Only NIC ID Number and Contact Number can be requested for approval.');
    }
    const val = String(body.newValue ?? '').trim();
    if (val.length < 4) {
      throw new BadRequestException('Please provide a valid new value.');
    }
    const label = body.field === 'nicNumber' ? 'NIC ID Number' : 'Contact Number';
    const item = {
      id: `apr_${randomUUID().slice(0, 8)}`,
      type: 'PROFILE_CHANGE',
      title: `${actor.fullName} · Update ${label}`,
      description: `Requested new ${label}: ${val}`,
      requestedById: actor.id,
      requestedByName: actor.fullName,
      meta: { targetUserId: actor.id, field: body.field, newValue: val },
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };
    this.approvals.unshift(item);
    this.notifications.unshift({
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'APPROVAL',
      title: `Profile Change Request: ${label}`,
      body: `${actor.fullName} requested to update ${label} to "${val}".`,
      targetUserId: '*',
      readByIds: [actor.id],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    });
    this.persistState(actor.organizationId);
    return item;
  }

  async adminUpdateProfile(
    actor: AuthUser,
    targetUserId: string,
    body: {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      nicNumber?: string;
      address?: string;
      birthday?: string;
      phone?: string;
      role?: Role;
      title?: string;
      monthlyBasicSalaryLkr?: number;
      fixedAllowancesLkr?: number;
      epfNumber?: string;
      bankName?: string;
      bankBranch?: string;
      bankAccountNo?: string;
      avatarUrl?: string;
    },
  ) {
    const isSelf = actor.id === targetUserId;
    const isAdminOrHr = this.isHrOrSuperAdmin(actor);
    if (!isSelf && !isAdminOrHr) {
      throw new ForbiddenException('Only Super Admin or HR can update another employee profile.');
    }
    if ((body.role !== undefined || body.title !== undefined) && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a Super Admin can change an employee job role or title.');
    }
    if (body.avatarUrl !== undefined && String(body.avatarUrl).trim().length > 2_000_000) {
      throw new BadRequestException('Profile image is too large (max ~1.5 MB).');
    }

    // The target must belong to the caller's organization.
    const targetDbUser = this.prisma.user?.findFirst
      ? ((await this.prisma.user
          .findFirst({
            where: { id: targetUserId, organizationId: actor.organizationId, deletedAt: null },
            select: { id: true, phone: true },
          })
          .catch(() => undefined)) as { id: string; phone: string | null } | null | undefined)
      : undefined;
    if (targetDbUser === null) throw new NotFoundException('Employee not found.');

    await this.syncSnapshotFromSupabase(actor.organizationId, true);

    const prev = this.userProfiles[targetUserId] ?? {};
    this.userProfiles[targetUserId] = {
      ...prev,
      ...(body.fullName !== undefined && String(body.fullName).trim().length >= 2
        ? { fullName: String(body.fullName).trim() }
        : {}),
      ...(body.firstName !== undefined ? { firstName: String(body.firstName).trim() } : {}),
      ...(body.lastName !== undefined ? { lastName: String(body.lastName).trim() } : {}),
      ...(body.nicNumber !== undefined ? { nicNumber: String(body.nicNumber).trim() } : {}),
      ...(body.address !== undefined ? { address: String(body.address).trim() } : {}),
      ...(body.birthday !== undefined ? { birthday: String(body.birthday).trim() } : {}),
      ...(body.phone !== undefined ? { phone: String(body.phone).trim() } : {}),
      ...(isAdminOrHr && body.monthlyBasicSalaryLkr !== undefined && Number.isFinite(Number(body.monthlyBasicSalaryLkr))
        ? { monthlyBasicSalaryLkr: Math.max(0, Math.round(Number(body.monthlyBasicSalaryLkr))) }
        : {}),
      ...(isAdminOrHr && body.fixedAllowancesLkr !== undefined && Number.isFinite(Number(body.fixedAllowancesLkr))
        ? { fixedAllowancesLkr: Math.max(0, Math.round(Number(body.fixedAllowancesLkr))) }
        : {}),
      ...(isAdminOrHr && body.epfNumber !== undefined ? { epfNumber: String(body.epfNumber).trim() } : {}),
      ...(body.bankName !== undefined ? { bankName: String(body.bankName).trim() } : {}),
      ...(body.bankBranch !== undefined ? { bankBranch: String(body.bankBranch).trim() } : {}),
      ...(body.bankAccountNo !== undefined ? { bankAccountNo: String(body.bankAccountNo).trim() } : {}),
      ...(body.role !== undefined && actor.role === Role.SUPER_ADMIN ? { role: body.role } : {}),
      ...(body.title !== undefined && actor.role === Role.SUPER_ADMIN ? { title: String(body.title).trim() } : {}),
    };
    await this.persistStateNow(actor.organizationId);

    const dbPatch: Record<string, unknown> = {};
    if (body.fullName !== undefined && String(body.fullName).trim().length >= 2) {
      dbPatch.fullName = String(body.fullName).trim();
    }
    if (body.phone !== undefined) dbPatch.phone = String(body.phone).trim() || null;
    if (body.avatarUrl !== undefined && String(body.avatarUrl).trim().length > 0) {
      const avatar = String(body.avatarUrl).trim();
      if (avatar.length > 2_000_000) {
        throw new BadRequestException('Profile image is too large (max ~1.5 MB).');
      }
      dbPatch.avatarUrl = avatar;
      this.avatarCache.set(targetUserId, avatar);
    }
    if (body.role !== undefined && actor.role === Role.SUPER_ADMIN) dbPatch.role = body.role;
    if (body.title !== undefined && actor.role === Role.SUPER_ADMIN) dbPatch.title = String(body.title).trim() || null;

    if (Object.keys(dbPatch).length > 0 && this.prisma.user?.update) {
      const updatedDbUser = await this.prisma.user
        .update({
          where: { id: targetUserId },
          data: dbPatch,
        })
        .catch(() => null);
      if (updatedDbUser) {
        this.prisma.upsertUserInCache?.(updatedDbUser);
      }
    }

    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'EMPLOYEE_PROFILE_UPDATED',
      entityType: 'User',
      entityId: targetUserId,
      metadata: { fields: Object.keys(body) },
    });

    return this.getEmployeeProfile(actor, targetUserId, true);
  }

  private haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  getRoleInsights(actor: AuthUser) {
    const actorTitle = this.userProfiles[actor.id]?.title || '';
    const title = actorTitle.toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const activeClockedIn = this.attendance.filter((a) => a.workDate === today && a.clockInAt && !a.clockOutAt);
    const lateToday = this.attendance.filter((a) => a.workDate === today && a.isLate);
    const pendingApprovals = this.approvals.filter((a) => a.status === 'PENDING');
    const pendingLeaves = this.leaveRequests.filter((l) => l.status === 'PENDING');
    const openBugs = this.bugs.filter((b) => b.status !== 'CLOSED' && b.status !== 'VERIFIED');
    const criticalBugs = openBugs.filter((b) => b.severity === 'CRITICAL' || b.severity === 'BLOCKER');
    const activeProjects = this.projects.filter((p) => p.status === 'ACTIVE');
    const invoiceEntries = this.financeEntries.filter(
      (f) => f.type === 'INVOICE' || f.type === 'INCOME',
    );
    const totalInvoiceUsd = invoiceEntries.reduce((acc, i) => acc + (i.amount || 0), 0);
    const paidInvoiceUsd = invoiceEntries
      .filter((i) => i.status === 'PAID')
      .reduce((acc, i) => acc + (i.amount || 0), 0);
    const outstandingUsd = totalInvoiceUsd - paidInvoiceUsd;

    if (actor.role === Role.INTERN) {
      const myTasks = this.tasks.filter(
        (t) => t.assigneeName.toLowerCase().includes(actor.fullName.toLowerCase()),
      );
      const myOpen = myTasks.filter((t) => t.status !== 'COMPLETED').length;
      const myTodayAtt = this.attendance.find((a) => a.userId === actor.id && a.workDate === today);
      const internUsedLeave = this.leaveRequests
        .filter((l) => l.userId === actor.id && l.status === 'APPROVED')
        .reduce((sum, l) => sum + (Number(l.days) || 1), 0);
      const internProfile = this.interns.find(
        (i) => i.userId === actor.id || i.email === actor.email || i.fullName === actor.fullName,
      );
      return {
        persona: 'Intern & Trainee Workspace',
        badge: actorTitle || 'Intern · 10d Leave Cap',
        cards: [
          {
            label: 'My Assigned Tasks',
            value: String(myOpen),
            detail: `${myTasks.length - myOpen} completed`,
            tone: 'blue',
          },
          {
            label: 'Attendance Today',
            value: myTodayAtt?.clockInAt ? (myTodayAtt.clockOutAt ? 'Clocked Out' : 'Clocked In') : 'Not Clocked In',
            detail: myTodayAtt?.workMode ? `${myTodayAtt.workMode} mode` : 'Clock in via Attendance',
            tone: myTodayAtt?.clockInAt ? 'emerald' : 'amber',
          },
          {
            label: 'Intern Leave Balance',
            value: `${Math.max(0, 10 - internUsedLeave)} / 10d`,
            detail: `${internUsedLeave} day(s) used of 10d cap`,
            tone: 10 - internUsedLeave <= 2 ? 'rose' : 'indigo',
          },
          {
            label: 'Training Progress',
            value: `${internProfile?.progressPercent ?? 0}%`,
            detail: internProfile ? `Mentor: ${internProfile.mentorName}` : 'Weekly internship plan',
            tone: 'emerald',
          },
        ],
      };
    }

    if (
      title.includes('accountant') ||
      title.includes('cfo') ||
      title.includes('finance')
    ) {
      return {
        persona: 'Finance & Accounting Intelligence',
        badge: actorTitle || 'CFO / Finance',
        cards: [
          {
            label: 'Total Billed',
            value: `$${totalInvoiceUsd.toLocaleString()}`,
            detail: `${invoiceEntries.length} revenue & invoice entries`,
            tone: 'blue',
          },
          {
            label: 'Collected Revenue',
            value: `$${paidInvoiceUsd.toLocaleString()}`,
            detail: 'Settled & reconciled',
            tone: 'emerald',
          },
          {
            label: 'Outstanding AR',
            value: `$${outstandingUsd.toLocaleString()}`,
            detail: 'Pending client settlement',
            tone: outstandingUsd > 0 ? 'amber' : 'emerald',
          },
          {
            label: 'Pending Approvals',
            value: String(pendingApprovals.length),
            detail: 'Expense & payout sign-offs',
            tone: 'indigo',
          },
        ],
      };
    }

    if (title.includes('secretary') || title.includes('legal') || title.includes('compliance')) {
      const legalDocs = this.documents.filter(
        (d) => d.visibility === 'ADMIN_ONLY' || d.visibility === 'CONFIDENTIAL' || d.type === 'CONTRACT',
      );
      const boardMeetings = this.meetings.filter(
        (m) => m.meetingScope === 'BOARD' || m.meetingScope === 'LEGAL',
      );
      return {
        persona: 'Legal & Governance Intelligence',
        badge: actorTitle || 'Company Secretary',
        cards: [
          {
            label: 'Board & Legal Meetings',
            value: String(boardMeetings.length),
            detail: 'Confidential governance sessions',
            tone: 'indigo',
          },
          {
            label: 'Restricted Documents',
            value: String(legalDocs.length),
            detail: 'Contracts & admin-only filings',
            tone: 'blue',
          },
          {
            label: 'Active Clients',
            value: String(this.clients.length),
            detail: 'Corporate entities on record',
            tone: 'emerald',
          },
          {
            label: 'Pending Approvals',
            value: String(pendingApprovals.length),
            detail: 'Compliance & policy sign-offs',
            tone: 'amber',
          },
        ],
      };
    }

    if (title.includes('hr') || title.includes('people') || actor.role === Role.ADMIN) {
      return {
        persona: 'HR & Workforce Intelligence',
        badge: actorTitle || 'HR / Admin',
        cards: [
          {
            label: 'Clocked In Today',
            value: String(activeClockedIn.length),
            detail: `${this.attendance.filter((a) => a.workDate === today).length} total check-ins`,
            tone: 'emerald',
          },
          {
            label: 'Late Arrivals Today',
            value: String(lateToday.length),
            detail: `Shift start ${this.settings.workDayStart}`,
            tone: lateToday.length > 0 ? 'rose' : 'emerald',
          },
          {
            label: 'Pending Leaves',
            value: String(pendingLeaves.length),
            detail: 'Awaiting HR review',
            tone: 'amber',
          },
          {
            label: 'Employee Profiles',
            value: String(Object.keys(this.userProfiles).length),
            detail: 'Profiles in HR directory',
            tone: 'blue',
          },
        ],
      };
    }

    if (
      title.includes('cto') ||
      title.includes('tech') ||
      title.includes('engineer') ||
      title.includes('qa') ||
      title.includes('devops') ||
      title.includes('ui')
    ) {
      const reviewTasks = this.tasks.filter((t) => t.status === 'IN_REVIEW' || t.status === 'IN_PROGRESS');
      return {
        persona: 'Engineering & Quality Intelligence',
        badge: actorTitle || 'Engineering',
        cards: [
          {
            label: 'Open Bugs',
            value: String(openBugs.length),
            detail: `${criticalBugs.length} critical / blocker`,
            tone: criticalBugs.length > 0 ? 'rose' : 'amber',
          },
          {
            label: 'Active Dev Tasks',
            value: String(reviewTasks.length),
            detail: 'In progress or in review',
            tone: 'blue',
          },
          {
            label: 'Active Sprints',
            value: String(this.sprints.filter((s) => s.status === 'ACTIVE').length),
            detail: `${this.sprints.length} total sprints`,
            tone: 'indigo',
          },
          {
            label: 'Active Projects',
            value: String(activeProjects.length),
            detail: 'Repositories & modules live',
            tone: 'emerald',
          },
        ],
      };
    }

    if (
      actor.role === Role.SUPER_ADMIN ||
      title.includes('md') ||
      title.includes('ceo') ||
      title.includes('director')
    ) {
      return {
        persona: 'Executive Command Center',
        badge: actorTitle || 'MD / Super Admin',
        cards: [
          {
            label: 'Active Projects',
            value: String(activeProjects.length),
            detail: `${this.projects.length} total engagements`,
            tone: 'blue',
          },
          {
            label: 'Live Workforce',
            value: String(activeClockedIn.length),
            detail: 'Currently clocked in',
            tone: 'emerald',
          },
          {
            label: 'Outstanding AR',
            value: `$${outstandingUsd.toLocaleString()}`,
            detail: `$${paidInvoiceUsd.toLocaleString()} collected`,
            tone: outstandingUsd > 0 ? 'amber' : 'emerald',
          },
          {
            label: 'Executive Approvals',
            value: String(pendingApprovals.length + pendingLeaves.length),
            detail: `${pendingApprovals.length} approvals · ${pendingLeaves.length} leaves`,
            tone: 'indigo',
          },
        ],
      };
    }

    // Default: Delivery / PM / Intern
    const myTasks = this.tasks.filter(
      (t) => t.assigneeName === actor.fullName && t.status !== 'COMPLETED',
    );
    return {
      persona: 'Delivery & Operations Focus',
      badge: actorTitle || actor.role,
      cards: [
        {
          label: 'My Open Tasks',
          value: String(myTasks.length),
          detail: 'Assigned & not yet done',
          tone: 'blue',
        },
        {
          label: 'Active Projects',
          value: String(activeProjects.length),
          detail: 'Across workspace',
          tone: 'emerald',
        },
        {
          label: 'Open Bugs',
          value: String(openBugs.length),
          detail: `${criticalBugs.length} high-priority`,
          tone: openBugs.length > 0 ? 'amber' : 'emerald',
        },
        {
          label: 'Team Clocked In',
          value: String(activeClockedIn.length),
          detail: 'Live attendance today',
          tone: 'indigo',
        },
      ],
    };
  }

  updateLiveLocation(actor: AuthUser, body: Record<string, unknown>) {
    const today = new Date().toISOString().slice(0, 10);
    const record = this.attendance.find(
      (a) => a.userId === actor.id && a.workDate === today && a.clockInAt && !a.clockOutAt,
    );
    if (!record) {
      return { ok: false, reason: 'Not currently clocked in.' };
    }
    const latitude = typeof body.latitude === 'number' ? body.latitude : null;
    const longitude = typeof body.longitude === 'number' ? body.longitude : null;
    if (latitude === null || longitude === null) {
      throw new BadRequestException('Valid latitude and longitude are required.');
    }
    const accuracyMeters = typeof body.accuracyMeters === 'number' ? body.accuracyMeters : null;
    const locationLabel = body.locationLabel
      ? String(body.locationLabel).trim()
      : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    let distanceMeters: number | null = null;
    let geofenceStatus: AttendanceItem['geofenceStatus'] = 'NO_GPS';
    if (record.workMode === 'REMOTE') {
      geofenceStatus = 'REMOTE_APPROVED';
    } else {
      const officeLat = this.settings.officeLatitude ?? 6.9271;
      const officeLon = this.settings.officeLongitude ?? 79.8612;
      const radius = this.settings.officeRadiusMeters ?? 250;
      distanceMeters = Math.round(this.haversineMeters(latitude, longitude, officeLat, officeLon));
      geofenceStatus = distanceMeters <= radius ? 'INSIDE_OFFICE' : 'OUTSIDE_OFFICE';
    }

    record.latitude = latitude;
    record.longitude = longitude;
    record.accuracyMeters = accuracyMeters;
    record.locationLabel = locationLabel;
    record.geofenceStatus = geofenceStatus;
    record.distanceMeters = distanceMeters;
    record.lastLocationAt = new Date().toISOString();
    const prevTrail = record.locationTrail ?? [];
    const lastPt = prevTrail[prevTrail.length - 1];
    if (!lastPt || lastPt.lat !== latitude || lastPt.lon !== longitude) {
      record.locationTrail = [...prevTrail, { lat: latitude, lon: longitude, at: record.lastLocationAt }].slice(-100);
    }
    this.persistState(actor.organizationId);

    return {
      ok: true,
      latitude,
      longitude,
      accuracyMeters,
      geofenceStatus,
      distanceMeters,
      lastLocationAt: record.lastLocationAt,
    };
  }

  // ─── Global Live Real-Time Stream ─────────────────────────────────────────
  getWorkspaceVersion(): number {
    return this.workspaceVersion;
  }

  onWorkspaceMutated(
    listener: (evt: { organizationId?: string; version: number }) => void,
  ): () => void {
    this.workspaceBus.setMaxListeners(200);
    this.workspaceBus.on('mutated', listener);
    return () => {
      this.workspaceBus.off('mutated', listener);
    };
  }

  // ─── Sri Lanka Leave Balances & 2026 Poya / Mercantile Holidays ──────────
  async getLeaveSummaryAndHolidays(actor: AuthUser) {
    await this.syncSnapshotFromSupabase(actor.organizationId);
    const holidays2026 = await this.getHolidayCalendar(actor.organizationId);

    const myApproved = this.leaveRequests.filter(
      (lr) => lr.userId === actor.id && lr.status === 'APPROVED',
    );
    const usedByType = (kind: string) =>
      myApproved
        .filter((l) => l.type.toUpperCase() === kind)
        .reduce((sum, l) => {
          const d1 = new Date(l.startDate).getTime();
          const d2 = new Date(l.endDate).getTime();
          const days = Number.isFinite(d1) && Number.isFinite(d2)
            ? Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1)
            : 1;
          return sum + days;
        }, 0);

    const annualUsed = usedByType('ANNUAL');
    const casualUsed = usedByType('CASUAL');
    const medicalUsed = usedByType('SICK') + usedByType('MEDICAL');
    const totalUsed = myApproved.reduce((sum, l) => sum + (Number(l.days) || 1), 0);

    const teamUpcoming = this.leaveRequests
      .filter((lr) => lr.status === 'APPROVED' || lr.status === 'PENDING')
      .slice(0, 30);

    if (actor.role === Role.INTERN) {
      return {
        isIntern: true,
        maxTotalDays: 10,
        totalUsed,
        totalRemaining: Math.max(0, 10 - totalUsed),
        entitlements: {
          annual: { total: 5, used: annualUsed, remaining: Math.max(0, 5 - annualUsed) },
          casual: { total: 3, used: casualUsed, remaining: Math.max(0, 3 - casualUsed) },
          medical: { total: 2, used: medicalUsed, remaining: Math.max(0, 2 - medicalUsed) },
        },
        holidays2026,
        teamCalendar: teamUpcoming,
      };
    }

    return {
      isIntern: false,
      maxTotalDays: 28,
      totalUsed,
      totalRemaining: Math.max(0, 28 - totalUsed),
      entitlements: {
        annual: { total: 14, used: annualUsed, remaining: Math.max(0, 14 - annualUsed) },
        casual: { total: 7, used: casualUsed, remaining: Math.max(0, 7 - casualUsed) },
        medical: { total: 7, used: medicalUsed, remaining: Math.max(0, 7 - medicalUsed) },
      },
      holidays2026,
      teamCalendar: teamUpcoming,
    };
  }

  // ─── Sri Lanka OT (1.5x / 2x) + EPF (8% / 12%) + ETF (3%) Payroll Summary ─
  /** Built-in holidays merged with the organization's PublicHoliday rows (DB rows win). */
  private async getHolidayCalendar(
    organizationId: string,
  ): Promise<Array<{ date: string; name: string; type: string }>> {
    const byDate = new Map(BUILTIN_HOLIDAYS.map((h) => [h.date, { ...h }]));
    try {
      const rows = (await this.prisma.publicHoliday?.findMany?.({
        where: { organizationId },
        select: { date: true, name: true },
      })) as Array<{ date: Date; name: string }> | undefined;
      for (const r of rows ?? []) {
        const date = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
        byDate.set(date, { date, name: r.name, type: 'PUBLIC' });
      }
    } catch {
      // Fall back to the built-in calendar.
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async getSriLankaPayrollSummary(actor: AuthUser) {
    await this.syncSnapshotFromSupabase(actor.organizationId);
    const calendar = await this.getHolidayCalendar(actor.organizationId);
    const poyaSet = new Set(calendar.map((h) => h.date));
    const calendarYears = new Set(calendar.map((h) => h.date.slice(0, 4)));
    const yearsMissingHolidays = new Set<string>();

    const byUser = new Map<
      string,
      {
        userId: string;
        userName: string;
        regularMinutes: number;
        weekdayOtMinutes: number;
        holidayOtMinutes: number;
        billableMinutes: number;
        daysWorked: number;
      }
    >();

    const visibleEntries = this.isManagerOrAdmin(actor)
      ? this.timeEntries
      : this.timeEntries.filter((te) => te.userId === actor.id);

    // Sum minutes per employee per Sri Lanka calendar day first: the 8-hour OT threshold
    // applies to the whole day, not to each individual time entry.
    const perDay = new Map<string, { userId: string; userName: string; date: string; dayOfWeek: number; minutes: number; billable: number }>();
    for (const te of visibleEntries) {
      if (!te.startedAt) continue;
      const minutes = Math.max(0, Number(te.durationMinutes) || 0);
      const { date, dayOfWeek } = colomboDate(te.startedAt);
      const key = `${te.userId}|${date}`;
      const day = perDay.get(key) ?? { userId: te.userId, userName: te.userName, date, dayOfWeek, minutes: 0, billable: 0 };
      day.minutes += minutes;
      if (te.billable) day.billable += minutes;
      perDay.set(key, day);
    }

    for (const day of perDay.values()) {
      if (!calendarYears.has(day.date.slice(0, 4))) yearsMissingHolidays.add(day.date.slice(0, 4));
      const isHolidayOrWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6 || poyaSet.has(day.date);
      const row = byUser.get(day.userId) ?? {
        userId: day.userId,
        userName: day.userName,
        regularMinutes: 0,
        weekdayOtMinutes: 0,
        holidayOtMinutes: 0,
        billableMinutes: 0,
        daysWorked: 0,
      };
      if (isHolidayOrWeekend) {
        row.holidayOtMinutes += day.minutes;
      } else {
        row.regularMinutes += Math.min(day.minutes, 480);
        row.weekdayOtMinutes += Math.max(0, day.minutes - 480);
      }
      row.billableMinutes += day.billable;
      if (day.minutes > 0) row.daysWorked += 1;
      byUser.set(day.userId, row);
    }

    const rows = Array.from(byUser.values()).map((r) => {
      const prof = this.userProfiles[r.userId] ?? {};
      // No invented salary: unconfigured employees show 0 and are flagged for HR.
      const salaryConfigured = Boolean(prof.monthlyBasicSalaryLkr && prof.monthlyBasicSalaryLkr > 0);
      const monthlyBasic = salaryConfigured ? Number(prof.monthlyBasicSalaryLkr) : 0;
      const hourlyLkr = salaryConfigured ? Math.round(monthlyBasic / 160) : 0;
      const fixedAllowances = Math.max(0, Math.round(prof.fixedAllowancesLkr ?? 0));

      const regHours = Number((r.regularMinutes / 60).toFixed(2));
      const ot15Hours = Number((r.weekdayOtMinutes / 60).toFixed(2));
      const ot20Hours = Number((r.holidayOtMinutes / 60).toFixed(2));
      const basePay = Math.round(regHours * hourlyLkr);
      const otPay = Math.round(ot15Hours * hourlyLkr * 1.5 + ot20Hours * hourlyLkr * 2);
      const grossLkr = basePay + otPay + fixedAllowances;
      const epfEmployee8 = Math.round(basePay * 0.08);
      const epfEmployer12 = Math.round(basePay * 0.12);
      const etfEmployer3 = Math.round(basePay * 0.03);
      const apitTaxLkr = this.computeSriLankaMonthlyApit(grossLkr);
      const netPayLkr = Math.max(0, grossLkr - epfEmployee8 - apitTaxLkr);
      return {
        ...r,
        hourlyLkr,
        salaryConfigured,
        monthlyBasicSalaryLkr: monthlyBasic,
        fixedAllowancesLkr: fixedAllowances,
        epfNumber: prof.epfNumber ?? '',
        nicNumber: prof.nicNumber ?? '',
        bankName: prof.bankName ?? '',
        bankBranch: prof.bankBranch ?? '',
        bankAccountNo: prof.bankAccountNo ?? '',
        regHours,
        ot15Hours,
        ot20Hours,
        basePay,
        otPay,
        grossLkr,
        epfEmployee8,
        epfEmployer12,
        etfEmployer3,
        apitTaxLkr,
        netPayLkr,
      };
    });

    return {
      currency: 'LKR',
      rows,
      // Years with logged time but no holiday calendar: holiday OT there may be under-counted.
      holidayCalendarMissingYears: [...yearsMissingHolidays].sort(),
    };
  }

  /**
   * Sri Lanka IRD APIT (Advance Personal Income Tax) monthly progressive slabs (2025/2026 relief: LKR 150,000/month).
   */
  computeSriLankaMonthlyApit(monthlyGrossLkr: number): number {
    if (!Number.isFinite(monthlyGrossLkr) || monthlyGrossLkr <= 150_000) return 0;
    let remaining = monthlyGrossLkr - 150_000;
    let tax = 0;
    const slabs: Array<{ width: number; rate: number }> = [
      { width: 83_333, rate: 0.06 },
      { width: 41_667, rate: 0.18 },
      { width: 41_667, rate: 0.24 },
      { width: 41_667, rate: 0.30 },
    ];
    for (const slab of slabs) {
      if (remaining <= 0) break;
      const taxable = Math.min(remaining, slab.width);
      tax += taxable * slab.rate;
      remaining -= taxable;
    }
    if (remaining > 0) {
      tax += remaining * 0.36;
    }
    return Math.round(tax);
  }

  async submitWeeklyTimesheet(actor: AuthUser, body: { weekLabel?: string; notes?: string }) {
    await this.syncSnapshotFromSupabase(actor.organizationId, true);
    const mine = this.timeEntries.filter((te) => te.userId === actor.id && te.status !== 'APPROVED');
    const totalMin = mine.reduce((sum, te) => sum + te.durationMinutes, 0);
    for (const te of mine) {
      te.status = 'SUBMITTED';
    }
    const approval = {
      id: `apr_${randomUUID().slice(0, 8)}`,
      type: 'TIMESHEET',
      title: `Weekly Timesheet — ${actor.fullName} (${body.weekLabel || 'Current Week'})`,
      description: `${(totalMin / 60).toFixed(1)} hrs logged across ${mine.length} entries. ${body.notes || ''}`.trim(),
      requestedById: actor.id,
      requestedByName: actor.fullName,
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };
    this.approvals.unshift(approval);
    const notif = {
      id: `ntf_${randomUUID().slice(0, 8)}`,
      type: 'APPROVAL' as const,
      title: `Timesheet Submitted: ${actor.fullName}`,
      body: `${actor.fullName} submitted ${(totalMin / 60).toFixed(1)}h for approval.`,
      targetUserId: '*',
      allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'],
      actionUrl: '/approvals',
      readByIds: [actor.id],
      authorName: actor.fullName,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(notif);
    this.notificationBus.emit('notification', { organizationId: actor.organizationId, notification: notif });
    await this.persistStateNow(actor.organizationId);
    return { ok: true, submittedEntries: mine.length, totalHours: Number((totalMin / 60).toFixed(2)), approval };
  }

  // ─── GitHub PR Webhook Auto-Transition (Jira Enterprise Integration) ─────
  async handleGithubWebhook(
    payload: Record<string, unknown>,
    signatureHeader?: string,
    rawBody?: Buffer,
  ) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    // Without a shared secret anyone could forge PR events and move task statuses.
    if (!secret) {
      throw new ForbiddenException('GitHub webhook is disabled: set GITHUB_WEBHOOK_SECRET on the API.');
    }
    const provided = String(signatureHeader ?? '').trim();
    if (!provided.startsWith('sha256=')) {
      throw new ForbiddenException('Missing or malformed X-Hub-Signature-256 header.');
    }
    if (!rawBody || rawBody.length === 0) {
      throw new ForbiddenException('Webhook body could not be read for signature verification.');
    }
    // GitHub signs the exact request bytes, so verify the raw body, not a re-serialised object.
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid GitHub webhook signature.');
    }

    await this.syncSnapshotFromSupabase(undefined, true);
    const pr = (payload.pull_request as Record<string, unknown> | undefined) ?? null;
    if (!pr) return { ok: true, matched: false };
    const action = String(payload.action ?? '');
    const merged = Boolean(pr.merged);
    const title = String(pr.title ?? '');
    const headRef = String((pr.head as Record<string, unknown> | undefined)?.ref ?? '');
    const rawHtmlUrl = String(pr.html_url ?? '').trim();
    const safeHtmlUrl = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/pull\/\d+/i.test(rawHtmlUrl)
      ? rawHtmlUrl
      : '';
    const haystack = `${title} ${headRef}`.toUpperCase();

    const matchedTask = this.tasks.find((t) => haystack.includes(t.code.toUpperCase()));
    if (!matchedTask) return { ok: true, matched: false };

    if (safeHtmlUrl) matchedTask.prUrl = safeHtmlUrl;
    if (headRef) matchedTask.branchName = headRef.slice(0, 120);
    if (action === 'opened' || action === 'reopened') {
      matchedTask.status = 'IN_REVIEW';
    } else if (action === 'closed' && merged) {
      matchedTask.status = 'TESTING';
    }
    this.recalculateProjectProgress(matchedTask.projectId);
    await this.persistStateNow();
    return { ok: true, matched: true, taskCode: matchedTask.code, newStatus: matchedTask.status };
  }

  // ─── External Client Portal (Public Read-Only Project & Milestone View) ──
  async getOrCreateClientPortalLink(actor: AuthUser, clientId: string) {
    await this.syncSnapshotFromSupabase(actor.organizationId, true);
    const client = this.clients.find((c) => c.id === clientId);
    if (!client) throw new NotFoundException('Client not found.');
    if (!client.portalToken) {
      client.portalToken = `cp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await this.persistStateNow(actor.organizationId);
    }
    return { clientId: client.id, clientName: client.name, portalToken: client.portalToken };
  }

  async rotateClientPortalLink(actor: AuthUser, clientId: string) {
    await this.syncSnapshotFromSupabase(actor.organizationId, true);
    const client = this.clients.find((c) => c.id === clientId);
    if (!client) throw new NotFoundException('Client not found.');
    client.portalToken = `cp_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await this.persistStateNow(actor.organizationId);
    await this.audit.log({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'CLIENT_PORTAL_TOKEN_ROTATED',
      entityType: 'Client',
      entityId: client.id,
      metadata: { clientName: client.name },
    });
    return { clientId: client.id, clientName: client.name, portalToken: client.portalToken, rotated: true };
  }

  async getPublicClientPortal(portalToken: string) {
    const clean = String(portalToken ?? '').trim();
    if (!clean) throw new BadRequestException('Portal token is required.');
    await this.syncSnapshotFromSupabase(undefined, true);
    const client = this.clients.find((c) => c.portalToken === clean);
    if (!client) throw new NotFoundException('Client portal link is invalid or expired.');

    const clientProjects = this.projects
      .filter((p) => p.clientId === client.id || p.clientName.toLowerCase() === client.name.toLowerCase())
      .map((p) => {
        const pTasks = this.tasks.filter((t) => t.projectId === p.id);
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          status: p.status,
          progressPercent: p.progressPercent,
          startDate: p.startDate,
          expectedEndDate: p.expectedEndDate,
          managerName: p.managerName,
          stages: p.stages,
          totalTasks: pTasks.length,
          completedTasks: pTasks.filter((t) => t.status === 'COMPLETED').length,
        };
      });

    return {
      organizationName: this.settings.name || 'Yakunex Technologies',
      client: {
        name: client.name,
        contactName: client.contactName,
        contactEmail: client.contactEmail,
      },
      projects: clientProjects,
      updatedAt: new Date().toISOString(),
    };
  }
}

