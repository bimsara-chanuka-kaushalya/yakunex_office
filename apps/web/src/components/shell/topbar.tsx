'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Eye, LogOut, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import {
  ROLE_PREVIEW_OPTIONS,
  useAuth,
  useLang,
  useTheme,
  type RolePreviewPreset,
  type ThemeChoice,
} from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { findNavItem } from '@/lib/nav';

const THEME_OPTIONS: { value: ThemeChoice; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'lightTheme' },
  { value: 'dark', icon: Moon, labelKey: 'darkTheme' },
  { value: 'system', icon: Monitor, labelKey: 'systemTheme' },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isSuperAdminReal, previewRole, setPreviewRole } = useAuth();
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
    <>
      <header className="material sticky top-0 z-30 flex h-16 items-center gap-2.5 border-b border-line/70 px-3.5 sm:gap-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-full p-2 text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="hidden sm:inline">Yakunex</span>
            <ChevronRight className="hidden h-3 w-3 text-muted/60 sm:inline" />
            <h1 className="font-display text-[17px] font-semibold tracking-tight text-ink capitalize sm:text-[19px]">
              {title}
            </h1>
          </div>
        </div>

        {/* Center Spotlight Search Trigger */}
        <div className="mx-auto hidden max-w-xs flex-1 lg:block">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('yakunex:command-palette'))}
            className="flex w-full items-center gap-2 rounded-full bg-ink/[0.05] px-3.5 py-1.5 text-left text-xs text-muted transition-all hover:bg-ink/[0.08] hover:text-ink dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="flex-1 truncate">Jump to a module or action…</span>
            <kbd className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted shadow-2xs dark:bg-raised">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Actions */}
        <div className="ml-auto flex items-center gap-2.5">
          {/* Super Admin Testing Role Preview Switcher */}
          {isSuperAdminReal && (
            <label
              className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold-strong dark:text-gold"
              title="Super Admin Role Preview (Testing Only)"
            >
              <Eye className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xl:inline">View as:</span>
              <select
                aria-label="Preview system as role"
                value={previewRole ?? ''}
                onChange={(e) => {
                  const next = (e.target.value || null) as RolePreviewPreset | null;
                  setPreviewRole(next);
                  router.push('/dashboard');
                }}
                className="max-w-[140px] cursor-pointer bg-transparent text-xs font-semibold text-ink focus:outline-none dark:text-gold"
              >
                <option value="" className="bg-surface text-ink">Super Admin (Actual)</option>
                {ROLE_PREVIEW_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-surface text-ink">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Apple Segmented Theme Switcher */}
          <div role="radiogroup" aria-label={t('theme')} className="segmented hidden sm:inline-flex">
            {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                aria-label={t(labelKey)}
                title={t(labelKey)}
                onClick={() => setTheme(value)}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Apple Segmented Language Switcher */}
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

          {/* User Profile Pill */}
          {user && (
            <button
              type="button"
              onClick={() => router.push('/profile')}
              title="View Profile"
              className="ml-0.5 hidden items-center gap-2.5 rounded-full bg-ink/[0.04] py-1 pl-1.5 pr-3 transition hover:bg-ink/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.12] md:flex"
            >
              <Avatar
                src={user.avatarUrl}
                name={user.fullName}
                fallbackText={user.fullName.slice(0, 1).toUpperCase()}
                size="sm"
              />
              <div className="text-left leading-none">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-ink">{user.fullName}</p>
                  {user.companyId && (
                    <span className="rounded-full bg-gold/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gold-strong dark:text-gold">
                      {user.companyId}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {ROLE_LABELS[user.role as Role]?.[lang] ?? user.role}
                </p>
              </div>
            </button>
          )}

          <Button variant="ghost" size="sm" onClick={handleLogout} aria-label={t('signOut')}>
            <LogOut className="h-4 w-4" />
            <span className="hidden xl:inline">{t('signOut')}</span>
          </Button>
        </div>
      </header>

    </>
  );
}
