import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-gold text-gold-ink hover:bg-gold-strong hover:text-white dark:hover:text-gold-ink shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas',
  ghost: 'text-muted hover:text-ink hover:bg-canvas',
  danger: 'bg-danger text-white hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);
