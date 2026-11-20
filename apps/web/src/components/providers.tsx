'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { api, ApiError, clearApiCache, post, refreshSession, warmWorkspaceCache } from '@/lib/api';
import { translate, type Lang } from '@/lib/i18n';
import { PERMISSIONS, type Role } from '@/lib/permissions';

export type RolePreviewPreset =
  | 'ADMIN'
  | 'PROJECT_MANAGER'
  | 'PM_HR'
  | 'PM_ACC'
  | 'STAFF'
  | 'INTERN';

export const ROLE_PREVIEW_OPTIONS: Array<{
  key: RolePreviewPreset;
  label: string;
  role: Role;
  permissions: string[];
}> = [
  {
    key: 'ADMIN',
    label: 'Admin (CTO / COO / CFO)',
    role: 'ADMIN',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.USERS_ASSIGN_ROLES,
      PERMISSIONS.USERS_MANAGE_PERMISSIONS,
      PERMISSIONS.DASHBOARD_ADMIN,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.PROJECTS_WRITE,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_WRITE,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.TIME_APPROVE,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.CHAT_USE,
      PERMISSIONS.FINANCIALS_READ,
    ],
  },
  {
    key: 'PROJECT_MANAGER',
    label: 'Project Manager (PM / PO / BA)',
    role: 'PROJECT_MANAGER',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.PROJECTS_WRITE,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_WRITE,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.CHAT_USE,
    ],
  },
  {
    key: 'PM_HR',
    label: 'HR Manager (PM + HR)',
    role: 'PROJECT_MANAGER',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_WRITE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.TIME_APPROVE,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.CHAT_USE,
    ],
  },
  {
    key: 'PM_ACC',
    label: 'Accountant (PM + Finance)',
    role: 'PROJECT_MANAGER',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.FINANCIALS_READ,
      PERMISSIONS.FINANCIALS_WRITE,
      PERMISSIONS.CHAT_USE,
    ],
  },
  {
    key: 'STAFF',
    label: 'Staff (SE / QA / UI-UX / DevOps)',
    role: 'STAFF',
    permissions: [
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_WRITE,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.CHAT_USE,
    ],
  },
  {
    key: 'INTERN',
    label: 'Intern (Trainee · 10d Leave · Join-Only)',
    role: 'INTERN',
    permissions: [
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.TASKS_READ,
      PERMISSIONS.TASKS_WRITE,
      PERMISSIONS.TIME_OWN,
      PERMISSIONS.CHAT_USE,
    ],
  },
];

const PREVIEW_ROLE_KEY = 'yh-sa-preview-role';

