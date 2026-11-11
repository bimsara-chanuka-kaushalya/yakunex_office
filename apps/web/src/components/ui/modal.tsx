'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  title,
  onClose,
  children,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest close handler without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-t-2xl bg-surface shadow-pop animate-pop-in sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-canvas hover:text-ink"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
