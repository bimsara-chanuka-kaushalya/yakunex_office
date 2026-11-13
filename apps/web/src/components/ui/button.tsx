import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold-outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'clay-btn-primary text-gold-ink font-semibold hover:brightness-105 active:translate-y-[1px] active:scale-[0.97] border border-gold/40',
  secondary:
    'clay-btn-secondary bg-surface text-ink border border-white/80 dark:border-white/[0.08] hover:border-gold/40 active:translate-y-[1px] active:scale-[0.97]',
  ghost:
    'text-muted hover:text-ink hover:bg-surface/70 active:scale-[0.97]',
  danger:
    'clay-btn-danger bg-danger text-white hover:brightness-105 active:translate-y-[1px] active:scale-[0.97]',
  'gold-outline':
    'clay-btn-secondary border border-gold/45 bg-gold/15 text-gold-strong dark:text-gold hover:bg-gold/25 font-medium active:translate-y-[1px] active:scale-[0.97]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8.5 px-3.5 text-xs rounded-xl gap-1.5',
  md: 'h-10 px-4.5 text-sm rounded-2xl gap-2',
  lg: 'h-11.5 px-6 text-base rounded-2xl gap-2.5',
  icon: 'h-9.5 w-9.5 p-0 rounded-2xl justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
