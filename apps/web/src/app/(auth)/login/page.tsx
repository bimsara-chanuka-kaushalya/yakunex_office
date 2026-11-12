'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, ShieldCheck, Sparkles, Zap } from 'lucide-react';
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

  function fillDemo() {
    setEmail('YNX-0001');
    setPassword('ChangeMe!2026');
    setError(null);
  }

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
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left Showcase Section with Deep Obsidian Gradient & Ambient Lighting */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-sidebar via-[#151921] to-[#0d0f13] p-12 text-white lg:flex">
        {/* Ambient Gold Radial Glow Orbs */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-gold/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-gold/15 blur-[120px]" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <YakunexMark className="h-10 w-10 drop-shadow-[0_0_15px_rgba(213,165,46,0.4)]" />
            <div className="leading-tight">
              <span className="font-display text-xl font-bold tracking-tight text-white">Yakunex Hub</span>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">Enterprise Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>Supabase Cloud Active</span>
          </div>
        </div>

        {/* Center Pitch */}
        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-1 text-xs font-semibold text-gold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Next-Gen Enterprise Delivery Suite</span>
          </div>
          <h2 className="mt-4 font-display text-5xl font-extrabold leading-[1.08] tracking-tight text-white">
            Every project, team, and hour in one place.
          </h2>
          <p className="mt-5 text-base text-white/70 leading-relaxed">
            Unify client delivery, sprint planning, Jibble-style time tracking, and built-in video
            meetings into a single lightning-fast workspace.
          </p>

          {/* Feature highlights */}
          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              { icon: Zap, label: 'Sub-300ms Login & Cache' },
              { icon: ShieldCheck, label: 'Enterprise RBAC (5 Roles)' },
              { icon: CheckCircle2, label: 'Company ID (YNX-XXXX)' },
              { icon: KeyRound, label: 'Argon2id Encrypted' },
            ].map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 p-2.5 backdrop-blur-xs">
                  <Icon className="h-4 w-4 text-gold shrink-0" />
                  <span className="text-xs font-medium text-white/85">{feat.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Logo & Copyright */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6">
          <YakunexLogo className="w-36 opacity-85" />
          <p className="text-xs text-white/40">© 2026 Yakunex Technologies (Pvt) Ltd.</p>
        </div>
      </section>

      {/* Right Login Form Section */}
      <section className="flex flex-col justify-between bg-canvas px-6 py-8 sm:px-12 md:px-16">
        {/* Top Language Toggle */}
        <div className="flex justify-end">
          <div role="radiogroup" aria-label={t('language')} className="flex items-center rounded-xl border border-line bg-surface p-0.5 text-xs font-semibold shadow-2xs">
            {(['en', 'si'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
                className={`rounded-lg px-3 py-1 transition-all ${lang === code ? 'bg-canvas text-gold shadow-xs' : 'text-muted hover:text-ink'}`}
              >
                {code === 'en' ? 'EN' : 'සිං'}
              </button>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="mx-auto w-full max-w-sm my-auto py-6">
          <div className="mb-8 lg:hidden">
            <YakunexLogo className="w-36" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{t('welcomeBack')}</h1>
            <p className="text-sm text-muted">{t('signInSubtitle')}</p>
          </div>

          {/* Quick Demo Autofill Pill */}
          <div className="mt-6 flex items-center justify-between rounded-xl border border-gold/30 bg-gold/10 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-gold">YNX-0001</span>
              <span className="text-muted">Super Admin</span>
            </div>
            <button
              type="button"
              onClick={fillDemo}
              className="rounded-lg bg-gold px-2.5 py-1 text-[11px] font-semibold text-gold-ink shadow-2xs transition-transform active:scale-95"
            >
              Autofill
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4.5" noValidate>
            <Field label={t('companyIdOrEmail')} htmlFor="email" error={undefined}>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="YNX-0001 or admin@yakunexhub.local"
                className="h-11"
              />
            </Field>

            <Field
              label={t('password')}
              htmlFor="password"
              action={
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-gold hover:underline focus:outline-none"
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
                className="h-11"
              />
            </Field>

            <div aria-live="polite" className="min-h-[1.25rem]">
              {error && (
                <div className="flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                  <span>{error}</span>
                </div>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full text-base font-bold shadow-sm" disabled={busy}>
              {busy ? t('loading') : t('signIn')}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-muted">
            Protected by enterprise-grade Argon2id encryption & Supabase.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-muted">
          Yakunex Hub · Enterprise Suite v0.1.0
        </div>
      </section>
    </main>
  );
}
