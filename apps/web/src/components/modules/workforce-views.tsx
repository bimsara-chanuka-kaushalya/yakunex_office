'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Download,
  GraduationCap,
  LogIn,
  LogOut,
  MapPin,
  Pause,
  Plane,
  Play,
  Plus,
  RefreshCw,
  Send,
  Square,
  Star,
} from 'lucide-react';
import { useAuth } from '@/components/providers';
import { TeamLocationMap } from '@/components/ui/team-location-map';
import { AttendanceCalendar } from '@/components/modules/attendance-calendar';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, patch, post } from '@/lib/api';
import { isSilentRefresh, useLiveSync } from '@/lib/use-live-sync';
import { exportBrandedPdf } from '@/lib/pdf-export';
import { PERMISSIONS } from '@/lib/permissions';
import { cn } from '@/lib/cn';

// ─── 1. TIME TRACKER PAGE (/time-tracker) ────────────────────────────────────

interface TimeEntry {
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
}

interface TimeSummary {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  approvedMinutes: number;
}

const WORK_CATEGORIES = [
  'Development',
  'Testing / QA',
  'Design',
  'Meeting',
  'Research',
  'Documentation',
  'Support',
  'Management',
];

function formatElapsed(
  startedAtIso: string,
  pausedAt?: string | null,
  pauseDurationSeconds = 0,
): string {
  const endMs = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  const rawSec = Math.floor((endMs - new Date(startedAtIso).getTime()) / 1000);
  const diffSec = Math.max(0, rawSec - (pauseDurationSeconds ?? 0));
  const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
  const secs = String(diffSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

function formatMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function statusTone(status?: string): 'gold' | 'success' | 'danger' | 'neutral' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
    case 'REVISION_REQUIRED':
      return 'danger';
    case 'RUNNING':
    case 'PAUSED':
    case 'SUBMITTED':
      return 'gold';
    default:
      return 'neutral';
  }
}

async function captureBrowserGps(): Promise<{
  latitude: number;
  longitude: number;
  accuracyMeters: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 60_000 },
    );
  });
}

