'use client';

import { useEffect, useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { TeamLocationMap } from '@/components/ui/team-location-map';
import { api, put } from '@/lib/api';

interface Rules {
  roles: string[];
  radiusMeters: number;
  graceMinutes: number;
  lateAfter: string;
  reminderTimes: string[];
  workDays: number[];
  trackingLostMinutes: number;
}

const ROLE_OPTIONS = [
  { key: 'INTERN', label: 'Interns' },
  { key: 'STAFF', label: 'Staff' },
  { key: 'PROJECT_MANAGER', label: 'Project managers' },
  { key: 'ADMIN', label: 'Admins' },
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** HR / Super Admin: geofence, late-start and reminder rules + the office location. */
export function AttendanceRulesSettings() {
  const toast = useToast();
  const [rules, setRules] = useState<Rules | null>(null);
  const [office, setOffice] = useState<{ lat: string; lon: string }>({ lat: '', lon: '' });
  const [reminders, setReminders] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    api<{ rules?: Rules; officeGeofence?: { latitude: number; longitude: number } }>('/attendance')
      .then((res) => {
        if (res.rules) {
          setRules(res.rules);
          setReminders(res.rules.reminderTimes.join(', '));
        }
        if (res.officeGeofence) setOffice({ lat: String(res.officeGeofence.latitude), lon: String(res.officeGeofence.longitude) });
      })
      .catch(() => undefined);
  }, []);

  if (!rules) return null;

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => (r ? { ...r, [k]: v } : r));

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('This browser cannot share its location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOffice({ lat: pos.coords.latitude.toFixed(6), lon: pos.coords.longitude.toFixed(6) });
        toast.info(`Location found (±${Math.round(pos.coords.accuracy)} m). Press Save to use it as the office.`);
        setLocating(false);
      },
      () => {
        toast.error('Could not read your location. Allow location for this site and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function save() {
    if (!rules) return;
    setSaving(true);
    try {
      const lat = Number(office.lat);
      const lon = Number(office.lon);
      const res = await put<{ rules: Rules }>('/attendance/rules', {
        ...rules,
        reminderTimes: reminders.split(/[,\s]+/).filter(Boolean),
        ...(Number.isFinite(lat) && Number.isFinite(lon) && office.lat && office.lon ? { officeLatitude: lat, officeLongitude: lon } : {}),
      });
      setRules(res.rules);
      setReminders(res.rules.reminderTimes.join(', '));
      toast.success('Attendance rules saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const lat = Number(office.lat);
  const lon = Number(office.lon);

  return (
    <Card>
      <CardHeader
        title="Attendance & location rules"
        description="Office zone, live-location alerts, late start (short leave) and the morning reminders."
        badge={<Badge tone="gold">HR · Super Admin</Badge>}
        action={
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        }
      />
      <div className="grid gap-5 px-5 pb-6 sm:px-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Applies to</p>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => {
                const on = rules.roles.includes(r.key);
                return (
                  <label key={r.key} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px]">
                    <input type="checkbox" checked={on} onChange={() => set('roles', on ? rules.roles.filter((x) => x !== r.key) : [...rules.roles, r.key])} />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Office zone (metres)" htmlFor="ar-radius">
              <Input id="ar-radius" type="number" min={20} max={2000} value={rules.radiusMeters} onChange={(e) => set('radiusMeters', Number(e.target.value))} />
            </Field>
            <Field label="Allowed time outside (min)" htmlFor="ar-grace">
              <Input id="ar-grace" type="number" min={1} max={120} value={rules.graceMinutes} onChange={(e) => set('graceMinutes', Number(e.target.value))} />
            </Field>
            <Field label="Late after (short leave)" htmlFor="ar-late">
              <Input id="ar-late" type="time" value={rules.lateAfter} onChange={(e) => set('lateAfter', e.target.value)} />
            </Field>
            <Field label="Tracking-lost alert after (min)" htmlFor="ar-lost">
              <Input id="ar-lost" type="number" min={3} max={120} value={rules.trackingLostMinutes} onChange={(e) => set('trackingLostMinutes', Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Reminder pop-ups (HH:MM, comma separated)" htmlFor="ar-rem">
            <Input id="ar-rem" value={reminders} onChange={(e) => setReminders(e.target.value)} placeholder="08:15, 08:30" />
          </Field>
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Work days (Poya &amp; public holidays are skipped automatically)</p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((d, i) => {
                const on = rules.workDays.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('workDays', on ? rules.workDays.filter((x) => x !== i) : [...rules.workDays, i].sort())}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium ${on ? 'bg-gold/20 text-gold-strong dark:text-gold' : 'bg-ink/[0.05] text-muted'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Office latitude" htmlFor="ar-lat">
              <Input id="ar-lat" value={office.lat} onChange={(e) => setOffice((o) => ({ ...o, lat: e.target.value }))} />
            </Field>
            <Field label="Office longitude" htmlFor="ar-lon">
              <Input id="ar-lon" value={office.lon} onChange={(e) => setOffice((o) => ({ ...o, lon: e.target.value }))} />
            </Field>
            <Button size="sm" variant="secondary" onClick={useMyLocation} disabled={locating}>
              <Crosshair className="h-3.5 w-3.5" /> {locating ? 'Locating…' : 'Use my location'}
            </Button>
          </div>
          {Number.isFinite(lat) && Number.isFinite(lon) && office.lat && office.lon ? (
            <TeamLocationMap members={[]} officeLat={lat} officeLon={lon} radiusMeters={rules.radiusMeters} />
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] text-muted">
              <MapPin className="h-3.5 w-3.5" /> Set the office location to see the zone on the map.
            </p>
          )}
          <p className="text-[11.5px] text-muted">
            Tip: stand in the middle of the office and press “Use my location”. Phones are far more accurate than laptops.
          </p>
        </div>
      </div>
    </Card>
  );
}
