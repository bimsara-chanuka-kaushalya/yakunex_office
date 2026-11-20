import { Role } from '@prisma/client';

/**
 * Permission keys. The database (RolePermission / UserPermission) is the source of truth
 * at runtime; these defaults seed RolePermission and define the catalogue shown in the UI.
 */
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_ASSIGN_ROLES: 'users:assign_roles',
  USERS_MANAGE_PERMISSIONS: 'users:manage_permissions',
  DASHBOARD_ADMIN: 'dashboard:admin',
  AUDIT_READ: 'audit:read',
  SETTINGS_MANAGE: 'settings:manage',
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TIME_OWN: 'time:own',
  TIME_APPROVE: 'time:approve',
  LEAVE_APPROVE: 'leave:approve',
  CHAT_USE: 'chat:use',
  LEGAL_READ: 'legal:read',
  LEGAL_WRITE: 'legal:write',
  FINANCIALS_READ: 'financials:read',
  FINANCIALS_WRITE: 'financials:write',
  CODE_READ: 'code:read',
  CODE_DEPLOY: 'code:deploy',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

const P = PERMISSIONS;

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
  ADMIN: [
    P.USERS_READ,
    P.USERS_WRITE,
    P.USERS_ASSIGN_ROLES,
    P.USERS_MANAGE_PERMISSIONS,
    P.DASHBOARD_ADMIN,
    P.AUDIT_READ,
    P.SETTINGS_MANAGE,
    P.PROJECTS_READ,
    P.PROJECTS_WRITE,
    P.TASKS_READ,
    P.TASKS_WRITE,
    P.TIME_APPROVE,
    P.LEAVE_APPROVE,
    P.CHAT_USE,
  ],
  PROJECT_MANAGER: [
    P.USERS_READ,
    P.PROJECTS_READ,
    P.PROJECTS_WRITE,
    P.TASKS_READ,
    P.TASKS_WRITE,
    P.TIME_OWN,
    P.CHAT_USE,
  ],
  STAFF: [P.PROJECTS_READ, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
  INTERN: [P.CHAT_USE],
};

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSION_KEYS as string[]).includes(value);
}

export interface TierAccessMatrixRow {
  tier: string;
  roles: string;
  legalGovernance: string;
  systemSettings: string;
  financialsPayroll: string;
  hrAttendance: string;
  projectsTasks: string;
  codeDeployments: string;
}

export const TIER_ACCESS_MATRIX: TierAccessMatrixRow[] = [
  {
    tier: 'Tier 1: Super Admin',
    roles: 'MD, CEO',
    legalGovernance: 'Full View & Approve',
    systemSettings: 'Full Access',
    financialsPayroll: 'Full View & Approve',
    hrAttendance: 'Full View & Approve',
    projectsTasks: 'Full View',
    codeDeployments: 'View Overview Only',
  },
  {
    tier: 'Tier 1B: Legal Admin',
    roles: 'Company Secretary',
    legalGovernance: 'Full Edit & Upload',
    systemSettings: 'None',
    financialsPayroll: 'Audit / Tax Docs Only',
    hrAttendance: 'None',
    projectsTasks: 'None',
    codeDeployments: 'None',
  },
  {
    tier: 'Tier 2: C-Level / Dept Heads',
    roles: 'CTO, COO, CFO',
    legalGovernance: 'View Only',
    systemSettings: 'Dept Settings Only',
    financialsPayroll: 'CFO: Full / Others: None',
    hrAttendance: 'Dept Staff View',
    projectsTasks: 'Full Access (Dept)',
    codeDeployments: 'CTO: Full / Others: None',
  },
  {
    tier: 'Tier 3: Management',
    roles: 'HR, PM, BA, PO',
    legalGovernance: 'None',
    systemSettings: 'None',
    financialsPayroll: 'PM: Project Budget Only',
    hrAttendance: 'HR: Full / PM: Leave Approve',
    projectsTasks: 'PM/PO: Full / BA: Edit',
    codeDeployments: 'View Status Only',
  },
  {
    tier: 'Tier 4: Core Staff',
    roles: 'Tech Lead, SE, QA, UI/UX, DevOps',
    legalGovernance: 'None',
    systemSettings: 'None',
    financialsPayroll: 'None',
    hrAttendance: 'Self Profile & Leave',
    projectsTasks: 'Assigned Tasks Only',
    codeDeployments: 'Tech Lead/DevOps: Full / SE: Commit',
  },
  {
    tier: 'Tier 5: Trainees',
    roles: 'Interns',
    legalGovernance: 'None',
    systemSettings: 'None',
    financialsPayroll: 'None',
    hrAttendance: 'Self Profile & Leave',
    projectsTasks: 'Assigned Tasks (Limited)',
    codeDeployments: 'Staging / Dev Env Only',
  },
];

