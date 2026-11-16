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
  Users,
  Video,
} from 'lucide-react';
import { PERMISSIONS } from './permissions';

export interface NavItem {
  /** Route segment and i18n key. */
  key: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see the item. Omitted = visible to every signed-in user. */
  permission?: string;
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
        phase: 1,
        ready: true,
        description: 'Role-based overview of your work and company.',
      },
      {
        key: 'organization',
        href: '/organization',
        icon: Network,
        phase: 1,
        ready: true,
        description: 'Company hierarchy, departments and reporting managers.',
      },
      {
        key: 'notifications',
        href: '/notifications',
        icon: Bell,
        phase: 4,
        ready: true,
        description: 'Company announcements and personal notifications.',
      },
    ],
  },
  {
    title: { en: 'Delivery', si: 'ක්‍රියාත්මක කිරීම' },
    items: [
      {
        key: 'projects',
        href: '/projects',
        icon: FolderKanban,
        permission: PERMISSIONS.PROJECTS_READ,
        phase: 2,
        ready: true,
        description: 'Create projects, set stages, budgets and milestones.',
      },
      {
        key: 'tasks',
        href: '/tasks',
        icon: ListChecks,
        permission: PERMISSIONS.TASKS_READ,
        phase: 2,
        ready: true,
        description: 'Tasks, subtasks, dependencies and Kanban, list, and timeline views.',
      },
      {
        key: 'sprints',
        href: '/sprints',
        icon: Repeat,
        permission: PERMISSIONS.TASKS_READ,
        phase: 2,
        ready: true,
        description: 'Backlog, sprint planning, burndown and velocity.',
      },
      {
        key: 'clients',
        href: '/clients',
        icon: Building2,
        permission: PERMISSIONS.PROJECTS_READ,
        phase: 2,
        ready: true,
        description: 'Client profiles, requirements and delivery history.',
      },
      {
        key: 'bugs',
        href: '/bugs',
        icon: Bug,
        permission: PERMISSIONS.TASKS_READ,
        phase: 5,
        ready: true,
        description: 'Bug reports, severity, verification and QA approval.',
      },
      {
        key: 'documents',
        href: '/documents',
        icon: FileText,
        permission: PERMISSIONS.PROJECTS_READ,
        phase: 5,
        ready: true,
        description: 'SRS, proposals, designs and versioned project files.',
      },
    ],
  },
  {
    title: { en: 'Time & people', si: 'කාලය සහ පුද්ගලයින්' },
    items: [
      {
        key: 'users',
        href: '/users',
        icon: Users,
        permission: PERMISSIONS.USERS_READ,
        phase: 1,
        ready: true,
        description: 'Staff, interns and their roles.',
      },
      {
        key: 'time-tracker',
        href: '/time-tracker',
        icon: Clock,
        permission: PERMISSIONS.TIME_OWN,
        phase: 3,
        ready: true,
        description: 'Clock in, task timers, breaks and timesheets.',
      },
      {
        key: 'attendance',
        href: '/attendance',
        icon: CalendarCheck,
        permission: PERMISSIONS.TIME_OWN,
        phase: 3,
        ready: true,
        description: 'Daily attendance, late arrivals and working hours.',
      },
      {
        key: 'leave',
        href: '/leave',
        icon: Plane,
        permission: PERMISSIONS.TIME_OWN,
        phase: 3,
        ready: true,
        description: 'Leave requests and approvals.',
      },
      {
        key: 'approvals',
        href: '/approvals',
        icon: CheckSquare,
        phase: 2,
        ready: true,
        description: 'Centralized approval requests and decisions.',
      },
      {
        key: 'performance',
        href: '/performance',
        icon: Award,
        phase: 5,
        ready: true,
        description: 'Employee goals, KPIs and manager reviews.',
      },
      {
        key: 'assets',
        href: '/assets',
        icon: Laptop,
        phase: 6,
        ready: true,
        description: 'Company laptops, monitors, licenses and assignments.',
      },
      {
        key: 'interns',
        href: '/interns',
        icon: GraduationCap,
        permission: PERMISSIONS.USERS_READ,
        phase: 6,
        ready: true,
        description: 'Mentors, training plans, daily logs and evaluations.',
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
        phase: 4,
        ready: true,
        description: 'Direct messages, project channels and file sharing.',
      },
      {
        key: 'meetings',
        href: '/meetings',
        icon: Video,
        permission: PERMISSIONS.CHAT_USE,
        phase: 4,
        ready: true,
        description: 'Scheduled meetings, notes and action items.',
      },
    ],
  },
  {
    title: { en: 'Insight & control', si: 'විශ්ලේෂණය සහ පාලනය' },
    items: [
      {
        key: 'reports',
        href: '/reports',
        icon: BarChart3,
        permission: PERMISSIONS.DASHBOARD_ADMIN,
        phase: 6,
        ready: true,
        description: 'Project, time, attendance and performance reports.',
      },
      {
        key: 'finance',
        href: '/finance',
        icon: DollarSign,
        permission: PERMISSIONS.FINANCIALS_READ,
        phase: 6,
        ready: true,
        description: 'Revenue, expenses, invoices and payroll ledger.',
      },
      {
        key: 'audit-logs',
        href: '/audit-logs',
        icon: ShieldCheck,
        permission: PERMISSIONS.AUDIT_READ,
        phase: 1,
        ready: true,
        description: 'Every security-relevant change, with actor and time.',
      },
      {
        key: 'settings',
        href: '/settings',
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
        phase: 1,
        ready: true,
        description: 'Company profile, working hours, time zone and activity policy.',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findNavItem(key: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.key === key);
}
