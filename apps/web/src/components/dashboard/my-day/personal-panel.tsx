'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Coffee,
  GraduationCap,
  LogIn,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Send,
  Square,
  Sunrise,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError, patch, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtMinutes, fmtTime, type MyDayIntern, type MyDayPersonal, type MyDayTask } from './types';

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Best-effort GPS for clock-in; never blocks for long and never fails the action. */
function quickGps(): Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(done);
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracyMeters: Math.round(p.coords.accuracy),
        });
      },
      () => {
        clearTimeout(done);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5500, maximumAge: 60_000 },
    );
  });
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [active]);
}

export function PersonalPanel({
  data,
  intern,
  reload,
}: {
  data: MyDayPersonal;
  intern: MyDayIntern | null;
  reload: () => Promise<void> | void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<MyDayTask | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const timer = data.activeTimer;
  useTicker(Boolean(timer && timer.status !== 'PAUSED'));

  // The server computed `minutes` when the data was loaded; keep counting locally between refreshes.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  useEffect(() => setLoadedAt(Date.now()), [timer?.id, timer?.minutes, timer?.status]);
  const timerMinutes = timer
    ? timer.status === 'PAUSED'
      ? timer.minutes
      : timer.minutes + Math.max(0, (Date.now() - loadedAt) / 60000)
    : 0;

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
      await reload();
    } catch (err) {
      toast.error(errMsg(err, 'Something went wrong.'));
    } finally {
      setBusy(null);
    }
  }

  const firstTask = data.todayTasks.find((t) => t.status !== 'BLOCKED');

  async function startMyDay() {
    await run(
      'start-day',
      async () => {
        if (!data.attendance.clockedIn) {
          const gps = await quickGps();
          await post('/attendance/clock-in', {
            workMode: 'OFFICE',
            deviceType: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile Web' : 'Desktop Web',
            ...(gps ? { ...gps, locationLabel: `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` } : {}),
          });
        }
        if (!timer && firstTask) {
          await post('/time-entries/start', { projectId: firstTask.projectId, taskId: firstTask.id });
          if (firstTask.status === 'TODO' || firstTask.status === 'BACKLOG') {
            await patch(`/tasks/${firstTask.id}`, { status: 'IN_PROGRESS' });
          }
        }
      },
      firstTask ? `Clocked in · timer running on ${firstTask.code}` : 'Clocked in',
    );
  }

  async function workOn(task: MyDayTask) {
    await run(
      `work-${task.id}`,
      async () => {
        if (timer) await post('/time-entries/switch', { projectId: task.projectId, taskId: task.id });
        else await post('/time-entries/start', { projectId: task.projectId, taskId: task.id });
        if (task.status === 'TODO' || task.status === 'BACKLOG') await patch(`/tasks/${task.id}`, { status: 'IN_PROGRESS' });
      },
      `Timer on ${task.code}`,
    );
  }

  async function submitBlock() {
    if (!blocking) return;
    const t = blocking;
    await run(
      'block',
      () => post(`/my-day/tasks/${t.id}/block`, { reason: blockReason }),
      `${t.code} flagged — your manager has been told`,
    );
    setBlocking(null);
    setBlockReason('');
  }

  const att = data.attendance;
  const dayState = !att.clockedIn ? 'NOT_IN' : att.clockedOut ? 'DONE' : att.onBreak ? 'BREAK' : 'WORKING';

  return (
    <div className="space-y-5">
      {/* ── Morning: one-click start ─────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Sunrise className="h-4 w-4 text-gold" />
              <span className="text-[13px] font-semibold text-ink">Today</span>
              {dayState === 'WORKING' && <Badge tone="success" dot>Clocked in {fmtTime(att.clockInAt)}</Badge>}
              {dayState === 'BREAK' && <Badge tone="warning" dot>On break</Badge>}
              {dayState === 'DONE' && <Badge tone="neutral">Clocked out {fmtTime(att.clockOutAt)}</Badge>}
              {dayState === 'NOT_IN' && <Badge tone="warning">Not clocked in</Badge>}
              {att.isLate && <Badge tone="danger">Late</Badge>}
            </div>
            <p className="text-[13px] text-muted">
              {data.taskCounts.open} open task(s) · {data.taskCounts.dueToday} due today
              {data.taskCounts.overdue ? ` · ${data.taskCounts.overdue} overdue` : ''} · {data.hoursToday}h logged today
            </p>
            {timer && (
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                <span className={cn('h-2 w-2 rounded-full', timer.status === 'PAUSED' ? 'bg-warning' : 'animate-pulse bg-success')} />
                {timer.taskTitle || 'Untitled work'} · {timer.projectName} · {fmtMinutes(timerMinutes)}
                {timer.status === 'PAUSED' && ' (paused)'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dayState === 'NOT_IN' && (
              <Button onClick={startMyDay} disabled={busy !== null}>
                <Play className="h-4 w-4" />
                {busy === 'start-day' ? 'Starting…' : 'Start my day'}
              </Button>
            )}
            {(dayState === 'WORKING' || dayState === 'BREAK') && (
              <>
                {timer && timer.status !== 'PAUSED' && (
                  <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run('pause', () => post('/time-entries/pause'))}>
                    <Pause className="h-4 w-4" /> Pause timer
                  </Button>
                )}
                {timer && timer.status === 'PAUSED' && (
                  <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run('resume', () => post('/time-entries/resume'))}>
                    <Play className="h-4 w-4" /> Resume
                  </Button>
                )}
                {timer && (
                  <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run('stop', () => post('/time-entries/stop'), 'Timer stopped and saved')}>
                    <Square className="h-4 w-4" /> Stop
                  </Button>
                )}
                {!timer && firstTask && (
                  <Button size="sm" disabled={busy !== null} onClick={() => workOn(firstTask)}>
                    <Play className="h-4 w-4" /> Start timer on {firstTask.code}
                  </Button>
                )}
                <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => run('break', () => post('/attendance/break'))}>
                  <Coffee className="h-4 w-4" /> {att.onBreak ? 'End break' : 'Break'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      'clock-out',
                      async () => {
                        if (timer) await post('/time-entries/stop');
                        await post('/attendance/clock-out');
                      },
                      'Clocked out — see you tomorrow',
                    )
                  }
                >
                  <LogOut className="h-4 w-4" /> Clock out
                </Button>
              </>
            )}
            {dayState === 'DONE' && (
              <Link href="/attendance">
                <Button variant="secondary" size="sm">
                  <LogIn className="h-4 w-4" /> Attendance
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* ── Today's tasks ─────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="My tasks for today"
            description="Overdue first, then by due date and priority."
            action={
              <Link href="/tasks" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">
                All tasks
              </Link>
            }
          />
          <ul className="divide-y divide-line px-2 pb-3 sm:px-3">
            {data.todayTasks.length === 0 && (
              <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing assigned to you. Enjoy the quiet — or pick something from the backlog.</li>
            )}
            {data.todayTasks.map((t) => {
              const running = timer?.taskId === t.id;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted">{t.code}</span>
                      <Badge tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{t.priority}</Badge>
                      {t.status === 'BLOCKED' && <Badge tone="danger">Blocked</Badge>}
                      {t.status === 'IN_PROGRESS' && <Badge tone="info">In progress</Badge>}
                      {t.overdue && <Badge tone="danger">Overdue {t.dueDate}</Badge>}
                      {t.dueToday && <Badge tone="warning">Due today</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[14px] font-medium text-ink">{t.title}</p>
                    <p className="text-[12px] text-muted">{t.projectName}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {running ? (
                      <Badge tone="success" dot>Timer running</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={busy !== null || !att.clockedIn || att.clockedOut} onClick={() => workOn(t)} title={att.clockedIn ? 'Track time on this task' : 'Clock in first'}>
                        <Play className="h-3.5 w-3.5" /> Work on it
                      </Button>
                    )}
                    {t.status !== 'BLOCKED' && (
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => { setBlocking(t); setBlockReason(''); }}>
                        <AlertTriangle className="h-3.5 w-3.5" /> Blocked
                      </Button>
                    )}
                  </div>
                  {blocking?.id === t.id && (
                    <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-danger/5 p-2.5">
                      <input
                        autoFocus
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && blockReason.trim().length >= 3) void submitBlock();
                          if (e.key === 'Escape') setBlocking(null);
                        }}
                        placeholder="What is blocking you? (your manager sees this)"
                        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-gold"
                        maxLength={500}
                      />
                      <Button size="sm" variant="danger" disabled={busy !== null || blockReason.trim().length < 3} onClick={submitBlock}>
                        Tell my manager
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setBlocking(null)}>Cancel</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ── Side: meetings + leave ───────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Meetings today" badge={data.meetingsToday.length ? <Badge tone="gold">{data.meetingsToday.length}</Badge> : undefined} />
            <ul className="space-y-1 px-3 pb-4">
              {data.meetingsToday.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">No meetings today.</li>}
              {data.meetingsToday.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-ink/[0.03]">
                  <Video className={cn('h-4 w-4 shrink-0', m.status === 'LIVE' ? 'text-danger' : 'text-muted')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{m.title}</p>
                    <p className="text-[12px] text-muted">
                      {m.status === 'LIVE' ? 'Live now' : `${fmtTime(m.startsAt)} – ${fmtTime(m.endsAt)}`} · {m.organizerName}
                    </p>
                  </div>
                  {m.status !== 'COMPLETED' && (
                    <Link href={`/meet?room=${encodeURIComponent(m.roomCode)}`}>
                      <Button size="sm" variant={m.status === 'LIVE' ? 'primary' : 'secondary'}>Join</Button>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title="Leave balance"
              action={
                <Link href="/leave" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">
                  Request leave
                </Link>
              }
            />
            <div className="grid grid-cols-3 gap-2 px-5 pb-5">
              {data.leave
                ? Object.entries(data.leave).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-ink/[0.03] p-2.5 text-center dark:bg-white/[0.04]">
                      <p className="font-display text-xl font-semibold tabular-nums text-ink">{v.remaining}</p>
                      <p className="text-[11px] capitalize text-muted">{k} left</p>
                    </div>
                  ))
                : <p className="col-span-3 text-[13px] text-muted">Leave balance unavailable.</p>}
            </div>
            {data.pendingLeave > 0 && <p className="px-5 pb-4 text-[12px] text-muted">{data.pendingLeave} request(s) waiting for approval.</p>}
          </Card>
        </div>
      </div>

      {intern && <InternSection intern={intern} reload={reload} onAskMentor={async () => {
        if (!intern.mentorUserId) {
          router.push('/chat?channel=ch_tech_interns');
          return;
        }
        try {
          const ch = await post<{ id: string }>('/chat/direct', { targetUserId: intern.mentorUserId, targetUserName: intern.mentorName });
          router.push(`/chat?channel=${encodeURIComponent(ch.id)}`);
        } catch (err) {
          toast.error(errMsg(err, 'Could not open a chat with your mentor.'));
        }
      }} />}

      <StandupCard draft={data.standupDraft} unsubmitted={data.unsubmittedTimeEntries} reload={reload} />
    </div>
  );
}

function InternSection({ intern, reload, onAskMentor }: { intern: MyDayIntern; reload: () => Promise<void> | void; onAskMentor: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [learned, setLearned] = useState('');
  const [challenge, setChallenge] = useState('');
  const [nextStep, setNextStep] = useState('');

  async function toggle(taskId: string) {
    try {
      await patch(`/interns/${intern.internId}/tasks/${taskId}`, {});
      await reload();
    } catch (err) {
      toast.error(errMsg(err, 'Could not update the training task.'));
    }
  }

  async function saveReflection() {
    setBusy(true);
    try {
      await post('/my-day/reflection', { learned, challenge, nextStep });
      toast.success('Reflection saved — your mentor will see it');
      setLearned('');
      setChallenge('');
      setNextStep('');
      await reload();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save your reflection.'));
    } finally {
      setBusy(false);
    }
  }

  const list = [...intern.overdueTraining, ...intern.thisWeek];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title={`Learning plan · week ${intern.currentWeek} of ${intern.totalWeeks}`}
          description={`${intern.programme} · Mentor: ${intern.mentorName}`}
          badge={<Badge tone="gold">{intern.progressPercent}%</Badge>}
          action={
            <Button size="sm" variant="secondary" onClick={onAskMentor}>
              <MessageCircle className="h-4 w-4" /> Ask mentor
            </Button>
          }
        />
        <div className="px-5">
          <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${intern.progressPercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {intern.daysLeft !== null && (
              <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {intern.daysLeft} day(s) left · ends {intern.endDate}</span>
            )}
            {intern.lastEvaluation && (
              <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" /> Last evaluation {intern.lastEvaluation.period}: {intern.lastEvaluation.score}/5</span>
            )}
          </div>
        </div>
        <ul className="space-y-0.5 px-3 py-3">
          {list.length === 0 && <li className="px-2 py-2 text-[13px] text-muted">No training tasks for this week.</li>}
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => toggle(t.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-ink/[0.03]">
                {t.completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted" />}
                <span className={cn('flex-1 text-[13px]', t.completed ? 'text-muted line-through' : 'text-ink')}>{t.title}</span>
                {t.weekNumber < intern.currentWeek && !t.completed && <Badge tone="danger">Week {t.weekNumber}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Today's reflection"
          description="Three short lines for your mentor."
          badge={intern.reflectionSubmittedToday ? <Badge tone="success">Done today</Badge> : undefined}
        />
        <div className="space-y-2.5 px-5 pb-5">
          {[
            { label: 'What did I learn today?', value: learned, set: setLearned },
            { label: 'What was hard?', value: challenge, set: setChallenge },
            { label: 'What will I do next?', value: nextStep, set: setNextStep },
          ].map((f) => (
            <label key={f.label} className="block">
              <span className="text-[12px] font-medium text-muted">{f.label}</span>
              <input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                maxLength={1000}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-gold"
              />
            </label>
          ))}
          <Button size="sm" disabled={busy || !learned.trim()} onClick={saveReflection}>
            <Send className="h-4 w-4" /> {intern.reflectionSubmittedToday ? 'Update reflection' : 'Send to mentor'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function StandupCard({
  draft,
  unsubmitted,
  reload,
}: {
  draft: MyDayPersonal['standupDraft'];
  unsubmitted: number;
  reload: () => Promise<void> | void;
}) {
  const toast = useToast();
  const toText = (a: string[]) => a.join('\n');
  const [yesterday, setYesterday] = useState(toText(draft.yesterday));
  const [today, setToday] = useState(toText(draft.today));
  const [blockers, setBlockers] = useState(toText(draft.blockers));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Refresh the draft from live data until the user starts editing it.
  useEffect(() => {
    if (touched) return;
    setYesterday(toText(draft.yesterday));
    setToday(toText(draft.today));
    setBlockers(toText(draft.blockers));
  }, [draft, touched]);

  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

  async function postIt() {
    setBusy('standup');
    try {
      await post('/my-day/standup', { yesterday: lines(yesterday), today: lines(today), blockers: lines(blockers) });
      toast.success('Standup posted to #general');
      setTouched(false);
    } catch (err) {
      toast.error(errMsg(err, 'Could not post your standup.'));
    } finally {
      setBusy(null);
    }
  }

  async function submitTimesheet() {
    setBusy('timesheet');
    try {
      await post('/workforce/timesheets/submit', {});
      toast.success('Timesheet sent for approval');
      await reload();
    } catch (err) {
      toast.error(errMsg(err, 'Could not submit your timesheet.'));
    } finally {
      setBusy(null);
    }
  }

  const fields = [
    { label: `Yesterday (${draft.previousWorkDay})`, value: yesterday, set: setYesterday },
    { label: 'Today', value: today, set: setToday },
    { label: 'Blockers', value: blockers, set: setBlockers },
  ];

  return (
    <Card>
      <CardHeader
        title="End of day · standup & timesheet"
        description="Drafted from your timer and tasks. Edit it, then post."
        action={
          unsubmitted > 0 ? (
            <Button size="sm" variant="gold-outline" disabled={busy !== null} onClick={submitTimesheet}>
              {busy === 'timesheet' ? 'Submitting…' : `Submit timesheet (${unsubmitted})`}
            </Button>
          ) : (
            <Badge tone="success">Timesheet up to date</Badge>
          )
        }
      />
      <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-3">
        {fields.map((f) => (
          <label key={f.label} className="block">
            <span className="text-[12px] font-medium text-muted">{f.label}</span>
            <textarea
              value={f.value}
              onChange={(e) => {
                setTouched(true);
                f.set(e.target.value);
              }}
              rows={4}
              placeholder="One item per line"
              className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-gold"
            />
          </label>
        ))}
        <div className="md:col-span-3">
          <Button size="sm" disabled={busy !== null || (!yesterday.trim() && !today.trim() && !blockers.trim())} onClick={postIt}>
            <Send className="h-4 w-4" /> {busy === 'standup' ? 'Posting…' : 'Post standup'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
