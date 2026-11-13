'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Bell, ChevronRight, Database, LogOut, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useAuth, useLang, useTheme, type ThemeChoice } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { findNavItem } from '@/lib/nav';
import { cn } from '@/lib/cn';

const THEME_OPTIONS: { value: ThemeChoice; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'lightTheme' },
  { value: 'dark', icon: Moon, labelKey: 'darkTheme' },
  { value: 'system', icon: Monitor, labelKey: 'systemTheme' },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();

  const segment = pathname.split('/')[1] ?? 'dashboard';
  const current = findNavItem(segment);
  const title = t(current?.key ?? 'dashboard');

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2.5 sm:gap-3 border-b border-line/80 bg-surface/85 px-3.5 sm:px-6 lg:px-8 backdrop-blur-md">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-xl p-2 text-muted transition-colors hover:bg-canvas hover:text-ink md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Back button or Breadcrumbs */}
      <div className="flex items-center gap-2">
        {segment !== 'dashboard' ? (
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas/80 px-2.5 py-1 text-xs font-semibold text-muted transition-all hover:border-gold/40 hover:bg-surface hover:text-ink focus:outline-none"
            title={t('backToDashboard')}
            aria-label={t('backToDashboard')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('back')}</span>
          </button>
        ) : null}

        <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span className="hidden sm:inline">Yakunex</span>
          <ChevronRight className="hidden h-3 w-3 sm:inline text-muted/60" />
          <h1 className="font-display text-lg font-bold tracking-tight text-ink capitalize md:text-xl">
            {title}
          </h1>
        </div>
      </div>

      {/* Center Search Simulation Pill */}
      <div className="mx-auto hidden max-w-xs flex-1 lg:block">
        <div className="clay-input flex items-center gap-2 rounded-2xl border border-line/80 bg-canvas/80 px-3.5 py-2 text-xs text-muted transition-all hover:border-gold/40 hover:bg-surface">
          <Search className="h-3.5 w-3.5 text-muted" />
          <span className="flex-1 truncate">Search modules, tasks, projects...</span>
          <kbd className="rounded-lg border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted shadow-2xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Actions */}
      <div className="ml-auto flex items-center gap-2.5">
        {/* Theme Switcher */}
        <div role="radiogroup" aria-label={t('theme')} className="clay-input hidden items-center rounded-2xl border border-line/80 bg-canvas/80 p-1 sm:flex">
          {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              aria-label={t(labelKey)}
              title={t(labelKey)}
              onClick={() => setTheme(value)}
              className={cn(
                'rounded-xl p-1.5 transition-all',
                theme === value ? 'clay-btn-secondary bg-surface text-gold' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Language Switcher */}
        <div role="radiogroup" aria-label={t('language')} className="clay-input flex items-center rounded-2xl border border-line/80 bg-canvas/80 p-1 text-xs font-semibold">
          {(['en', 'si'] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={lang === code}
              onClick={() => setLang(code)}
              className={cn(
                'rounded-xl px-2.5 py-1 transition-all',
                lang === code ? 'clay-btn-secondary bg-surface text-gold' : 'text-muted hover:text-ink',
              )}
            >
              {code === 'en' ? 'EN' : 'සිං'}
            </button>
          ))}
        </div>

        {/* User Profile Pill */}
        {user && (
          <div className="ml-1 hidden items-center gap-2.5 rounded-xl border border-line/70 bg-surface px-2.5 py-1.5 shadow-2xs md:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold/30 to-gold/10 font-mono text-xs font-bold text-gold">
              {user.fullName.slice(0, 1).toUpperCase()}
            </div>
            <div className="leading-none text-left">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-ink">{user.fullName}</p>
                {user.companyId && (
                  <span className="rounded bg-gold/15 px-1 py-0.5 font-mono text-[10px] font-bold text-gold">
                    {user.companyId}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                {ROLE_LABELS[user.role as Role]?.[lang] ?? user.role}
              </p>
            </div>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={handleLogout} aria-label={t('signOut')} className="rounded-xl">
          <LogOut className="h-4 w-4" />
          <span className="hidden xl:inline">{t('signOut')}</span>
        </Button>
      </div>
    </header>
  );
}
