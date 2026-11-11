'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useLang } from '@/components/providers';
import { YakunexLogo, YakunexMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { ApiError } from '@/lib/api';

/** Only same-site relative paths are allowed, which blocks open redirects. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t, lang, setLang } = useLang();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      const next = safeNext(new URLSearchParams(window.location.search).get('next'));
      router.replace(next);
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
          <span className="font-display text-xl font-semibold">ProjectFlow</span>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-5xl font-semibold leading-[1.05]">
            Every project, team and hour, in one place.
          </h2>
          <p className="mt-5 text-base text-white/60">
            Plan delivery from client request to handover, track time with consent, and keep your
            team connected.
          </p>
        </div>
        <YakunexLogo className="w-44 opacity-90" />
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex justify-end">
          <div role="radiogroup" aria-label={t('language')} className="flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs font-medium">
            {(['en', 'si'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
                className={`rounded-md px-2.5 py-1 transition-colors ${lang === code ? 'bg-canvas text-gold' : 'text-muted hover:text-ink'}`}
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
          <h1 className="font-display text-3xl font-semibold">{t('welcomeBack')}</h1>
          <p className="mt-1.5 text-sm text-muted">{t('signInSubtitle')}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
            <Field label={t('email')} htmlFor="email" error={undefined}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@yakunex.lk"
              />
            </Field>

            <Field
              label={t('password')}
              htmlFor="password"
              action={
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-gold hover:underline focus:outline-none"
                >
                  {t('forgotPassword')}
                </Link>
              }
            >
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </Field>

            <div aria-live="polite" className="min-h-[1.25rem]">
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t('loading') : t('signIn')}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted">
            Enterprise Project & Workforce Management System by Yakunex Technologies.
          </p>
        </div>
      </section>
    </main>
  );
}
