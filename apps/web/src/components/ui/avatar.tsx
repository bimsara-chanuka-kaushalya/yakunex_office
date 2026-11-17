import { cn } from '@/lib/cn';

export function Avatar({
  src,
  name,
  fallbackText,
  size = 'md',
  className,
}: {
  src?: string | null;
  name: string;
  fallbackText?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-7 w-7 text-[11px]',
    md: 'h-8 w-8 text-xs',
    lg: 'h-9 w-9 text-xs',
  };

  const label = fallbackText ?? (name || 'U').trim().slice(0, 1).toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-line/60',
          sizes[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold-strong dark:text-gold',
        sizes[size],
        className,
      )}
    >
      {label}
    </span>
  );
}