export function TimeTrackerView() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'timer' | 'weekly'>('timer');
  const [activeTimer, setActiveTimer] = useState<TimeEntry | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<TimeSummary>({
    todayMinutes: 0,
    weekMinutes: 0,
    monthMinutes: 0,
    approvedMinutes: 0,
  });
  const [projects, setProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; projectId: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [workCategory, setWorkCategory] = useState('Development');
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState('');

  const [switchOpen, setSwitchOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('60');
  const [manualNote, setManualNote] = useState('');
  const [weeklyNotice, setWeeklyNotice] = useState<string | null>(null);
  const [submittingWeek, setSubmittingWeek] = useState(false);

  const load = useCallback(async () => {
    if (!isSilentRefresh()) setLoading(true);
    try {
      const [res, prjs, tsks] = await Promise.all([
        api<{ activeTimer: TimeEntry | null; entries: TimeEntry[]; summary?: TimeSummary }>('/time-entries'),
        api<Array<{ id: string; name: string; code: string }>>('/projects').catch(() => []),
        api<Array<{ id: string; title: string; projectId: string | null }>>('/tasks').catch(() => []),
      ]);
      setActiveTimer(res.activeTimer);
      setEntries(res.entries);
      if (res.summary) setSummary(res.summary);
      setProjects(prjs);
      setTasks(tsks);
      if (prjs.length > 0) {
        setProjectId((prev) => prev || prjs[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  useEffect(() => {
    if (!activeTimer) {
      setElapsed('00:00:00');
      return;
    }
    const updateClock = () =>
      setElapsed(
        formatElapsed(
          activeTimer.startedAt,
          activeTimer.pausedAt,
          activeTimer.pauseDurationSeconds ?? 0,
        ),
      );
    updateClock();
    if (activeTimer.status === 'PAUSED' || activeTimer.pausedAt) {
      return;
    }
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  const filteredTasks = projectId ? tasks.filter((t) => !t.projectId || t.projectId === projectId) : tasks;

  async function handleStart() {
    setError(null);
    try {
      const gps = await captureBrowserGps();
      await post('/time-entries/start', {
        projectId,
        taskId: taskId || undefined,
        workCategory,
        note: note || `${workCategory} work`,
        billable,
        ...(gps ? { latitude: gps.latitude, longitude: gps.longitude, locationLabel: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` } : {}),
      });
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start timer.');
    }
  }

  async function handlePause() {
    setError(null);
    try {
      await post('/time-entries/pause');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not pause timer.');
    }
  }

  async function handleResume() {
    setError(null);
    try {
      await post('/time-entries/resume');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resume timer.');
    }
  }

  async function handleSwitch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post('/time-entries/switch', {
        projectId,
        taskId: taskId || undefined,
        workCategory,
        note: note || `${workCategory} work`,
        billable,
      });
      setSwitchOpen(false);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not switch task.');
    }
  }

  async function handleStop() {
    setError(null);
    try {
      await post('/time-entries/stop');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop timer.');
    }
  }

  async function handleSubmitEntry(id: string) {
    setError(null);
    try {
      await post(`/time-entries/${id}/submit`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit timesheet.');
    }
  }

  async function handleManual(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await post('/time-entries/manual', {
        projectId,
        taskId: taskId || undefined,
        workCategory,
        durationMinutes: Number(manualMinutes),
        note: manualNote,
        billable,
      });
      setManualOpen(false);
      setManualNote('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log manual time.');
    }
  }

  function exportCsv() {
    const header = ['Date', 'Person', 'Project', 'Task', 'Category', 'Source', 'Status', 'Billable', 'Minutes', 'Note'];
    const rows = entries.map((e) => [
      new Date(e.startedAt).toISOString().slice(0, 10),
      e.userName,
      e.projectName,
      e.taskTitle,
      e.workCategory ?? 'Development',
      e.source,
      e.status ?? (e.endedAt ? 'SAVED' : 'RUNNING'),
      e.billable ? 'Yes' : 'No',
      String(e.durationMinutes),
      `"${(e.note || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yakunex-timesheet-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalMinutes = entries.reduce((s, e) => s + e.durationMinutes, 0);
  const billableMinutes = entries.filter((e) => e.billable).reduce((s, e) => s + e.durationMinutes, 0);
  const isPaused = Boolean(activeTimer && (activeTimer.status === 'PAUSED' || activeTimer.pausedAt));

  // Build Mon-Sun Weekly Timesheet Matrix
  const weekDays = (() => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMon);
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        iso: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      };
    });
  })();

  const weeklyRows = (() => {
    const map = new Map<string, { label: string; sub: string; days: Record<string, number>; total: number }>();
    for (const e of entries) {
      const dIso = new Date(e.startedAt).toISOString().slice(0, 10);
      if (!weekDays.some((w) => w.iso === dIso)) continue;
      const key = `${e.projectId ?? 'gen'}::${e.taskTitle || 'General'}`;
      let row = map.get(key);
      if (!row) {
        row = { label: e.projectName, sub: e.taskTitle || e.workCategory || 'General', days: {}, total: 0 };
        map.set(key, row);
      }
      row.days[dIso] = (row.days[dIso] ?? 0) + e.durationMinutes;
      row.total += e.durationMinutes;
    }
    return Array.from(map.values());
  })();

  const savedEntries = entries.filter(
    (e) => e.endedAt && (e.status === 'SAVED' || e.status === 'REJECTED' || e.status === 'REVISION_REQUIRED' || !e.status),
  );

  async function handleSubmitAllSaved() {
    setError(null);
    setWeeklyNotice(null);
    setSubmittingWeek(true);
    try {
      const weekLabel =
        weekDays.length >= 7 ? `${weekDays[0].iso} → ${weekDays[6].iso}` : 'Current Week';
      const res = await post<{ submittedEntries: number; totalHours: number }>(
        '/workforce/timesheets/submit',
        { weekLabel },
      );
      setWeeklyNotice(
        `Weekly timesheet submitted for approval (${res.submittedEntries} entries · ${res.totalHours}h).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit weekly timesheet.');
    } finally {
      setSubmittingWeek(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Time Tracker &amp; Timesheets</h2>
          <p className="mt-1 text-sm text-muted">
            Live timer, GPS verification, weekly Mon–Sun timesheet matrix &amp; manager approvals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="segmented" role="tablist" aria-label="Time view">
            <button
              type="button"
              role="tab"
              aria-checked={tab === 'timer'}
              onClick={() => setTab('timer')}
            >
              Live Timer
            </button>
            <button
              type="button"
              role="tab"
              aria-checked={tab === 'weekly'}
              onClick={() => setTab('weekly')}
            >
              Weekly Timesheet
            </button>
          </div>
          <Button
            variant="secondary"
            disabled={entries.length === 0}
            onClick={() =>
              exportBrandedPdf({
                title: 'Time Tracker & Timesheet Report',
                subtitle: 'Logged work hours, billable status & approval state',
                generatedByEmail: user?.email,
                generatedByName: user?.fullName,
                kpis: [
                  { label: 'Today', value: formatMins(summary.todayMinutes) },
                  { label: 'This Week', value: formatMins(summary.weekMinutes) },
                  { label: 'This Month', value: formatMins(summary.monthMinutes) },
                  { label: 'Approved', value: formatMins(summary.approvedMinutes) },
                ],
                columns: ['Date', 'Person', 'Project', 'Task', 'Category', 'Status', 'Billable', 'Duration'],
                rows: entries.map((e) => [
                  new Date(e.startedAt).toISOString().slice(0, 10),
                  e.userName,
                  e.projectName,
                  e.taskTitle,
                  e.workCategory ?? 'Development',
                  e.status ?? (e.endedAt ? 'SAVED' : 'RUNNING'),
                  e.billable ? 'Yes' : 'No',
                  `${e.durationMinutes} min`,
                ]),
              })
            }
          >
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={entries.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Log manual time
          </Button>
          <Button
            size="sm"
            disabled={submittingWeek || entries.length === 0}
            onClick={() => void handleSubmitAllSaved()}
          >
            <Send className="h-4 w-4" /> {submittingWeek ? 'Submitting…' : 'Submit Weekly Timesheet'}
          </Button>
        </div>
      </header>

      {weeklyNotice && (
        <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {weeklyNotice}
        </div>
      )}

      <Card className="border-gold/40 bg-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={activeTimer ? 'gold' : 'neutral'}>
                {!activeTimer ? 'Ready to track' : isPaused ? 'Timer paused' : 'Timer running'}
              </Badge>
              {activeTimer?.workCategory && (
                <Badge tone="neutral">{activeTimer.workCategory}</Badge>
              )}
              <span className="text-xs text-muted">
                Enforces one active timer per user · Paused time excluded
              </span>
            </div>
            {activeTimer ? (
              <div>
                <p className="font-semibold text-ink">
                  {activeTimer.projectName}
                  {activeTimer.taskTitle ? ` · ${activeTimer.taskTitle}` : ''}
                </p>
                <p className="text-sm text-muted">{activeTimer.note}</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setTaskId('');
                  }}
                >
                  <option value="">General Project Work</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ''}{p.name}
                    </option>
                  ))}
                </Select>
                <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">General Task</option>
                  {filteredTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
                <Select value={workCategory} onChange={(e) => setWorkCategory(e.target.value)}>
                  {WORK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="What are you working on?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-3xl font-semibold tabular-nums text-ink">{elapsed}</p>
            {activeTimer ? (
              <>
                {isPaused ? (
                  <Button onClick={handleResume}>
                    <Play className="h-4 w-4" /> Resume
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={handlePause}>
                    <Pause className="h-4 w-4" /> Pause
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSwitchOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Switch
                </Button>
                <Button variant="danger" onClick={handleStop}>
                  <Square className="h-4 w-4" /> Stop
                </Button>
              </>
            ) : (
              <Button onClick={handleStart}>
                <Play className="h-4 w-4" /> Start timer
              </Button>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        <div className="mt-4 border-t border-line/60 pt-3">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Daily Shift Target (8h Regular)</span>
            <span className="font-mono font-semibold text-ink">
              {formatMins(summary.todayMinutes)} / 8h 0m ({Math.min(100, Math.round((summary.todayMinutes / 480) * 100))}%)
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.1]">
            <div
              className="h-full rounded-full bg-gold transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((summary.todayMinutes / 480) * 100))}%` }}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={formatMins(summary.todayMinutes)} hint="Logged today" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="This Week" value={formatMins(summary.weekMinutes)} hint="Current 7-day window" icon={<CalendarCheck className="h-4 w-4" />} />
        <StatCard label="This Month" value={formatMins(summary.monthMinutes)} hint={`${formatMins(billableMinutes)} billable`} icon={<Play className="h-4 w-4" />} />
        <StatCard label="Approved Hours" value={formatMins(summary.approvedMinutes)} hint={`${entries.length} total entries (${formatMins(totalMinutes)})`} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {tab === 'weekly' && (
        <Card>
          <CardHeader
            title="Weekly Timesheet (Mon – Sun)"
            description="Daily hour breakdown by Project & Task, with Regular vs Overtime (>8h/day)."
            action={
              savedEntries.length > 0 ? (
                <Button size="sm" onClick={() => void handleSubmitAllSaved()}>
                  <Send className="h-3.5 w-3.5" /> Submit {savedEntries.length} Drafts
                </Button>
              ) : undefined
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Project / Task</th>
                  {weekDays.map((d) => (
                    <th key={d.iso} className="px-3 py-3 text-center">
                      {d.label}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-right">Week Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {weeklyRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-xs text-muted">
                      No hours logged this week yet. Start the timer or log manual time above.
                    </td>
                  </tr>
                ) : (
                  weeklyRows.map((row) => (
                    <tr key={`${row.label}-${row.sub}`} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-ink">{row.label}</p>
                        <p className="text-xs text-muted">{row.sub}</p>
                      </td>
                      {weekDays.map((d) => {
                        const mins = row.days[d.iso] ?? 0;
                        return (
                          <td key={d.iso} className="px-3 py-3.5 text-center font-mono text-xs">
                            {mins > 0 ? (
                              <span className="rounded-md bg-gold/15 px-2 py-0.5 font-semibold text-gold-strong dark:text-gold">
                                {formatMins(mins)}
                              </span>
                            ) : (
                              <span className="text-muted/50">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-5 py-3.5 text-right font-mono text-xs font-bold text-ink">
                        {formatMins(row.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {weeklyRows.length > 0 && (
                <tfoot className="border-t-2 border-line bg-canvas/50 text-xs font-semibold">
                  <tr>
                    <td className="px-5 py-3 text-muted">Daily Total (OT &gt; 8h)</td>
                    {weekDays.map((d) => {
                      const daySum = weeklyRows.reduce((s, r) => s + (r.days[d.iso] ?? 0), 0);
                      const ot = Math.max(0, daySum - 480);
                      return (
                        <td key={d.iso} className="px-3 py-3 text-center font-mono">
                          <span className="text-ink">{daySum > 0 ? formatMins(daySum) : '—'}</span>
                          {ot > 0 && (
                            <span className="block text-[10px] text-warning">+{formatMins(ot)} OT</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-5 py-3 text-right font-mono text-gold-strong dark:text-gold">
                      {formatMins(weeklyRows.reduce((s, r) => s + r.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Recent time entries"
          description="Logged timer and manual entries across projects. Submit saved entries for manager approval."
        />
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Person</th>
                  <th className="px-5 py-3">Project, Task & Note</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Billable</th>
                  <th className="px-5 py-3 text-right">Duration</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((entry) => {
                  const st = entry.status ?? (entry.endedAt ? 'SAVED' : 'RUNNING');
                  const canSubmit = Boolean(entry.endedAt) && (st === 'SAVED' || st === 'REJECTED' || st === 'REVISION_REQUIRED');
                  return (
                    <tr key={entry.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5 font-medium">{entry.userName}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-ink">
                          {entry.projectName}
                          {entry.taskTitle ? ` · ${entry.taskTitle}` : ''}
                        </p>
                        <p className="text-xs text-muted">{entry.note}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone="neutral">{entry.workCategory ?? 'Development'}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={statusTone(st)}>{st}</Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={entry.billable ? 'success' : 'neutral'}>
                          {entry.billable ? 'Billable' : 'Internal'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs font-semibold">
                        {entry.endedAt ? `${entry.durationMinutes} min` : st === 'PAUSED' ? 'Paused' : 'Running…'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {canSubmit ? (
                          <Button size="sm" variant="secondary" onClick={() => handleSubmitEntry(entry.id)}>
                            <Send className="h-3.5 w-3.5" /> Submit
                          </Button>
                        ) : st === 'APPROVED' ? (
                          <span className="text-xs text-success font-medium">Locked</span>
                        ) : (
                          <span className="text-xs text-muted">{entry.source}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={switchOpen} title="Switch active task" onClose={() => setSwitchOpen(false)}>
        <form onSubmit={handleSwitch} className="space-y-4">
          <Field label="Next Project" htmlFor="sw-prj">
            <Select
              id="sw-prj"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setTaskId('');
              }}
            >
              <option value="">General Project Work</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ` : ''}{p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next Task" htmlFor="sw-tsk">
            <Select id="sw-tsk" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">General Task</option>
              {filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work Category" htmlFor="sw-cat">
            <Select id="sw-cat" value={workCategory} onChange={(e) => setWorkCategory(e.target.value)}>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="sw-note">
            <Input
              id="sw-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you switching to?"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setSwitchOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Stop current &amp; start next</Button>
          </div>
        </form>
      </Modal>

      <Modal open={manualOpen} title="Log manual time entry" onClose={() => setManualOpen(false)}>
        <form onSubmit={handleManual} className="space-y-4">
          <Field label="Project" htmlFor="mn-prj">
            <Select
              id="mn-prj"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setTaskId('');
              }}
            >
              <option value="">General Project Work</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ` : ''}{p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Task" htmlFor="mn-tsk">
            <Select id="mn-tsk" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">General Task</option>
              {filteredTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work Category" htmlFor="mn-cat">
            <Select id="mn-cat" value={workCategory} onChange={(e) => setWorkCategory(e.target.value)}>
              {WORK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (minutes)" htmlFor="mn-min">
            <Input
              id="mn-min"
              type="number"
              min={1}
              max={720}
              required
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </Field>
          <Field label="Reason / Work description" htmlFor="mn-note">
            <Input
              id="mn-note"
              required
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Reason for manual entry & what was completed"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="rounded border-line"
            />
            Billable hours
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save time entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 2. ATTENDANCE PAGE (/attendance) ────────────────────────────────────────

interface AttendanceRow {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  workDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  onBreak: boolean;
  breakMinutes: number;
  workedMinutes?: number;
  isLate: boolean;
  notes: string;
  projectId?: string | null;
  projectName?: string | null;
  workMode?: 'OFFICE' | 'REMOTE' | 'FIELD';
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationLabel?: string | null;
  deviceType?: string | null;
  geofenceStatus?: 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'REMOTE_APPROVED' | 'NO_GPS';
  distanceMeters?: number | null;
  geofenceExitAt?: string | null;
  geofenceBreaches?: Array<{ id: string; exitAt: string; returnAt: string | null; minutesOutside: number | null; unauthorized: boolean }>;
  shortLeaveId?: string | null;
}

interface LiveBoardMember {
  userId: string;
  userName: string;
  userRole: string;
  clockInAt: string | null;
  onBreak: boolean;
  breakMinutes?: number;
  projectId?: string | null;
  projectName?: string | null;
  notes?: string;
  deviceType?: string | null;
  workMode: 'OFFICE' | 'REMOTE' | 'FIELD';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  locationLabel: string | null;
  geofenceStatus?: 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'REMOTE_APPROVED' | 'NO_GPS';
  distanceMeters?: number | null;
  lastLocationAt?: string | null;
  locationTrail?: Array<{ lat: number; lon: number; at: string }>;
  tracked?: boolean;
  outsideSince?: string | null;
  unauthorizedToday?: number;
  exitsToday?: number;
  trackingLost?: boolean;
}

interface AttendanceRulesPayload {
  roles: string[];
  radiusMeters: number;
  graceMinutes: number;
  lateAfter: string;
  reminderTimes: string[];
}

/** Server messages carry a machine prefix (e.g. "OUTSIDE_ZONE: …"); show only the sentence. */
const cleanApiMessage = (msg: string) => msg.replace(/^[A-Z_]+:\s*/, '');

interface SriLankaPayrollRow {
  userId: string;
  userName: string;
  hourlyLkr?: number;
  salaryConfigured?: boolean;
  monthlyBasicSalaryLkr?: number;
  fixedAllowancesLkr?: number;
  epfNumber?: string;
  nicNumber?: string;
  bankName?: string;
  bankBranch?: string;
  bankAccountNo?: string;
  regHours: number;
  ot15Hours: number;
  ot20Hours: number;
  basePay: number;
  otPay: number;
  grossLkr: number;
  epfEmployee8: number;
  epfEmployer12: number;
  etfEmployer3: number;
  apitTaxLkr?: number;
  netPayLkr: number;
  daysWorked: number;
}

function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

function formatShiftHms(clockInAt?: string | null, breakMinutes = 0, clockOutAt?: string | null): string {
  if (!clockInAt) return '00:00:00';
  const endMs = clockOutAt ? Date.parse(clockOutAt) : Date.now();
  const netSec = Math.max(0, Math.floor((endMs - Date.parse(clockInAt)) / 1000) - breakMinutes * 60);
  const h = Math.floor(netSec / 3600);
  const m = Math.floor((netSec % 3600) / 60);
  const s = netSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function AttendanceView() {
  const { user, can } = useAuth();
  const toast = useToast();
  const canKiosk = can(PERMISSIONS.TIME_APPROVE);
  const [todayRecord, setTodayRecord] = useState<AttendanceRow | null>(null);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [liveBoard, setLiveBoard] = useState<LiveBoardMember[]>([]);
  const [payrollRows, setPayrollRows] = useState<SriLankaPayrollRow[]>([]);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
  const [projectsList, setProjectsList] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [officeGeofence, setOfficeGeofence] = useState<{
    latitude: number;
    longitude: number;
    radiusMeters: number;
    trackedRadiusMeters?: number;
  }>({ latitude: 6.9271, longitude: 79.8612, radiusMeters: 250 });
  const [rules, setRules] = useState<AttendanceRulesPayload | null>(null);
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; companyId: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [workMode, setWorkMode] = useState<'OFFICE' | 'REMOTE' | 'FIELD'>('OFFICE');
  const [error, setError] = useState<string | null>(null);
  const [kioskOpen, setKioskOpen] = useState(false);
  const [kioskUserId, setKioskUserId] = useState('');
  const [kioskAction, setKioskAction] = useState<'CLOCK_IN' | 'BREAK' | 'CLOCK_OUT'>('CLOCK_IN');

  // Jibble UX state: live 1s clock tick, pre-clock-in GPS probe, roster filter & focused map pin
  const [, setClockTick] = useState(0);
  const [gpsPreview, setGpsPreview] = useState<{
    checking: boolean;
    lat?: number;
    lon?: number;
    acc?: number;
    dist?: number;
    denied?: boolean;
  }>({ checking: false });
  const [rosterFilter, setRosterFilter] = useState<'ALL' | 'IN' | 'BREAK' | 'OUTSIDE' | 'OUT'>('ALL');
  const [rosterQuery, setRosterQuery] = useState('');
  const [focusedUserId, setFocusedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSilentRefresh()) setLoading(true);
    try {
      const [res, org, payroll] = await Promise.all([
        api<{
          todayRecord: AttendanceRow | null;
          records: AttendanceRow[];
          liveBoard?: LiveBoardMember[];
          googleMapsApiKey?: string;
          projects?: Array<{ id: string; code: string; name: string }>;
          officeGeofence?: { latitude: number; longitude: number; radiusMeters: number; trackedRadiusMeters?: number };
          rules?: AttendanceRulesPayload;
        }>('/attendance'),
        api<{ employees?: Array<{ id: string; fullName: string; companyId: string | null }> }>('/organization').catch(() => ({ employees: [] })),
        api<{ currency: string; rows: SriLankaPayrollRow[] }>('/workforce/sri-lanka-payroll').catch(() => ({ currency: 'LKR', rows: [] })),
      ]);
      setTodayRecord(res.todayRecord);
      if (res.todayRecord?.projectId) {
        setSelectedProjectId(res.todayRecord.projectId);
      }
      setRecords(res.records);
      setLiveBoard(Array.isArray(res.liveBoard) ? res.liveBoard : []);
      if (typeof res.googleMapsApiKey === 'string') setGoogleMapsApiKey(res.googleMapsApiKey);
      if (Array.isArray(res.projects)) setProjectsList(res.projects);
      setPayrollRows(Array.isArray(payroll?.rows) ? payroll.rows : []);
      if (res.officeGeofence) setOfficeGeofence(res.officeGeofence);
      if (res.rules) setRules(res.rules);
      const emps = Array.isArray(org?.employees) ? org.employees : [];
      setEmployees(emps);
      if (emps.length > 0) setKioskUserId((prev) => prev || emps[0].id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  const isClockedInActive = Boolean(todayRecord?.clockInAt && !todayRecord?.clockOutAt);
  const iAmTracked = Boolean(user?.role && rules?.roles.includes(user.role));

  // Tick Jibble shift clock every second while clocked in and not on break
  useEffect(() => {
    if (!isClockedInActive || todayRecord?.onBreak) return;
    const id = setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isClockedInActive, todayRecord?.onBreak]);

  const probeMyGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setGpsPreview((p) => ({ ...p, checking: true, denied: false }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lon = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);
        const dist = calcDistanceMeters(lat, lon, officeGeofence.latitude, officeGeofence.longitude);
        setGpsPreview({ checking: false, lat, lon, acc, dist, denied: false });
      },
      () => {
        setGpsPreview({ checking: false, denied: true });
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
    );
  }, [officeGeofence.latitude, officeGeofence.longitude]);

  useEffect(() => {
    if (!isClockedInActive && workMode !== 'REMOTE') {
      probeMyGps();
    }
  }, [isClockedInActive, probeMyGps, workMode]);

  useEffect(() => {
    const refreshId = setInterval(() => {
      void api<{ liveBoard?: LiveBoardMember[]; googleMapsApiKey?: string }>('/attendance')
        .then((res) => {
          if (Array.isArray(res?.liveBoard)) setLiveBoard(res.liveBoard);
          if (typeof res?.googleMapsApiKey === 'string') setGoogleMapsApiKey(res.googleMapsApiKey);
        })
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(refreshId);
  }, []);

  async function doClockIn() {
    setError(null);
    try {
      const gps = workMode === 'REMOTE' && !iAmTracked ? null : await captureBrowserGps();
      if (!gps && iAmTracked) {
        setError('Turn on location for this site, then try again — you must be inside the office area to clock in.');
        return;
      }
      await post('/attendance/clock-in', {
        notes,
        workMode,
        projectId: selectedProjectId || undefined,
        deviceType: typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile Web' : 'Desktop Web',
        ...(gps
          ? {
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracyMeters: gps.accuracyMeters,
            locationLabel: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`,
          }
          : {}),
      });
      setNotes('');
      toast.success('Clocked in! Live shift timer started.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? cleanApiMessage(err.message) : 'Could not clock in.');
    }
  }

  async function doSwitchActivity(nextProjectId: string) {
    setSelectedProjectId(nextProjectId);
    if (!isClockedInActive) return;
    try {
      await post('/attendance/switch-activity', { projectId: nextProjectId || null });
      toast.success('Switched active project.');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not switch project.');
    }
  }

  async function doBreak() {
    setError(null);
    try {
      await post('/attendance/break');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not toggle break.');
    }
  }

  async function doClockOut() {
    setError(null);
    try {
      await post('/attendance/clock-out');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not clock out.');
    }
  }

  async function submitKiosk(e: FormEvent) {
    e.preventDefault();
    const target = employees.find((emp) => emp.id === kioskUserId);
    if (!target) return;
    setError(null);
    try {
      const gps = await captureBrowserGps();
      await post('/attendance/kiosk', {
        targetUserId: target.id,
        targetUserName: target.fullName,
        action: kioskAction,
        workMode,
        ...(gps ? { latitude: gps.latitude, longitude: gps.longitude, locationLabel: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` } : {}),
      });
      setKioskOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kiosk action failed.');
    }
  }

  const isClockedIn = Boolean(todayRecord?.clockInAt && !todayRecord?.clockOutAt);
  const effectiveZoneRadius = iAmTracked
    ? (rules?.radiusMeters ?? officeGeofence.trackedRadiusMeters ?? 50)
    : officeGeofence.radiusMeters;

  const workingCount = liveBoard.filter((m) => !m.onBreak && !m.outsideSince).length;
  const breakCount = liveBoard.filter((m) => m.onBreak).length;
  const outsideCount = liveBoard.filter((m) => Boolean(m.outsideSince || m.geofenceStatus === 'OUTSIDE_OFFICE')).length;
  const clockedInIds = new Set(liveBoard.map((m) => m.userId));
  const outMembers = employees.filter((e) => !clockedInIds.has(e.id));

  const filteredLiveBoard = liveBoard.filter((m) => {
    if (rosterFilter === 'IN' && (m.onBreak || m.outsideSince)) return false;
    if (rosterFilter === 'BREAK' && !m.onBreak) return false;
    if (rosterFilter === 'OUTSIDE' && !m.outsideSince && m.geofenceStatus !== 'OUTSIDE_OFFICE') return false;
    if (rosterQuery.trim()) {
      const q = rosterQuery.trim().toLowerCase();
      return (
        m.userName.toLowerCase().includes(q) ||
        (m.projectName ?? '').toLowerCase().includes(q) ||
        m.workMode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Time &amp; Live Location (Jibble Mode)</h2>
          <p className="mt-1 text-sm text-muted">
            Live digital shift clock, project activity tagging, Google Maps geofence verification &amp; Who&apos;s In/Out roster.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canKiosk && employees.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setKioskOpen(true)}>
              Kiosk Mode
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={records.length === 0}
            onClick={() =>
              exportBrandedPdf({
                title: 'Team Attendance & Google Maps GPS Register',
                subtitle: 'Clock-in/out, project activity, work mode, break duration & GPS check-in coordinates',
                generatedByEmail: user?.email,
                generatedByName: user?.fullName,
                kpis: [
                  { label: 'Live Clocked In', value: String(liveBoard.length) },
                  { label: 'Total Records', value: String(records.length) },
                ],
                columns: ['Employee', 'Date', 'Mode / Project', 'Clock In', 'Clock Out', 'Location', 'Breaks'],
                rows: records.map((r) => [
                  r.userName,
                  r.workDate,
                  `${r.workMode ?? 'OFFICE'}${r.projectName ? ` · ${r.projectName}` : ''}`,
                  r.clockInAt
                    ? new Date(r.clockInAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })
                    : '—',
                  r.clockOutAt
                    ? new Date(r.clockOutAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' })
                    : 'Active',
                  r.locationLabel ?? '—',
                  `${r.breakMinutes}m`,
                ]),
              })
            }
          >
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </header>

      {/* Jibble-Style Live Shift Command Bar */}
      <Card className="p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                dot
                tone={
                  todayRecord?.onBreak
                    ? 'warning'
                    : isClockedIn
                      ? 'success'
                      : 'neutral'
                }
              >
                {todayRecord?.onBreak
                  ? 'On Break'
                  : isClockedIn
                    ? 'Clocked In · Working'
                    : 'Clocked Out'}
              </Badge>
              {todayRecord?.workMode && <Badge tone="gold">{todayRecord.workMode}</Badge>}
              {todayRecord?.projectName && <Badge tone="info">{todayRecord.projectName}</Badge>}
              {todayRecord?.isLate && <Badge tone="danger">Late</Badge>}
              {todayRecord?.shortLeaveId && <Badge tone="warning">Short leave (late start)</Badge>}
              <span className="text-xs text-muted">Shift: 08:30 – 17:30 (Asia/Colombo)</span>
            </div>

            <div className="flex flex-wrap items-baseline gap-4">
              <span
                className={cn(
                  'font-mono text-4xl font-bold tracking-tight tabular-nums',
                  todayRecord?.onBreak
                    ? 'text-warning'
                    : isClockedIn
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-ink',
                )}
              >
                {formatShiftHms(todayRecord?.clockInAt, todayRecord?.breakMinutes ?? 0, todayRecord?.clockOutAt)}
              </span>
              <div className="text-xs text-muted">
                {todayRecord?.clockInAt ? (
                  <>
                    In at{' '}
                    <strong className="text-ink">
                      {new Date(todayRecord.clockInAt).toLocaleTimeString('en-LK', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Colombo',
                      })}
                    </strong>
                    {todayRecord.breakMinutes > 0 && ` · Breaks: ${todayRecord.breakMinutes}m`}
                    {todayRecord.locationLabel && ` · 📍 ${todayRecord.locationLabel}`}
                  </>
                ) : (
                  'Tap Clock In to start your shift timer and live location check-in.'
                )}
              </div>
            </div>

            {/* Pre-Clock-In Live GPS Zone Readiness Pill */}
            {!isClockedIn && workMode !== 'REMOTE' && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {gpsPreview.checking ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-3 py-1 text-muted">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Checking live GPS distance to Office HQ…
                  </span>
                ) : gpsPreview.denied ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1 font-medium text-danger">
                    Location access blocked — allow browser GPS to verify office zone
                  </span>
                ) : gpsPreview.dist !== undefined ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium',
                      gpsPreview.dist <= effectiveZoneRadius + Math.min(gpsPreview.acc ?? 20, 40)
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/15 text-warning',
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {gpsPreview.dist <= effectiveZoneRadius + Math.min(gpsPreview.acc ?? 20, 40)
                      ? `Inside Office Zone · ${gpsPreview.dist}m from HQ (±${gpsPreview.acc}m)`
                      : `${gpsPreview.dist}m from HQ (Office zone is ${effectiveZoneRadius}m)`}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={probeMyGps}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink"
                >
                  <RefreshCw className="h-3 w-3" /> Refresh GPS
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isClockedIn ? (
              <>
                {!iAmTracked && (
                  <div className="segmented" role="radiogroup" aria-label="Work mode">
                    {(['OFFICE', 'REMOTE', 'FIELD'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={workMode === m}
                        onClick={() => setWorkMode(m)}
                      >
                        {m === 'OFFICE' ? 'Office' : m === 'REMOTE' ? 'Remote' : 'Field'}
                      </button>
                    ))}
                  </div>
                )}
                <Select
                  aria-label="Project or activity"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-48"
                >
                  <option value="">General Shift / Activity</option>
                  {projectsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ''}{p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Shift note (optional)…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-44"
                />
                <Button onClick={doClockIn}>
                  <LogIn className="h-4 w-4" /> Clock In
                </Button>
              </>
            ) : (
              <>
                <Select
                  aria-label="Switch active project"
                  value={selectedProjectId}
                  onChange={(e) => void doSwitchActivity(e.target.value)}
                  className="w-52"
                >
                  <option value="">General Shift / Activity</option>
                  {projectsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ` : ''}{p.name}
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" onClick={doBreak}>
                  <Coffee className="h-4 w-4" />
                  {todayRecord?.onBreak ? 'End Break' : 'Start Break'}
                </Button>
                <Button variant="danger" onClick={doClockOut}>
                  <LogOut className="h-4 w-4" /> Clock Out
                </Button>
              </>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}
        {iAmTracked && rules && (
          <div className="mt-4 grid gap-3 rounded-2xl bg-ink/[0.03] p-4 text-[13px] dark:bg-white/[0.04] sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Office area</p>
              {isClockedIn ? (
                todayRecord?.geofenceExitAt ? (
                  <p className="mt-0.5 font-semibold text-danger">Outside{todayRecord.distanceMeters != null ? ` · ${todayRecord.distanceMeters} m away` : ''}</p>
                ) : (
                  <p className="mt-0.5 font-semibold text-success">Inside{todayRecord?.distanceMeters != null ? ` · ${todayRecord.distanceMeters} m from office` : ''}</p>
                )
              ) : (
                <p className="mt-0.5 text-ink">Clock in inside {rules.radiusMeters} m of the office</p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Today</p>
              <p className="mt-0.5 text-ink">
                {(todayRecord?.geofenceBreaches ?? []).length} exit(s) ·{' '}
                <span className={(todayRecord?.geofenceBreaches ?? []).some((b) => b.unauthorized) ? 'font-semibold text-danger' : ''}>
                  {(todayRecord?.geofenceBreaches ?? []).filter((b) => b.unauthorized).length} unauthorized
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Rules</p>
              <p className="mt-0.5 text-ink">
                Back within {rules.graceMinutes} min · late after {rules.lateAfter} = short leave
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Jibble Live Who's In / Out Board + Interactive Google Maps */}
      <Card>
        <CardHeader
          title={`Who's In / Out & Google Maps Live Tracking (${liveBoard.length} In)`}
          description="Click any person card to focus their live Google Maps pin, trail, and shift timer."
          badge={<Badge dot tone="success">Google Maps Live</Badge>}
        />
        <div className="px-5 pb-4 sm:px-6">
          <TeamLocationMap
            members={liveBoard}
            officeLat={officeGeofence.latitude}
            officeLon={officeGeofence.longitude}
            radiusMeters={officeGeofence.trackedRadiusMeters ?? officeGeofence.radiusMeters}
            apiKey={googleMapsApiKey}
            focusedUserId={focusedUserId}
            onSelectMember={setFocusedUserId}
          />
        </div>

        {/* Jibble Status Filter Tabs & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { key: 'ALL' as const, label: `All In (${liveBoard.length})` },
              { key: 'IN' as const, label: `Working (${workingCount})` },
              { key: 'BREAK' as const, label: `On Break (${breakCount})` },
              { key: 'OUTSIDE' as const, label: `Outside Zone (${outsideCount})` },
              { key: 'OUT' as const, label: `Out (${outMembers.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRosterFilter(tab.key)}
                className={cn(
                  'rounded-full px-3 py-1 font-semibold transition',
                  rosterFilter === tab.key
                    ? 'bg-gold/20 text-gold-strong dark:text-gold'
                    : 'bg-ink/[0.05] text-muted hover:text-ink dark:bg-white/[0.06]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Input
            value={rosterQuery}
            onChange={(e) => setRosterQuery(e.target.value)}
            placeholder="Filter people or project…"
            className="h-8 w-52 text-xs"
          />
        </div>

        {rosterFilter === 'OUT' ? (
          outMembers.length === 0 ? (
            <div className="px-6 pb-6 text-xs text-muted">Everyone in the directory is clocked in right now!</div>
          ) : (
            <div className="grid gap-2.5 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
              {outMembers
                .filter((e) => !rosterQuery.trim() || e.fullName.toLowerCase().includes(rosterQuery.trim().toLowerCase()))
                .map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line/60 bg-canvas/40 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={e.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">{e.fullName}</p>
                        <p className="font-mono text-[10.5px] text-muted">{e.companyId ?? 'Staff'}</p>
                      </div>
                    </div>
                    <Badge tone="neutral">Out</Badge>
                  </div>
                ))}
            </div>
          )
        ) : filteredLiveBoard.length === 0 ? (
          <div className="px-6 pb-6 text-xs text-muted">
            No team members match this live status filter right now.
          </div>
        ) : (
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 sm:px-6">
            {filteredLiveBoard.map((m) => {
              const selected = focusedUserId === m.userId;
              return (
                <div
                  key={m.userId}
                  onClick={() => setFocusedUserId(selected ? null : m.userId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setFocusedUserId(selected ? null : m.userId);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 transition hover:-translate-y-0.5',
                    selected
                      ? 'border-gold bg-gold/10 shadow-sm'
                      : 'border-transparent bg-ink/[0.04] hover:border-line dark:bg-white/[0.06]',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={m.userName} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{m.userName}</p>
                      <p className="text-[11px] text-muted">
                        In{' '}
                        {m.clockInAt
                          ? new Date(m.clockInAt).toLocaleTimeString('en-LK', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Colombo',
                          })
                          : '—'}{' '}
                        · {m.workMode}
                        {m.projectName ? ` · ${m.projectName}` : ''}
                      </p>
                      {m.locationLabel && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                          <MapPin className="h-3 w-3 shrink-0 text-gold-strong dark:text-gold" />
                          {m.latitude !== null && m.longitude !== null ? (
                            <a
                              href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              className="truncate text-info hover:underline"
                            >
                              {m.locationLabel}
                              {m.distanceMeters != null ? ` (${m.distanceMeters}m)` : ''}
                            </a>
                          ) : (
                            <span className="truncate">{m.locationLabel}</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-xs font-bold tabular-nums text-ink">
                      {formatShiftHms(m.clockInAt, m.breakMinutes ?? 0)}
                    </span>
                    <Badge tone={m.onBreak ? 'warning' : m.outsideSince ? 'danger' : 'success'}>
                      {m.onBreak ? 'Break' : m.outsideSince ? 'Outside' : 'Working'}
                    </Badge>
                    {(m.unauthorizedToday ?? 0) > 0 && (
                      <Badge tone="danger">{m.unauthorizedToday} unauthorized</Badge>
                    )}
                    {m.trackingLost && <Badge tone="warning">Tracking stopped</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AttendanceCalendar people={employees} />

      <Card>
        <CardHeader title="Team attendance log" description="Daily clock-in, GPS location, break and clock-out register." />
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Team member</th>
                  <th className="px-5 py-3">Date &amp; Mode</th>
                  <th className="px-5 py-3">Clock In</th>
                  <th className="px-5 py-3">Clock Out</th>
                  <th className="px-5 py-3">Live Location</th>
                  <th className="px-5 py-3">Breaks</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted">
                      No team attendance records logged yet today.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5 font-medium">
                          <Avatar name={rec.userName} size="sm" />
                          <span>{rec.userName}</span>
                          {rec.isLate && <Badge tone="danger">Late</Badge>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className="font-mono">{rec.workDate}</span>
                        {rec.workMode && (
                          <Badge tone="neutral" className="ml-2">{rec.workMode}</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {rec.clockInAt
                          ? new Date(rec.clockInAt).toLocaleTimeString('en-LK', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Colombo',
                          })
                          : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {rec.clockOutAt ? (
                          new Date(rec.clockOutAt).toLocaleTimeString('en-LK', {
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Asia/Colombo',
                          })
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {rec.latitude != null && rec.longitude != null ? (
                            <a
                              href={`https://maps.google.com/?q=${rec.latitude},${rec.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-info hover:underline"
                            >
                              <MapPin className="h-3 w-3" />
                              {rec.locationLabel ?? `${rec.latitude.toFixed(4)}, ${rec.longitude.toFixed(4)}`}
                            </a>
                          ) : (
                            <span className="text-muted">{rec.locationLabel ?? '—'}</span>
                          )}
                          {rec.geofenceStatus === 'INSIDE_OFFICE' && (
                            <Badge tone="success">
                              In Zone{rec.distanceMeters != null ? ` (${rec.distanceMeters}m)` : ''}
                            </Badge>
                          )}
                          {rec.geofenceStatus === 'OUTSIDE_OFFICE' && (
                            <Badge tone="warning">
                              Outside Zone{rec.distanceMeters != null ? ` (${rec.distanceMeters}m)` : ''}
                            </Badge>
                          )}
                          {rec.geofenceStatus === 'REMOTE_APPROVED' && (
                            <Badge tone="info">Remote</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">{rec.breakMinutes}m</td>
                      <td className="px-5 py-3.5 text-xs text-muted">{rec.notes}</td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Sri Lanka OT (1.5x / 2x) + EPF (8%/12%), ETF (3%) & IRD APIT Payroll Summary */}
      <Card>
        <CardHeader
          title="Sri Lanka OT, EPF, ETF & APIT Payroll Engine"
          description="Regular, 1.5x Weekday OT, 2.0x Weekend/Poya OT, EPF (8%/12%), ETF (3%), IRD APIT Tax & statutory bank exports."
          action={
            payrollRows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const csv = [
                      'EPF No,Employee Name,NIC,Basic Earnings (LKR),EPF Employee 8%,EPF Employer 12%,Total EPF 20%',
                      ...payrollRows.map((p) =>
                        [
                          p.epfNumber || 'PENDING',
                          `"${p.userName}"`,
                          p.nicNumber || '',
                          p.basePay,
                          p.epfEmployee8,
                          p.epfEmployer12,
                          p.epfEmployee8 + p.epfEmployer12,
                        ].join(','),
                      ),
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `yakunex-epf-c-form-${new Date().toISOString().slice(0, 7)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> EPF C-Form
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const csv = [
                      'ETF/EPF No,Employee Name,NIC,Basic Earnings (LKR),ETF Employer 3%',
                      ...payrollRows.map((p) =>
                        [p.epfNumber || 'PENDING', `"${p.userName}"`, p.nicNumber || '', p.basePay, p.etfEmployer3].join(','),
                      ),
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `yakunex-etf-r-form-${new Date().toISOString().slice(0, 7)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> ETF R-Form
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const csv = [
                      'Bank Name,Branch,Account No,Beneficiary Name,Net Salary (LKR),Reference',
                      ...payrollRows.map((p) =>
                        [
                          `"${p.bankName || 'Commercial Bank'}"`,
                          `"${p.bankBranch || 'Colombo'}"`,
                          p.bankAccountNo || 'PENDING',
                          `"${p.userName}"`,
                          p.netPayLkr,
                          `SALARY-${new Date().toISOString().slice(0, 7)}`,
                        ].join(','),
                      ),
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `yakunex-slips-payroll-${new Date().toISOString().slice(0, 7)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> Bank SLIPS
                </Button>
              </div>
            ) : undefined
          }
        />
        {payrollRows.length === 0 ? (
          <p className="px-6 pb-6 text-xs text-muted">
            Log time entries in Time Tracker to generate live Sri Lanka OT, EPF, ETF &amp; APIT payroll breakdowns.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-4 py-3 text-right">Reg / 1.5x / 2x (h)</th>
                  <th className="px-4 py-3 text-right">Gross (LKR)</th>
                  <th className="px-4 py-3 text-right">EPF 8% / 12%</th>
                  <th className="px-4 py-3 text-right">ETF 3%</th>
                  <th className="px-4 py-3 text-right">APIT Tax</th>
                  <th className="px-4 py-3 text-right">Net Pay (LKR)</th>
                  <th className="px-5 py-3 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payrollRows.map((p) => (
                  <tr key={p.userId} className="hover:bg-canvas/40">
                    <td className="px-5 py-3 font-medium text-ink">
                      {p.userName}
                      <span className="ml-2 text-xs text-muted">({p.daysWorked}d)</span>
                      {p.salaryConfigured === false && (
                        <span className="ml-2 text-xs font-semibold text-warning">Salary not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {p.regHours}h / <span className="text-warning">{p.ot15Hours}h</span> /{' '}
                      <span className="text-gold-strong dark:text-gold">{p.ot20Hours}h</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      LKR {p.grossLkr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                      -{p.epfEmployee8.toLocaleString()} / +{p.epfEmployer12.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                      +{p.etfEmployer3.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-danger">
                      {p.apitTaxLkr ? `-${p.apitTaxLkr.toLocaleString()}` : '0'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold text-ink">
                      LKR {p.netPayLkr.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          exportBrandedPdf({
                            title: `Sri Lanka Payslip — ${p.userName}`,
                            subtitle: 'Yakunex Technologies · OT (1.5x/2x), EPF (8%/12%), ETF (3%) & IRD APIT Statement',
                            generatedByEmail: user?.email,
                            generatedByName: user?.fullName,
                            kpis: [
                              { label: 'Gross Pay', value: `LKR ${p.grossLkr.toLocaleString()}` },
                              { label: 'EPF (8%) + APIT', value: `-LKR ${(p.epfEmployee8 + (p.apitTaxLkr ?? 0)).toLocaleString()}` },
                              { label: 'Employer EPF+ETF (15%)', value: `LKR ${(p.epfEmployer12 + p.etfEmployer3).toLocaleString()}` },
                              { label: 'Net Take-Home', value: `LKR ${p.netPayLkr.toLocaleString()}` },
                            ],
                            columns: ['Component', 'Detail', 'Amount (LKR)'],
                            rows: [
                              ['Regular Hours', `${p.regHours}h @ LKR ${(p.hourlyLkr ?? 0).toLocaleString()}/hr`, p.basePay.toLocaleString()],
                              ['Overtime (1.5x Weekday + 2.0x Weekend/Poya)', `${p.ot15Hours}h + ${p.ot20Hours}h`, p.otPay.toLocaleString()],
                              ...(p.fixedAllowancesLkr ? [['Fixed Allowances', 'Monthly allowance', p.fixedAllowancesLkr.toLocaleString()]] : []),
                              ['Gross Earnings', `${(p.regHours + p.ot15Hours + p.ot20Hours).toFixed(2)}h total`, p.grossLkr.toLocaleString()],
                              ['EPF Employee Deduction (8%)', p.epfNumber ? `EPF #${p.epfNumber}` : 'Statutory deduction', `-${p.epfEmployee8.toLocaleString()}`],
                              ['IRD APIT Income Tax', 'Sri Lanka progressive slab', `-${(p.apitTaxLkr ?? 0).toLocaleString()}`],
                              ['EPF Employer Contribution (12%)', 'Company statutory', p.epfEmployer12.toLocaleString()],
                              ['ETF Employer Contribution (3%)', 'Company statutory', p.etfEmployer3.toLocaleString()],
                              ['Net Payable Salary', p.bankName ? `${p.bankName} ${p.bankAccountNo || ''}` : 'Bank SLIPS transfer', p.netPayLkr.toLocaleString()],
                            ],
                          })
                        }
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={kioskOpen} title="Workforce Kiosk — Team Clock-In / Out" onClose={() => setKioskOpen(false)}>
        <form onSubmit={submitKiosk} className="space-y-4">
          <Field label="Employee" htmlFor="ksk-emp">
            <Select id="ksk-emp" value={kioskUserId} onChange={(e) => setKioskUserId(e.target.value)}>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.companyId ? `${emp.companyId} · ` : ''}{emp.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Action" htmlFor="ksk-act">
            <Select id="ksk-act" value={kioskAction} onChange={(e) => setKioskAction(e.target.value as typeof kioskAction)}>
              <option value="CLOCK_IN">Clock In (GPS)</option>
              <option value="BREAK">Toggle Break</option>
              <option value="CLOCK_OUT">Clock Out</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setKioskOpen(false)}>Cancel</Button>
            <Button type="submit">Confirm Kiosk Action</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 3. LEAVE PAGE (/leave) ──────────────────────────────────────────────────

interface LeaveRow {
  id: string;
  userId: string;
  userName: string;
  type: 'ANNUAL' | 'SICK' | 'UNPAID' | 'OTHER' | 'SHORT';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approverName: string | null;
  decisionNote: string | null;
}

interface LeaveSummaryPayload {
  isIntern?: boolean;
  maxTotalDays?: number;
  totalUsed?: number;
  totalRemaining?: number;
  entitlements: {
    annual: { total: number; used: number; remaining: number };
    casual: { total: number; used: number; remaining: number };
    medical: { total: number; used: number; remaining: number };
  };
  holidays2026: Array<{ date: string; name: string; type: string }>;
  shortLeavesThisMonth?: number;
}

export function LeaveView() {
  const { user, can } = useAuth();
  const toast = useToast();
  const canApprove = can(PERMISSIONS.LEAVE_APPROVE);
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const [type, setType] = useState<LeaveRow['type']>('ANNUAL');
  const [startDate, setStartDate] = useState('2026-11-26');
  const [endDate, setEndDate] = useState('2026-11-27');
  const [days, setDays] = useState('2');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!isSilentRefresh()) setLoading(true);
    try {
      const [reqs, summary] = await Promise.all([
        api<LeaveRow[]>('/leave'),
        api<LeaveSummaryPayload>('/leave/summary').catch(() => null),
      ]);
      setRequests(reqs);
      if (summary) setLeaveSummary(summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  // Auto-calculate Sri Lanka working days (skipping Sat/Sun & 2026 Poya/Mercantile holidays)
  useEffect(() => {
    if (!startDate || !endDate) return;
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return;
    const holidaySet = new Set((leaveSummary?.holidays2026 ?? []).map((h) => h.date));
    let workingDays = 0;
    const cur = new Date(start);
    let guard = 0;
    while (cur <= end && guard < 90) {
      const dow = cur.getUTCDay();
      const iso = cur.toISOString().slice(0, 10);
      if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) {
        workingDays += 1;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
      guard += 1;
    }
    if (workingDays > 0) setDays(String(workingDays));
  }, [startDate, endDate, leaveSummary]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLeaveError(null);
    try {
      await post('/leave', { type, startDate, endDate, days: Number(days), reason });
      setModalOpen(false);
      setReason('');
      await load();
    } catch (err) {
      setLeaveError(err instanceof ApiError ? err.message : 'Unable to submit leave request.');
    }
  }

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await patch(`/leave/${id}/decision`, { status });
      toast.success(`Leave request ${status.toLowerCase()}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to update leave decision.');
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Leave Management</h2>
          <p className="mt-1 text-sm text-muted">
            Annual, medical and study leave requests with manager approval workflow.
          </p>
        </div>
        <Button
          onClick={() => {
            setLeaveError(null);
            setModalOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Request leave
        </Button>
      </header>

      {(leaveSummary?.isIntern || user?.role === 'INTERN') && (
        <div className="rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-ink">
          <strong className="text-gold-strong dark:text-gold">Intern Leave Policy (10 Days Max):</strong>{' '}
          Interns are entitled to a maximum of <strong>10 total leave days</strong> ({leaveSummary?.totalRemaining ?? 10} day(s) remaining).
          {' '}Starting work after 08:30 is recorded as a <strong>short leave</strong>
          {typeof leaveSummary?.shortLeavesThisMonth === 'number' ? ` (${leaveSummary.shortLeavesThisMonth} this month)` : ''}.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Annual Leave"
          value={`${leaveSummary?.entitlements.annual.remaining ?? 14} / ${leaveSummary?.entitlements.annual.total ?? 14}d`}
          hint={`${leaveSummary?.entitlements.annual.used ?? 0}d used this year`}
          icon={<Plane className="h-4 w-4" />}
        />
        <StatCard
          label="Casual Leave"
          value={`${leaveSummary?.entitlements.casual.remaining ?? 7} / ${leaveSummary?.entitlements.casual.total ?? 7}d`}
          hint={`${leaveSummary?.entitlements.casual.used ?? 0}d used this year`}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Sick / Medical Leave"
          value={`${leaveSummary?.entitlements.medical.remaining ?? 7} / ${leaveSummary?.entitlements.medical.total ?? 7}d`}
          hint={`${leaveSummary?.entitlements.medical.used ?? 0}d used this year`}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Pending Approvals"
          value={requests.filter((r) => r.status === 'PENDING').length}
          hint="Awaiting review"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {leaveSummary && leaveSummary.holidays2026.length > 0 && (
        <Card>
          <CardHeader
            title="Sri Lanka 2026 Poya & Mercantile Holidays"
            description="Official non-working calendar dates excluded from leave deductions."
            badge={<Badge tone="gold">{leaveSummary.holidays2026.length} Dates</Badge>}
          />
          <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            {leaveSummary.holidays2026.slice(0, 12).map((h) => (
              <div
                key={`${h.date}-${h.name}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas/50 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{h.name}</p>
                  <p className="font-mono text-[11px] text-muted">{h.date}</p>
                </div>
                <Badge tone={h.type === 'POYA' ? 'gold' : 'neutral'}>{h.type}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Leave requests" description="Submitted leave applications and approval decisions." />
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Type & Dates</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-xs text-muted">
                      No leave requests submitted yet.
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3.5 font-medium">{req.userName}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={req.type === 'SHORT' ? 'warning' : 'neutral'}>{req.type === 'SHORT' ? 'Short leave' : req.type}</Badge>
                        <p className="mt-1 text-xs text-muted">
                          {req.startDate} → {req.endDate} ({req.days}d)
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted">
                        <p>{req.reason}</p>
                        {req.approverName && (
                          <p className="mt-0.5 text-[11px] text-ink">
                            Decided by {req.approverName}: {req.decisionNote}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge
                          tone={
                            req.status === 'APPROVED'
                              ? 'success'
                              : req.status === 'REJECTED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {req.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {canApprove && req.status === 'PENDING' && (
                          <div className="inline-flex gap-2">
                            <Button size="sm" onClick={() => decide(req.id, 'APPROVED')}>
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => decide(req.id, 'REJECTED')}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} title="Request leave" onClose={() => setModalOpen(false)}>
        <form onSubmit={onCreate} className="space-y-4">
          {leaveError && (
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {leaveError}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Leave type" htmlFor="lv-type">
              <Select
                id="lv-type"
                value={type}
                onChange={(e) => setType(e.target.value as LeaveRow['type'])}
              >
                <option value="ANNUAL">Annual Leave</option>
                <option value="SICK">Sick / Medical Leave</option>
                <option value="UNPAID">Unpaid Leave</option>
                <option value="OTHER">Study / Exam Leave</option>
              </Select>
            </Field>
            <Field label="Number of days" htmlFor="lv-days">
              <Input
                id="lv-days"
                type="number"
                step="0.5"
                min="0.5"
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="lv-start">
              <Input
                id="lv-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date" htmlFor="lv-end">
              <Input
                id="lv-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason" htmlFor="lv-reason">
            <Input
              id="lv-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason and handover coverage"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── 4. INTERNS PAGE (/interns) ──────────────────────────────────────────────

interface InternRow {
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

export function InternsView() {
  const { user } = useAuth();
  const canEvaluate = user?.role !== 'INTERN';
  const [interns, setInterns] = useState<InternRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evalTarget, setEvalTarget] = useState<InternRow | null>(null);
  const [period, setPeriod] = useState('2026-Month-3');
  const [score, setScore] = useState('5');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSilentRefresh()) setLoading(true);
    try {
      setInterns(await api<InternRow[]>('/interns'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveSync(load);

  async function toggleTask(internId: string, taskId: string) {
    setError(null);
    try {
      await patch(`/interns/${internId}/tasks/${taskId}`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update training task.');
    }
  }

  async function onAddEvaluation(e: FormEvent) {
    e.preventDefault();
    if (!evalTarget) return;
    setError(null);
    try {
      await post(`/interns/${evalTarget.id}/evaluations`, {
        period,
        score: Number(score),
        strengths,
        improvements,
        feedback,
      });
      setEvalTarget(null);
      setStrengths('');
      setImprovements('');
      setFeedback('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit evaluation.');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Internship & Mentorship</h2>
        <p className="mt-1 text-sm text-muted">
          University intern onboarding, structured weekly training plans and mentor evaluations.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-xs text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : interns.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <GraduationCap className="mx-auto h-10 w-10 text-muted/60 mb-3" />
          <p className="font-semibold text-ink text-base">No intern profiles active</p>
          <p className="text-sm mt-1">Interns added to the workspace will appear here with structured training milestones.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {interns.map((intern) => (
            <Card key={intern.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 text-gold">
                    <GraduationCap className="h-6 w-6" />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold">{intern.fullName}</h3>
                    <p className="text-sm text-muted">
                      {intern.university} · {intern.programme}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Mentor: <strong className="text-ink">{intern.mentorName}</strong> · Placement:{' '}
                      {intern.startDate} → {intern.endDate}
                    </p>
                  </div>
                </div>
                {canEvaluate && (
                  <Button size="sm" onClick={() => setEvalTarget(intern)}>
                    <Star className="h-4 w-4" /> Add evaluation
                  </Button>
                )}
              </div>

              <div className="mt-5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-muted">Training plan completion</span>
                  <span className="font-semibold">{intern.progressPercent}%</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-gold transition-all"
                    style={{ width: `${intern.progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Structured Training Plan</h4>
                  <ul className="mt-3 space-y-2">
                    {intern.trainingTasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => toggleTask(intern.id, task.id)}
                          className="flex w-full items-center gap-3 rounded-xl border border-line bg-canvas/40 px-3.5 py-2.5 text-left text-xs transition-colors hover:border-gold/50"
                        >
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                              task.completed
                                ? 'border-success bg-success text-white'
                                : 'border-line bg-surface',
                            )}
                          >
                            {task.completed && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="font-mono text-muted">W{task.weekNumber}</span>
                          <span className={cn('flex-1', task.completed && 'line-through text-muted')}>
                            {task.title}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-ink">Mentor Evaluations</h4>
                  <div className="mt-3 space-y-3">
                    {intern.evaluations.map((ev) => (
                      <div key={ev.id} className="rounded-xl border border-line bg-canvas/40 p-4 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">
                            {ev.period} · Evaluated by {ev.evaluatorName}
                          </span>
                          <Badge tone="gold">Score {ev.score} / 5</Badge>
                        </div>
                        <p className="mt-2 text-muted">
                          <strong className="text-ink">Strengths:</strong> {ev.strengths}
                        </p>
                        <p className="mt-1 text-muted">
                          <strong className="text-ink">Growth areas:</strong> {ev.improvements}
                        </p>
                        <p className="mt-1 text-muted">{ev.feedback}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(evalTarget)}
        title={evalTarget ? `Evaluate ${evalTarget.fullName}` : 'Add evaluation'}
        onClose={() => setEvalTarget(null)}
      >
        <form onSubmit={onAddEvaluation} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Review period" htmlFor="ev-period">
              <Input
                id="ev-period"
                required
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </Field>
            <Field label="Score (1–5)" htmlFor="ev-score">
              <Select id="ev-score" value={score} onChange={(e) => setScore(e.target.value)}>
                <option value="5">5 – Exceptional</option>
                <option value="4">4 – Exceeds expectations</option>
                <option value="3">3 – Meets expectations</option>
                <option value="2">2 – Needs improvement</option>
                <option value="1">1 – Unsatisfactory</option>
              </Select>
            </Field>
          </div>
          <Field label="Key strengths" htmlFor="ev-str">
            <Input
              id="ev-str"
              required
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
            />
          </Field>
          <Field label="Areas for improvement" htmlFor="ev-imp">
            <Input
              id="ev-imp"
              required
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
            />
          </Field>
          <Field label="Overall mentor feedback" htmlFor="ev-fb">
            <Input
              id="ev-fb"
              required
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setEvalTarget(null)}>
              Cancel
            </Button>
            <Button type="submit">Save evaluation</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

