import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted border-line',
  gold: 'bg-gold/15 text-gold-strong dark:text-gold border-gold/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  info: 'bg-blue-500/15 text-blue-500 dark:text-blue-400 border-blue-500/30',
};

const dotTones: Record<Tone, string> = {
  neutral: 'bg-muted',
  gold: 'bg-gold animate-pulse',
  success: 'bg-success animate-pulse',
  warning: 'bg-warning animate-pulse',
  danger: 'bg-danger animate-pulse',
  info: 'bg-blue-500 animate-pulse',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight shadow-2xs',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotTones[tone])} />}
      {children}
    </span>
  );
}
