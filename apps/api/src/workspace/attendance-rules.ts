/**
 * Attendance & live-location rules (Jibble-style geofencing) — pure helpers, easy to test.
 *
 * Applied to the roles listed in `roles` (interns for now):
 *  - clock in only inside the office zone (`radiusMeters`, default 50 m), Office mode only;
 *  - leaving the zone alerts the person at once; still outside after `graceMinutes` (5) →
 *    unauthorized absence + alert to HR and Super Admin;
 *  - clocking in after `lateAfter` (08:30) on a work day records a short leave;
 *  - reminders pop up at `reminderTimes` (08:15, 08:30) on work days;
 *  - location silent for `trackingLostMinutes` while clocked in → HR is told tracking stopped.
 */

export interface AttendanceRules {
  roles: string[];
  radiusMeters: number;
  graceMinutes: number;
  lateAfter: string; // HH:MM, Asia/Colombo
  reminderTimes: string[]; // HH:MM, Asia/Colombo
  workDays: number[]; // 0 = Sunday … 6 = Saturday
  trackingLostMinutes: number;
}

export const DEFAULT_ATTENDANCE_RULES: AttendanceRules = {
  roles: ['INTERN'],
  radiusMeters: 50,
  graceMinutes: 5,
  lateAfter: '08:30',
  reminderTimes: ['08:15', '08:30'],
  workDays: [1, 2, 3, 4, 5],
  trackingLostMinutes: 10,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Merges stored settings over the defaults and drops anything invalid. */
export function normalizeRules(raw: Partial<AttendanceRules> | null | undefined): AttendanceRules {
  const r = raw ?? {};
  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  const times = Array.isArray(r.reminderTimes) ? r.reminderTimes.map(String).filter((t) => HHMM.test(t)) : null;
  const days = Array.isArray(r.workDays) ? r.workDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null;
  const roles = Array.isArray(r.roles) ? r.roles.map((x) => String(x).toUpperCase()).filter((x) => x && x !== 'SUPER_ADMIN') : null;
  return {
    roles: roles ?? DEFAULT_ATTENDANCE_RULES.roles,
    radiusMeters: num(r.radiusMeters, 20, 2000, DEFAULT_ATTENDANCE_RULES.radiusMeters),
    graceMinutes: num(r.graceMinutes, 1, 120, DEFAULT_ATTENDANCE_RULES.graceMinutes),
    lateAfter: typeof r.lateAfter === 'string' && HHMM.test(r.lateAfter) ? r.lateAfter : DEFAULT_ATTENDANCE_RULES.lateAfter,
    reminderTimes: times ? Array.from(new Set(times)).sort() : DEFAULT_ATTENDANCE_RULES.reminderTimes,
    workDays: days ? Array.from(new Set(days)).sort() : DEFAULT_ATTENDANCE_RULES.workDays,
    trackingLostMinutes: num(r.trackingLostMinutes, 3, 120, DEFAULT_ATTENDANCE_RULES.trackingLostMinutes),
  };
}

const COLOMBO_OFFSET_MIN = 330;

/** Local Asia/Colombo date (YYYY-MM-DD), time (HH:MM) and weekday for an instant. */
export function colomboClock(at: Date = new Date()) {
  const local = new Date(at.getTime() + COLOMBO_OFFSET_MIN * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: local.getUTCDay() };
}

export function isWorkDay(date: string, rules: AttendanceRules, holidays: Set<string>): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return rules.workDays.includes(weekday) && !holidays.has(date);
}

export type ZoneReading = 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN';

/**
 * Decides inside / outside with the GPS error in mind, so a jumpy fix near the edge does not
 * fire false alarms: clearly outside only when even the most favourable point of the accuracy
 * circle is beyond the zone; very poor fixes (> 150 m) are "uncertain" and keep the last state.
 */
export function readZone(distanceMeters: number, accuracyMeters: number | null, radiusMeters: number): ZoneReading {
  const acc = accuracyMeters === null || !Number.isFinite(accuracyMeters) ? 30 : Math.max(0, accuracyMeters);
  if (acc > 150) return 'UNCERTAIN';
  if (distanceMeters - Math.min(acc, 50) <= radiusMeters) return 'INSIDE';
  if (distanceMeters - acc > radiusMeters) return 'OUTSIDE';
  return 'UNCERTAIN';
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function minutesBetween(fromIso: string, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - Date.parse(fromIso)) / 60_000));
}
