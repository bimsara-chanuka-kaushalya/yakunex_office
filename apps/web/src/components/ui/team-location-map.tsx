'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { LiveMapMember } from './live-location-map';

/**
 * Team live-location map. Uses Google Maps when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, otherwise
 * the free OpenStreetMap (Leaflet) map, so attendance keeps working before a key is configured.
 */

const LeafletMap = dynamic(() => import('./live-location-map').then((m) => m.LiveLocationMap), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-2xl bg-ink/[0.05]" />,
});

export interface TeamMapMember extends LiveMapMember {
  outsideSince?: string | null;
  tracked?: boolean;
}

interface Props {
  members: TeamMapMember[];
  officeLat: number;
  officeLon: number;
  /** The tracked zone (e.g. 50 m for interns). */
  radiusMeters: number;
  className?: string;
}

const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';

export function TeamLocationMap(props: Props) {
  const [googleFailed, setGoogleFailed] = useState(false);
  if (!GOOGLE_KEY || googleFailed) {
    return (
      <LeafletMap
        members={props.members}
        officeLat={props.officeLat}
        officeLon={props.officeLon}
        officeRadiusMeters={props.radiusMeters}
      />
    );
  }
  return <GoogleTeamMap {...props} onFail={() => setGoogleFailed(true)} />;
}

// ─── Google Maps ──────────────────────────────────────────────────────────────

/* Minimal typings for the parts of the Maps JS API used here (no @types/google.maps needed). */
interface GLatLng {
  lat: number;
  lng: number;
}
interface GOverlay {
  setMap(map: unknown): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
    fitBounds(b: unknown, pad?: number): void;
    setCenter(c: GLatLng): void;
    setZoom(z: number): void;
  };
  Circle: new (opts: Record<string, unknown>) => GOverlay;
  Marker: new (opts: Record<string, unknown>) => GOverlay & { addListener(e: string, fn: () => void): void };
  Polyline: new (opts: Record<string, unknown>) => GOverlay;
  InfoWindow: new () => { setContent(html: string): void; open(opts: Record<string, unknown>): void };
  LatLngBounds: new () => { extend(p: GLatLng): void };
  SymbolPath: { CIRCLE: number };
}
declare global {
  interface Window {
    google?: { maps?: GMaps };
    __yhGoogleMapsReady?: () => void;
  }
}

let loader: Promise<GMaps> | null = null;
function loadGoogleMaps(): Promise<GMaps> {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loader) return loader;
  loader = new Promise<GMaps>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Google Maps timed out')), 15_000);
    window.__yhGoogleMapsReady = () => {
      clearTimeout(timeout);
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps unavailable'));
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&callback=__yhGoogleMapsReady`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      loader = null;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  });
  return loader;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function colorFor(m: TeamMapMember) {
  if (m.onBreak) return '#F59E0B';
  if (m.outsideSince || m.geofenceStatus === 'OUTSIDE_OFFICE') return '#EF4444';
  if (m.workMode === 'REMOTE') return '#0EA5E9';
  return '#10B981';
}

function GoogleTeamMap({ members, officeLat, officeLon, radiusMeters, className, onFail }: Props & { onFail: () => void }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<GMaps['Map']> | null>(null);
  const apiRef = useRef<GMaps | null>(null);
  const overlaysRef = useRef<GOverlay[]>([]);
  const infoRef = useRef<InstanceType<GMaps['InfoWindow']> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogleMaps()
      .then((g) => {
        if (!alive || !elRef.current) return;
        apiRef.current = g;
        mapRef.current = new g.Map(elRef.current, {
          center: { lat: officeLat, lng: officeLon },
          zoom: 18,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        });
        infoRef.current = new g.InfoWindow();
        setReady(true);
      })
      .catch(() => alive && onFail());
    return () => {
      alive = false;
    };
    // The map is created once; data changes are drawn by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = apiRef.current;
    const map = mapRef.current;
    if (!ready || !g || !map) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const office = { lat: officeLat, lng: officeLon };
    overlaysRef.current.push(
      new g.Circle({
        map,
        center: office,
        radius: radiusMeters,
        strokeColor: '#D4A843',
        strokeWeight: 2,
        fillColor: '#D4A843',
        fillOpacity: 0.15,
      }),
      new g.Marker({ map, position: office, title: `Office · ${radiusMeters} m zone`, label: { text: '🏢', fontSize: '16px' } }),
    );

    const bounds = new g.LatLngBounds();
    bounds.extend(office);
    let points = 0;
    for (const m of members) {
      if (m.latitude == null || m.longitude == null) continue;
      const pos = { lat: m.latitude, lng: m.longitude };
      const color = colorFor(m);
      bounds.extend(pos);
      points++;
      if (m.locationTrail && m.locationTrail.length > 1) {
        overlaysRef.current.push(
          new g.Polyline({
            map,
            path: m.locationTrail.map((p) => ({ lat: p.lat, lng: p.lon })),
            strokeColor: color,
            strokeOpacity: 0.7,
            strokeWeight: 3,
          }),
        );
      }
      if (m.accuracyMeters && m.accuracyMeters > 5) {
        overlaysRef.current.push(
          new g.Circle({ map, center: pos, radius: m.accuracyMeters, strokeOpacity: 0, fillColor: color, fillOpacity: 0.1, clickable: false }),
        );
      }
      const initials = m.userName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
      const marker = new g.Marker({
        map,
        position: pos,
        title: m.userName,
        label: { text: initials || 'U', color: '#fff', fontSize: '11px', fontWeight: '700' },
        icon: { path: g.SymbolPath.CIRCLE, scale: 15, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      const last = m.lastLocationAt
        ? new Date(m.lastLocationAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Colombo' })
        : '—';
      marker.addListener('click', () => {
        infoRef.current?.setContent(
          `<div style="font-size:12px;min-width:170px;color:#111">
            <strong>${escapeHtml(m.userName)}</strong><br/>
            ${m.onBreak ? 'On break' : m.outsideSince ? '<span style="color:#dc2626">Outside the office area</span>' : 'Working'}<br/>
            ${m.distanceMeters != null ? `${m.distanceMeters} m from office<br/>` : ''}
            ${m.accuracyMeters != null ? `GPS ±${m.accuracyMeters} m<br/>` : ''}
            Last update: ${last}
          </div>`,
        );
        infoRef.current?.open({ map, anchor: marker });
      });
      overlaysRef.current.push(marker);
    }
    if (points > 0) map.fitBounds(bounds, 48);
    else {
      map.setCenter(office);
      map.setZoom(18);
    }
  }, [members, officeLat, officeLon, radiusMeters, ready]);

  return <div ref={elRef} className={className ?? 'h-80 w-full overflow-hidden rounded-2xl border border-line bg-surface'} />;
}
