'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useLang } from '@/components/providers';
import { YakunexLogo, YakunexMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { ApiError, post } from '@/lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang, setLang } = useLang();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const queryToken = searchParams.get('token');
    if (queryToken) {
      setToken(queryToken);
    }
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('Please provide a valid password reset token.');
      return;
    }

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters long.');
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Password must contain both letters and numbers.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      return;
    }

    setBusy(true);
    try {
      await post('/auth/reset-password', { token: token.trim(), newPassword });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset password. The link may have expired.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <YakunexMark />
          <span className="font-display text-xl font-semibold">Yakunex Hub</span>
        </div>
        <div className="max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Identity Verification</span>
          </div>
          <h2 className="font-display text-5xl font-semibold leading-[1.05]">
            Set your new workspace password.
          </h2>
          <p className="mt-5 text-base text-white/60">
            Choose a strong passphrase to protect your account and project assets across all devices.
          </p>
        </div>
        <YakunexLogo className="w-44 opacity-90" />
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink focus:outline-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('backToSignIn')}</span>
          </Link>

          <div
            role="radiogroup"
            aria-label={t('language')}
            className="flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs font-medium"
          >
            {(['en', 'si'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  lang === code ? 'bg-canvas text-gold' : 'text-muted hover:text-ink'
                }`}
              >
                {code === 'en' ? 'EN' : 'සිං'}
              </button>
            ))}
          </div>
        </div>

        <div className="m-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <YakunexLogo className="w-32" />
          </div>

          <h1 className="font-display text-3xl font-semibold">{t('resetPasswordTitle')}</h1>
          <p className="mt-1.5 text-sm text-muted">{t('resetPasswordSubtitle')}</p>

          {!success ? (
            <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
              {!searchParams.get('token') && (
                <Field label={t('resetToken')} htmlFor="token">
                  <Input
                    id="token"
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Paste your reset token here"
                  />
                </Field>
              )}

              <Field label={t('newPassword')} htmlFor="new-password">
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters"
                />
              </Field>

              <Field label={t('confirmPassword')} htmlFor="confirm-password">
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                />
              </Field>

              <div aria-live="polite" className="min-h-[1.25rem]">
                {error && <p className="text-sm text-danger">{error}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('loading') : t('resetPassword')}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>{t('backToSignIn')}</span>
                </Link>
              </div>
            </form>
          ) : (
            <div className="mt-8 space-y-5">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-emerald-400">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{t('passwordResetSuccess')}</p>
                    <p className="mt-1 text-xs opacity-80">
                      All previous sessions have been safely invalidated.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => router.push('/login')}
              >
                <span>{t('signInWithNewPassword')}</span>
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center">Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

