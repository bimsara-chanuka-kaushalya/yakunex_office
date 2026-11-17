'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { YakunexMark } from '@/components/brand/logo';
import { NAV_SECTIONS } from '@/lib/nav';
import { ROLE_LABELS, type Role } from '@/lib/permissions';
import { cn } from '@/lib/cn';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, can } = useAuth();
  const { t, lang } = useLang();

  return (
    <nav
      aria-label="Main"
      className="flex h-full flex-col border-r border-sidebar-line/80 bg-sidebar/90 text-ink backdrop-blur-xl"
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-sidebar-line/70 px-4 py-4">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3">
          <div className="relative">
            <YakunexMark className="h-9 w-9 drop-shadow-[0_2px_8px_rgba(201,150,30,0.28)]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold tracking-tight text-ink">Yakunex Hub</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold-strong dark:text-gold">
              Enterprise Cloud
            </p>
          </div>
        </Link>
      </div>

      {/* macOS Source List Navigation */}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.title.en}>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
                {section.title[lang]}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150 ease-spring',
                          active
                            ? 'bg-gold/15 font-semibold text-gold-strong shadow-2xs dark:bg-gold/20 dark:text-gold'
                            : 'text-ink/80 hover:bg-ink/[0.05] hover:text-ink dark:hover:bg-white/[0.07]',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105',
                            active
                              ? 'text-gold-strong dark:text-gold'
                              : 'text-muted group-hover:text-ink',
                          )}
                        />
                        <span className="flex-1 truncate">{t(item.key)}</span>
                        {!item.ready && (
                          <span
                            className="flex items-center rounded bg-ink/[0.05] px-1.5 py-0.5 text-[10px] text-muted dark:bg-white/[0.08]"
                            title="Planned module"
                          >
                            <Lock className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* User Footer Card */}
      {user && (
        <div className="border-t border-sidebar-line/70 p-3">
          <Link
            href="/profile"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-[14px] bg-surface/80 p-2 shadow-2xs ring-1 ring-line/60 transition-all hover:bg-surface dark:bg-raised/70"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 font-mono text-[11px] font-bold text-gold-strong dark:text-gold">
              {user.companyId ? user.companyId.slice(-4) : user.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-semibold text-ink">{user.fullName}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                {user.companyId && (
                  <span className="rounded bg-gold/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-gold-strong dark:text-gold">
                    {user.companyId}
                  </span>
                )}
                <span className="truncate text-[10px] text-muted">
                  {ROLE_LABELS[user.role as Role]?.[lang] ?? user.role}
                </span>
              </div>
            </div>
          </Link>
        </div>
      )}
    </nav>
  );
}
