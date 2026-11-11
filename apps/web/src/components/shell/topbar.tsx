'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, LogOut, Menu, Monitor, Moon, Sun } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur md:px-8">
      <button
        type="button"
        onClick={onMenu}
        className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {segment !== 'dashboard' && (
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-ink focus:outline-none"
          title={t('backToDashboard')}
          aria-label={t('backToDashboard')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('back')}</span>
        </button>
      )}

      <h1 className="font-display text-xl font-semibold capitalize">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <div role="radiogroup" aria-label={t('theme')} className="hidden items-center rounded-lg border border-line bg-canvas p-0.5 sm:flex">
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
                'rounded-md p-1.5 transition-colors',
                theme === value ? 'bg-surface text-gold shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label={t('language')} className="flex items-center rounded-lg border border-line bg-canvas p-0.5 text-xs font-medium">
          {(['en', 'si'] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={lang === code}
              onClick={() => setLang(code)}
              className={cn(
                'rounded-md px-2 py-1 transition-colors',
                lang === code ? 'bg-surface text-gold shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {code === 'en' ? 'EN' : 'සිං'}
            </button>
          ))}
        </div>

        {user && (
          <div className="ml-2 hidden text-right leading-tight md:block">
            <p className="text-sm font-medium">{user.fullName}</p>
            <p className="text-xs text-muted">{ROLE_LABELS[user.role as Role]?.[lang] ?? user.role}</p>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={handleLogout} aria-label={t('signOut')} className="ml-1">
          <LogOut className="h-4 w-4" />
          <span className="hidden lg:inline">{t('signOut')}</span>
        </Button>
      </div>
    </header>
  );
}
