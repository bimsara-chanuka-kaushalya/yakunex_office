import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold-outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-gold to-gold-strong text-gold-ink font-semibold shadow-sm hover:brightness-105 active:scale-[0.98] border border-gold/40',
  secondary:
    'bg-surface text-ink border border-line hover:border-gold/40 hover:bg-canvas shadow-xs active:scale-[0.98]',
  ghost:
    'text-muted hover:text-ink hover:bg-canvas/80 active:scale-[0.98]',
  danger:
    'bg-danger text-white hover:bg-danger/90 shadow-xs active:scale-[0.98]',
  'gold-outline':
    'border border-gold/50 bg-gold/10 text-gold hover:bg-gold/20 font-medium active:scale-[0.98]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9.5 px-4 text-sm rounded-xl gap-2',
  lg: 'h-11 px-5 text-base rounded-xl gap-2.5',
  icon: 'h-9 w-9 p-0 rounded-lg justify-center',
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
