import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold-outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

/** Apple-style capsule buttons: one shape, filled / tinted / plain variants. */
const variants: Record<Variant, string> = {
  primary: 'bg-gold text-gold-ink font-semibold shadow-xs hover:brightness-[1.06]',
  secondary: 'bg-ink/[0.06] text-ink hover:bg-ink/[0.1] dark:bg-white/[0.1] dark:hover:bg-white/[0.15]',
  ghost: 'text-gold-strong hover:bg-gold/10 dark:text-gold',
  danger: 'bg-danger text-white font-semibold shadow-xs hover:brightness-110',
  'gold-outline': 'bg-gold/15 text-gold-strong font-semibold hover:bg-gold/25 dark:text-gold',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5',
  md: 'h-10 px-[18px] text-sm gap-2',
  lg: 'h-12 px-6 text-[15px] gap-2.5',
  icon: 'h-10 w-10 p-0',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-medium tracking-[-0.01em]',
        'transition-[transform,background-color,filter,box-shadow] duration-200 ease-spring',
        'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/30',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
