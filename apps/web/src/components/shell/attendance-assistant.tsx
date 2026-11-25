'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlarmClock, Coffee, LogIn, MapPinOff, Radio, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { playAlertChime, showDesktopNotification } from '@/lib/alerts';
import { liveGet, post } from '@/lib/api';
import { useLiveSync } from '@/lib/use-live-sync';

/**
 * Jibble-style Global Attendance & Live Location Assistant:
 *  - Pop-up reminders at configured times (08:15, 08:30) on work days until clocked in;
 *  - Continuous background GPS pings while clocked in (Office & Field modes across all pages);
 *  - Strict geofence exit countdown & unauthorized absence alerts for roles under `appliesToMe`;
 *  - Compact live shift timer pill in the corner when working outside `/attendance`.
 */

interface MyRules {
  appliesToMe: boolean;
  rules: { radiusMeters: number; graceMinutes: number; lateAfter: string; reminderTimes: string[] };
  today: string;
  now: string;
  isWorkDay: boolean;
  onLeaveToday: boolean;
  clockedIn: boolean;
  clockedOut: boolean;
  onBreak: boolean;
  workMode?: 'OFFICE' | 'REMOTE' | 'FIELD' | null;
  clockInAt?: string | null;
  breakMinutes?: number;
  projectName?: string | null;
  outsideSince: string | null;
}

interface LocationAnswer {
  tracked?: boolean;
  zone?: 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN' | null;
  event?: 'LEFT' | 'RETURNED' | null;
  outsideSince?: string | null;
  unauthorized?: boolean;
  distanceMeters?: number | null;
  graceMinutes?: number;
  radiusMeters?: number;
}

type Popup =
  | { kind: 'reminder'; time: string; title: string; body: string }
  | { kind: 'left'; outsideSince: string; graceMinutes: number; distance: number | null; radius: number }
  | { kind: 'unauthorized'; distance: number | null }
  | { kind: 'location-off' };

const SEND_EVERY_MS = 20_000;
const HEARTBEAT_MS = 60_000;

