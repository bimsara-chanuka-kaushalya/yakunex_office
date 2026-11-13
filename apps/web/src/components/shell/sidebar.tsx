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
    <nav aria-label="Main" className="flex h-full flex-col border-r border-sidebar-line/60 bg-sidebar text-white/80">
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-sidebar-line/50 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <YakunexMark className="h-9 w-9 drop-shadow-[0_0_12px_rgba(213,165,46,0.35)]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base font-bold tracking-tight text-white">Yakunex Hub</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold/90">Enterprise Cloud</p>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 space-y-6 overflow-y-auto px-3.5 py-5">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.title.en}>
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                {section.title[lang]}
              </p>
              <ul className="space-y-1">
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
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                          active
                            ? 'bg-gradient-to-r from-gold/20 via-gold/10 to-transparent font-semibold text-gold shadow-2xs'
                            : 'text-white/70 hover:bg-white/6 hover:text-white',
                        )}
                      >
                        {/* Glowing left bar on active */}
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold shadow-[0_0_8px_rgba(213,165,46,0.8)]" />
                        )}
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110',
                            active ? 'text-gold' : 'text-white/50 group-hover:text-white/90',
                          )}
                        />
                        <span className="flex-1 truncate">{t(item.key)}</span>
                        {!item.ready && (
                          <span className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40" title="Planned module">
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
        <div className="border-t border-sidebar-line/60 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-sidebar-line/50 bg-white/4 p-2.5 transition-colors hover:bg-white/7">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gold/30 to-gold/10 font-mono text-xs font-bold text-gold">
              {user.companyId ? user.companyId.slice(-4) : user.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-white">{user.fullName}</p>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {user.companyId && (
                  <span className="rounded bg-gold/15 px-1 py-0.2 font-mono text-[10px] font-semibold text-gold">
                    {user.companyId}
                  </span>
                )}
                <span className="truncate text-[10px] text-white/50">
                  {ROLE_LABELS[user.role as Role]?.[lang] ?? user.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
