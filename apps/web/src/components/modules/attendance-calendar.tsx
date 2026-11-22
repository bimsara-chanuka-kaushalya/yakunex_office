'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useAuth } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { liveGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLiveSync } from '@/lib/use-live-sync';

type DayStatus = 'PRESENT' | 'LATE' | 'SHORT_LEAVE' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'UPCOMING' | 'TODAY';

interface CalendarDay {
  date: string;
  status: DayStatus;
  clockInAt: string | null;
  clockOutAt: string | null;
  holiday: string | null;
  leaveType: string | null;
  exits: number;
  unauthorized: number;
}

interface CalendarPayload {
  userId: string;
  month: string;
  days: CalendarDay[];
  totals: { present: number; late: number; shortLeaves: number; absent: number; leave: number; unauthorized: number };
}

const STYLE: Record<DayStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'bg-success/15 text-success' },
  LATE: { label: 'Late', cls: 'bg-warning/15 text-warning' },
  SHORT_LEAVE: { label: 'Short leave', cls: 'bg-warning/20 text-warning' },
  ABSENT: { label: 'Absent', cls: 'bg-danger/10 text-danger' },
  LEAVE: { label: 'Leave', cls: 'bg-info/10 text-info' },
  HOLIDAY: { label: 'Holiday', cls: 'bg-gold/15 text-gold-strong dark:text-gold' },
  WEEKEND: { label: 'Weekend', cls: 'bg-ink/[0.04] text-muted' },
  UPCOMING: { label: '', cls: 'text-muted' },
  TODAY: { label: 'Today', cls: 'ring-2 ring-gold text-ink' },
};

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' }) : '';

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** .ics of the month (leave, short leave, holidays, unauthorized absences) — imports into Google Calendar. */
function downloadIcs(data: CalendarPayload, personName: string) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yakunex Hub//Attendance//EN', 'CALSCALE:GREGORIAN'];
  for (const d of data.days) {
    let summary = '';
    if (d.status === 'HOLIDAY' && d.holiday) summary = d.holiday;
    else if (d.status === 'LEAVE') summary = `${personName}: leave (${(d.leaveType ?? '').toLowerCase()})`;
    else if (d.status === 'SHORT_LEAVE') summary = `${personName}: short leave (late start ${time(d.clockInAt)})`;
    else if (d.unauthorized > 0) summary = `${personName}: ${d.unauthorized} unauthorized absence(s)`;
    if (!summary) continue;
    const day = d.date.replace(/-/g, '');
    const next = new Date(Date.parse(`${d.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:yh-att-${data.userId}-${day}@yakunex`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(summary)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${data.month}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AttendanceCalendar({ people }: { people: Array<{ id: string; fullName: string }> }) {
  const { user, can } = useAuth();
  const canPickPerson = can('time:approve') || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === 'PROJECT_MANAGER';
  const [month, setMonth] = useState(() => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7));
  const [personId, setPersonId] = useState('');
  const [data, setData] = useState<CalendarPayload | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ month });
    if (personId) params.set('userId', personId);
    try {
      setData(await liveGet<CalendarPayload>(`/attendance/calendar?${params.toString()}`));
    } catch {
      setData(null);
    }
  }, [month, personId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  useLiveSync(load);

  const personName = (personId && people.find((p) => p.id === personId)?.fullName) || user?.fullName || 'Me';
  const leadingBlanks = useMemo(() => {
    if (!data) return 0;
    const first = new Date(`${data.month}-01T00:00:00Z`).getUTCDay();
    return (first + 6) % 7; // weeks start on Monday
  }, [data]);

  const monthLabel = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-LK', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <Card>
      <CardHeader
        title="Attendance calendar"
        description="Each work day at a glance: present, late (short leave), leave, holidays and unauthorized absences."
        badge={<CalendarDays className="h-4 w-4 text-muted" />}
        action={
          data ? (
            <Button size="sm" variant="secondary" onClick={() => downloadIcs(data, personName)} title="Download .ics — import into Google Calendar">
              <Download className="h-3.5 w-3.5" /> Google Calendar (.ics)
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-3 px-5 pb-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-[14px] font-semibold text-ink">{monthLabel}</span>
          <Button size="sm" variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {canPickPerson && people.length > 0 && (
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              aria-label="Person"
              className="ml-auto h-8 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
            >
              <option value="">My attendance</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          )}
        </div>

        {data && (
          <div className="flex flex-wrap gap-1.5 text-[12px]">
            <Badge tone="success">{data.totals.present} present</Badge>
            <Badge tone="warning">{data.totals.late} late · {data.totals.shortLeaves} short leave</Badge>
            <Badge tone="info">{data.totals.leave} leave</Badge>
            <Badge tone="danger">{data.totals.absent} absent</Badge>
            {data.totals.unauthorized > 0 && <Badge tone="danger">{data.totals.unauthorized} unauthorized absence(s)</Badge>}
          </div>
        )}

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        {!data ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {data.days.map((d) => {
              const st = STYLE[d.status];
              const tip = [st.label, d.holiday, d.clockInAt ? `In ${time(d.clockInAt)}` : '', d.clockOutAt ? `Out ${time(d.clockOutAt)}` : '', d.exits ? `${d.exits} exit(s)` : '']
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={d.date} title={tip} className={cn('min-h-[62px] rounded-lg p-1.5 text-left', st.cls)}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold">{Number(d.date.slice(8))}</span>
                    {d.unauthorized > 0 && <span className="h-2 w-2 rounded-full bg-danger" aria-label="Unauthorized absence" />}
                  </div>
                  <p className="truncate text-[10.5px] leading-tight">{d.holiday ?? st.label}</p>
                  {d.clockInAt && <p className="text-[10.5px] leading-tight opacity-80">{time(d.clockInAt)}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