function colomboNow() {
  const local = new Date(Date.now() + 330 * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

function formatLiveDuration(clockInAt?: string | null, breakMinutes = 0): string {
  if (!clockInAt) return '00:00:00';
  const elapsedSec = Math.max(0, Math.floor((Date.now() - Date.parse(clockInAt)) / 1000) - breakMinutes * 60);
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function readShown(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function markShown(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function AttendanceAssistant() {
  const { status, user, previewRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [rules, setRules] = useState<MyRules | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [, tick] = useState(0);
  const lastSentRef = useRef(0);
  const lastFixRef = useRef<GeolocationPosition | null>(null);
  const zoneRef = useRef<{ outside: boolean; unauthorized: boolean }>({ outside: false, unauthorized: false });

  const enabled = status === 'authenticated' && Boolean(user) && !previewRole;

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      setRules(await liveGet<MyRules>('/attendance/my-rules'));
    } catch {
      /* keep last state */
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);
  useLiveSync(load, enabled);

  // Reminders at 08:15 / 08:30 on work days
  useEffect(() => {
    if (!rules?.appliesToMe) return;
    const check = () => {
      if (!rules.isWorkDay || rules.onLeaveToday || rules.clockedIn || rules.clockedOut) return;
      const { date, time } = colomboNow();
      if (date !== rules.today) return;
      const due = [...rules.rules.reminderTimes].reverse().find((t) => t <= time);
      if (!due) return;
      const [h, m] = due.split(':').map(Number);
      const [nh, nm] = time.split(':').map(Number);
      if (nh * 60 + nm - (h * 60 + m) > 90) return;
      const key = `yh-att-reminder-${date}-${due}`;
      if (readShown(key)) return;
      markShown(key);
      const late = due >= rules.rules.lateAfter;
      const title = late ? `It's ${due} — clock in now` : `Good morning! Work starts at ${rules.rules.lateAfter}`;
      const body = late
        ? `Starting work after ${rules.rules.lateAfter} is recorded as a short leave. Clock in as soon as you are inside the office area.`
        : `Please clock in when you reach the office (within ${rules.rules.radiusMeters} m). Starting after ${rules.rules.lateAfter} counts as a short leave.`;
      setPopup({ kind: 'reminder', time: due, title, body });
      playAlertChime();
      showDesktopNotification(title, body, '/attendance');
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [rules]);

  // Live location while clocked in (Office & Field staff keep Google Maps updated across all tabs)
  const send = useCallback(
    async (pos: GeolocationPosition) => {
      lastSentRef.current = Date.now();
      try {
        const res = await post<LocationAnswer>('/attendance/location', {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy),
        });
        if (!res?.tracked) return;
        const outside = Boolean(res.outsideSince);
        if (res.event === 'LEFT' || (outside && !zoneRef.current.outside)) {
          setPopup({
            kind: 'left',
            outsideSince: res.outsideSince ?? new Date().toISOString(),
            graceMinutes: res.graceMinutes ?? 5,
            distance: res.distanceMeters ?? null,
            radius: res.radiusMeters ?? 50,
          });
          playAlertChime();
          showDesktopNotification('You left the office area', `Come back within ${res.graceMinutes ?? 5} minutes.`, '/attendance');
        }
        if (res.unauthorized && !zoneRef.current.unauthorized) {
          setPopup({ kind: 'unauthorized', distance: res.distanceMeters ?? null });
          playAlertChime();
        }
        if (res.event === 'RETURNED') {
          setPopup((p) => (p && (p.kind === 'left' || p.kind === 'unauthorized') ? null : p));
          toast.success('You are back in the office area.');
        }
        zoneRef.current = { outside, unauthorized: Boolean(res.unauthorized) };
      } catch {
        /* network blip: next fix retries */
      }
    },
    [toast],
  );

  const shouldSendGps = Boolean(
    rules?.clockedIn &&
      !rules.onBreak &&
      (rules.appliesToMe || rules.workMode === 'OFFICE' || rules.workMode === 'FIELD'),
  );

  useEffect(() => {
    if (!shouldSendGps || typeof navigator === 'undefined' || !navigator.geolocation) return;
    const onFix = (pos: GeolocationPosition) => {
      lastFixRef.current = pos;
      setPopup((p) => (p?.kind === 'location-off' ? null : p));
      if (Date.now() - lastSentRef.current >= SEND_EVERY_MS) void send(pos);
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED && rules?.appliesToMe) {
        setPopup({ kind: 'location-off' });
      }
    };
    const watchId = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    });
    const heartbeat = setInterval(() => {
      if (Date.now() - lastSentRef.current < HEARTBEAT_MS) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastFixRef.current = pos;
          void send(pos);
        },
        onError,
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      );
    }, 15_000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
    };
  }, [rules?.appliesToMe, send, shouldSendGps]);

  // 1-second tick for live countdown or floating Jibble shift timer pill
  const showFloatingShiftPill = Boolean(rules?.clockedIn && pathname !== '/attendance' && !pathname?.startsWith('/meet'));
  useEffect(() => {
    if (popup?.kind !== 'left' && (!showFloatingShiftPill || rules?.onBreak)) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [popup?.kind, rules?.onBreak, showFloatingShiftPill]);

  let modalNode: React.ReactNode = null;
  if (popup) {
    let icon = <AlarmClock className="h-7 w-7" />;
    let tone = 'bg-gold/15 text-gold-strong dark:text-gold';
    let title = '';
    let body = '';
    let primary: { label: string; onClick: () => void } | null = null;

    if (popup.kind === 'reminder') {
      title = popup.title;
      body = popup.body;
      primary = {
        label: 'Clock in now',
        onClick: () => {
          setPopup(null);
          router.push('/attendance');
        },
      };
    } else if (popup.kind === 'left') {
      const leftMs = Date.parse(popup.outsideSince) + popup.graceMinutes * 60_000 - Date.now();
      const secs = Math.max(0, Math.round(leftMs / 1000));
      icon = <MapPinOff className="h-7 w-7" />;
      tone = 'bg-warning/15 text-warning';
      title = 'You left the office area';
      body =
        secs > 0
          ? `You are ${popup.distance != null ? `about ${popup.distance} m` : ''} outside the ${popup.radius} m office zone. Come back within ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} or it is recorded as an unauthorized absence and HR is notified.`
          : 'Time is up — if you are still outside, this is now recorded as an unauthorized absence.';
    } else if (popup.kind === 'unauthorized') {
      icon = <ShieldAlert className="h-7 w-7" />;
      tone = 'bg-danger/10 text-danger';
      title = 'Recorded as an unauthorized absence';
      body = `You stayed outside the office area for more than ${rules?.rules.graceMinutes ?? 5} minutes. HR and the Super Admin have been notified.`;
    } else {
      icon = <MapPinOff className="h-7 w-7" />;
      tone = 'bg-danger/10 text-danger';
      title = 'Turn location back on';
      body = 'Location is required while you are clocked in. Allow location for this site in your browser bar — otherwise HR is notified that tracking stopped.';
    }

    modalNode = (
      <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
          <h2 className="mt-4 text-center font-display text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-2 text-center text-[13.5px] leading-relaxed text-muted">{body}</p>
          <div className="mt-6 flex justify-center gap-2">
            {primary && (
              <Button onClick={primary.onClick}>
                <LogIn className="h-4 w-4" /> {primary.label}
              </Button>
            )}
            <Button variant={primary ? 'secondary' : 'primary'} onClick={() => setPopup(null)}>
              {primary ? 'Later' : 'OK'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {showFloatingShiftPill && rules && (
        <button
          type="button"
          onClick={() => router.push('/attendance')}
          title="Open Jibble Live Attendance & Timer"
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2.5 rounded-full border border-line bg-surface/95 px-3.5 py-2 text-xs shadow-lg backdrop-blur-md transition hover:-translate-y-0.5 hover:border-gold"
        >
          {rules.onBreak ? (
            <Coffee className="h-3.5 w-3.5 text-warning" />
          ) : (
            <Radio className="h-3.5 w-3.5 text-success animate-pulse" />
          )}
          <span className="font-mono font-bold text-ink">
            {rules.onBreak ? 'ON BREAK' : formatLiveDuration(rules.clockInAt, rules.breakMinutes)}
          </span>
          {rules.projectName && (
            <span className="hidden max-w-[140px] truncate text-muted sm:inline">
              · {rules.projectName}
            </span>
          )}
        </button>
      )}
      {modalNode}
    </>
  );
}