// ─── Session ─────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  companyId?: string | null;
  email: string;
  fullName: string;
  role: string;
  status: string;
  organizationId: string;
  mustChangePassword: boolean;
  avatarUrl?: string | null;
}

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  permissions: Set<string>;
  can: (permission: string) => boolean;
  isSuperAdminReal: boolean;
  previewRole: RolePreviewPreset | null;
  setPreviewRole: (preset: RolePreviewPreset | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_CACHE_KEY = 'yh-session-cache-v1';

function readCachedSession(): { user: SessionUser; permissions: string[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: SessionUser; permissions?: string[] };
    if (parsed?.user?.id && Array.isArray(parsed.permissions)) {
      return { user: parsed.user, permissions: parsed.permissions };
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function writeCachedSession(data: { user: SessionUser; permissions: string[] } | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!data) {
      window.sessionStorage.removeItem(SESSION_CACHE_KEY);
    } else {
      window.sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
    }
  } catch {
    // Ignore quota errors
  }
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [previewRole, setPreviewRoleState] = useState<RolePreviewPreset | null>(null);
  const userRef = useRef<SessionUser | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.sessionStorage.getItem(PREVIEW_ROLE_KEY) as RolePreviewPreset | null;
    if (saved && ROLE_PREVIEW_OPTIONS.some((o) => o.key === saved)) {
      setPreviewRoleState(saved);
    }
  }, []);

  const setPreviewRole = useCallback((preset: RolePreviewPreset | null) => {
    setPreviewRoleState(preset);
    if (typeof window !== 'undefined') {
      if (preset) {
        window.sessionStorage.setItem(PREVIEW_ROLE_KEY, preset);
      } else {
        window.sessionStorage.removeItem(PREVIEW_ROLE_KEY);
      }
    }
  }, []);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmedRef = useRef(false);

  userRef.current = user;

  const reload = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    try {
      const data = await api<{ user: SessionUser; permissions: string[] }>('/auth/me');
      setUser(data.user);
      setPermissions(new Set(data.permissions));
      setStatus('authenticated');
      writeCachedSession(data);
      if (!warmedRef.current) {
        warmedRef.current = true;
        warmWorkspaceCache(data.permissions.includes('dashboard:admin'));
      }
    } catch (err) {
      const isExplicitUnauth =
        err instanceof ApiError && (err.status === 401 || err.status === 403);
      if (isExplicitUnauth) {
        writeCachedSession(null);
        setUser(null);
        setPermissions(new Set());
        setStatus('anonymous');
        return;
      }
      // On 3G / weak mobile signal, never kick an authenticated user out on a transient network blip
      const cached = readCachedSession();
      if (userRef.current || cached) {
        if (!userRef.current && cached) {
          setUser(cached.user);
          setPermissions(new Set(cached.permissions));
        }
        setStatus('authenticated');
        retryTimerRef.current = setTimeout(() => {
          void reload();
        }, 4000);
      } else {
        // Initial load on 3G without cache: retry once before declaring anonymous
        retryTimerRef.current = setTimeout(() => {
          api<{ user: SessionUser; permissions: string[] }>('/auth/me')
            .then((data) => {
              setUser(data.user);
              setPermissions(new Set(data.permissions));
              setStatus('authenticated');
              writeCachedSession(data);
            })
            .catch(() => {
              setUser(null);
              setPermissions(new Set());
              setStatus('anonymous');
            });
        }, 1500);
      }
    }
  }, []);

  useEffect(() => {
    const cached = readCachedSession();
    if (cached) {
      setUser(cached.user);
      setPermissions(new Set(cached.permissions));
      setStatus('authenticated');
    }
    void reload();
    const onOnline = () => {
      void refreshSession().then((ok) => {
        if (ok || !userRef.current) void reload();
      });
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [reload]);

  // Proactive keep-alive refresh every 8 minutes so active sessions & meetings never expire on 3G
  useEffect(() => {
    if (status !== 'authenticated') return;
    const timer = setInterval(() => {
      void refreshSession();
    }, 8 * 60_000);
    return () => clearInterval(timer);
  }, [status]);

  const login = useCallback(
    async (email: string, password: string) => {
      warmedRef.current = false;
      await post('/auth/login', { email, password });
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    writeCachedSession(null);
    setPreviewRole(null);
    clearApiCache();
    setUser(null);
    setPermissions(new Set());
    setStatus('anonymous');
  }, [setPreviewRole]);

  const isSuperAdminReal = user?.role === 'SUPER_ADMIN';
  const activePreview = isSuperAdminReal && previewRole
    ? ROLE_PREVIEW_OPTIONS.find((o) => o.key === previewRole) ?? null
    : null;

  const effectiveUser = useMemo<SessionUser | null>(() => {
    if (!user) return null;
    if (!activePreview) return user;
    return { ...user, role: activePreview.role };
  }, [user, activePreview]);

  const effectivePermissions = useMemo<Set<string>>(() => {
    if (!activePreview) return permissions;
    return new Set(activePreview.permissions);
  }, [permissions, activePreview]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: effectiveUser,
      permissions: effectivePermissions,
      can: (permission) => effectivePermissions.has(permission),
      isSuperAdminReal,
      previewRole: activePreview ? activePreview.key : null,
      setPreviewRole,
      login,
      logout,
      reload,
    }),
    [status, effectiveUser, effectivePermissions, isSuperAdminReal, activePreview, setPreviewRole, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <Providers>');
  return ctx;
}

// ─── Theme ───────────────────────────────────────────────────────────────

export type ThemeChoice = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(choice: ThemeChoice) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = choice === 'dark' || (choice === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('yh-theme') as ThemeChoice | null) ?? 'system';
    setThemeState(saved);
    applyTheme(saved);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = localStorage.getItem('yh-theme') ?? 'system';
      if (current === 'system') applyTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    localStorage.setItem('yh-theme', next);
    setThemeState(next);
    applyTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <Providers>');
  return ctx;
}

// ─── Language ────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem('yh-lang') as Lang | null;
    if (saved === 'en' || saved === 'si') setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'si' ? 'si' : 'en';
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('yh-lang', next);
    setLangState(next);
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, t: (key: string) => translate(key, lang) }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <Providers>');
  return ctx;
}

// ─── Root ────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
