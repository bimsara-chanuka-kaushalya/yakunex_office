'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, Search, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { api, ApiError, patch, post, put } from '@/lib/api';
import { PERMISSIONS, ROLE_LABELS, type Role } from '@/lib/permissions';
import { cn } from '@/lib/cn';

type AccountStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

interface UserRow {
  id: string;
  companyId: string | null;
  email: string;
  fullName: string;
  title: string | null;
  role: Role;
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  mustChangePassword: boolean;
}

interface UserList {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'STAFF', 'INTERN'];

const STATUS_TONE: Record<AccountStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DEACTIVATED: 'danger',
  INVITED: 'neutral',
};

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

export default function UsersPage() {
  const { user, can } = useAuth();
  const { t, lang } = useLang();
  const actorRole = (user?.role ?? 'STAFF') as Role;

  const assignableRoles =
    actorRole === 'SUPER_ADMIN'
      ? ALL_ROLES
      : ALL_ROLES.filter((r) => r !== 'SUPER_ADMIN' && r !== 'ADMIN');
  const canManage = (target: UserRow) =>
    target.id !== user?.id &&
    (actorRole === 'SUPER_ADMIN' || (target.role !== 'ADMIN' && target.role !== 'SUPER_ADMIN'));

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [statusFilter, setStatusFilter] = useState<'' | AccountStatus>('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<UserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [permTarget, setPermTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    try {
      setList(await api<UserList>(`/users?${params.toString()}`));
    } catch (err) {
      setLoadError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(row: UserRow, role: Role) {
    if (role === row.role) return;
    setNotice(null);
    try {
      await patch(`/users/${row.id}/role`, { role });
      setNotice({ tone: 'success', text: `${row.fullName} is now ${ROLE_LABELS[role][lang]}.` });
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) });
    }
  }

  async function changeStatus(row: UserRow, status: AccountStatus) {
    setNotice(null);
    try {
      await patch(`/users/${row.id}/status`, { status });
      setNotice({
        tone: 'success',
        text:
          status === 'ACTIVE'
            ? `${row.fullName} can sign in again.`
            : `${row.fullName} has been ${status.toLowerCase()} and signed out.`,
      });
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold">{t('users')}</h2>
          <p className="mt-1 text-sm text-muted">
            {list
              ? `${list.total} ${list.total === 1 ? 'account' : 'accounts'} in your organisation`
              : '\u00A0'}
          </p>
        </div>
        {can(PERMISSIONS.USERS_WRITE) && (
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {t('addUser')}
          </Button>
        )}
      </header>

      {notice && (
        <div
          role="status"
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            notice.tone === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          {notice.text}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label={t('search')}
              placeholder="Search by Company ID (e.g. YNX-0001), name, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:w-auto">
            <Select
              aria-label={t('role')}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as '' | Role);
                setPage(1);
              }}
            >
              <option value="">{t('role')}: all</option>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r][lang]}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('status')}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | AccountStatus);
                setPage(1);
              }}
            >
              <option value="">{t('status')}: all</option>
              <option value="ACTIVE">{t('active')}</option>
              <option value="INVITED">{t('invited')}</option>
              <option value="SUSPENDED">{t('suspended')}</option>
              <option value="DEACTIVATED">{t('deactivated')}</option>
            </Select>
          </div>
        </div>

        {loadError ? (
          <div className="p-8 text-center">
            <p className="text-sm text-danger">{loadError}</p>
            <Button variant="secondary" className="mt-4" onClick={load}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-canvas/60 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Company ID
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Person
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    {t('role')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    {t('status')}
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Last sign-in
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading && !list ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-5 py-4">
                        <Skeleton />
                      </td>
                    </tr>
                  ))
                ) : list && list.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={<UsersIcon className="h-5 w-5" />}
                        title="No matching accounts"
                        description="Try a different Company ID, name, email or filter."
                      />
                    </td>
                  </tr>
                ) : (
                  list?.items.map((row) => {
                    const self = row.id === user?.id;
                    const editable = canManage(row);
                    return (
                      <tr
                        key={row.id}
                        className={cn('transition-colors hover:bg-canvas/50', loading && 'opacity-60')}
                      >
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-xs font-semibold text-gold">
                            {row.companyId ?? '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">
                              {row.fullName.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium">
                                <span className="truncate">{row.fullName}</span>
                                {self && <Badge tone="gold">You</Badge>}
                              </p>
                              <p className="truncate text-xs text-muted">
                                {row.email} {row.title ? `· ${row.title}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {can(PERMISSIONS.USERS_ASSIGN_ROLES) && editable ? (
                            <Select
                              aria-label={`${t('role')}: ${row.fullName}`}
                              value={row.role}
                              onChange={(e) => changeRole(row, e.target.value as Role)}
                              className="h-9 min-w-[10rem] text-xs"
                            >
                              {[...new Set<Role>([row.role, ...assignableRoles])].map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r][lang]}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span>{ROLE_LABELS[row.role][lang]}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <Badge tone={STATUS_TONE[row.status]}>{t(row.status.toLowerCase())}</Badge>
                          {row.mustChangePassword && (
                            <p className="mt-1 text-xs text-muted">Temporary password</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          {row.lastLoginAt
                            ? new Date(row.lastLoginAt).toLocaleString(
                                lang === 'si' ? 'si-LK' : 'en-LK',
                                {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                  timeZone: 'Asia/Colombo',
                                },
                              )
                            : 'Never'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {can(PERMISSIONS.USERS_MANAGE_PERMISSIONS) && editable && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPermTarget(row)}
                                title="Permission overrides"
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                                Permissions
                              </Button>
                            )}
                            {can(PERMISSIONS.USERS_WRITE) && editable && (
                              row.status === 'ACTIVE' ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => changeStatus(row, 'SUSPENDED')}
                                >
                                  {t('suspend')}
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => changeStatus(row, 'ACTIVE')}
                                >
                                  {t('reactivate')}
                                </Button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {list && list.totalPages > 1 && (
          <nav
            aria-label="Pagination"
            className="flex items-center justify-between border-t border-line px-5 py-3 text-sm"
          >
            <p className="text-muted">
              Page {list.page} of {list.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= list.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </nav>
        )}
      </Card>

      <CreateUserDialog
        open={createOpen}
        roles={assignableRoles}
        onClose={() => setCreateOpen(false)}
        onCreated={async (name) => {
          setNotice({
            tone: 'success',
            text: `${name} was added. Share the temporary password securely.`,
          });
          await load();
        }}
      />

      <PermissionsOverrideDialog
        target={permTarget}
        onClose={() => setPermTarget(null)}
        onSaved={(name) => {
          setPermTarget(null);
          setNotice({
            tone: 'success',
            text: `Updated granular permission overrides for ${name}.`,
          });
        }}
      />
    </div>
  );
}

function PermissionsOverrideDialog({
  target,
  onClose,
  onSaved,
}: {
  target: UserRow | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Set<string>>(new Set());
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [revokes, setRevokes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api<string[]>('/users/permission-catalog'),
      api<{ roleDefaults: string[]; grants: string[]; revokes: string[] }>(
        `/users/${target.id}/permissions`,
      ),
    ])
      .then(([cat, data]) => {
        setCatalog(cat);
        setRoleDefaults(new Set(data.roleDefaults));
        setGrants(new Set(data.grants));
        setRevokes(new Set(data.revokes));
      })
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, [target]);

  function setOverride(key: string, mode: 'default' | 'grant' | 'revoke') {
    const nextGrants = new Set(grants);
    const nextRevokes = new Set(revokes);
    nextGrants.delete(key);
    nextRevokes.delete(key);
    if (mode === 'grant') nextGrants.add(key);
    if (mode === 'revoke') nextRevokes.add(key);
    setGrants(nextGrants);
    setRevokes(nextRevokes);
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await put(`/users/${target.id}/permissions`, {
        grants: [...grants],
        revokes: [...revokes],
      });
      onSaved(target.fullName);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      title={target ? `Permission overrides · ${target.fullName}` : 'Permissions'}
      onClose={onClose}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Override individual permissions on top of this user&apos;s role defaults.
          </p>
          <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {catalog.map((key) => {
              const inRole = roleDefaults.has(key);
              const mode = grants.has(key) ? 'grant' : revokes.has(key) ? 'revoke' : 'default';
              return (
                <div key={key} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div>
                    <p className="font-mono font-medium text-ink">{key}</p>
                    <p className="text-[11px] text-muted">
                      Role default: {inRole ? 'Allowed' : 'Not included'}
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-line bg-canvas p-0.5">
                    {(['default', 'grant', 'revoke'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setOverride(key, m)}
                        className={cn(
                          'rounded-md px-2 py-1 capitalize transition-colors',
                          mode === m ? 'bg-surface font-medium text-gold shadow-sm' : 'text-muted',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save overrides'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateUserDialog({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  onCreated: (fullName: string) => Promise<void>;
}) {
  const { t, lang } = useLang();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [roleCode, setRoleCode] = useState<'CEO' | 'MD' | 'DIR' | 'HR' | 'PM' | 'DEV' | 'INT' | 'STF'>('STF');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; companyId: string | null; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCreatedPassword, setShowCreatedPassword] = useState(true);

  function defaultCodeForRole(nextRole: Role): 'CEO' | 'MD' | 'DIR' | 'HR' | 'PM' | 'DEV' | 'INT' | 'STF' {
    switch (nextRole) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return 'DIR';
      case 'PROJECT_MANAGER':
        return 'PM';
      case 'INTERN':
        return 'INT';
      default:
        return 'STF';
    }
  }

  const previewLast =
    lastName.trim().split(/\s+/).filter(Boolean).pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'lastname';
  const suggestedEmail = `${previewLast}@${roleCode.toLowerCase()}.yakunx.com`;

  function reset() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setCompanyId('');
    setRole('STAFF');
    setRoleCode('STF');
    setTitle('');
    setError(null);
    setCreated(null);
    setCopied(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const fullName = [trimmedFirst, trimmedLast].filter(Boolean).join(' ');
    try {
      const result = await post<{ user: { fullName: string; companyId: string | null; email: string }; temporaryPassword: string }>(
        '/users',
        {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          fullName,
          email: email.trim() || undefined,
          companyId: companyId.trim() || undefined,
          role,
          roleCode,
          title: title || undefined,
        },
      );
      setCreated({
        name: result.user.fullName,
        companyId: result.user.companyId,
        email: result.user.email,
        password: result.temporaryPassword,
      });
      await onCreated(result.user.fullName);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!created) return;
    const text = `Company ID: ${created.companyId ?? '—'}\nEmail: ${created.email}\nPassword: ${created.password}`;
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      open={open}
      title={created ? 'Account created' : t('addUser')}
      onClose={close}
      dismissible={!created}
    >
      {created ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Give {created.name} their Company ID and temporary password. They can sign in using either their{' '}
            <strong className="text-ink">Company ID ({created.companyId})</strong> or their email.
          </p>
          <div className="space-y-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
            <div className="flex items-center justify-between border-b border-gold/20 pb-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Company ID</p>
                <p className="font-mono text-base font-bold text-gold">{created.companyId ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-muted">{t('email')}</p>
                <p className="font-mono text-xs text-ink">{created.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">
                  {t('temporaryPassword')}
                </p>
                <p className="font-mono text-lg tracking-wider">
                  {showCreatedPassword ? created.password : '••••••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreatedPassword((v) => !v)}
                  title={showCreatedPassword ? t('hidePassword') : t('showPassword')}
                  aria-label={showCreatedPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showCreatedPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="secondary" size="sm" onClick={copyPassword}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t('copied') : t('copy')}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="new-first-name">
              <Input
                id="new-first-name"
                required
                minLength={1}
                maxLength={60}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Chanuka"
              />
            </Field>
            <Field label="Last name" htmlFor="new-last-name">
              <Input
                id="new-last-name"
                required
                minLength={1}
                maxLength={60}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Silva"
              />
            </Field>
          </div>
          <Field label="Company ID (Auto if blank)" htmlFor="new-company-id">
            <Input
              id="new-company-id"
              maxLength={32}
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value.toUpperCase())}
              placeholder={`Auto (e.g. YNX-${roleCode}-0001)`}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department / Role Code" htmlFor="new-role-code">
              <Select
                id="new-role-code"
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value as 'CEO' | 'MD' | 'DIR' | 'HR' | 'PM' | 'DEV' | 'INT' | 'STF')}
              >
                <option value="CEO">CEO — Chief Executive Officer</option>
                <option value="MD">MD — Managing Director</option>
                <option value="DIR">DIR — Director / Management</option>
                <option value="HR">HR — Human Resources</option>
                <option value="PM">PM — Project Manager</option>
                <option value="DEV">DEV — Developer / Software Engineer</option>
                <option value="INT">INT — Intern / Technical Intern</option>
                <option value="STF">STF — Staff / General Employee</option>
              </Select>
            </Field>
            <Field label="Company Mail (Auto if blank)" htmlFor="new-email">
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={suggestedEmail}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('role')} htmlFor="new-role">
              <Select
                id="new-role"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as Role;
                  setRole(next);
                  setRoleCode(defaultCodeForRole(next));
                }}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r][lang]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Job title" htmlFor="new-title">
              <Input
                id="new-title"
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Backend Developer"
              />
            </Field>
          </div>
          <div aria-live="polite" className="min-h-[1.25rem] text-sm text-danger">
            {error}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={close}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('loading') : t('addUser')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
