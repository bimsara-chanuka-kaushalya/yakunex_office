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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiError, patch, post } from '@/lib/api';
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

export function TimeTrackerView() {
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

  const load = useCallback(async () => {
    setLoading(true);
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
      await post('/time-entries/start', {
        projectId,
        taskId: taskId || undefined,
        workCategory,
        note: note || `${workCategory} work`,
        billable,
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">Time Tracker & Timesheets</h2>
          <p className="mt-1 text-sm text-muted">
            Project & task timer with Pause/Resume, Task Switch, manual entries, and approval workflow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={entries.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Log manual time
          </Button>
        </div>
      </header>

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
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={formatMins(summary.todayMinutes)} hint="Logged today" icon={<Clock className="h-4 w-4" />} />
        <StatCard label="This Week" value={formatMins(summary.weekMinutes)} hint="Current 7-day window" icon={<CalendarCheck className="h-4 w-4" />} />
        <StatCard label="This Month" value={formatMins(summary.monthMinutes)} hint={`${formatMins(billableMinutes)} billable`} icon={<Play className="h-4 w-4" />} />
        <StatCard label="Approved Hours" value={formatMins(summary.approvedMinutes)} hint={`${entries.length} total entries (${formatMins(totalMinutes)})`} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

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
  isLate: boolean;
  notes: string;
}

export function AttendanceView() {
  const [todayRecord, setTodayRecord] = useState<AttendanceRow | null>(null);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ todayRecord: AttendanceRow | null; records: AttendanceRow[] }>(
        '/attendance',
      );
      setTodayRecord(res.todayRecord);
      setRecords(res.records);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function doClockIn() {
    setError(null);
    try {
      await post('/attendance/clock-in', { notes });
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not clock in.');
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

  const isClockedIn = Boolean(todayRecord?.clockInAt && !todayRecord?.clockOutAt);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display text-3xl font-semibold">Attendance & Working Hours</h2>
        <p className="mt-1 text-sm text-muted">
          Daily clock-in/out, break tracking and Colombo standard working schedule.
        </p>
      </header>

      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge
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
                    ? 'Clocked In'
                    : 'Clocked Out'}
              </Badge>
              <span className="text-xs text-muted">Standard hours: 08:30 – 17:30 (Asia/Colombo)</span>
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold">
              Today&apos;s Attendance Status
            </h3>
            <p className="text-sm text-muted">
              {todayRecord?.clockInAt
                ? `Clocked in at ${new Date(todayRecord.clockInAt).toLocaleTimeString('en-LK', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Colombo',
                  })}`
                : 'You have not clocked in yet today.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isClockedIn ? (
              <>
                <Input
                  placeholder="Shift note (optional)…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-56"
                />
                <Button onClick={doClockIn}>
                  <LogIn className="h-4 w-4" /> Clock In
                </Button>
              </>
            ) : (
              <>
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
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </Card>

      <Card>
        <CardHeader title="Team attendance log" description="Daily clock-in, break and clock-out register." />
        {loading ? (
          <div className="p-6">
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Team member</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Clock In</th>
                  <th className="px-5 py-3">Clock Out</th>
                  <th className="px-5 py-3">Breaks</th>
                  <th className="px-5 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-muted">
                      No team attendance records logged yet today.
                    </td>
                  </tr>
                ) : (
                  records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-canvas/40">
                    <td className="px-5 py-3.5 font-medium">{rec.userName}</td>
                    <td className="px-5 py-3.5 font-mono text-xs">{rec.workDate}</td>
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
                    <td className="px-5 py-3.5 text-xs text-muted">{rec.breakMinutes}m</td>
                    <td className="px-5 py-3.5 text-xs text-muted">{rec.notes}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 3. LEAVE PAGE (/leave) ──────────────────────────────────────────────────

interface LeaveRow {
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
}

export function LeaveView() {
  const { can } = useAuth();
  const canApprove = can(PERMISSIONS.LEAVE_APPROVE);
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [type, setType] = useState<LeaveRow['type']>('ANNUAL');
  const [startDate, setStartDate] = useState('2026-11-26');
  const [endDate, setEndDate] = useState('2026-11-27');
  const [days, setDays] = useState('2');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await api<LeaveRow[]>('/leave'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await post('/leave', { type, startDate, endDate, days: Number(days), reason });
    setModalOpen(false);
    setReason('');
    await load();
  }

  async function decide(id: string, status: 'APPROVED' | 'REJECTED') {
    await patch(`/leave/${id}/decision`, { status });
    await load();
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
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> Request leave
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Annual leave allowance"
          value="14 days"
          hint="12 days remaining in 2026"
          icon={<Plane className="h-4 w-4" />}
        />
        <StatCard
          label="Sick / Medical leave"
          value="7 days"
          hint="7 days remaining"
          icon={<CalendarCheck className="h-4 w-4" />}
        />
        <StatCard
          label="Pending approvals"
          value={requests.filter((r) => r.status === 'PENDING').length}
          hint="Awaiting review"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

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
                      <Badge>{req.type}</Badge>
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
    setLoading(true);
    try {
      setInterns(await api<InternRow[]>('/interns'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

