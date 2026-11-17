'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, LogOut, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useAuth, useLang, useTheme, type ThemeChoice } from '@/components/providers';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { ALL_NAV_ITEMS, findNavItem } from '@/lib/nav';

const THEME_OPTIONS: { value: ThemeChoice; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'lightTheme' },
  { value: 'dark', icon: Moon, labelKey: 'darkTheme' },
  { value: 'system', icon: Monitor, labelKey: 'systemTheme' },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, can, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLang();

  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [query, setQuery] = useState('');

  const segment = pathname.split('/')[1] ?? 'dashboard';
  const current = findNavItem(segment);
  const title = t(current?.key ?? 'dashboard');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const searchableItems = useMemo(() => {
    const permitted = ALL_NAV_ITEMS.filter((item) => !item.permission || can(item.permission));
    const q = query.trim().toLowerCase();
    if (!q) return permitted;
    return permitted.filter(
      (item) =>
        t(item.key).toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q),
    );
  }, [can, query, t]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  function navigateTo(href: string) {
    setSpotlightOpen(false);
    setQuery('');
    router.push(href);
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
            onClick={() => setSpotlightOpen(true)}
            className="flex w-full items-center gap-2 rounded-full bg-ink/[0.05] px-3.5 py-1.5 text-left text-xs text-muted transition-all hover:bg-ink/[0.08] hover:text-ink dark:bg-white/[0.08] dark:hover:bg-white/[0.12]"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="flex-1 truncate">Quick jump to module…</span>
            <kbd className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted shadow-2xs dark:bg-raised">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Actions */}
        <div className="ml-auto flex items-center gap-2.5">
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

      <Modal
        open={spotlightOpen}
        title="Spotlight — Jump to Module"
        onClose={() => {
          setSpotlightOpen(false);
          setQuery('');
        }}
      >
        <div className="space-y-3">
          <Input
            placeholder="Type module name (e.g. Chat, Time Tracker, Profile, Approvals)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchableItems.length > 0) {
                e.preventDefault();
                navigateTo(searchableItems[0].href);
              }
            }}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {searchableItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigateTo(item.href)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-strong dark:text-gold">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{t(item.key)}</p>
                    <p className="truncate text-xs text-muted">{item.description}</p>
                  </div>
                </button>
              );
            })}
            {searchableItems.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">No matching modules found.</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
