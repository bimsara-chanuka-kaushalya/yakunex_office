'use client';

import Link from 'next/link';
import { AlertOctagon, ShieldAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { fmtMoney, fmtTime, type MyDayCockpit } from './types';

const AUDIT_LABEL: Record<string, string> = {
  USER_ROLE_CHANGED: 'Role changed',
  USER_STATUS_CHANGED: 'Account status changed',
  USER_PERMISSIONS_CHANGED: 'Permissions changed',
  USER_DELETED: 'User deleted',
  ROLE_PERMISSIONS_UPDATED: 'Role matrix updated',
  ACCOUNT_LOCKED: 'Account locked',
  REFRESH_TOKEN_REUSE_DETECTED: 'Possible session theft',
  LOGIN_FAILED: 'Failed sign-in',
};

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-display text-[26px] font-semibold tabular-nums text-ink">
        {value}
        {tone === 'up' && <TrendingUp className="h-4 w-4 text-success" />}
        {tone === 'down' && <TrendingDown className="h-4 w-4 text-danger" />}
      </p>
      {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
    </Card>
  );
}

export function CockpitPanel({ data }: { data: MyDayCockpit }) {
  const monthName = new Date(`${data.month}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const failedLogins = data.sensitiveAudit.filter((a) => a.action === 'LOGIN_FAILED').length;
  const otherSensitive = data.sensitiveAudit.filter((a) => a.action !== 'LOGIN_FAILED');
  const alert = failedLogins >= 10 || data.sensitiveAudit.some((a) => a.action === 'REFRESH_TOKEN_REUSE_DETECTED');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Net · ${monthName}`} value={fmtMoney(data.net)} hint={`In ${fmtMoney(data.income)} · out ${fmtMoney(data.expense)}`} tone={data.net >= 0 ? 'up' : 'down'} />
        <Kpi label="Outstanding invoices" value={fmtMoney(data.outstandingInvoices.total)} hint={`${data.outstandingInvoices.count} unpaid · ${data.overdueInvoices.length} overdue`} />
        <Kpi label="Utilisation · 30 days" value={`${data.utilisation.percent}%`} hint={`${data.utilisation.billableHours}h billable of ${data.utilisation.totalHours}h`} />
        <Kpi label="Delivery" value={String(data.activeProjects)} hint={`active project(s) · ${data.openCriticalBugs} critical bug(s)`} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Projects that need you"
            description="Ranked by deadline, blockers, overdue work and critical bugs."
            action={<Link href="/projects" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Projects</Link>}
          />
          <ul className="space-y-2 px-5 pb-5">
            {data.riskiestProjects.length === 0 && <li className="text-[13px] text-muted">No project is showing risk signals. 👌</li>}
            {data.riskiestProjects.map((p, i) => (
              <li key={p.id} className={cn('flex items-start gap-3 rounded-xl p-3', i === 0 ? 'bg-danger/5' : 'bg-warning/5')}>
                <AlertOctagon className={cn('mt-0.5 h-4 w-4 shrink-0', i === 0 ? 'text-danger' : 'text-warning')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">
                    <span className="font-mono text-[11px] text-muted">{p.code}</span> {p.name}
                    <span className="font-normal text-muted"> · {p.clientName || 'Internal'} · {p.progressPercent}%</span>
                  </p>
                  <p className="text-[12px] text-muted">{p.reasons.join(' · ')}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Security · last 24h"
            badge={alert ? <Badge tone="danger" dot>Check now</Badge> : <Badge tone="success">Quiet</Badge>}
            action={<Link href="/audit-logs" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Audit log</Link>}
          />
          <div className="space-y-2 px-5 pb-5 text-[13px]">
            <p className="flex items-center gap-2 text-ink">
              <ShieldAlert className={cn('h-4 w-4', failedLogins >= 10 ? 'text-danger' : 'text-muted')} />
              {failedLogins} failed sign-in(s)
            </p>
            {otherSensitive.length === 0 && <p className="text-muted">No role, permission or account changes.</p>}
            {otherSensitive.slice(0, 6).map((a) => (
              <p key={a.id} className="flex justify-between gap-2">
                <span className="truncate text-ink">{AUDIT_LABEL[a.action] ?? a.action}<span className="text-muted"> · {a.actorName ?? 'system'}</span></span>
                <span className="shrink-0 text-muted">{fmtTime(a.createdAt)}</span>
              </p>
            ))}
          </div>
        </Card>
      </div>

      {data.overdueInvoices.length > 0 && (
        <Card>
          <CardHeader title="Overdue invoices" action={<Link href="/finance" className="text-[13px] font-medium text-gold-strong hover:underline dark:text-gold">Finance</Link>} />
          <ul className="divide-y divide-line px-5 pb-4 text-[13px]">
            {data.overdueInvoices.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-2">
                <span className="text-ink"><span className="font-mono text-[11px] text-muted">{i.invoiceNumber}</span> {i.clientName}</span>
                <span className="tabular-nums text-danger">{i.currency} {fmtMoney(i.totalAmount)} · due {i.dueDate.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
