'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useAuth, useLang } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ALL_NAV_ITEMS, isModuleLockedForRole, isNavItemVisibleForRole } from '@/lib/nav';
import { ROLE_LABELS, type Role } from '@/lib/permissions';

/**
 * Shown when someone opens a module their role cannot use (role rules or the Super Admin's
 * hide/lock settings). Offers the modules they *can* open right now, never a fixed list.
 */
export function LockedModuleNotice({ moduleName }: { moduleName?: string }) {
  const { user, can } = useAuth();
  const { t, lang } = useLang();
  const role = user?.role ?? '';
  const roleLabel = ROLE_LABELS[role as Role]?.[lang] ?? 'your';
  const available = ALL_NAV_ITEMS.filter(
    (item) => isNavItemVisibleForRole(item, role, can) && !isModuleLockedForRole(item.key, role, can),
  ).slice(0, 6);

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          {moduleName ? `${moduleName} is locked` : 'This module is locked'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          This module is not available for {roleLabel} accounts right now. Ask your administrator if you need it.
        </p>
        {available.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {available.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.key} href={item.href}>
                  <Button variant="secondary" size="sm">
                    <Icon className="h-4 w-4 text-gold" />
                    <span>{t(item.key)}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
