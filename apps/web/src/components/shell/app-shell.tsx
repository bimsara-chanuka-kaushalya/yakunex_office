'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import { ROLE_PREVIEW_OPTIONS, useAuth, useLang } from '@/components/providers';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { ForcePasswordChange } from './force-password-change';
import { MeetingAlertListener } from './meeting-alert-listener';
import { Skeleton } from '@/components/ui/skeleton';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, isSuperAdminReal, previewRole, setPreviewRole } = useAuth();
  const activePreviewLabel = ROLE_PREVIEW_OPTIONS.find((o) => o.key === previewRole)?.label;
  const { t } = useLang();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex min-h-dvh" aria-busy="true" aria-label={t('loading')}>
        <div className="hidden w-64 bg-sidebar md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 md:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[4px] animate-fade-in" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-pop animate-slide-in-left">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setDrawerOpen(true)} />
        {isSuperAdminReal && previewRole && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-950 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Super Admin Testing Preview:</strong> Viewing system as{' '}
                <strong className="underline">{activePreviewLabel}</strong> (UI/Sidebar/Permissions preview only — no employee account is modified)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewRole(null);
                router.push('/dashboard');
              }}
              className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-amber-700"
            >
              <X className="h-3 w-3" /> Exit Preview
            </button>
          </div>
        )}
        <main id="main" className="flex-1 px-3.5 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">{children}</div>
        </main>
      </div>

      <MeetingAlertListener />
      {user.mustChangePassword && <ForcePasswordChange />}
    </div>
  );
}
