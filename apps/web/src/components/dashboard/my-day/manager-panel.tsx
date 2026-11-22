'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Inbox, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtTime, type MyDayManager, type PulsePerson, type Risk } from './types';

const STATE_LABEL: Record<PulsePerson['state'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' | 'danger' }> = {
  WORKING: { label: 'Working', tone: 'success' },
  ON_BREAK: { label: 'Break', tone: 'warning' },
  CLOCKED_OUT: { label: 'Clocked out', tone: 'neutral' },
  ON_LEAVE: { label: 'On leave', tone: 'info' },
  NOT_IN: { label: 'Not in', tone: 'neutral' },
};

const RISK: Record<Risk, { label: string; tone: 'success' | 'warning' | 'danger'; bar: string }> = {
  GREEN: { label: 'On track', tone: 'success', bar: 'bg-success' },
  AMBER: { label: 'At risk', tone: 'warning', bar: 'bg-warning' },
  RED: { label: 'Off track', tone: 'danger', bar: 'bg-danger' },
};

type Filter = 'ALL' | 'BLOCKED' | 'NOT_IN' | 'LATE';

export function ManagerPanel({ data, reload }: { data: MyDayManager; reload: () => Promise<void> | void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const s = data.teamPulse.summary;

  const people = useMemo(() => {
    const all = data.teamPulse.people;
    if (filter === 'BLOCKED') return all.filter((p) => p.blockedTasks.length > 0);
    if (filter === 'NOT_IN') return all.filter((p) => p.state === 'NOT_IN');
    if (filter === 'LATE') return all.filter((p) => p.isLate);
    return all;
  }, [data.teamPulse.people, filter]);

  const inbox = data.approvalInbox;
  const allChecked = inbox.length > 0 && inbox.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(status: 'APPROVED' | 'REJECTED', ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const items = inbox.filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, source: i.source }));
      const res = await post<{ decided: number; results: Array<{ ok: boolean; error?: string }> }>('/my-day/approvals/bulk', { status, items });
      const failed = res.results.filter((r) => !r.ok);
      if (res.decided) toast.success(`${res.decided} request(s) ${status === 'APPROVED' ? 'approved' : 'rejected'}`);
      if (failed.length) toast.error(`${failed.length} could not be decided: ${failed[0].error ?? ''}`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not decide these requests.');
    } finally {
      setBusy(false);
    }
  }

  const chips: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'ALL', label: 'Everyone', count: s.total },
    { key: 'BLOCKED', label: 'Blocked', count: s.blocked },
    { key: 'NOT_IN', label: 'Not in', count: s.notIn },
    { key: 'LATE', label: 'Late', count: s.late },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* ── Team pulse ────────────────────────────────────────── */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="Team pulse"
            description={`${s.working} working · ${s.onBreak} on break · ${s.onLeave} on leave · ${s.notIn} not in`}
            badge={<Users className="h-4 w-4 text-muted" />}
          />
          <div className="flex flex-wrap gap-1.5 px-5 pb-3">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={cn(
                  'rounded-full px-3 py-1 text-[12px] font-medium transition',
                  filter === c.key ? 'bg-gold text-gold-ink' : 'bg-ink/[0.05] text-muted hover:bg-ink/[0.09] dark:bg-white/[0.06]',
                )}
              >
                {c.label} · {c.count}
              </button>
            ))}
          </div>
          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto px-2 pb-3 sm:px-3">
            {people.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nobody here.</li>}
            {people.map((p) => {
              const st = STATE_LABEL[p.state];
              return (
                <li key={p.userId} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{p.fullName}</span>
                    <span className="text-[11px] text-muted">{p.companyId ? `${p.companyId} · ` : ''}{p.role.replace('_', ' ')}</span>
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    {p.isLate && <Badge tone="danger">Late {fmtTime(p.clockInAt)}</Badge>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {p.currentTask ? `⏱ ${p.currentTask}` : 'No timer running'} · {p.openTasks} open
                    {p.overdueTasks ? ` · ${p.overdueTasks} overdue` : ''}
                  </p>
                  {p.blockedTasks.map((b) => (
                    <p key={b.id} className="mt-1 rounded-lg bg-danger/5 px-2 py-1 text-[12px] text-danger">
                      🚧 {b.code} {b.title}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ── Sprint health ────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Sprint health"
            action={<Link href="/sprints" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Sprints</Link>}
          />
          <ul className="space-y-3 px-5 pb-5">
            {data.sprints.length === 0 && <li className="text-[13px] text-muted">No active sprints.</li>}
            {data.sprints.map((sp) => {
              const r = RISK[sp.risk];
              return (
                <li key={sp.id} className="rounded-xl bg-ink/[0.03] p-3 dark:bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{sp.name}</span>
                    <Badge tone={r.tone} dot>{r.label}</Badge>
                  </div>
                  <p className="text-[12px] text-muted">
                    {sp.projectName} · {sp.daysLeft >= 0 ? `${sp.daysLeft}d left` : `${-sp.daysLeft}d over`}
                  </p>
                  {/* Done vs. time elapsed: if the dark bar lags behind the tick, the sprint is behind. */}
                  <div className="relative mt-2 h-2 rounded-full bg-ink/[0.08]">
                    <div className={cn('h-full rounded-full', r.bar)} style={{ width: `${sp.completionPercent}%` }} />
                    <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/60" style={{ left: `${sp.elapsedPercent}%` }} title={`${sp.elapsedPercent}% of time used`} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    {sp.donePoints}/{sp.totalPoints} pts ({sp.completionPercent}%) · {sp.elapsedPercent}% of time used
                    {sp.blocked ? ` · ${sp.blocked} blocked` : ''}
                    {sp.overdue ? ` · ${sp.overdue} overdue` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* ── Approval inbox ─────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Approval inbox"
          description="Leave, timesheets, expenses and profile changes — one queue."
          badge={<Badge tone={inbox.length ? 'warning' : 'success'}>{inbox.length} pending</Badge>}
          action={
            inbox.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" disabled={busy || selected.size === 0} onClick={() => decide('APPROVED', [...selected])}>
                  <Check className="h-4 w-4" /> Approve {selected.size || ''}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy || selected.size === 0} onClick={() => decide('REJECTED', [...selected])}>
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            ) : undefined
          }
        />
        {inbox.length === 0 ? (
          <div className="flex items-center gap-2 px-5 pb-5 text-[13px] text-muted">
            <Inbox className="h-4 w-4" /> Inbox zero. Nothing is waiting on you.
          </div>
        ) : (
          <div className="px-2 pb-3 sm:px-3">
            <label className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium text-muted">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() => setSelected(allChecked ? new Set() : new Set(inbox.map((i) => i.id)))}
                className="h-4 w-4 accent-[var(--color-gold,#c9a227)]"
              />
              Select all
            </label>
            <ul className="divide-y divide-line">
              {inbox.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="h-4 w-4" aria-label={`Select ${i.title}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="gold">{i.type}</Badge>
                      <span className="text-[12px] text-muted">{i.requestedByName} · {i.createdAt.slice(0, 10)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] font-medium text-ink">{i.title}</p>
                    {i.description && <p className="truncate text-[12px] text-muted">{i.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('APPROVED', [i.id])} aria-label="Approve">
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide('REJECTED', [i.id])} aria-label="Reject">
                      <X className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
