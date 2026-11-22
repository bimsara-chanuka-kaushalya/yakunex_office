import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart3,
  Bell,
  Bug,
  Building2,
  CalendarCheck,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  FolderKanban,
  GraduationCap,
  Laptop,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Network,
  Plane,
  Repeat,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  Video,
} from 'lucide-react';
import { PERMISSIONS, type Role } from './permissions';

export interface NavItem {
  /** Route segment and i18n key. */
  key: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item. Omitted = visible to every signed-in user in allowedRoles. */
  permission?: string;
  /** Explicit roles that should see this item in the clean sidebar. */
  allowedRoles?: Role[];
  /** Roadmap phase from the product specification. */
  phase: number;
  /** True when the page is implemented in this release. */
  ready: boolean;
  /** Short description of the module. */
  description: string;
}

export const NAV_SECTIONS: { title: { en: string; si: string }; items: NavItem[] }[] = [
  {
    title: { en: 'Overview', si: 'දළ විශ්ලේෂණය' },
    items: [
      {
        key: 'dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 1,
        ready: true,
        description: 'Role-based overview of your work and company.',
      },
      {
        key: 'profile',
        href: '/profile',
        icon: UserCircle,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 1,
        ready: true,
        description: 'View and update your personal profile, DP, and bank details.',
      },
      {
        key: 'organization',
        href: '/organization',
        icon: Network,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 1,
        ready: true,
        description: 'Company hierarchy, departments and reporting managers.',
      },
      {
        key: 'notifications',
        href: '/notifications',
        icon: Bell,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 4,
        ready: true,
        description: 'Company announcements, live meeting alerts and notifications.',
      },
    ],
  },
  {
    title: { en: 'Delivery & Agile', si: 'ක්‍රියාත්මක කිරීම' },
    items: [
      {
        key: 'projects',
        href: '/projects',
        icon: FolderKanban,
        permission: PERMISSIONS.PROJECTS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 2,
        ready: true,
        description: 'Projects, milestones, timeline, budgets and client portal links.',
      },
      {
        key: 'tasks',
        href: '/tasks',
        icon: ListChecks,
        permission: PERMISSIONS.TASKS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 2,
        ready: true,
        description: 'Epics, stories, drag-and-drop Kanban board, worklog timer & dependencies.',
      },
      {
        key: 'sprints',
        href: '/sprints',
        icon: Repeat,
        permission: PERMISSIONS.TASKS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF'],
        phase: 2,
        ready: true,
        description: 'Backlog, sprint planning, burndown and team velocity charts.',
      },
      {
        key: 'bugs',
        href: '/bugs',
        icon: Bug,
        permission: PERMISSIONS.TASKS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF'],
        phase: 5,
        ready: true,
        description: 'Bug tracker, severity SLAs, verification and QA approval.',
      },
      {
        key: 'clients',
        href: '/clients',
        icon: Building2,
        permission: PERMISSIONS.PROJECTS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'],
        phase: 2,
        ready: true,
        description: 'Client CRM profiles, portals, requirements and delivery history.',
      },
      {
        key: 'documents',
        href: '/documents',
        icon: FileText,
        permission: PERMISSIONS.PROJECTS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF'],
        phase: 5,
        ready: true,
        description: 'Company wiki, SRS, proposals, designs and versioned project files.',
      },
    ],
  },
  {
    title: { en: 'Workforce & Time', si: 'කාලය සහ පුද්ගලයින්' },
    items: [
      {
        key: 'users',
        href: '/users',
        icon: Users,
        permission: PERMISSIONS.USERS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 1,
        ready: true,
        description: 'Staff, interns, onboarding, bulk CSV import, offboarding and roles.',
      },
      {
        key: 'time-tracker',
        href: '/time-tracker',
        icon: Clock,
        permission: PERMISSIONS.TIME_OWN,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 3,
        ready: true,
        description: 'Jibble-grade clock in, selfie/GPS verification, project timers & timesheets.',
      },
      {
        key: 'attendance',
        href: '/attendance',
        icon: CalendarCheck,
        permission: PERMISSIONS.TIME_OWN,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 3,
        ready: true,
        description: 'Daily attendance, live GPS map, OT rules (1.5x/2x) & EPF/ETF payroll export.',
      },
      {
        key: 'leave',
        href: '/leave',
        icon: Plane,
        permission: PERMISSIONS.TIME_OWN,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 3,
        ready: true,
        description: 'Leave balances, Sri Lanka Poya holidays, team calendar & approvals.',
      },
      {
        key: 'approvals',
        href: '/approvals',
        icon: CheckSquare,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'],
        phase: 2,
        ready: true,
        description: 'Centralized leave, timesheet & expense approval queue.',
      },
      {
        key: 'performance',
        href: '/performance',
        icon: Award,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF'],
        phase: 5,
        ready: true,
        description: 'Employee OKRs, KPIs and manager reviews.',
      },
      {
        key: 'assets',
        href: '/assets',
        icon: Laptop,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 6,
        ready: true,
        description: 'Company laptops, monitors, SaaS license renewals & assignments.',
      },
      {
        key: 'interns',
        href: '/interns',
        icon: GraduationCap,
        permission: PERMISSIONS.USERS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'],
        phase: 6,
        ready: true,
        description: 'Mentors, training plans, evaluations & Intern-to-Staff conversion.',
      },
    ],
  },
  {
    title: { en: 'Communication', si: 'සන්නිවේදනය' },
    items: [
      {
        key: 'chat',
        href: '/chat',
        icon: MessagesSquare,
        permission: PERMISSIONS.CHAT_USE,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 4,
        ready: true,
        description: 'Direct messages, project channels, standups and file sharing.',
      },
      {
        key: 'meetings',
        href: '/meetings',
        icon: Video,
        permission: PERMISSIONS.CHAT_USE,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'],
        phase: 4,
        ready: true,
        description: 'Zoom Pro video meetings, waiting rooms, whiteboard, polls & recordings.',
      },
    ],
  },
  {
    title: { en: 'Insight & Control', si: 'විශ්ලේෂණය සහ පාලනය' },
    items: [
      {
        key: 'reports',
        href: '/reports',
        icon: BarChart3,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'],
        phase: 6,
        ready: true,
        description: 'Delivery, time, attendance, OT and performance analytics.',
      },
      {
        key: 'finance',
        href: '/finance',
        icon: DollarSign,
        permission: PERMISSIONS.FINANCIALS_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 6,
        ready: true,
        description: 'Client invoices, expenses, payroll & EPF/ETF ledger.',
      },
      {
        key: 'audit-logs',
        href: '/audit-logs',
        icon: ShieldCheck,
        permission: PERMISSIONS.AUDIT_READ,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 1,
        ready: true,
        description: 'Every security-relevant change, with actor, IP and timestamp.',
      },
      {
        key: 'settings',
        href: '/settings',
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
        allowedRoles: ['SUPER_ADMIN', 'ADMIN'],
        phase: 1,
        ready: true,
        description: 'Company profile, multi-geofence offices, work shifts and security.',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export const INTERN_ALLOWED_MODULES = new Set([
  'dashboard',
  'profile',
  'projects',
  'tasks',
  'time-tracker',
  'attendance',
  'leave',
  'chat',
  'meetings',
  'notifications',
]);

export type ModuleAccessState = 'SHOWN' | 'LOCKED' | 'HIDDEN';
export type ModuleAccessConfig = Record<string, Record<string, ModuleAccessState>>;

/** Roles whose sidebar the Super Admin shapes in Settings → Intern sidebar. */
export const MODULE_ACCESS_ROLES = ['INTERN'] as const;

/**
 * Super Admin sidebar rules (loaded by the AuthProvider from /module-access). Kept here so the
 * plain helpers below can read them; the provider re-renders consumers whenever they change.
 */
let moduleAccessConfig: ModuleAccessConfig = {};
export function setModuleAccessConfig(config: ModuleAccessConfig | null | undefined): void {
  moduleAccessConfig = config && typeof config === 'object' ? config : {};
}

/** Built-in intern default when the Super Admin has not set a rule for a module. */
export function defaultModuleAccess(role: string, key: string): ModuleAccessState {
  if (role === 'INTERN') return INTERN_ALLOWED_MODULES.has(key) ? 'SHOWN' : 'HIDDEN';
  return 'SHOWN';
}

export function getModuleAccessState(key: string, role?: string | null): ModuleAccessState {
  if (!role || key === 'profile') return 'SHOWN';
  if (!(MODULE_ACCESS_ROLES as readonly string[]).includes(role)) return 'SHOWN';
  return moduleAccessConfig[role]?.[key] ?? defaultModuleAccess(role, key);
}

function hasDesignationUnlock(key: string, can?: (perm: string) => boolean): boolean {
  if (!can) return false;
  // HR Managers (baseRole: PROJECT_MANAGER + USERS_WRITE override) unlock Users, Organization & Assets
  if ((key === 'users' || key === 'organization' || key === 'assets') && can(PERMISSIONS.USERS_WRITE)) {
    return true;
  }
  // Accountants / Finance Leads (baseRole: PROJECT_MANAGER + FINANCIALS_WRITE override) unlock Finance
  if (key === 'finance' && can(PERMISSIONS.FINANCIALS_READ) && can(PERMISSIONS.FINANCIALS_WRITE)) {
    return true;
  }
  // Legal / Audit officers with explicit AUDIT_READ unlock Audit Logs
  if (key === 'audit-logs' && can(PERMISSIONS.AUDIT_READ)) {
    return true;
  }
  return false;
}

export function isModuleLockedForRole(
  key: string,
  role?: string | null,
  can?: (perm: string) => boolean,
): boolean {
  if (key === 'profile') {
    return false;
  }
  if (role === 'INTERN') {
    // Hidden or locked by the Super Admin (or by the intern default) = no access to the page.
    return getModuleAccessState(key, role) !== 'SHOWN';
  }
  if (hasDesignationUnlock(key, can)) {
    return false;
  }
  const item = ALL_NAV_ITEMS.find((i) => i.key === key);
  if (item?.allowedRoles && role && !item.allowedRoles.includes(role as Role)) {
    return true;
  }
  return false;
}

export function isNavItemVisibleForRole(
  item: NavItem,
  role: string | null | undefined,
  can: (perm: string) => boolean,
): boolean {
  if (!item.ready) return false;
  if (role === 'INTERN') {
    // Locked modules stay in the sidebar (with a lock), hidden ones disappear.
    return getModuleAccessState(item.key, role) !== 'HIDDEN';
  }
  if (hasDesignationUnlock(item.key, can)) {
    return true;
  }
  if (item.allowedRoles && role && !item.allowedRoles.includes(role as Role)) {
    return false;
  }
  if (item.permission && !can(item.permission)) {
    return false;
  }
  return true;
}

export function findNavItem(key: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.key === key);
}
