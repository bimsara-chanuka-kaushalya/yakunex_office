import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const controlBase =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25 disabled:opacity-60';

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlBase, 'h-10', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(controlBase, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});
