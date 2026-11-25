'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { YakunexLogo, YakunexMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Field, Input, PasswordInput } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { APP_VERSION } from '@/lib/version';

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
  const [totpCode, setTotpCode] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaPrompt, setMfaPrompt] = useState('');
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const outcome = await login(email, password, mfaStep ? totpCode : undefined);
      if (outcome.requiresTwoFactor) {
        setMfaStep(true);
        setMfaPrompt(outcome.message || 'Enter the 6-digit code from your authenticator app.');
        return;
      }
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
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1c1c1e] via-[#151517] to-[#0a0a0c] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-gold/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-gold/15 blur-[120px]" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <YakunexMark className="h-10 w-10 drop-shadow-[0_0_15px_rgba(213,165,46,0.4)]" />
            <div className="leading-tight">
              <span className="font-display text-xl font-bold tracking-tight text-white">Yakunex Hub</span>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gold">Enterprise Platform</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3.5 py-1 text-xs font-semibold text-gold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Next-Gen Enterprise Delivery Suite</span>
          </div>
          <h2 className="mt-4 font-display text-5xl font-extrabold leading-[1.08] tracking-tight text-white">
            Every project, team, and hour in one place.
          </h2>
          <p className="mt-5 text-base text-white/70 leading-relaxed">
            Unify client delivery, sprint planning, Jibble-grade Google Maps live attendance, and
            built-in video meetings inside a zero-trust enterprise workspace.
          </p>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6">
          <YakunexLogo className="w-36 opacity-85" />
          <p className="text-xs text-white/40">
            © 2026 Yakunex Technologies (Pvt) Ltd. · <span className="font-mono text-gold/80">{APP_VERSION}</span>
          </p>
        </div>
      </section>

      {/* Right Login Form Section */}
      <section className="flex flex-col justify-between bg-canvas px-6 py-8 sm:px-12 md:px-16">
        <div className="flex justify-end">
          <div role="radiogroup" aria-label={t('language')} className="segmented">
            {(['en', 'si'] as const).map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                onClick={() => setLang(code)}
              >
                {code === 'en' ? 'EN' : 'සිං'}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-md rounded-[28px] bg-surface p-8 shadow-card">
          <div className="mb-8 lg:hidden">
            <YakunexLogo className="w-36" />
          </div>

          {!mfaStep ? (
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{t('welcomeBack')}</h1>
              <p className="text-sm text-muted">{t('signInSubtitle')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold-strong dark:text-gold">
                <ShieldCheck className="h-3.5 w-3.5" /> Two-Factor Verification
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
                Authenticator Code
              </h1>
              <p className="text-xs text-muted">{mfaPrompt}</p>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-4.5" noValidate>
            {!mfaStep ? (
              <>
                <Field label={t('companyIdOrEmail')} htmlFor="email" error={undefined}>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="YNX-DIR-0001 or name@yakunx.com"
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
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                    placeholder="••••••••••••"
                    className="h-11"
                  />
                </Field>

                <div className="flex items-center justify-between text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-muted">
                    <input
                      type="checkbox"
                      checked={rememberDevice}
                      onChange={(e) => setRememberDevice(e.target.checked)}
                    />
                    <span>Trust this device for 30 days</span>
                  </label>
                  {capsLockOn && (
                    <span className="font-semibold text-amber-500">Caps Lock is ON</span>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <Field label="6-digit Authenticator Code or Backup Code" htmlFor="totp">
                  <Input
                    id="totp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="123456 or ABCD-1234"
                    className="h-12 text-center font-mono text-lg tracking-widest"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => {
                    setMfaStep(false);
                    setTotpCode('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Use a different account
                </button>
              </div>
            )}

            <div aria-live="polite" className="min-h-[1.25rem]">
              {error && (
                <div className="flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
                  <span>{error}</span>
                </div>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? t('loading') : mfaStep ? 'Verify & Sign In' : t('signIn')}
            </Button>
          </form>
        </div>

        <div className="text-center text-[11px] text-muted">
          Yakunex Hub <span className="font-mono font-semibold text-gold-strong dark:text-gold">{APP_VERSION}</span> · Protected with Argon2id, HKDF JWT &amp; TOTP 2FA
        </div>
      </section>
    </main>
  );
}
