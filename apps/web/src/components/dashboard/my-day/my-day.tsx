'use client';

import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Building2, HeartHandshake, Sun } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ApiError, liveGet } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLiveSync } from '@/lib/use-live-sync';
import { CockpitPanel } from './cockpit-panel';
import { HrPanel } from './hr-panel';
import { ManagerPanel } from './manager-panel';
import { PersonalPanel } from './personal-panel';
import type { MyDayData } from './types';

type Tab = 'me' | 'team' | 'hr' | 'company';
const TAB_KEY = 'yakunex.myday.tab';

/**
 * Role-based "My Day": every role opens on what they need to do today.
 * Staff/interns get their own day; managers also get the team; admins the HR desk;
 * the director the company cockpit.
 */
export function MyDay() {
  const [data, setData] = useState<MyDayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('me');

  const load = useCallback(async () => {
    try {
      const d = await liveGet<MyDayData>('/my-day');
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your day.');
    }
  }, []);

  useEffect(() => {
    void load();
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved) setTab(saved);
    } catch {
      /* storage blocked */
    }
  }, [load]);

  useLiveSync(load);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Sun; show: boolean; count?: number }> = [
    { key: 'me', label: 'My day', icon: Sun, show: true },
    {
      key: 'team',
      label: 'Team',
      icon: Briefcase,
      show: Boolean(data?.manager),
      count: (data?.manager?.approvalInbox.length ?? 0) + (data?.manager?.teamPulse.summary.blocked ?? 0),
    },
    { key: 'hr', label: 'HR desk', icon: HeartHandshake, show: Boolean(data?.hr), count: data?.hr ? data.hr.lateToday.length + data.hr.pendingLeave : 0 },
    { key: 'company', label: 'Company', icon: Building2, show: Boolean(data?.cockpit), count: data?.cockpit?.riskiestProjects.length ?? 0 },
  ];
  const visible = tabs.filter((t) => t.show);
  const active: Tab = visible.some((t) => t.key === tab) ? tab : 'me';

  function choose(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* storage blocked */
    }
  }

  if (error && !data) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[13px] text-danger">{error}</p>
        <Button size="sm" variant="secondary" onClick={load}>Try again</Button>
      </Card>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <section aria-label="My Day" className="space-y-4">
      {visible.length > 1 && (
        <div role="tablist" aria-label="My Day views" className="flex gap-1 overflow-x-auto rounded-full bg-ink/[0.05] p-1 dark:bg-white/[0.06] sm:inline-flex">
          {visible.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={active === t.key}
                onClick={() => choose(t.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition',
                  active === t.key ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.count ? (
                  <span className="rounded-full bg-gold/20 px-1.5 text-[11px] font-semibold tabular-nums text-gold-strong dark:text-gold">{t.count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {active === 'me' && <PersonalPanel data={data.personal} intern={data.intern} reload={load} />}
      {active === 'team' && data.manager && <ManagerPanel data={data.manager} reload={load} />}
      {active === 'hr' && data.hr && <HrPanel data={data.hr} />}
      {active === 'company' && data.cockpit && <CockpitPanel data={data.cockpit} />}
    </section>
  );
}
