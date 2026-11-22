'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Calendar, Radio, Video, X } from 'lucide-react';
import { useAuth } from '@/components/providers';
import { playAlertChime, playMeetingStartChime, showDesktopNotification } from '@/lib/alerts';
import { liveGet, patch } from '@/lib/api';

export interface LiveNotificationItem {
  id: string;
  type: 'ANNOUNCEMENT' | 'APPROVAL' | 'MEETING' | 'TASK' | 'SYSTEM';
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  read?: boolean;
  meetingId?: string | null;
  roomCode?: string | null;
  actionUrl?: string | null;
  hostName?: string | null;
  isLiveMeeting?: boolean;
}

/**
 * Global zero-delay real-time notification listener mounted in AppShell for ALL users
 * (including Interns when invited to a meeting).
 * Uses EventSource (SSE /api/notifications/stream) + fast uncached fallback + BroadcastChannel.
 */
export function MeetingAlertListener() {
  const { user } = useAuth();
  const [toasts, setToasts] = useState<LiveNotificationItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);

  const enqueueAlerts = useCallback((items: LiveNotificationItem[], isSnapshot: boolean) => {
    if (!Array.isArray(items)) return;

    if (isSnapshot && !hydratedRef.current) {
      hydratedRef.current = true;
      const now = Date.now();
      for (const n of items) {
        seenIdsRef.current.add(n.id);
        // If a brand-new LIVE meeting started within the last 12 seconds and is unread, pop immediately
        const ageMs = now - new Date(n.createdAt).getTime();
        if (n.type === 'MEETING' && n.isLiveMeeting && !n.read && ageMs >= 0 && ageMs <= 12_000) {
          playMeetingStartChime();
          showDesktopNotification(n.title, n.body, n.actionUrl ?? undefined);
          setToasts((prev) => (prev.some((t) => t.id === n.id) ? prev : [n, ...prev].slice(0, 4)));
        }
      }
      return;
    }

    const fresh = items.filter((n) => !seenIdsRef.current.has(n.id));
    if (fresh.length === 0) return;

    for (const n of fresh) {
      seenIdsRef.current.add(n.id);
      if (n.read) continue;

      if (n.type === 'MEETING') {
        playMeetingStartChime();
        showDesktopNotification(n.title, n.body, n.actionUrl ?? undefined);
        setToasts((prev) => (prev.some((t) => t.id === n.id) ? prev : [n, ...prev].slice(0, 4)));
      } else {
        playAlertChime();
        showDesktopNotification(n.title, n.body);
        setToasts((prev) => (prev.some((t) => t.id === n.id) ? prev : [n, ...prev].slice(0, 4)));
      }
    }

    // Notify Sidebar badge to refresh immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('yakunex:notifications-updated'));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let closed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let bc: BroadcastChannel | null = null;
    let streamLive = false;
    let lastPullAt = 0;

    // Request notification permission early on first user gesture
    const askPerm = () => {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => undefined);
      }
    };
    window.addEventListener('pointerdown', askPerm, { once: true });

    const pullFresh = async (isSnapshot = false) => {
      if (closed) return;
      try {
        const list = await liveGet<LiveNotificationItem[]>('/notifications');
        if (!closed) enqueueAlerts(list, isSnapshot);
      } catch {
        // Ignore transient network errors
      }
    };

    const connectSse = () => {
      if (closed || typeof window === 'undefined' || typeof EventSource === 'undefined') return;
      try {
        es?.close();
        es = new EventSource('/api/notifications/stream', { withCredentials: true });
        es.onopen = () => {
          streamLive = true;
        };
        es.onmessage = (evt) => {
          streamLive = true;
          try {
            const payload = JSON.parse(evt.data) as {
              kind?: 'snapshot' | 'new' | 'ping';
              notifications?: LiveNotificationItem[];
            };
            if (payload.kind === 'snapshot' && payload.notifications) {
              enqueueAlerts(payload.notifications, true);
            } else if (payload.kind === 'new' && payload.notifications) {
              enqueueAlerts(payload.notifications, false);
            }
          } catch {
            // Ignore malformed SSE keepalive
          }
        };
        es.onerror = () => {
          streamLive = false;
          es?.close();
          es = null;
          if (!closed && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSse();
            }, 2500);
          }
        };
      } catch {
        // Fallback polling below handles it
      }
    };

    // Instant initial snapshot + SSE connection
    void pullFresh(true);
    connectSse();

    // Backup poll: every 2s only while the push stream is down (e.g. a serverless SSE cut-off);
    // while it is up, a light 30s safety check is enough and the screen stays quiet.
    fallbackTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (streamLive && now - lastPullAt < 30_000) return;
      lastPullAt = now;
      void pullFresh(false);
    }, 2000);

    // Cross-tab BroadcastChannel for 0ms sync when host starts a meeting in another tab
    try {
      bc = new BroadcastChannel('yakunex_live_alerts');
      bc.onmessage = (evt) => {
        if (evt.data?.type === 'meeting-started') {
          void pullFresh(false);
        }
      };
    } catch {
      // BroadcastChannel unsupported
    }

    const onLocalTrigger = () => void pullFresh(false);
    window.addEventListener('yakunex:meeting-started', onLocalTrigger);
    window.addEventListener('focus', onLocalTrigger);

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      bc?.close();
      window.removeEventListener('pointerdown', askPerm);
      window.removeEventListener('yakunex:meeting-started', onLocalTrigger);
      window.removeEventListener('focus', onLocalTrigger);
    };
  }, [enqueueAlerts, user]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    void patch(`/notifications/${id}/read`, {}).catch(() => undefined);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('yakunex:notifications-updated'));
    }
  };

  const joinFromToast = (toast: LiveNotificationItem) => {
    dismissToast(toast.id);
    if (toast.actionUrl && typeof window !== 'undefined') {
      window.open(toast.actionUrl, '_blank');
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed right-4 top-4 z-[90] flex w-full max-w-sm flex-col gap-2.5"
    >
      {toasts.map((toast) => {
        const isMeeting = toast.type === 'MEETING';
        const isLive = Boolean(toast.isLiveMeeting);
        return (
          <div
            key={toast.id}
            className="pointer-events-auto overflow-hidden rounded-2xl border border-gold/40 bg-[#0F1522]/95 p-4 text-white shadow-2xl backdrop-blur-xl animate-slide-up"
          >
            <div className="flex items-start gap-3">
              <div
                className={
                  isLive
                    ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400'
                    : isMeeting
                      ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4A843]/20 text-[#D4A843]'
                      : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400'
                }
              >
                {isLive ? (
                  <Radio className="h-5 w-5 animate-pulse" />
                ) : isMeeting ? (
                  <Calendar className="h-5 w-5" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={
                      isLive
                        ? 'inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300'
                        : 'inline-flex items-center gap-1 rounded-full bg-[#D4A843]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D4A843]'
                    }
                  >
                    {isLive ? '● LIVE MEETING NOW' : isMeeting ? 'MEETING SCHEDULED' : toast.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss notification"
                    className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-white">{toast.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/70">{toast.body}</p>
                {isMeeting && toast.actionUrl && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => joinFromToast(toast)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Now
                    </button>
                    {toast.roomCode && (
                      <span className="rounded-lg bg-white/10 px-2 py-1 font-mono text-[10px] text-white/75">
                        {toast.roomCode}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
