'use client';

import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Client-side errors are reported to the console here. Wire a monitoring service in production.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-muted">Your work is safe. Try again, and if the problem continues, contact your administrator.</p>
      <button onClick={reset} className="mt-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-gold-ink">
        Try again
      </button>
    </main>
  );
}
