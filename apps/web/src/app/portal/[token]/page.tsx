'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, FolderKanban, ShieldCheck } from 'lucide-react';
import { YakunexMark } from '@/components/brand/logo';

interface PortalPayload {
  organizationName: string;
  client: { name: string; contactName: string; contactEmail: string };
  projects: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    status: string;
    progressPercent: number;
    startDate: string;
    expectedEndDate: string;
    managerName: string;
    stages: Array<{ id: string; position: number; name: string; status: string }>;
    totalTasks: number;
    completedTasks: number;
  }>;
  updatedAt: string;
}

export default function ClientPortalPage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/clients/portal/${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.message || 'Portal link not found.');
        setData(body as PortalPayload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load client portal.'));
  }, [params?.token]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08090C] p-6 text-center text-white">
        <div className="max-w-md space-y-3 rounded-3xl border border-white/10 bg-[#111520] p-8">
          <YakunexMark className="mx-auto h-10 w-10" />
          <h1 className="font-display text-xl font-bold">Client Portal Unavailable</h1>
          <p className="text-sm text-white/65">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#08090C] text-sm text-white/70">
        Loading live client project portal...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#08090C] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#111520] p-6 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <YakunexMark className="h-11 w-11" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#D4A843]">
                {data.organizationName} · Live Client Portal
              </p>
              <h1 className="font-display text-2xl font-bold">{data.client.name}</h1>
              <p className="text-xs text-white/60">
                Contact: {data.client.contactName} ({data.client.contactEmail})
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Verified Live Delivery Status
          </div>
        </header>

        {data.projects.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#111520] p-12 text-center text-white/60">
            No active projects linked yet.
          </div>
        ) : (
          <div className="space-y-5">
            {data.projects.map((p) => (
              <section
                key={p.id}
                className="space-y-5 rounded-3xl border border-white/10 bg-[#111520] p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#D4A843]/20 px-2 py-0.5 font-mono text-xs font-bold text-[#D4A843]">
                        {p.code}
                      </span>
                      <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/80">
                        {p.status}
                      </span>
                    </div>
                    <h2 className="mt-2 font-display text-xl font-bold">{p.name}</h2>
                    <p className="mt-1 text-sm text-white/65">{p.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-3xl font-bold text-emerald-400">
                      {p.progressPercent}%
                    </p>
                    <p className="text-xs text-white/55">
                      {p.completedTasks} / {p.totalTasks} deliverables done
                    </p>
                  </div>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#D4A843] to-emerald-400 transition-all"
                    style={{ width: `${p.progressPercent}%` }}
                  />
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {(p.stages ?? []).map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-medium text-white/90">{st.name}</span>
                      {st.status === 'DONE' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-300" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-white/55">
                  <span className="inline-flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5 text-[#D4A843]" /> Delivery Manager: {p.managerName}
                  </span>
                  <span>
                    Target Launch: {p.expectedEndDate}
                  </span>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
