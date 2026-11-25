'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Eye, EyeOff, Lock, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { liveGet, post, put } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  NAV_SECTIONS,
  defaultModuleAccess,
  type ModuleAccessConfig,
  type ModuleAccessState,
} from '@/lib/nav';

// ─── Intern sidebar: show / lock / hide each module ───────────────────────────

const STATES: Array<{ key: ModuleAccessState; label: string; icon: typeof Eye; hint: string }> = [
  { key: 'SHOWN', label: 'Show', icon: Eye, hint: 'In the sidebar and usable' },
  { key: 'LOCKED', label: 'Lock', icon: Lock, hint: 'In the sidebar with a lock; cannot be opened' },
  { key: 'HIDDEN', label: 'Hide', icon: EyeOff, hint: 'Not in the sidebar; cannot be opened' },
];

export function InternSidebarAccess({ internPermissions }: { internPermissions: string[] }) {
  const { moduleAccess, setModuleAccess } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const role = 'INTERN';
  const saved = moduleAccess[role] ?? {};
  const [draft, setDraft] = useState<Record<string, ModuleAccessState>>({});
  const [saving, setSaving] = useState(false);

  const modules = useMemo(
    () => NAV_SECTIONS.map((s) => ({ title: s.title.en, items: s.items.filter((i) => i.ready && i.key !== 'profile') })),
    [],
  );
  const stateOf = (key: string): ModuleAccessState => draft[key] ?? saved[key] ?? defaultModuleAccess(role, key);
  const dirty = Object.keys(draft).some((k) => draft[k] !== (saved[k] ?? defaultModuleAccess(role, k)));

  async function save() {
    setSaving(true);
    try {
      const access: Record<string, ModuleAccessState> = {};
      for (const section of modules) for (const item of section.items) access[item.key] = stateOf(item.key);
      const next = await put<ModuleAccessConfig>(`/module-access/${role}`, { access });
      setModuleAccess(next);
      setDraft({});
      toast.success('Intern sidebar updated — interns see it right away.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function resetDefaults() {
    setSaving(true);
    try {
      const next = await put<ModuleAccessConfig>(`/module-access/${role}`, { access: {} });
      setModuleAccess(next);
      setDraft({});
      toast.success('Intern sidebar reset to the default.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reset.');
    } finally {
      setSaving(false);
    }
  }

  const counts = { SHOWN: 0, LOCKED: 0, HIDDEN: 0 };
  for (const s of modules) for (const i of s.items) counts[stateOf(i.key)] += 1;

  return (
    <Card>
      <CardHeader
        title="Intern sidebar"
        description="Choose what interns see in their sidebar. Profile is always available. Use “View as: Intern” in the top bar to preview."
        badge={<Badge tone="gold">Super Admin</Badge>}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={resetDefaults} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Default
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 px-5 pb-3 text-[12px] text-muted sm:px-6">
        <span>{counts.SHOWN} shown</span>
        <span>· {counts.LOCKED} locked</span>
        <span>· {counts.HIDDEN} hidden</span>
      </div>
      <div className="grid gap-x-6 gap-y-4 px-5 pb-6 sm:px-6 2xl:grid-cols-2">
        {modules.map((section) =>
          section.items.length === 0 ? null : (
            <section key={section.title}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{section.title}</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {section.items.map((item) => {
                  const current = stateOf(item.key);
                  const Icon = item.icon;
                  // Showing a module does not grant data access: the API still follows the role's permissions.
                  const missingPerm = Boolean(item.permission && !internPermissions.includes(item.permission));
                  return (
                    <li key={item.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{t(item.key)}</p>
                        {missingPerm && current === 'SHOWN' && (
                          <p className="text-[11px] text-warning">Interns lack “{item.permission}” — the page may show no data.</p>
                        )}
                      </div>
                      <div role="radiogroup" aria-label={`${t(item.key)} for interns`} className="flex rounded-full bg-ink/[0.05] p-0.5 dark:bg-white/[0.06]">
                        {STATES.map((st) => {
                          const SIcon = st.icon;
                          const on = current === st.key;
                          return (
                            <button
                              key={st.key}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              title={st.hint}
                              onClick={() => setDraft((d) => ({ ...d, [item.key]: st.key }))}
                              className={cn(
                                'flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium transition',
                                on
                                  ? st.key === 'SHOWN'
                                    ? 'bg-success/15 text-success'
                                    : st.key === 'LOCKED'
                                      ? 'bg-warning/15 text-warning'
                                      : 'bg-danger/10 text-danger'
                                  : 'text-muted hover:text-ink',
                              )}
                            >
                              <SIcon className="h-3 w-3" />
                              {st.label}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </Card>
  );
}

// ─── Data Manager: browse & permanently delete any workspace data ─────────────

interface Collection {
  key: string;
  label: string;
  count: number;
}
interface RecordRow {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string | null;
}

const CASCADE_NOTE: Record<string, string> = {
  projects: 'Deleting a project also deletes its tasks, sprints, bugs and documents.',
  channels: 'Deleting a chat group also deletes all of its messages. #general and #company-announcements are protected.',
  meetings: 'Meetings with people in the call right now are skipped — end them first.',
};

export function DataManager() {
  const toast = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [active, setActive] = useState('projects');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<RecordRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      setCollections(await liveGet<Collection[]>('/admin/data'));
    } catch {
      setCollections([]);
    }
  }, []);

  const loadRows = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (query.trim()) params.set('q', query.trim());
      const res = await liveGet<{ total: number; items: RecordRow[] }>(`/admin/data/${active}?${params.toString()}`);
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setRows([]);
      toast.error(err instanceof Error ? err.message : 'Could not load records.');
    }
  }, [active, limit, query, toast]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    setRows(null);
    setSelected(new Set());
    const id = setTimeout(() => void loadRows(), query ? 250 : 0);
    return () => clearTimeout(id);
  }, [loadRows, query]);

  const activeLabel = collections?.find((c) => c.key === active)?.label ?? active;
  const allOnPage = rows && rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function doDelete(ids: string[], stepUpPassword: string) {
    setBusy(true);
    try {
      await post('/auth/verify-password', { password: stepUpPassword });
      const res = await post<{ deleted: number; skipped: Array<{ id: string; reason: string }> }>(`/admin/data/${active}/delete`, { ids });
      if (res.deleted) toast.success(`${res.deleted} ${activeLabel.toLowerCase()} deleted.`);
      if (res.skipped.length) toast.error(`${res.skipped.length} skipped: ${res.skipped[0].reason}`);
      setConfirm(null);
      setSelected(new Set());
      await Promise.all([loadRows(), loadCollections()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Data manager"
        description="Find and permanently delete any record in the workspace. Every delete is written to the audit log. User accounts are managed on the Users page."
        badge={<Badge tone="danger">Super Admin · permanent</Badge>}
      />
      <div className="grid gap-4 px-5 pb-6 sm:px-6 lg:grid-cols-[220px_1fr]">
        {/* Data types */}
        <nav aria-label="Data types" className="flex gap-1 overflow-x-auto lg:max-h-[520px] lg:flex-col lg:overflow-y-auto">
          {collections === null
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)
            : collections.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    setActive(c.key);
                    setQuery('');
                    setLimit(50);
                  }}
                  className={cn(
                    'flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] transition',
                    active === c.key ? 'bg-gold/15 font-semibold text-gold-strong dark:text-gold' : 'text-ink hover:bg-ink/[0.04]',
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  <span className="font-mono text-[11px] tabular-nums text-muted">{c.count}</span>
                </button>
              ))}
        </nav>

        {/* Records */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${activeLabel.toLowerCase()}`}
                className="h-9 w-full rounded-full bg-ink/[0.05] pl-8 pr-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-gold/30 dark:bg-white/[0.06]"
              />
            </div>
            <Button
              size="sm"
              variant="danger"
              disabled={selected.size === 0 || busy}
              onClick={() => setConfirm(Array.from(selected))}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size || ''}
            </Button>
          </div>
          {CASCADE_NOTE[active] && <p className="rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-warning">{CASCADE_NOTE[active]}</p>}

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center gap-3 border-b border-line bg-ink/[0.02] px-3 py-2 text-[12px] text-muted">
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={Boolean(allOnPage)}
                onChange={() => setSelected(allOnPage ? new Set() : new Set((rows ?? []).map((r) => r.id)))}
              />
              <span className="flex-1">
                {rows === null ? 'Loading…' : `${total} ${activeLabel.toLowerCase()}${query ? ' match' : ''}`}
              </span>
            </div>
            <ul className="max-h-[440px] divide-y divide-line overflow-y-auto">
              {rows === null &&
                Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="px-3 py-2.5">
                    <Skeleton className="h-4 w-2/3" />
                  </li>
                ))}
              {rows !== null && rows.length === 0 && (
                <li className="flex items-center justify-center gap-2 px-3 py-10 text-[13px] text-muted">
                  <Database className="h-4 w-4" /> Nothing here.
                </li>
              )}
              {rows?.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2 hover:bg-ink/[0.02]">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{r.title}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {r.subtitle}
                      {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete ${r.title}`}
                    onClick={() => setConfirm([r.id])}
                    className="rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {rows && total > rows.length && (
            <Button size="sm" variant="secondary" onClick={() => setLimit((l) => Math.min(200, l + 50))}>
              Show more ({rows.length} of {total})
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm && confirm.length > 1 ? `Delete ${confirm.length} ${activeLabel.toLowerCase()}?` : `Delete this ${activeLabel.toLowerCase().replace(/s$/, '')}?`}
        description={`${CASCADE_NOTE[active] ? `${CASCADE_NOTE[active]} ` : ''}This is permanent and written to the hash-chained audit log. Enter your Super Admin password to confirm.`}
        confirmLabel="Verify & Delete Permanently"
        tone="danger"
        inputLabel="Super Admin Password"
        inputPlaceholder="Enter your password to authorize purge"
        inputRequired
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={(typedPassword) => {
          if (typedPassword.trim().length < 8) {
            toast.error('Enter your Super Admin password to confirm.');
            return;
          }
          if (confirm) void doDelete(confirm, typedPassword);
        }}
      />
    </Card>
  );
}
