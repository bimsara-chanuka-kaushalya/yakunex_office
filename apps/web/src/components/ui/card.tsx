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
        'rounded-2xl border border-line bg-surface shadow-card transition-all duration-200',
        hoverable && 'hover:-translate-y-0.5 hover:border-gold/30 hover:shadow-md',
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
    <header className="flex items-start justify-between gap-4 border-b border-line/80 px-6 py-4.5">
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
    <Card hoverable className="p-5.5 relative overflow-hidden group">
      {/* Subtle background glow effect on hover */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gold/5 blur-2xl transition-all duration-300 group-hover:bg-gold/15" />
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-gradient-to-br from-gold/20 to-gold/5 text-gold shadow-xs transition-transform duration-200 group-hover:scale-105">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="font-display text-3xl font-bold tracking-tight tabular-nums text-ink">{value}</p>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center text-xs font-semibold',
              trend.positive ? 'text-success' : 'text-danger',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