export interface DesignationTierPreset {
  code: string;
  tier: string;
  title: string;
  baseRole: Role;
  grants: PermissionKey[];
  revokes: PermissionKey[];
}

export const DESIGNATION_TIER_PRESETS: DesignationTierPreset[] = [
  { code: 'MD', tier: 'Tier 1: Super Admin', title: 'Managing Director', baseRole: Role.SUPER_ADMIN, grants: ALL_PERMISSION_KEYS, revokes: [] },
  { code: 'CEO', tier: 'Tier 1: Super Admin', title: 'Chief Executive Officer', baseRole: Role.SUPER_ADMIN, grants: ALL_PERMISSION_KEYS, revokes: [] },
  {
    code: 'SEC',
    tier: 'Tier 1B: Legal Admin',
    title: 'Company Secretary',
    baseRole: Role.ADMIN,
    grants: [P.LEGAL_READ, P.LEGAL_WRITE, P.FINANCIALS_READ, P.AUDIT_READ, P.CHAT_USE],
    revokes: [P.SETTINGS_MANAGE, P.PROJECTS_WRITE, P.TASKS_WRITE, P.LEAVE_APPROVE, P.TIME_APPROVE, P.USERS_ASSIGN_ROLES, P.USERS_MANAGE_PERMISSIONS],
  },
  {
    code: 'CTO',
    tier: 'Tier 2: C-Level / Dept Heads',
    title: 'Chief Technology Officer',
    baseRole: Role.ADMIN,
    grants: [P.LEGAL_READ, P.CODE_READ, P.CODE_DEPLOY, P.PROJECTS_READ, P.PROJECTS_WRITE, P.TASKS_READ, P.TASKS_WRITE, P.USERS_READ],
    revokes: [P.FINANCIALS_WRITE],
  },
  {
    code: 'COO',
    tier: 'Tier 2: C-Level / Dept Heads',
    title: 'Chief Operating Officer',
    baseRole: Role.ADMIN,
    grants: [P.LEGAL_READ, P.PROJECTS_READ, P.PROJECTS_WRITE, P.TASKS_READ, P.TASKS_WRITE, P.USERS_READ, P.LEAVE_APPROVE, P.TIME_APPROVE],
    revokes: [P.FINANCIALS_WRITE, P.CODE_DEPLOY],
  },
  {
    code: 'CFO',
    tier: 'Tier 2: C-Level / Dept Heads',
    title: 'Chief Financial Officer',
    baseRole: Role.ADMIN,
    grants: [P.LEGAL_READ, P.FINANCIALS_READ, P.FINANCIALS_WRITE, P.AUDIT_READ, P.USERS_READ],
    revokes: [P.CODE_DEPLOY],
  },
  {
    code: 'ACC',
    tier: 'Tier 3: Management',
    title: 'Accountant',
    baseRole: Role.PROJECT_MANAGER,
    grants: [P.FINANCIALS_READ, P.FINANCIALS_WRITE, P.CHAT_USE, P.TIME_OWN],
    revokes: [P.CODE_DEPLOY, P.USERS_ASSIGN_ROLES, P.SETTINGS_MANAGE],
  },
  {
    code: 'ADM',
    tier: 'Tier 3: Management',
    title: 'Admin',
    baseRole: Role.ADMIN,
    grants: [P.USERS_READ, P.CHAT_USE, P.TIME_OWN],
    revokes: [P.FINANCIALS_WRITE, P.USERS_MANAGE_PERMISSIONS],
  },
  {
    code: 'HR',
    tier: 'Tier 3: Management',
    title: 'Human Resources',
    baseRole: Role.PROJECT_MANAGER,
    grants: [P.USERS_READ, P.USERS_WRITE, P.LEAVE_APPROVE, P.TIME_APPROVE, P.CODE_READ],
    revokes: [P.FINANCIALS_WRITE, P.CODE_DEPLOY],
  },
  {
    code: 'PM',
    tier: 'Tier 3: Management',
    title: 'Project Manager',
    baseRole: Role.PROJECT_MANAGER,
    grants: [P.PROJECTS_READ, P.PROJECTS_WRITE, P.TASKS_READ, P.TASKS_WRITE, P.FINANCIALS_READ, P.LEAVE_APPROVE, P.CODE_READ],
    revokes: [],
  },
  {
    code: 'PO',
    tier: 'Tier 3: Management',
    title: 'Product Owner',
    baseRole: Role.PROJECT_MANAGER,
    grants: [P.PROJECTS_READ, P.PROJECTS_WRITE, P.TASKS_READ, P.TASKS_WRITE, P.CODE_READ],
    revokes: [],
  },
  {
    code: 'BA',
    tier: 'Tier 3: Management',
    title: 'Business Analyst',
    baseRole: Role.PROJECT_MANAGER,
    grants: [P.PROJECTS_READ, P.TASKS_READ, P.TASKS_WRITE, P.CODE_READ],
    revokes: [P.PROJECTS_WRITE],
  },
  {
    code: 'TL',
    tier: 'Tier 4: Core Staff',
    title: 'Tech Lead',
    baseRole: Role.STAFF,
    grants: [P.CODE_READ, P.CODE_DEPLOY, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
    revokes: [],
  },
  {
    code: 'DEVOPS',
    tier: 'Tier 4: Core Staff',
    title: 'DevOps Engineer',
    baseRole: Role.STAFF,
    grants: [P.CODE_READ, P.CODE_DEPLOY, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
    revokes: [],
  },
  {
    code: 'SE',
    tier: 'Tier 4: Core Staff',
    title: 'Software Engineer',
    baseRole: Role.STAFF,
    grants: [P.CODE_READ, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
    revokes: [P.CODE_DEPLOY],
  },
  {
    code: 'QA',
    tier: 'Tier 4: Core Staff',
    title: 'QA Engineer',
    baseRole: Role.STAFF,
    grants: [P.CODE_READ, P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
    revokes: [P.CODE_DEPLOY],
  },
  {
    code: 'UIUX',
    tier: 'Tier 4: Core Staff',
    title: 'UI/UX Designer',
    baseRole: Role.STAFF,
    grants: [P.TASKS_READ, P.TASKS_WRITE, P.TIME_OWN, P.CHAT_USE],
    revokes: [P.CODE_DEPLOY],
  },
  {
    code: 'INT',
    tier: 'Tier 5: Trainees',
    title: 'Intern',
    baseRole: Role.INTERN,
    grants: [P.CHAT_USE],
    revokes: [
      P.PROJECTS_READ,
      P.PROJECTS_WRITE,
      P.TASKS_READ,
      P.TASKS_WRITE,
      P.TIME_OWN,
      P.CODE_DEPLOY,
      P.FINANCIALS_READ,
      P.FINANCIALS_WRITE,
      P.LEGAL_READ,
      P.LEGAL_WRITE,
    ],
  },
];

export function resolveDesignationOverrides(jobTitle?: string | null): {
  grants: PermissionKey[];
  revokes: PermissionKey[];
} | null {
  const normalized = String(jobTitle ?? '').trim().toLowerCase();
  if (!normalized) return null;
  const match = DESIGNATION_TIER_PRESETS.find(
    (p) => normalized === p.title.toLowerCase() || normalized === p.code.toLowerCase(),
  );
  return match ? { grants: match.grants, revokes: match.revokes } : null;
}
