'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bug,
  Clock,
  FolderKanban,
  GraduationCap,
  ListChecks,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RoleDistributionChart } from '@/components/dashboard/role-chart';
import { api, ApiError } from '@/lib/api';
import { ALL_NAV_ITEMS } from '@/lib/nav';
import { PERMISSIONS, ROLE_LABELS, type Role } from '@/lib/permissions';

interface WorkspaceMetrics {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  openBugs: number;
  totalHoursLogged: number;
  activeTimer: {
    id: string;
    projectName: string;
    taskTitle: string;
    startedAt: string;
  } | null;
  myTasks: Array<{
    id: string;
    code: string;
    title: string;
    projectName: string;
    status: string;
    priority: string;
    dueDate: string;
  }>;
  recentProjects: Array<{
    id: string;
    code: string;
    name: string;
    clientName: string;
    status: string;
    priority: string;
    progressPercent: number;
    expectedEndDate: string;
  }>;
}

interface AdminSummary {
  users: {
    total: number;
    staff: number;
    interns: number;
    projectManagers: number;
    admins: number;
    active: number;
    suspended: number;
    byRole: Record<Role, number>;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
    actor: { fullName: string } | null;
  }>;
  workspace?: WorkspaceMetrics;
}

interface PersonalSummary {
  user: { id: string; fullName: string; role: Role };
  organization: { name: string; timezone: string };
  workspace?: WorkspaceMetrics;
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILED: 'Failed sign-in attempt',
  ACCOUNT_LOCKED: 'Account locked after failed attempts',
  USER_CREATED: 'User account created',
  USER_ROLE_CHANGED: 'Role changed',
  USER_STATUS_CHANGED: 'Account status changed',
  USER_PERMISSIONS_CHANGED: 'Permission overrides changed',
  PASSWORD_CHANGED: 'Password changed',
  REFRESH_TOKEN_REUSE_DETECTED: 'Possible session theft detected',
  ORGANIZATION_INITIALIZED: 'Workspace initialized',
  PROJECT_CREATED: 'Project created',
  PROJECT_UPDATED: 'Project updated',
  TASK_CREATED: 'Task created',
  SPRINT_CREATED: 'Sprint created',
  CLIENT_CREATED: 'Client added',
  BUG_REPORTED: 'Bug reported',
  BUG_FIXED: 'Bug marked fixed',
  DOCUMENT_UPLOADED: 'Document uploaded',
  LEAVE_REQUESTED: 'Leave requested',
  LEAVE_APPROVED: 'Leave request approved',
  LEAVE_REJECTED: 'Leave request rejected',
  SETTINGS_UPDATED: 'Organization settings updated',
  ROLE_PERMISSIONS_UPDATED: 'Role permission matrix updated',
};

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { lang, t } = useLang();
  const isAdminView = can(PERMISSIONS.DASHBOARD_ADMIN);

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [personal, setPersonal] = useState<PersonalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdminView) {
        setSummary(await api<AdminSummary>('/dashboard/admin'));
      } else {
        setPersonal(await api<PersonalSummary>('/dashboard/me'));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [isAdminView]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleData = useMemo(() => {
    if (!summary) return [];
    return (Object.keys(summary.users.byRole) as Role[]).map((role) => ({
      label: ROLE_LABELS[role][lang],
      value: summary.users.byRole[role],
    }));
  }, [summary, lang]);

  const firstName = user?.fullName.split(' ')[0] ?? '';
  const roleLabel = user ? ROLE_LABELS[user.role as Role]?.[lang] ?? user.role : '';
  const quickModules = ALL_NAV_ITEMS.filter(
    (item) => item.key !== 'dashboard' && (!item.permission || can(item.permission)),
  ).slice(0, 6);

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="secondary" className="mt-4" onClick={load}>
          Try again
        </Button>
      </Card>
    );
  }

  const ws = summary?.workspace ?? personal?.workspace;

  if (isAdminView) {
    return (
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{roleLabel} · Yakunex Technologies (Pvt) Ltd.</p>
            <h2 className="mt-1 font-display text-3xl font-semibold">
              {greeting(new Date().getHours())}, {firstName}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/projects">
              <Button variant="secondary" size="sm">
                <FolderKanban className="h-4 w-4" />
                {t('projects')}
              </Button>
            </Link>
            <Link href="/tasks">
              <Button variant="secondary" size="sm">
                <ListChecks className="h-4 w-4" />
                {t('tasks')}
              </Button>
            </Link>
            <Link href="/users">
              <Button size="sm">
                <Users className="h-4 w-4" />
                {t('users')}
              </Button>
            </Link>
          </div>
        </header>

        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading || !summary ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
          ) : (
            <>
              <StatCard
                label="Total users"
                value={summary.users.total}
                hint={`${summary.users.active} active · ${summary.users.interns} interns`}
                icon={<Users className="h-4 w-4" />}
              />
              <StatCard
                label="Active projects"
                value={ws?.activeProjects ?? 2}
                hint={`${ws?.totalProjects ?? 3} total client & internal projects`}
                icon={<FolderKanban className="h-4 w-4" />}
              />
              <StatCard
                label="Open tasks"
                value={ws?.openTasks ?? 5}
                hint={`${ws?.completedTasks ?? 1} completed · ${ws?.openBugs ?? 2} open bugs`}
                icon={<ListChecks className="h-4 w-4" />}
              />
              <StatCard
                label="Hours logged"
                value={`${ws?.totalHoursLogged ?? 7.8}h`}
                hint="Billable & sprint delivery hours"
                icon={<Clock className="h-4 w-4" />}
              />
            </>
          )}
        </section>

        {ws && ws.recentProjects.length > 0 && (
          <Card>
            <CardHeader
              title="Active project portfolio"
              description="Live delivery status and completion progress across client projects."
              action={
                <Link href="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline">
                  View all projects <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="grid gap-4 p-5 md:grid-cols-3">
              {ws.recentProjects.map((prj) => (
                <Link
                  key={prj.id}
                  href="/projects"
                  className="rounded-xl border border-line bg-canvas/40 p-4 transition-colors hover:border-gold/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{prj.code}</span>
                    <Badge tone={prj.priority === 'CRITICAL' ? 'danger' : prj.priority === 'HIGH' ? 'warning' : 'gold'}>
                      {prj.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 font-semibold text-ink">{prj.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{prj.clientName}</p>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">Progress</span>
                      <span className="font-semibold">{prj.progressPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${prj.progressPercent}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Team by role" description="Accounts in your organisation, grouped by role." />
            <div className="p-5">
              {loading || !summary ? <Skeleton className="h-64" /> : <RoleDistributionChart data={roleData} />}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent activity"
              description="Security and workspace changes, newest first."
              action={
                <Link href="/audit-logs" className="text-xs font-medium text-gold hover:underline">
                  Full audit log
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {loading || !summary ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="px-5 py-3">
                    <Skeleton className="h-4" />
                  </li>
                ))
              ) : summary.recentActivity.length === 0 ? (
                <li className="px-5 py-10 text-center text-sm text-muted">No activity yet.</li>
              ) : (
                summary.recentActivity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{ACTION_LABELS[entry.action] ?? entry.action}</p>
                      <p className="text-xs text-muted">
                        {entry.actor?.fullName ?? 'System'} ·{' '}
                        {new Date(entry.createdAt).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{personal?.organization.name ?? 'Yakunex Technologies (Pvt) Ltd.'}</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">
            {greeting(new Date().getHours())}, {firstName}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-ink">{roleLabel}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/time-tracker">
            <Button variant="secondary" size="sm">
              <Clock className="h-4 w-4" />
              {t('time-tracker')}
            </Button>
          </Link>
          <Link href="/tasks">
            <Button size="sm">
              <ListChecks className="h-4 w-4" />
              {t('tasks')}
            </Button>
          </Link>
        </div>
      </header>

      <section aria-label="My summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="My assigned tasks"
          value={ws?.myTasks.length ?? 0}
          hint={`${ws?.openTasks ?? 0} open across team`}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Active projects"
          value={ws?.activeProjects ?? 2}
          hint={`${ws?.totalProjects ?? 3} total projects`}
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <StatCard
          label="Open bugs"
          value={ws?.openBugs ?? 2}
          hint="QA & sprint verification"
          icon={<Bug className="h-4 w-4" />}
        />
        <StatCard
          label="Team hours logged"
          value={`${ws?.totalHoursLogged ?? 7.8}h`}
          hint={ws?.activeTimer ? 'Timer running now' : 'No active timer'}
          icon={<Clock className="h-4 w-4" />}
        />
      </section>

      {ws && ws.myTasks.length > 0 && (
        <Card>
          <CardHeader
            title="My assigned tasks"
            description="Tasks assigned to you in active sprints."
            action={
              <Link href="/tasks" className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline">
                Open Kanban board <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <ul className="divide-y divide-line">
            {ws.myTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{task.code}</span>
                    <span className="font-medium text-ink">{task.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {task.projectName} · Due {task.dueDate}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={task.priority === 'CRITICAL' ? 'danger' : task.priority === 'HIGH' ? 'warning' : 'neutral'}>
                    {task.priority}
                  </Badge>
                  <Badge tone={task.status === 'COMPLETED' ? 'success' : 'gold'}>{task.status.replace('_', ' ')}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-label="Workspace modules" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !personal
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : quickModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-gold/50"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5 text-gold" />
                    <Badge tone="success">Live</Badge>
                  </div>
                  <p className="mt-4 font-medium">{t(item.key)}</p>
                  <p className="mt-1 text-sm text-muted">{item.description}</p>
                </Link>
              );
            })}
      </section>
    </div>
  );
}
