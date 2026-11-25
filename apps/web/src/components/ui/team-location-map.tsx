'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, ExternalLink, Layers, LocateFixed, MapPin, Navigation, Radio } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface TeamMapMember {
  userId: string;
  userName: string;
  userRole: string;
  workMode: 'OFFICE' | 'REMOTE' | 'FIELD';
  onBreak: boolean;
  clockInAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  locationLabel: string | null;
  geofenceStatus?: 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'REMOTE_APPROVED' | 'NO_GPS';
  distanceMeters?: number | null;
  lastLocationAt?: string | null;
  locationTrail?: Array<{ lat: number; lon: number; at: string }>;
  outsideSince?: string | null;
  tracked?: boolean;
  projectName?: string | null;
}

interface Props {
  members: TeamMapMember[];
  officeLat: number;
  officeLon: number;
  /** The tracked zone (e.g. 50 m for interns, or office radius). */
  radiusMeters: number;
  /** Optional dynamic Google Maps JS API key from Super Admin Settings. */
  apiKey?: string | null;
  /** Optional controlled selected/focused member ID (synced with Jibble roster). */
  focusedUserId?: string | null;
  onSelectMember?: (userId: string | null) => void;
  /** Allows HR / Super Admin to click or drag on Google Maps to set the office pin. */
  editableOffice?: boolean;
  onPickOfficeLocation?: (lat: number, lon: number) => void;
  className?: string;
}

const ENV_GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export function TeamLocationMap(props: Props) {
  const effectiveKey = (props.apiKey?.trim() || ENV_GOOGLE_KEY).trim();
  const [sdkFailedKey, setSdkFailedKey] = useState<string | null>(null);

  if (effectiveKey && sdkFailedKey !== effectiveKey) {
    return (
      <GoogleJsTeamMap
        {...props}
        apiKey={effectiveKey}
        onFail={() => setSdkFailedKey(effectiveKey)}
      />
    );
  }

  return <GoogleEmbedTeamMap {...props} />;
}

// ─── Minimal Google Maps JS SDK Typings ───────────────────────────────────────

interface GLatLng {
  lat: number;
  lng: number;
}
interface GLatLngObj {
  lat(): number;
  lng(): number;
}
interface GOverlay {
  setMap(map: unknown): void;
}
interface GCircle extends GOverlay {
  setCenter(c: GLatLng): void;
  setRadius(r: number): void;
}
interface GPolyline extends GOverlay {
  setPath(path: GLatLng[]): void;
}
interface GMarker extends GOverlay {
  setPosition(p: GLatLng): void;
  setIcon(icon: Record<string, unknown>): void;
  setLabel(label: Record<string, unknown> | string): void;
  getPosition(): GLatLngObj | undefined;
  addListener(event: string, fn: (ev?: { latLng?: GLatLngObj }) => void): void;
}
interface GMapInstance {
  fitBounds(b: unknown, pad?: number): void;
  setCenter(c: GLatLng): void;
  panTo(c: GLatLng): void;
  setZoom(z: number): void;
  setMapTypeId(typeId: string): void;
  addListener(event: string, fn: (ev?: { latLng?: GLatLngObj }) => void): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMapInstance;
  Circle: new (opts: Record<string, unknown>) => GCircle;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Polyline: new (opts: Record<string, unknown>) => GPolyline;
  InfoWindow: new () => {
    setContent(html: string): void;
    open(opts: Record<string, unknown>): void;
    close(): void;
  };
  LatLngBounds: new () => { extend(p: GLatLng): void };
  SymbolPath: { CIRCLE: number };
}
declare global {
  interface Window {
    google?: { maps?: GMaps };
    __yhGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

let activeLoaderKey: string | null = null;
let activeLoaderPromise: Promise<GMaps> | null = null;

function loadGoogleMapsSdk(apiKey: string): Promise<GMaps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.maps?.Map && activeLoaderKey === apiKey) {
    return Promise.resolve(window.google.maps);
  }
  if (activeLoaderPromise && activeLoaderKey === apiKey) {
    return activeLoaderPromise;
  }

  activeLoaderKey = apiKey;
  activeLoaderPromise = new Promise<GMaps>((resolve, reject) => {
    const existing = document.getElementById('yh-google-maps-sdk');
    if (existing) existing.remove();

    const timeout = setTimeout(() => {
      activeLoaderPromise = null;
      reject(new Error('Google Maps SDK timed out'));
    }, 12_000);

    window.gm_authFailure = () => {
      clearTimeout(timeout);
      activeLoaderPromise = null;
      reject(new Error('Google Maps API key authentication failed'));
    };

    window.__yhGoogleMapsReady = () => {
      clearTimeout(timeout);
      if (window.google?.maps?.Map) resolve(window.google.maps);
      else {
        activeLoaderPromise = null;
        reject(new Error('Google Maps unavailable'));
      }
    };

    const script = document.createElement('script');
    script.id = 'yh-google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&callback=__yhGoogleMapsReady`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timeout);
      activeLoaderPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(script);
  });

  return activeLoaderPromise;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function colorFor(m: TeamMapMember): string {
  if (m.onBreak) return '#F59E0B';
  if (m.outsideSince || m.geofenceStatus === 'OUTSIDE_OFFICE') return '#EF4444';
  if (m.workMode === 'REMOTE') return '#0EA5E9';
  return '#10B981';
}

function formatAge(iso?: string | null): string {
  if (!iso) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  return new Date(iso).toLocaleTimeString('en-LK', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Colombo',
  });
}

