'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useDashboardStore } from '@/lib/store';
import type { Station, Anomaly } from '@/lib/types';
import { RISK_ZONES } from '@/lib/stations';
import L from 'leaflet';

// Fix leaflet default icon issue in Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const anomalyMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());

  const {
    stations,
    readings,
    selectedStationId,
    selectStation,
    anomalies,
  } = useDashboardStore();

  // Get latest reading per station
  const latestReadings = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number; res3d: number; pdop: number; sats: number }>();
    for (const [stationId, rs] of readings) {
      if (rs.length > 0) {
        const r = rs[rs.length - 1];
        const res3d = Math.sqrt(r.northResidual ** 2 + r.eastResidual ** 2 + r.upResidual ** 2);
        map.set(stationId, { lat: r.latitude, lon: r.longitude, res3d, pdop: r.pdop, sats: r.satellites });
      }
    }
    return map;
  }, [readings]);

  // Recent anomalies for map markers
  const recentAnomalies = useMemo(() => {
    const cutoff = Date.now() - 5 * 60 * 1000; // last 5 minutes
    return anomalies.filter(a => a.timestamp > cutoff);
  }, [anomalies]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [2, 22],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map)
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>');

    leafletMapRef.current = map;

    // Draw risk zone labels (static)
    // We'll add these after stations render

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // Update station markers
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    // Add/update station markers
    for (const station of stations) {
      let marker = markersRef.current.get(station.stationId);
      const latest = latestReadings.get(station.stationId);
      const isSelected = station.stationId === selectedStationId;

      if (!marker) {
        marker = L.circleMarker([station.latitude, station.longitude], {
          radius: 6,
          fillColor: '#22c55e',
          color: '#fff',
          weight: isSelected ? 3 : 1,
          opacity: 1,
          fillOpacity: 0.8,
        }).addTo(map);

        marker.bindTooltip(station.stationId, {
          permanent: false,
          direction: 'top',
          offset: [0, -8],
          className: '!bg-neutral-900 !text-neutral-100 !border-neutral-700 !text-xs !rounded !px-2 !py-1',
        });

        marker.on('click', () => {
          selectStation(
            selectedStationId === station.stationId ? null : station.stationId,
          );
        });

        markersRef.current.set(station.stationId, marker);
      }

      // Update color based on data
      let color = '#22c55e'; // green = healthy
      if (latest) {
        if (latest.res3d > 20 || latest.pdop > 6) color = '#ef4444'; // red
        else if (latest.res3d > 10 || latest.pdop > 4) color = '#f59e0b'; // amber
      }

      marker.setStyle({
        fillColor: color,
        color: isSelected ? '#fff' : color,
        weight: isSelected ? 3 : 1,
        radius: isSelected ? 9 : 6,
      });

      // Update popup
      const popupContent = `
        <div class="text-xs font-sans min-w-48">
          <div class="font-bold text-sm mb-1">${station.stationId} — ${station.name}</div>
          <div class="text-gray-400">${station.country} · ${station.network}</div>
          <div class="text-gray-400">Elev: ${station.elevation}m</div>
          ${latest ? `
            <div class="mt-2 border-t border-gray-700 pt-1">
              <div>PDOP: <span class="font-mono ${latest.pdop > 4 ? 'text-red-400' : 'text-green-400'}">${latest.pdop.toFixed(1)}</span></div>
              <div>Satellites: <span class="font-mono">${latest.sats}</span></div>
              <div>3D Residual: <span class="font-mono ${latest.res3d > 10 ? 'text-red-400' : 'text-green-400'}">${latest.res3d.toFixed(1)} mm</span></div>
            </div>
          ` : '<div class="mt-1 text-gray-500">No data yet</div>'}
        </div>
      `;
      marker.bindPopup(popupContent, { className: '!bg-neutral-900 !text-neutral-100 !border-neutral-700 !rounded-lg' });
    }

    // Update anomaly markers (pulsing circles)
    for (const anomaly of recentAnomalies) {
      const key = `${anomaly.stationId}-${anomaly.timestamp}`;
      if (!anomalyMarkersRef.current.has(key)) {
        const color = anomaly.severity === 'critical' ? '#ef4444' : '#f59e0b';
        const m = L.circleMarker([anomaly.latitude, anomaly.longitude], {
          radius: 12,
          fillColor: color,
          color: color,
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0.15,
        }).addTo(map);
        anomalyMarkersRef.current.set(key, m);

        // Auto-remove after 2 minutes
        setTimeout(() => {
          m.remove();
          anomalyMarkersRef.current.delete(key);
        }, 120000);
      }
    }

  }, [stations, latestReadings, selectedStationId, recentAnomalies, selectStation]);

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden border border-border bg-neutral-950">
      <div ref={mapRef} className="absolute inset-0" />
      {/* Map overlay legend */}
      <div className="absolute top-3 left-3 z-[1000] bg-neutral-900/90 backdrop-blur-sm border border-neutral-700 rounded-lg p-3 text-xs">
        <div className="font-semibold text-neutral-200 mb-2">Station Health</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="text-neutral-400">Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            <span className="text-neutral-400">Elevated</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
            <span className="text-neutral-400">Critical</span>
          </div>
        </div>
        {selectedStationId && (
          <button
            onClick={() => selectStation(null)}
            className="mt-2 text-neutral-400 hover:text-white transition-colors block"
          >
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}