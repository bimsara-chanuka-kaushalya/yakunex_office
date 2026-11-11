'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useLang } from '@/components/providers';
import { Modal } from '@/components/ui/modal';
import { Field, PasswordInput } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ApiError, post } from '@/lib/api';

/** Shown when an account was created with a temporary password. Cannot be dismissed. */
export function ForcePasswordChange() {
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useLang();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post('/auth/change-password', { currentPassword, newPassword });
      setDone(true);
      await logout();
      router.replace('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title={t('mustChangePassword')} onClose={() => undefined} dismissible={false}>
      {done ? (
        <p className="text-sm text-muted">Password changed. Redirecting to sign in…</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted">Use at least 12 characters with letters and numbers. You will be signed out on all devices.</p>
          <Field label={t('currentPassword')} htmlFor="current-password">
            <PasswordInput id="current-password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <Field label={t('newPassword')} htmlFor="new-password" error={error ?? undefined}>
            <PasswordInput id="new-password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>{busy ? t('loading') : t('save')}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
