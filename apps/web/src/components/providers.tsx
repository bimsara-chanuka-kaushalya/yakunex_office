'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, post } from '@/lib/api';
import { translate, type Lang } from '@/lib/i18n';

// ─── Session ─────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  organizationId: string;
  mustChangePassword: boolean;
}

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  permissions: Set<string>;
  can: (permission: string) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      const data = await api<{ user: SessionUser; permissions: string[] }>('/auth/me');
      setUser(data.user);
      setPermissions(new Set(data.permissions));
      setStatus('authenticated');
    } catch {
      setUser(null);
      setPermissions(new Set());
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const login = useCallback(
    async (email: string, password: string) => {
      await post('/auth/login', { email, password });
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setUser(null);
    setPermissions(new Set());
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      permissions,
      can: (permission) => permissions.has(permission),
      login,
      logout,
      reload,
    }),
    [status, user, permissions, login, logout, reload],
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
    const saved = (localStorage.getItem('pf-theme') as ThemeChoice | null) ?? 'system';
    setThemeState(saved);
    applyTheme(saved);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem('pf-theme') ?? 'system') === 'system') applyTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    localStorage.setItem('pf-theme', next);
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
    const saved = localStorage.getItem('pf-lang') as Lang | null;
    if (saved === 'en' || saved === 'si') setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'si' ? 'si' : 'en';
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem('pf-lang', next);
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
        <AuthProvider>{children}</AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
