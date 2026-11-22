'use client';

import { useEffect, useRef } from 'react';
import { clearApiCache } from './api';

/**
 * Zero-refresh live sync.
 *
 * One shared connection per tab (not one per component): a single EventSource on
 * /api/workspace/live-stream, a cross-tab BroadcastChannel and local mutation events feed one bus.
 * When anything changes, cached GETs are dropped first (so the refetch sees the new data at once)
 * and every subscribed view refreshes in the background. Views keep their current content on screen
 * while refreshing; they never flip back to a skeleton (see `isSilentRefresh`).
 *
 * The periodic fallback only runs while the live stream is down.
 */

type Listener = () => void | Promise<void>;

const listeners = new Set<{ current: Listener }>();
let silentDepth = 0;
let started = false;
let es: EventSource | null = null;
let bc: BroadcastChannel | null = null;
let sseHealthy = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushAt = 0;
let hiddenAt = 0;

const COALESCE_MS = 250;
const FALLBACK_POLL_MS = 15_000;

/**
 * True while a live-sync refresh is starting a view's load function. Load functions use it to skip
 * their loading skeleton: `if (!isSilentRefresh()) setLoading(true);`
 */
export function isSilentRefresh(): boolean {
  return silentDepth > 0;
}

function runListeners() {
  flushTimer = null;
  lastFlushAt = Date.now();
  for (const l of Array.from(listeners)) {
    silentDepth += 1;
    try {
      // The synchronous start of each load (where it would set its loading flag) runs inside this window.
      void Promise.resolve(l.current()).catch(() => undefined);
    } catch {
      // A failing view must not stop the others from refreshing.
    } finally {
      silentDepth -= 1;
    }
  }
}

/**
 * Leading + trailing coalescing: the first change refreshes immediately, a burst of changes
 * collapses into one more refresh at the end, and the last change is never dropped.
 */
function schedule(dropCache: boolean) {
  if (dropCache) clearApiCache();
  if (listeners.size === 0 || flushTimer) return;
  const wait = Math.max(0, COALESCE_MS - (Date.now() - lastFlushAt));
  flushTimer = setTimeout(runListeners, wait);
}

function connectSse() {
  if (typeof EventSource === 'undefined' || listeners.size === 0) return;
  es?.close();
  try {
    es = new EventSource('/api/workspace/live-stream', { withCredentials: true });
  } catch {
    es = null;
    return;
  }
  es.onopen = () => {
    const wasDown = !sseHealthy;
    sseHealthy = true;
    // Catch up on anything missed while the stream was down.
    if (wasDown && lastFlushAt > 0) schedule(true);
  };
  es.onmessage = (evt) => {
    sseHealthy = true;
    try {
      const parsed = JSON.parse(evt.data) as { kind?: string };
      if (parsed.kind === 'mutated') schedule(true);
    } catch {
      // keep-alive
    }
  };
  es.onerror = () => {
    sseHealthy = false;
    es?.close();
    es = null;
    if (!reconnectTimer && listeners.size > 0) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSse();
      }, 4000);
    }
  };
}

const onLocalMutate = () => schedule(false); // api() already cleared the cache for local writes
const onVisibility = () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  // Only revalidate if the tab was away long enough to have missed something.
  if (Date.now() - hiddenAt > 5000) schedule(true);
  if (!es && listeners.size > 0) connectSse();
};
const onOnline = () => {
  schedule(true);
  if (!es) connectSse();
};

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  connectSse();
  try {
    bc = new BroadcastChannel('yakunex_live_sync');
    bc.onmessage = () => schedule(true);
  } catch {
    bc = null;
  }
  window.addEventListener('yakunex:workspace-mutated', onLocalMutate);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  fallbackTimer = setInterval(() => {
    if (!sseHealthy && document.visibilityState === 'visible' && navigator.onLine !== false) schedule(true);
  }, FALLBACK_POLL_MS);
}

function stop() {
  if (!started) return;
  started = false;
  es?.close();
  es = null;
  sseHealthy = false;
  bc?.close();
  bc = null;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (fallbackTimer) clearInterval(fallbackTimer);
  if (flushTimer) clearTimeout(flushTimer);
  reconnectTimer = fallbackTimer = flushTimer = null;
  window.removeEventListener('yakunex:workspace-mutated', onLocalMutate);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('online', onOnline);
}

export function useLiveSync(onRefresh: Listener, enabled = true): void {
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const entry = { current: () => cbRef.current() };
    listeners.add(entry);
    start();
    return () => {
      listeners.delete(entry);
      // Keep the shared stream while any view is still listening (e.g. during route changes).
      if (listeners.size === 0) setTimeout(() => listeners.size === 0 && stop(), 1000);
    };
  }, [enabled]);
}
