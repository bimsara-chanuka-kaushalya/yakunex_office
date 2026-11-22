'use client';

import Link from 'next/link';
import { Cake, CalendarX2, Clock3, GraduationCap, Laptop, PartyPopper, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { fmtTime, type MyDayHr } from './types';

function when(inDays: number) {
  if (inDays === 0) return 'today';
  if (inDays === 1) return 'tomorrow';
  return `in ${inDays} days`;
}

function Tile({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={`mt-1 font-display text-[26px] font-semibold tabular-nums ${tone}`}>{value}</p>
    </Link>
  );
}

export function HrPanel({ data }: { data: MyDayHr }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Late today" value={data.lateToday.length} tone={data.lateToday.length ? 'text-danger' : 'text-ink'} href="/attendance" />
        <Tile label="Not clocked in" value={data.absentToday.length} tone={data.absentToday.length ? 'text-warning' : 'text-ink'} href="/attendance" />
        <Tile label="Leave to approve" value={data.pendingLeave} tone={data.pendingLeave ? 'text-warning' : 'text-ink'} href="/leave" />
        <Tile label="Profile changes" value={data.profileChangeRequests} tone={data.profileChangeRequests ? 'text-warning' : 'text-ink'} href="/approvals" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Attendance exceptions" badge={<Clock3 className="h-4 w-4 text-muted" />} />
          <div className="space-y-3 px-5 pb-5 text-[13px]">
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Late</p>
              {data.lateToday.length === 0 ? <p className="text-muted">Nobody was late.</p> : data.lateToday.map((p) => (
                <p key={p.userId} className="flex justify-between text-ink"><span>{p.fullName}</span><span className="text-muted">{fmtTime(p.clockInAt)}</span></p>
              ))}
            </section>
            <section>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted"><UserX className="h-3.5 w-3.5" /> Not clocked in</p>
              {data.absentToday.length === 0 ? <p className="text-muted">Everyone is accounted for.</p> : data.absentToday.slice(0, 12).map((p) => (
                <p key={p.userId} className="flex justify-between text-ink"><span>{p.fullName}</span><span className="text-[11px] text-muted">{p.role.replace('_', ' ')}</span></p>
              ))}
            </section>
            {data.onLeaveToday.length > 0 && (
              <section>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">On leave today</p>
                <p className="text-ink">{data.onLeaveToday.map((p) => p.fullName).join(', ')}</p>
              </section>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Leave clashes · next 14 days" badge={<CalendarX2 className="h-4 w-4 text-muted" />} />
          <ul className="space-y-2 px-5 pb-5 text-[13px]">
            {data.leaveClashes.length === 0 && <li className="text-muted">No days with two or more people away.</li>}
            {data.leaveClashes.map((c) => (
              <li key={c.date} className="rounded-xl bg-warning/5 p-2.5">
                <p className="font-medium text-ink">{new Date(`${c.date}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {c.names.length} away</p>
                <p className="text-[12px] text-muted">{c.names.join(', ')}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="This week" badge={<PartyPopper className="h-4 w-4 text-muted" />} />
          <ul className="space-y-2 px-5 pb-5 text-[13px]">
            {data.celebrations.length === 0 && <li className="text-muted">No birthdays or work anniversaries this week.</li>}
            {data.celebrations.map((c) => (
              <li key={`${c.userId}-${c.kind}`} className="flex items-center gap-2">
                {c.kind === 'BIRTHDAY' ? <Cake className="h-4 w-4 text-gold" /> : <PartyPopper className="h-4 w-4 text-gold" />}
                <span className="flex-1 text-ink">
                  {c.fullName}
                  <span className="text-muted"> · {c.kind === 'BIRTHDAY' ? 'birthday' : `${c.years} year(s) with us`}</span>
                </span>
                <Badge tone={c.inDays === 0 ? 'gold' : 'neutral'}>{when(c.inDays)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Interns finishing in 30 days" badge={<GraduationCap className="h-4 w-4 text-muted" />} action={<Link href="/interns" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Interns</Link>} />
          <ul className="space-y-1.5 px-5 pb-5 text-[13px]">
            {data.internsEndingSoon.length === 0 && <li className="text-muted">No internships ending soon.</li>}
            {data.internsEndingSoon.map((i) => (
              <li key={i.id} className="flex justify-between"><span className="text-ink">{i.fullName}</span><span className="text-muted">{i.endDate} · {i.daysLeft}d</span></li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Assets needing attention" badge={<Laptop className="h-4 w-4 text-muted" />} action={<Link href="/assets" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Assets</Link>} />
          <ul className="space-y-1.5 px-5 pb-5 text-[13px]">
            {data.assetsNeedingAttention.length === 0 && <li className="text-muted">All assets are in good order.</li>}
            {data.assetsNeedingAttention.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-ink"><span className="font-mono text-[11px] text-muted">{a.tag}</span> {a.name}</span>
                <Badge tone="warning">{a.status === 'REPAIR' ? 'In repair' : 'Maintenance'}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
