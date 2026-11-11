'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { YakunexMark } from '@/components/brand/logo';
import { NAV_SECTIONS } from '@/lib/nav';
import { cn } from '@/lib/cn';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  const { t, lang } = useLang();

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar text-white/80">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <YakunexMark className="h-9 w-9" />
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold text-white">ProjectFlow</p>
          <p className="text-[11px] uppercase tracking-wider text-white/50">by Yakunex</p>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={section.title.en}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
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
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-gold/15 font-medium text-gold'
                            : 'hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-gold' : 'text-white/50 group-hover:text-white/80')} />
                        <span className="flex-1 truncate">{t(item.key)}</span>
                        {!item.ready && <Lock className="h-3 w-3 text-white/30" aria-label="Planned" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