function buildInfoHtml(m: TeamMapMember): string {
  const statusText = m.onBreak
    ? '<span style="color:#d97706;font-weight:600">On Break</span>'
    : m.outsideSince || m.geofenceStatus === 'OUTSIDE_OFFICE'
      ? '<span style="color:#dc2626;font-weight:600">Outside Office Zone</span>'
      : m.workMode === 'REMOTE'
        ? '<span style="color:#0284c7;font-weight:600">Remote Approved</span>'
        : '<span style="color:#059669;font-weight:600">In Zone · Working</span>';

  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;min-width:190px;line-height:1.45;color:#111827;padding:2px">
    <div style="font-weight:700;font-size:13px">${escapeHtml(m.userName)}</div>
    <div style="margin-top:2px">${statusText} · <span style="color:#6b7280">${escapeHtml(m.workMode)}</span></div>
    ${m.projectName ? `<div style="color:#374151;margin-top:2px">Project: <strong>${escapeHtml(m.projectName)}</strong></div>` : ''}
    ${m.distanceMeters != null ? `<div style="color:#374151">${m.distanceMeters} m from HQ</div>` : ''}
    ${m.accuracyMeters != null ? `<div style="color:#6b7280">GPS accuracy ±${m.accuracyMeters} m</div>` : ''}
    <div style="color:#6b7280">Updated: ${escapeHtml(formatAge(m.lastLocationAt))}</div>
    ${
      m.latitude != null && m.longitude != null
        ? `<div style="margin-top:5px"><a href="https://www.google.com/maps?q=${m.latitude},${m.longitude}" target="_blank" rel="noreferrer" style="color:#2563eb;font-weight:600;text-decoration:none">Open in Google Maps ↗</a></div>`
        : ''
    }
  </div>`;
}

// ─── Mode A: Full Google Maps JavaScript SDK (Smooth Live Tracking) ───────────

function GoogleJsTeamMap({
  members,
  officeLat,
  officeLon,
  radiusMeters,
  apiKey,
  focusedUserId,
  onSelectMember,
  editableOffice,
  onPickOfficeLocation,
  className,
  onFail,
}: Props & { apiKey: string; onFail: () => void }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMapInstance | null>(null);
  const apiRef = useRef<GMaps | null>(null);
  const officeCircleRef = useRef<GCircle | null>(null);
  const officeMarkerRef = useRef<GMarker | null>(null);
  const memberOverlaysRef = useRef<
    Map<string, { marker: GMarker; accuracy?: GCircle; trail?: GPolyline }>
  >(new Map());
  const infoRef = useRef<InstanceType<GMaps['InfoWindow']> | null>(null);
  const openInfoUserIdRef = useRef<string | null>(null);
  const initialFitDoneRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [autoFollow, setAutoFollow] = useState(false);

  const onPickRef = useRef(onPickOfficeLocation);
  onPickRef.current = onPickOfficeLocation;
  const onSelectRef = useRef(onSelectMember);
  onSelectRef.current = onSelectMember;

  useEffect(() => {
    let alive = true;
    loadGoogleMapsSdk(apiKey)
      .then((g) => {
        if (!alive || !elRef.current) return;
        apiRef.current = g;
        const map = new g.Map(elRef.current, {
          center: { lat: officeLat, lng: officeLon },
          zoom: 18,
          mapTypeId: mapType,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        infoRef.current = new g.InfoWindow();

        if (editableOffice) {
          map.addListener('click', (ev) => {
            const lat = ev?.latLng?.lat();
            const lng = ev?.latLng?.lng();
            if (typeof lat === 'number' && typeof lng === 'number') {
              onPickRef.current?.(lat, lng);
            }
          });
        }

        setReady(true);
      })
      .catch(() => {
        if (alive) onFail();
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (ready && mapRef.current) {
      mapRef.current.setMapTypeId(mapType);
    }
  }, [mapType, ready]);

  // Update office geofence & smooth member markers IN-PLACE without resetting zoom/pan
  useEffect(() => {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!ready || !g || !map) return;

    const office = { lat: officeLat, lng: officeLon };
    if (!officeCircleRef.current) {
      officeCircleRef.current = new g.Circle({
        map,
        center: office,
        radius: radiusMeters,
        strokeColor: '#D4A843',
        strokeWeight: 2,
        fillColor: '#D4A843',
        fillOpacity: 0.14,
        clickable: false,
      });
    } else {
      officeCircleRef.current.setCenter(office);
      officeCircleRef.current.setRadius(radiusMeters);
    }

    if (!officeMarkerRef.current) {
      const hqMarker = new g.Marker({
        map,
        position: office,
        draggable: Boolean(editableOffice),
        title: `Office HQ · ${radiusMeters} m geofence`,
        label: { text: 'HQ', color: '#111827', fontSize: '10px', fontWeight: '800' },
        icon: {
          path: g.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#D4A843',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
      });
      if (editableOffice) {
        hqMarker.addListener('dragend', () => {
          const p = hqMarker.getPosition();
          if (p) onPickRef.current?.(p.lat(), p.lng());
        });
      }
      officeMarkerRef.current = hqMarker;
    } else {
      officeMarkerRef.current.setPosition(office);
    }

    const activeIds = new Set<string>();
    const bounds = new g.LatLngBounds();
    bounds.extend(office);
    let gpsPoints = 0;

    for (const m of members) {
      if (m.latitude == null || m.longitude == null) continue;
      activeIds.add(m.userId);
      const pos = { lat: m.latitude, lng: m.longitude };
      const color = colorFor(m);
      bounds.extend(pos);
      gpsPoints += 1;

      const initials =
        m.userName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? '')
          .join('') || 'U';

      const iconCfg = {
        path: g.SymbolPath.CIRCLE,
        scale: focusedUserId === m.userId ? 18 : 15,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: focusedUserId === m.userId ? '#D4A843' : '#ffffff',
        strokeWeight: focusedUserId === m.userId ? 3.5 : 2,
      };
      const labelCfg = { text: initials, color: '#ffffff', fontSize: '11px', fontWeight: '700' };
      const trailPath = (m.locationTrail ?? []).map((p) => ({ lat: p.lat, lng: p.lon }));

      let existing = memberOverlaysRef.current.get(m.userId);
      if (!existing) {
        const marker = new g.Marker({
          map,
          position: pos,
          title: m.userName,
          label: labelCfg,
          icon: iconCfg,
        });
        marker.addListener('click', () => {
          openInfoUserIdRef.current = m.userId;
          onSelectRef.current?.(m.userId);
          infoRef.current?.setContent(buildInfoHtml(m));
          infoRef.current?.open({ map, anchor: marker });
        });
        existing = { marker };
        memberOverlaysRef.current.set(m.userId, existing);
      } else {
        existing.marker.setPosition(pos);
        existing.marker.setIcon(iconCfg);
        existing.marker.setLabel(labelCfg);
      }

      if (m.accuracyMeters && m.accuracyMeters > 5) {
        if (!existing.accuracy) {
          existing.accuracy = new g.Circle({
            map,
            center: pos,
            radius: m.accuracyMeters,
            strokeOpacity: 0,
            fillColor: color,
            fillOpacity: 0.1,
            clickable: false,
          });
        } else {
          existing.accuracy.setCenter(pos);
          existing.accuracy.setRadius(m.accuracyMeters);
        }
      } else if (existing.accuracy) {
        existing.accuracy.setMap(null);
        existing.accuracy = undefined;
      }

      if (trailPath.length > 1) {
        if (!existing.trail) {
          existing.trail = new g.Polyline({
            map,
            path: trailPath,
            strokeColor: color,
            strokeOpacity: 0.75,
            strokeWeight: 3,
          });
        } else {
          existing.trail.setPath(trailPath);
        }
      } else if (existing.trail) {
        existing.trail.setMap(null);
        existing.trail = undefined;
      }

      if (openInfoUserIdRef.current === m.userId) {
        infoRef.current?.setContent(buildInfoHtml(m));
      }
    }

    // Remove overlays for members who clocked out
    for (const [uid, entry] of memberOverlaysRef.current.entries()) {
      if (!activeIds.has(uid)) {
        entry.marker.setMap(null);
        entry.accuracy?.setMap(null);
        entry.trail?.setMap(null);
        memberOverlaysRef.current.delete(uid);
        if (openInfoUserIdRef.current === uid) {
          infoRef.current?.close();
          openInfoUserIdRef.current = null;
        }
      }
    }

    if (!initialFitDoneRef.current || autoFollow) {
      initialFitDoneRef.current = true;
      if (gpsPoints > 0) {
        map.fitBounds(bounds, 56);
      } else {
        map.setCenter(office);
        map.setZoom(18);
      }
    }
  }, [autoFollow, editableOffice, focusedUserId, members, officeLat, officeLon, radiusMeters, ready]);

  // Pan smoothly when a user is clicked in the Jibble roster
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focusedUserId) return;
    const target = members.find((m) => m.userId === focusedUserId);
    if (target && target.latitude != null && target.longitude != null) {
      map.panTo({ lat: target.latitude, lng: target.longitude });
      map.setZoom(18);
      const entry = memberOverlaysRef.current.get(target.userId);
      if (entry && infoRef.current) {
        openInfoUserIdRef.current = target.userId;
        infoRef.current.setContent(buildInfoHtml(target));
        infoRef.current.open({ map, anchor: entry.marker });
      }
    }
  }, [focusedUserId, members, ready]);

  function fitAll() {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    const bounds = new g.LatLngBounds();
    bounds.extend({ lat: officeLat, lng: officeLon });
    let count = 0;
    for (const m of members) {
      if (m.latitude != null && m.longitude != null) {
        bounds.extend({ lat: m.latitude, lng: m.longitude });
        count += 1;
      }
    }
    if (count > 0) map.fitBounds(bounds, 56);
    else {
      map.setCenter({ lat: officeLat, lng: officeLon });
      map.setZoom(18);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/70 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <Radio className="h-3.5 w-3.5 text-success animate-pulse" /> Google Maps Live SDK
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> In Zone
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Break
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Outside
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Remote
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMapType((t) => (t === 'roadmap' ? 'hybrid' : 'roadmap'))}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-gold"
          >
            <Layers className="h-3.5 w-3.5 text-gold-strong dark:text-gold" />
            {mapType === 'roadmap' ? 'Satellite' : 'Road Map'}
          </button>
          <button
            type="button"
            onClick={() => {
              mapRef.current?.panTo({ lat: officeLat, lng: officeLon });
              mapRef.current?.setZoom(18);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-gold"
          >
            <LocateFixed className="h-3.5 w-3.5" /> Office HQ
          </button>
          <button
            type="button"
            onClick={fitAll}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-gold"
          >
            <Compass className="h-3.5 w-3.5" /> Fit All
          </button>
          <button
            type="button"
            onClick={() => setAutoFollow((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-medium transition',
              autoFollow
                ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                : 'border-line bg-surface text-muted hover:text-ink',
            )}
          >
            <Navigation className="h-3.5 w-3.5" /> Auto-Follow {autoFollow ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div
        ref={elRef}
        className={className ?? 'h-96 w-full overflow-hidden rounded-2xl border border-line bg-surface'}
      />

      {editableOffice && (
        <p className="text-[11.5px] text-muted">
          Tip: Click anywhere on the Google Map or drag the gold <strong>HQ</strong> pin to set the exact office zone center.
        </p>
      )}
    </div>
  );
}

// ─── Mode B: Key-Free Interactive Google Maps Live View ───────────────────────
// Works immediately out of the box using Google Maps (never OpenStreetMap) even before
// Super Admin adds a Google Maps JavaScript API key in Settings.

function GoogleEmbedTeamMap({
  members,
  officeLat,
  officeLon,
  radiusMeters,
  focusedUserId,
  onSelectMember,
  className,
}: Props) {
  const gpsMembers = useMemo(
    () => members.filter((m) => m.latitude != null && m.longitude != null),
    [members],
  );
  const [internalFocusId, setInternalFocusId] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);

  const activeFocusId = focusedUserId !== undefined ? focusedUserId : internalFocusId;
  const focusedMember = gpsMembers.find((m) => m.userId === activeFocusId) ?? null;

  const targetLat = focusedMember?.latitude ?? officeLat;
  const targetLon = focusedMember?.longitude ?? officeLon;
  const zoom = focusedMember ? 18 : 17;
  const mapLayer = satellite ? 'k' : 'm';
  const embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(`${targetLat},${targetLon}`)}&t=${mapLayer}&z=${zoom}&ie=UTF8&iwloc=&output=embed`;

  function pickFocus(id: string | null) {
    setInternalFocusId(id);
    onSelectMember?.(id);
  }

  return (
    <div className="space-y-2.5">
      {/* Top Google Maps Control & Live Pin Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/70 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => pickFocus(null)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-semibold transition',
              !focusedMember
                ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                : 'border-line bg-surface text-ink hover:border-gold/60',
            )}
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Office HQ ({radiusMeters}m zone)
          </button>

          {gpsMembers.map((m) => {
            const selected = focusedMember?.userId === m.userId;
            const dotColor = m.onBreak
              ? 'bg-amber-500'
              : m.outsideSince || m.geofenceStatus === 'OUTSIDE_OFFICE'
                ? 'bg-red-500'
                : m.workMode === 'REMOTE'
                  ? 'bg-sky-500'
                  : 'bg-emerald-500';
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => pickFocus(m.userId)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition',
                  selected
                    ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
                    : 'border-line bg-surface text-ink hover:border-gold/60',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', dotColor)} />
                <span className="max-w-[130px] truncate">{m.userName}</span>
                {m.distanceMeters != null && (
                  <span className="font-mono text-[10.5px] text-muted">{m.distanceMeters}m</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSatellite((s) => !s)}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-ink transition hover:border-gold"
          >
            <Layers className="h-3.5 w-3.5 text-gold-strong dark:text-gold" />
            {satellite ? 'Road Map' : 'Satellite'}
          </button>
          <a
            href={`https://www.google.com/maps?q=${targetLat},${targetLon}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-info transition hover:border-info/50"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Google Maps
          </a>
        </div>
      </div>

      {/* Live Google Maps Viewport */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-line bg-surface',
          className ?? 'h-96',
        )}
      >
        <iframe
          key={`${targetLat.toFixed(5)}-${targetLon.toFixed(5)}-${mapLayer}`}
          title="Yakunex Google Maps Live Tracking"
          src={embedSrc}
          className="h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />

        {/* Jibble-style Live Telemetry Overlay Card */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/80 bg-surface/95 px-3.5 py-2 text-xs shadow-lg backdrop-blur-md sm:right-auto sm:max-w-md">
          {focusedMember ? (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-gold-strong dark:text-gold" />
              <div>
                <p className="font-semibold text-ink">
                  {focusedMember.userName} ·{' '}
                  <span
                    className={
                      focusedMember.onBreak
                        ? 'text-warning'
                        : focusedMember.outsideSince || focusedMember.geofenceStatus === 'OUTSIDE_OFFICE'
                          ? 'text-danger'
                          : 'text-success'
                    }
                  >
                    {focusedMember.onBreak
                      ? 'On Break'
                      : focusedMember.outsideSince || focusedMember.geofenceStatus === 'OUTSIDE_OFFICE'
                        ? 'Outside Zone'
                        : 'In Zone'}
                  </span>
                </p>
                <p className="text-[11px] text-muted">
                  {focusedMember.distanceMeters != null
                    ? `${focusedMember.distanceMeters} m from HQ (zone ${radiusMeters} m)`
                    : focusedMember.workMode}
                  {focusedMember.accuracyMeters != null ? ` · ±${focusedMember.accuracyMeters} m` : ''}
                  {` · Updated ${formatAge(focusedMember.lastLocationAt)}`}
                  {(focusedMember.locationTrail?.length ?? 0) > 1
                    ? ` · ${focusedMember.locationTrail!.length} trail pts`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <Radio className="h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="font-semibold text-ink">
                  Office HQ Geofence · {radiusMeters} m radius
                </p>
                <p className="text-[11px] text-muted">
                  {gpsMembers.length} live GPS member(s) tracked · Select any team member above to inspect their live Google Map pin.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
