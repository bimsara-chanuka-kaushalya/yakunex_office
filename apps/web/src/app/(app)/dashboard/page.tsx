'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bug,
  Clock,
  FolderKanban,
  ListChecks,
  MapPin,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RoleDistributionChart } from '@/components/dashboard/role-chart';
import { MyDay } from '@/components/dashboard/my-day/my-day';
import { api, ApiError } from '@/lib/api';
import { isSilentRefresh, useLiveSync } from '@/lib/use-live-sync';
import { ALL_NAV_ITEMS, isModuleLockedForRole, isNavItemVisibleForRole } from '@/lib/nav';
import { LockedModuleNotice } from '@/components/ui/locked-module';
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

interface RoleInsights {
  persona: string;
  badge: string;
  cards: Array<{
    label: string;
    value: string;
    detail: string;
    tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo';
  }>;
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

function formatNameWithInitials(fullName?: string | null, savedInitials?: string | null): string {
  if (savedInitials && savedInitials.trim().length > 0) {
    return savedInitials.trim();
  }
  const raw = (fullName ?? '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return raw;
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(' ');
  return `${initials} ${last}`;
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { lang, t } = useLang();
  const isAdminView = can(PERMISSIONS.DASHBOARD_ADMIN);

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [personal, setPersonal] = useState<PersonalSummary | null>(null);
  const [roleInsights, setRoleInsights] = useState<RoleInsights | null>(null);
  const [profileInitialsName, setProfileInitialsName] = useState<string | null>(null);
  const [liveBoard, setLiveBoard] = useState<
    Array<{
      userId: string;
      userName: string;
      clockInAt: string | null;
      onBreak: boolean;
      workMode: string;
      latitude: number | null;
      longitude: number | null;
      locationLabel: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isModuleLockedForRole('dashboard', user?.role)) {
      setLoading(false);
      return;
    }
    // Live refreshes keep the current dashboard on screen; only the first load shows a skeleton.
    const silent = isSilentRefresh();
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [attRes, insightsRes, profRes] = await Promise.all([
        api<{ liveBoard?: typeof liveBoard }>('/attendance').catch(() => ({ liveBoard: [] })),
        api<RoleInsights>('/dashboard/role-insights').catch(() => null),
        api<{ firstName?: string; fullName?: string }>('/profile').catch(() => null),
        isAdminView
          ? api<AdminSummary>('/dashboard/admin').then(setSummary)
          : api<PersonalSummary>('/dashboard/me').then(setPersonal),
      ]);
      setLiveBoard(Array.isArray(attRes?.liveBoard) ? attRes.liveBoard : []);
      if (insightsRes) setRoleInsights(insightsRes);
      if (profRes?.firstName) setProfileInitialsName(profRes.firstName);
    } catch (err) {
      if (!silent) setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, [isAdminView, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  if (isModuleLockedForRole('dashboard', user?.role)) {
    return <LockedModuleNotice moduleName="Dashboard" />;
  }

  const roleData = useMemo(() => {
    if (!summary) return [];
    return (Object.keys(summary.users.byRole) as Role[]).map((role) => ({
      label: ROLE_LABELS[role][lang],
      value: summary.users.byRole[role],
    }));
  }, [summary, lang]);

  const firstName = formatNameWithInitials(user?.fullName, profileInitialsName);
  const roleLabel = user ? ROLE_LABELS[user.role as Role]?.[lang] ?? user.role : '';
  const quickModules = ALL_NAV_ITEMS.filter(
    (item) => item.key !== 'dashboard' && isNavItemVisibleForRole(item, user?.role, can),
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
        {/* Top Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-r from-surface via-surface to-gold/5 p-6 shadow-card md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {user?.companyId && (
                  <span className="rounded-lg border border-gold/40 bg-gold/15 px-2.5 py-0.5 font-mono text-xs font-bold text-gold">
                    {user.companyId}
                  </span>
                )}
                <Badge tone="success" dot>
                  System Online
                </Badge>
                <span className="text-xs text-muted">
                  {roleLabel} · {personal?.organization.name ?? 'Yakunex Hub'}
                </span>
              </div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
                {greeting(new Date().getHours())}, {firstName} 👋
              </h2>
              <p className="text-xs text-muted md:text-sm">
                Here is your live enterprise workspace summary and delivery metrics across all 15 modules.
              </p>
            </div>

            {/* Quick Action Shortcuts */}
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/projects">
                <Button variant="secondary" size="sm" className="rounded-xl shadow-2xs">
                  <FolderKanban className="h-4 w-4 text-gold" />
                  <span>Projects</span>
                </Button>
              </Link>
              <Link href="/tasks">
                <Button variant="secondary" size="sm" className="rounded-xl shadow-2xs">
                  <ListChecks className="h-4 w-4 text-gold" />
                  <span>Tasks</span>
                </Button>
              </Link>
              <Link href="/meetings">
                <Button variant="secondary" size="sm" className="rounded-xl shadow-2xs">
                  <Video className="h-4 w-4 text-gold" />
                  <span>Meet</span>
                </Button>
              </Link>
              <Link href="/users">
                <Button size="sm" className="rounded-xl shadow-xs">
                  <Users className="h-4 w-4" />
                  <span>Team</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <MyDay />

        {/* Role-Tailored Intelligence Strip */}
        {roleInsights && roleInsights.cards.length > 0 && (
          <section aria-label="Role Intelligence" className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-gold" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                  {roleInsights.persona}
                </h3>
              </div>
              <Badge tone="gold">{roleInsights.badge}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roleInsights.cards.map((c) => {
                const toneMap: Record<string, string> = {
                  blue: 'border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400',
                  emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
                  amber: 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400',
                  rose: 'border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400',
                  indigo: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400',
                };
                return (
                  <div
                    key={c.label}
                    className={`rounded-2xl border p-4 shadow-2xs transition hover:shadow-card ${toneMap[c.tone] ?? toneMap.blue}`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
                      {c.label}
                    </div>
                    <div className="mt-1 font-display text-2xl font-bold text-ink">{c.value}</div>
                    <div className="mt-1 text-xs text-muted">{c.detail}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Key Metrics Grid */}
        <section aria-label="Key figures" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {loading || !summary ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
          ) : (
            <>
              <StatCard
                label="Total users"
                value={summary.users.total}
                trend={{ value: `${summary.users.active} Active`, positive: true }}
                hint={`${summary.users.staff} staff · ${summary.users.interns} interns`}
                icon={<Users className="h-5 w-5" />}
              />
              <StatCard
                label="Active projects"
                value={ws?.activeProjects ?? 2}
                trend={{ value: 'Portfolio Live', positive: true }}
                hint={`${ws?.totalProjects ?? 3} total client & internal`}
                icon={<FolderKanban className="h-5 w-5" />}
              />
              <StatCard
                label="Open tasks"
                value={ws?.openTasks ?? 5}
                trend={{ value: `${ws?.completedTasks ?? 1} Done`, positive: true }}
                hint={`${ws?.openBugs ?? 2} open bugs in backlog`}
                icon={<ListChecks className="h-5 w-5" />}
              />
              <StatCard
                label="Hours logged"
                value={`${ws?.totalHoursLogged ?? 7.8}h`}
                trend={{ value: 'Billable', positive: true }}
                hint="Delivery & sprint tracked"
                icon={<Clock className="h-5 w-5" />}
              />
            </>
          )}
        </section>

        {/* Live Who's In & Location Board */}
        <Card>
          <CardHeader
            title={`Live Workforce — Who's In (${liveBoard.length})`}
            description="Real-time team attendance, work mode & GPS check-in locations."
            badge={<Badge dot tone="success">Live</Badge>}
            action={
              <div className="flex items-center gap-2">
                <Link href="/attendance">
                  <Button size="sm" variant="secondary">Clock In / Map</Button>
                </Link>
                <Link href="/time-tracker">
                  <Button size="sm">Timesheet</Button>
                </Link>
              </div>
            }
          />
          {liveBoard.length === 0 ? (
            <p className="px-6 pb-5 text-xs text-muted">
              No one has clocked in yet today. Click &ldquo;Clock In / Map&rdquo; to start your shift with GPS.
            </p>
          ) : (
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
              {liveBoard.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-ink/[0.04] p-3 dark:bg-white/[0.06]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={m.userName} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{m.userName}</p>
                      <p className="text-[11px] text-muted">
                        {m.workMode} ·{' '}
                        {m.clockInAt
                          ? new Date(m.clockInAt).toLocaleTimeString('en-LK', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Colombo',
                            })
                          : '—'}
                      </p>
                      {m.locationLabel && (
                        <p className="flex items-center gap-1 truncate text-[11px] text-muted">
                          <MapPin className="h-3 w-3 shrink-0 text-gold-strong dark:text-gold" />
                          <span className="truncate">{m.locationLabel}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge tone={m.onBreak ? 'warning' : 'success'}>
                    {m.onBreak ? 'Break' : 'In'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader title="Team by role" description="Accounts in your organisation, grouped by role." />
            <div className="p-5 sm:p-6">
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
          <p className="flex items-center gap-2 text-sm text-muted">
            {user?.companyId && (
              <span className="rounded border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-xs font-semibold text-gold">
                {user.companyId}
              </span>
            )}
            <span>{personal?.organization.name ?? 'Yakunex Hub'}</span>
          </p>
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

      <MyDay />

      <section aria-label="My summary" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
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

      {roleInsights && roleInsights.cards.length > 0 && (
        <section aria-label="Role Intelligence" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                {roleInsights.persona}
              </h3>
            </div>
            <Badge tone="gold">{roleInsights.badge}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roleInsights.cards.map((c) => {
              const toneMap: Record<string, string> = {
                blue: 'border-sky-500/20 bg-sky-500/5 text-sky-600 dark:text-sky-400',
                emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400',
                amber: 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400',
                rose: 'border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400',
                indigo: 'border-indigo-500/20 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400',
              };
              return (
                <div
                  key={c.label}
                  className={`rounded-2xl border p-4 transition-all ${toneMap[c.tone] ?? toneMap.blue}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{c.label}</p>
                  <p className="mt-1 font-display text-2xl font-bold text-ink">{c.value}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
