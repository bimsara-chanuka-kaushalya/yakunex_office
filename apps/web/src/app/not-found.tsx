import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wider text-muted">404</p>
      <h1 className="font-display text-4xl font-semibold">This page does not exist</h1>
      <p className="max-w-sm text-muted">The link may be out of date, or the page has not been built yet.</p>
      <Link href="/dashboard" className="mt-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-gold-ink">
        Back to dashboard
      </Link>
    </main>
  );
}
