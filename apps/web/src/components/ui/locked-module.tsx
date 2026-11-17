'use client';

import Link from 'next/link';
import { Lock, MessagesSquare, UserCircle, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function LockedModuleNotice({ moduleName }: { moduleName?: string }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          {moduleName ? `${moduleName} is Locked` : 'Module Temporarily Locked'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          This module is temporarily locked for Intern accounts. You currently have access to{' '}
          <strong className="text-ink">Profile</strong>, <strong className="text-ink">Meetings</strong>, and{' '}
          <strong className="text-ink">Team Chat</strong>.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/profile">
            <Button variant="secondary" size="sm">
              <UserCircle className="h-4 w-4 text-gold" />
              <span>Profile</span>
            </Button>
          </Link>
          <Link href="/meetings">
            <Button variant="secondary" size="sm">
              <Video className="h-4 w-4 text-gold" />
              <span>Meetings</span>
            </Button>
          </Link>
          <Link href="/chat">
            <Button size="sm">
              <MessagesSquare className="h-4 w-4" />
              <span>Team Chat</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
