'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import { useLang } from '@/components/providers';
import { YakunexLogo, YakunexMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError, post } from '@/lib/api';

interface ForgotPasswordResponse {
  ok: boolean;
  message: string;
  deliveryChannel?: 'EMAIL' | 'ADMIN_APPROVAL';
}

export default function ForgotPasswordPage() {
  const { t, lang, setLang } = useLang();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ForgotPasswordResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await post<ForgotPasswordResponse>('/auth/forgot-password', { email });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection.');
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
            <KeyRound className="h-3.5 w-3.5" />
            <span>Zero-Trust Account Recovery</span>
          </div>
          <h2 className="font-display text-5xl font-semibold leading-[1.05]">
            Secure workspace recovery.
          </h2>
          <p className="mt-5 text-base text-white/60">
            Recovery tokens are never exposed publicly in the browser. Links are delivered strictly via verified company email or HR / Super Admin identity verification.
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

          <h1 className="font-display text-3xl font-semibold">{t('forgotPasswordTitle')}</h1>
          <p className="mt-1.5 text-sm text-muted">{t('forgotPasswordSubtitle')}</p>

          {!result ? (
            <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
              <Field label={t('companyIdOrEmail')} htmlFor="email" error={undefined}>
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="YNX-STF-0001 or name@yakunx.com"
                />
              </Field>

              <div aria-live="polite" className="min-h-[1.25rem]">
                {error && <p className="text-sm text-danger">{error}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? t('loading') : t('sendResetLink')}
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
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{result.message}</p>
                    <p className="mt-1.5 text-xs opacity-90">
                      {result.deliveryChannel === 'EMAIL'
                        ? 'Check your registered inbox (and spam folder). The single-use link expires in 60 minutes.'
                        : 'For security, self-service links are never shown on public screens. Contact HR or your Super Admin to receive your verified 1-click recovery link.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface p-3.5 text-xs text-muted flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold-strong dark:text-gold" />
                <span>
                  Request recorded in the immutable security audit log. Active sessions remain protected until verification completes.
                </span>
              </div>

              <div className="pt-2 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>{t('backToSignIn')}</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
