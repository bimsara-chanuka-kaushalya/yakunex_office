import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  className,
  hoverable = false,
  children,
}: {
  className?: string;
  hoverable?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'clay-card',
        hoverable && 'clay-card-hover hover:border-gold/35',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  badge,
  action,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line/80 px-5 py-4 sm:px-6">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold tracking-tight text-ink md:text-lg">{title}</h2>
          {badge}
        </div>
        {description && <p className="mt-0.5 text-xs text-muted md:text-sm">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  trend,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { value: string; positive?: boolean };
  icon: ReactNode;
}) {
  return (
    <Card hoverable className="relative overflow-hidden p-5 sm:p-6 group">
      {/* Subtle background glow effect on hover */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold/5 blur-2xl transition-all duration-300 group-hover:bg-gold/15" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted line-clamp-1">{label}</p>
        <span className="clay-icon-well flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center border border-gold/35 bg-gradient-to-br from-gold/25 to-gold/10 text-gold transition-transform duration-200 group-hover:scale-105">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <p className="font-display text-2xl font-bold tracking-tight tabular-nums text-ink sm:text-3xl">{value}</p>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
              trend.positive ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-muted leading-relaxed truncate">{hint}</p>}
    </Card>
  );
}
