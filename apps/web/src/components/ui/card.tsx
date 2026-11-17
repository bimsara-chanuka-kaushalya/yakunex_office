import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Inset grouped card, Apple style: white on grouped grey, continuous corners, hairline edge. */
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
        'rounded-[20px] bg-surface shadow-card transition-[transform,box-shadow] duration-300 ease-spring',
        hoverable && 'hover:-translate-y-0.5 hover:shadow-lift',
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
    <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-5 sm:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {badge}
        </div>
        {description && <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p>}
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
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold text-gold-ink [&_svg]:h-4 [&_svg]:w-4">
          {icon}
        </span>
        <p className="line-clamp-1 text-[13px] font-medium text-muted">{label}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <p className="font-display text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
          {value}
        </p>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
              trend.positive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 truncate text-xs text-muted">{hint}</p>}
    </Card>
  );
}
