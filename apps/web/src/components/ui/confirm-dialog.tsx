'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from './button';
import { Field, Input } from './field';
import { Modal } from './modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  inputLabel?: string;
  inputPlaceholder?: string;
  defaultInputValue?: string;
  inputRequired?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (inputValue: string) => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  inputLabel,
  inputPlaceholder,
  defaultInputValue = '',
  inputRequired = false,
  busy = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [val, setVal] = useState(defaultInputValue);

  useEffect(() => {
    if (open) setVal(defaultInputValue);
  }, [open, defaultInputValue]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (inputLabel && inputRequired && !val.trim()) return;
    await onConfirm(val.trim());
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          className={
            tone === 'danger'
              ? 'flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-ink'
              : 'flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 p-3.5 text-sm text-ink'
          }
        >
          {tone === 'danger' ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold-strong dark:text-gold" />
          )}
          <p className="text-xs leading-relaxed text-ink/90">{description}</p>
        </div>

        {inputLabel && (
          <Field label={inputLabel} htmlFor="confirm-dialog-input">
            <Input
              id="confirm-dialog-input"
              required={inputRequired}
              placeholder={inputPlaceholder}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            size="sm"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={busy}
          >
            {busy ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
