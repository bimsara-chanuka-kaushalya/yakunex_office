'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LiveMapMember {
  userId: string;
  userName: string;
  userRole: string;
  workMode: 'OFFICE' | 'REMOTE' | 'FIELD';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number | null;
  locationLabel: string | null;
  geofenceStatus?: 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'REMOTE_APPROVED' | 'NO_GPS';
  distanceMeters?: number | null;
  lastLocationAt?: string | null;
  onBreak: boolean;
}

interface LiveLocationMapProps {
  members: LiveMapMember[];
  officeLat?: number;
  officeLon?: number;
  officeRadiusMeters?: number;
}

export function LiveLocationMap({
  members,
  officeLat = 6.9271,
  officeLon = 79.8612,
  officeRadiusMeters = 250,
}: LiveLocationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [officeLat, officeLon],
      zoom: 14,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, [officeLat, officeLon]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    // Office HQ geofence circle
    L.circle([officeLat, officeLon], {
      radius: officeRadiusMeters,
      color: '#D4A843',
      fillColor: '#D4A843',
      fillOpacity: 0.12,
      weight: 2,
    })
      .bindPopup(`<strong>Yakunex HQ Geofence</strong><br/>Radius: ${officeRadiusMeters}m`)
      .addTo(group);

    const bounds: L.LatLngTuple[] = [[officeLat, officeLon]];

    for (const m of members) {
      if (m.latitude == null || m.longitude == null) continue;
      bounds.push([m.latitude, m.longitude]);
      const initials = m.userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('');
      const color =
        m.onBreak
          ? '#F59E0B'
          : m.geofenceStatus === 'OUTSIDE_OFFICE'
            ? '#EF4444'
            : m.workMode === 'REMOTE'
              ? '#0EA5E9'
              : '#10B981';

      const icon = L.divIcon({
        className: 'yakunex-live-pin',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:${color};color:#fff;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.35);">${initials || 'U'}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const lastPing = m.lastLocationAt
        ? new Date(m.lastLocationAt).toLocaleTimeString('en-LK', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'Asia/Colombo',
          })
        : '—';

      L.marker([m.latitude, m.longitude], { icon })
        .bindPopup(
          `<div style="min-width:160px;font-size:12px;">
            <strong>${m.userName}</strong><br/>
            <span>${m.workMode}${m.onBreak ? ' · On Break' : ' · Active'}</span><br/>
            <span>${m.locationLabel ?? `${m.latitude.toFixed(4)}, ${m.longitude.toFixed(4)}`}</span><br/>
            ${m.accuracyMeters != null ? `<span>Accuracy: ±${m.accuracyMeters}m</span><br/>` : ''}
            <span>Last GPS ping: ${lastPing}</span>
          </div>`,
        )
        .addTo(group);
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    } else {
      map.setView([officeLat, officeLon], 14);
    }
  }, [members, officeLat, officeLon, officeRadiusMeters]);

  return (
    <div
      ref={containerRef}
      className="h-72 w-full overflow-hidden rounded-2xl border border-line bg-surface"
    />
  );
}
