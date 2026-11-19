'use client';

import { exportBrandedPdf } from '@/lib/pdf-export';
import type { MeetingAttendanceEntry, MeetingRow } from './meeting-types';

function formatIcsDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Downloads a standards-compliant .ics calendar invite file for Outlook / Apple Calendar / Google Calendar. */
export function downloadMeetingIcs(mtg: MeetingRow): void {
  if (typeof window === 'undefined') return;
  const joinUrl = `${window.location.origin}/meet?room=${mtg.roomCode}`;
  const rruleMap: Record<string, string> = {
    DAILY: 'RRULE:FREQ=DAILY;COUNT=30',
    WEEKLY: 'RRULE:FREQ=WEEKLY;COUNT=20',
    BIWEEKLY: 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=15',
    MONTHLY: 'RRULE:FREQ=MONTHLY;COUNT=12',
  };
  const rrule = mtg.recurrence && mtg.recurrence !== 'NONE' ? rruleMap[mtg.recurrence] : '';
  const descLines = [
    mtg.agenda || 'Yakunex Hub Meet Video Session',
    `Room Code: ${mtg.roomCode}`,
    mtg.passcode ? `Passcode: ${mtg.passcode}` : '',
    `Join Link: ${joinUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yakunex Technologies//Yakunex Hub Meet//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${mtg.id}@yakunex.com`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(mtg.startsAt)}`,
    `DTEND:${formatIcsDate(mtg.endsAt || new Date(new Date(mtg.startsAt).getTime() + 3600_000).toISOString())}`,
    `SUMMARY:${escapeIcs(mtg.title)}`,
    `DESCRIPTION:${escapeIcs(descLines)}`,
    `LOCATION:${escapeIcs(joinUrl)}`,
    ...(rrule ? [rrule] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${mtg.roomCode}-${mtg.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens a pre-filled Google Calendar event creation tab. */
export function openGoogleCalendarInvite(mtg: MeetingRow): void {
  if (typeof window === 'undefined') return;
  const joinUrl = `${window.location.origin}/meet?room=${mtg.roomCode}`;
  const start = formatIcsDate(mtg.startsAt);
  const end = formatIcsDate(
    mtg.endsAt || new Date(new Date(mtg.startsAt).getTime() + 3600_000).toISOString(),
  );
  const details = [
    mtg.agenda || 'Yakunex Hub Meet Session',
    `Room Code: ${mtg.roomCode}`,
    mtg.passcode ? `Passcode: ${mtg.passcode}` : '',
    `Join URL: ${joinUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: mtg.title,
    dates: `${start}/${end}`,
    details,
    location: joinUrl,
  });
  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank');
}

function formatDuration(sec?: number): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

/** Exports Meeting Attendance + Notes as a Branded Yakunex A4 PDF. */
export function exportMeetingAttendancePdf(opts: {
  meeting: MeetingRow;
  entries?: MeetingAttendanceEntry[];
  generatedByName?: string | null;
  generatedByEmail?: string | null;
}): void {
  const { meeting } = opts;
  const list =
    opts.entries && opts.entries.length > 0
      ? opts.entries
      : meeting.attendanceLog && meeting.attendanceLog.length > 0
        ? meeting.attendanceLog
        : meeting.participants.map((p) => ({
            userId: p.userId,
            fullName: p.fullName,
            companyId: p.companyId,
            role: p.role,
            isGuest: p.isGuest,
            joinedAt: p.joinedAt,
            leftAt: null,
            durationSec: Math.max(0, Math.round((Date.now() - new Date(p.joinedAt).getTime()) / 1000)),
          }));

  const fmtTime = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString('en-LK', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Asia/Colombo',
        })
      : 'Active in call';

  const totalSec = list.reduce((sum, e) => sum + (e.durationSec ?? 0), 0);
  const avgSec = list.length > 0 ? Math.round(totalSec / list.length) : 0;

  exportBrandedPdf({
    title: `Meeting Report — ${meeting.title}`,
    subtitle: `Room ${meeting.roomCode} · Host: ${meeting.organizerName} · Status: ${meeting.status}`,
    generatedByName: opts.generatedByName,
    generatedByEmail: opts.generatedByEmail,
    kpis: [
      { label: 'Room Code', value: meeting.roomCode },
      { label: 'Total Attendees', value: String(list.length) },
      { label: 'Avg. Duration', value: formatDuration(avgSec) },
      { label: 'Scope', value: meeting.meetingScope ?? 'INTERNAL' },
    ],
    sections: [
      {
        heading: 'Agenda',
        body: meeting.agenda || '—',
      },
      {
        heading: 'Meeting Notes & Transcript Summary',
        body: meeting.notes || 'No meeting notes recorded.',
      },
    ],
    columns: ['Participant', 'Company ID', 'Role', 'Joined At', 'Left At', 'Duration'],
    rows: list.map((e) => [
      e.fullName,
      e.companyId || (e.isGuest ? 'EXTERNAL GUEST' : '—'),
      e.role,
      fmtTime(e.joinedAt),
      fmtTime(e.leftAt),
      formatDuration(e.durationSec),
    ]),
  });
}
