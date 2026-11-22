'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Coffee, LogIn, LogOut, Search, Square, Sun, Video, type LucideIcon } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { useToast } from '@/components/ui/toast';
import { ApiError, post } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ALL_NAV_ITEMS, isNavItemVisibleForRole } from '@/lib/nav';
import { PERMISSIONS } from '@/lib/permissions';

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  run: () => Promise<void> | void;
}

/** Ctrl/⌘+K: jump to any module or do a daily action (clock in, break, stop timer…) from anywhere. */
export function CommandPalette() {
  const router = useRouter();
  const toast = useToast();
  const { user, can } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('yakunex:command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('yakunex:command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const api = (path: string, ok: string) => async () => {
      try {
        await post(path, path === '/attendance/clock-in' ? { workMode: 'OFFICE', deviceType: 'Desktop Web' } : undefined);
        toast.success(ok);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'That did not work.');
      }
    };
    const actions: Command[] = [
      { id: 'my-day', label: 'Open My Day', hint: 'Dashboard', icon: Sun, keywords: 'today home dashboard my day', run: () => router.push('/dashboard') },
    ];
    if (can(PERMISSIONS.TIME_OWN)) {
      actions.push(
        { id: 'clock-in', label: 'Clock in', hint: 'Attendance', icon: LogIn, keywords: 'clock in start day attendance', run: api('/attendance/clock-in', 'Clocked in') },
        { id: 'break', label: 'Start / end break', hint: 'Attendance', icon: Coffee, keywords: 'break lunch tea', run: api('/attendance/break', 'Break updated') },
        { id: 'stop-timer', label: 'Stop my timer', hint: 'Time tracker', icon: Square, keywords: 'stop timer pause time', run: api('/time-entries/stop', 'Timer stopped') },
        { id: 'clock-out', label: 'Clock out', hint: 'Attendance', icon: LogOut, keywords: 'clock out end day leave office', run: api('/attendance/clock-out', 'Clocked out') },
        { id: 'leave', label: 'Request leave', hint: 'Leave', icon: ArrowRight, keywords: 'leave holiday sick vacation', run: () => router.push('/leave') },
      );
    }
    if (user?.role !== 'INTERN' && can(PERMISSIONS.CHAT_USE)) {
      actions.push({ id: 'meet', label: 'Start an instant meeting', hint: 'Meetings', icon: Video, keywords: 'meet call video huddle', run: () => router.push('/meet?instant=1') });
    }
    const modules: Command[] = ALL_NAV_ITEMS.filter((item) => isNavItemVisibleForRole(item, user?.role, can)).map((item) => ({
      id: `nav-${item.key}`,
      label: t(item.key as Parameters<typeof t>[0]) || item.key,
      hint: 'Go to',
      icon: item.icon,
      keywords: `${item.key} ${item.description}`.toLowerCase(),
      run: () => router.push(item.href),
    }));
    return [...actions, ...modules];
  }, [can, router, t, toast, user?.role]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    // Label matches beat keyword/description matches, and prefix matches beat the rest.
    const score = (c: Command) => {
      const label = c.label.toLowerCase();
      if (label.startsWith(q)) return 0;
      const words = c.keywords.split(/\s+/);
      // The first keyword is the module key (e.g. "approvals") or the action's main word.
      if (label.includes(q) || words[0]?.startsWith(q)) return 1;
      if (words.some((w) => w.startsWith(q))) return 2;
      return c.keywords.includes(q) ? 3 : -1;
    };
    return commands
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .map((x) => x.c);
  }, [commands, query]);

  if (!open || !user) return null;

  async function choose(c: Command | undefined) {
    if (!c) return;
    setOpen(false);
    await c.run();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-[3px]" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick actions"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void choose(results[cursor]);
              }
            }}
            placeholder="Type a command or module…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches.</li>}
          {results.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => void choose(c)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px]',
                    i === cursor ? 'bg-gold/15 text-ink' : 'text-ink hover:bg-ink/[0.04]',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className="text-[11px] text-muted">{c.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
