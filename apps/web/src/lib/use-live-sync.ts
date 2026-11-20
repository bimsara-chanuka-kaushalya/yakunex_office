'use client';

import { useEffect, useRef } from 'react';

/**
 * Zero-Refresh Live Sync Hook.
 * Keeps any module view synchronized in real time across users and tabs without manual page refreshes
 * via EventSource (/api/workspace/live-stream), cross-tab BroadcastChannel, local mutation events,
 * and visibility/focus revalidation.
 */
export function useLiveSync(onRefresh: () => void | Promise<void>, enabled = true): void {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let closed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bc: BroadcastChannel | null = null;

    const trigger = () => {
      if (closed) return;
      const now = Date.now();
      if (now - lastRunRef.current < 450) return;
      lastRunRef.current = now;
      void cbRef.current();
    };

    const connectSse = () => {
      if (closed || typeof EventSource === 'undefined') return;
      try {
        es?.close();
        es = new EventSource('/api/workspace/live-stream', { withCredentials: true });
        es.onmessage = (evt) => {
          try {
            const parsed = JSON.parse(evt.data) as { kind?: string };
            if (parsed.kind === 'mutated') {
              trigger();
            }
          } catch {
            // ignore keepalive
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (!closed && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSse();
            }, 4000);
          }
        };
      } catch {
        // fallback below
      }
    };

    connectSse();

    try {
      bc = new BroadcastChannel('yakunex_live_sync');
      bc.onmessage = () => trigger();
    } catch {
      // BroadcastChannel unsupported
    }

    const onLocalMutate = () => trigger();
    const onFocus = () => trigger();
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger();
    };

    window.addEventListener('yakunex:workspace-mutated', onLocalMutate);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    // Light safety fallback every 12s while visible (for multi-lambda serverless cold sync)
    const fallbackId = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        trigger();
      }
    }, 12_000);

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(fallbackId);
      bc?.close();
      window.removeEventListener('yakunex:workspace-mutated', onLocalMutate);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
