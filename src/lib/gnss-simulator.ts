// ============================================================
// GeoPulse — GNSS Data Simulator
// Generates realistic position time-series for African stations
// Includes controlled anomaly injection for demo
// ============================================================

import type { GNSReading, SimulatorConfig } from './types';
import { AFRICAN_GNSS_STATIONS } from './stations';

// Reference positions for each station (meters from nominal)
interface StationState {
  refLat: number;
  refLon: number;
  refElev: number;
  // Current displacement state (mm) — simulates slow tectonic drift
  northDrift: number;
  eastDrift: number;
  upDrift: number;
  // Previous reading for velocity calc
  prevTimestamp: number;
  prevLat: number;
  prevLon: number;
  prevElev: number;
  // Anomaly injection state
  anomalyActive: boolean;
  anomalyType: string | null;
  anomalyStart: number;
  anomalyDuration: number;
  anomalyMagnitude: number;
}

const stationStates = new Map<string, StationState>();

// Initialize station states
function ensureStationState(stationId: string, baseLat: number, baseLon: number, baseElev: number): StationState {
  let state = stationStates.get(stationId);
  if (!state) {
    state = {
      refLat: baseLat,
      refLon: baseLon,
      refElev: baseElev,
      northDrift: (Math.random() - 0.5) * 2, // ±1mm initial
      eastDrift: (Math.random() - 0.5) * 2,
      upDrift: (Math.random() - 0.5) * 2,
      prevTimestamp: Date.now() - 5000,
      prevLat: baseLat,
      prevLon: baseLon,
      prevElev: baseElev,
      anomalyActive: false,
      anomalyType: null,
      anomalyStart: 0,
      anomalyDuration: 0,
      anomalyMagnitude: 0,
    };
    stationStates.set(stationId, state);
  }
  return state;
}

/**
 * Convert mm displacement to lat/lon/elev changes
 * 1 degree lat ≈ 111,320 m; 1 degree lon ≈ 111,320 * cos(lat) m
 */
function displacementToPosition(
  state: StationState,
  northMm: number,
  eastMm: number,
  upMm: number,
): { lat: number; lon: number; elev: number } {
  const latRad = (state.refLat * Math.PI) / 180;
  const lat = state.refLat + (northMm / 1000) / 111320;
  const lon = state.refLon + (eastMm / 1000) / (111320 * Math.cos(latRad));
  const elev = state.refElev + upMm / 1000;
  return { lat, lon, elev };
}

/**
 * Generate a single GNSS reading for a station
 */
export function generateReading(stationId: string, timestamp?: number): GNSReading {
  const station = AFRICAN_GNSS_STATIONS.find(s => s.stationId === stationId);
  if (!station) throw new Error(`Unknown station: ${stationId}`);

  const state = ensureStationState(stationId, station.latitude, station.longitude, station.elevation);
  const ts = timestamp || Date.now();
  const dt = (ts - state.prevTimestamp) / 1000; // seconds

  // ---- Base signal noise (realistic GNSS noise floor) ----
  // Typical GNSS position noise: 2-5mm horizontal, 5-15mm vertical
  const noiseNorth = gaussianRandom() * 3.0;   // mm, σ=3mm
  const noiseEast = gaussianRandom() * 3.0;
  const noiseUp = gaussianRandom() * 8.0;      // vertical is noisier

  // ---- Slow tectonic drift (realistic rates) ----
  // East African Rift: ~5-15 mm/yr = ~0.00016 mm/s
  // Stable craton: ~0.5-2 mm/yr
  const driftRate = station.network === 'IGS' ? 0.0002 : 0.00005; // mm/s
  state.northDrift += driftRate * dt + gaussianRandom() * 0.001;
  state.eastDrift += driftRate * dt + gaussianRandom() * 0.001;
  state.upDrift += driftRate * 0.5 * dt + gaussianRandom() * 0.001;

  // Keep drift bounded
  state.northDrift = Math.max(-50, Math.min(50, state.northDrift));
  state.eastDrift = Math.max(-50, Math.min(50, state.eastDrift));
  state.upDrift = Math.max(-80, Math.min(80, state.upDrift));

  // ---- Anomaly injection ----
  let anomalyNorth = 0, anomalyEast = 0, anomalyUp = 0;
  if (state.anomalyActive) {
    const elapsed = ts - state.anomalyStart;
    if (elapsed > state.anomalyDuration) {
      state.anomalyActive = false;
      state.anomalyType = null;
    } else {
      const progress = elapsed / state.anomalyDuration;
      const envelope = Math.sin(progress * Math.PI); // smooth rise/fall

      switch (state.anomalyType) {
        case 'position_drift':
          anomalyNorth = state.anomalyMagnitude * envelope;
          anomalyEast = state.anomalyMagnitude * 0.7 * envelope;
          break;
        case 'velocity_spike':
          // Velocity spike decays quickly
          const decay = Math.exp(-elapsed / 5000);
          anomalyNorth = state.anomalyMagnitude * decay * Math.sin(elapsed / 500);
          break;
        case 'elevation_jump':
          anomalyUp = state.anomalyMagnitude * (elapsed < state.anomalyDuration * 0.3 ? 1 : 0.8);
          break;
        case 'multipath':
          anomalyNorth = state.anomalyMagnitude * Math.sin(elapsed / 300);
          anomalyEast = state.anomalyMagnitude * Math.cos(elapsed / 400);
          anomalyUp = state.anomalyMagnitude * 0.5 * Math.sin(elapsed / 250);
          break;
      }
    }
  }

  // Calculate total residuals (mm from reference)
  const totalNorth = state.northDrift + noiseNorth + anomalyNorth;
  const totalEast = state.eastDrift + noiseEast + anomalyEast;
  const totalUp = state.upDrift + noiseUp + anomalyUp;

  const pos = displacementToPosition(state, totalNorth, totalEast, totalUp);

  // Calculate velocity (mm/s) from position change
  const velNorth = dt > 0 ? ((pos.lat - state.prevLat) * 111320 * 1000) / dt : 0;
  const velEast = dt > 0 ? ((pos.lon - state.prevLon) * 111320 * Math.cos((state.refLat * Math.PI) / 180) * 1000) / dt : 0;
  const velUp = dt > 0 ? ((pos.elev - state.prevElev) * 1000) / dt : 0;

  // Signal quality
  const baseSatellites = 8 + Math.floor(Math.random() * 8); // 8-15 satellites
  const pdop = 1.0 + Math.random() * 2.5; // 1.0 - 3.5 (good to fair)
  const fixQuality = Math.random() > 0.05 ? 4 : 1; // 95% RTK Fixed, 5% GPS

  // Update previous state
  state.prevTimestamp = ts;
  state.prevLat = pos.lat;
  state.prevLon = pos.lon;
  state.prevElev = pos.elev;

  return {
    stationId,
    timestamp: ts,
    latitude: pos.lat,
    longitude: pos.lon,
    elevation: pos.elev,
    northResidual: totalNorth,
    eastResidual: totalEast,
    upResidual: totalUp,
    northVelocity: velNorth,
    eastVelocity: velEast,
    upVelocity: velUp,
    satellites: anomalyNorth !== 0 && state.anomalyType === 'multipath' ? Math.max(4, baseSatellites - 4) : baseSatellites,
    pdop: anomalyNorth !== 0 && state.anomalyType === 'multipath' ? pdop + 3 : pdop,
    fixQuality,
  };
}

/**
 * Inject an anomaly into a station's data stream
 */
export function injectAnomaly(stationId: string): {
  type: string;
  magnitude: number;
  duration: number;
} | null {
  const state = stationStates.get(stationId);
  if (!state || state.anomalyActive) return null;

  const types = [
    { type: 'position_drift', magRange: [15, 50], durRange: [30000, 120000] },
    { type: 'velocity_spike', magRange: [5, 20], durRange: [10000, 60000] },
    { type: 'elevation_jump', magRange: [20, 80], durRange: [20000, 90000] },
    { type: 'multipath', magRange: [8, 25], durRange: [15000, 45000] },
  ];

  const chosen = types[Math.floor(Math.random() * types.length)];
  const magnitude = chosen.magRange[0] + Math.random() * (chosen.magRange[1] - chosen.magRange[0]);
  const duration = chosen.durRange[0] + Math.random() * (chosen.durRange[1] - chosen.durRange[0]);

  state.anomalyActive = true;
  state.anomalyType = chosen.type;
  state.anomalyStart = Date.now();
  state.anomalyDuration = duration;
  state.anomalyMagnitude = magnitude;

  return { type: chosen.type, magnitude, duration };
}

/**
 * Box-Muller transform for Gaussian random numbers
 */
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Get the default simulator config
 */
export function getDefaultSimulatorConfig(): SimulatorConfig {
  return {
    running: false,
    intervalMs: 2000, // 2 seconds between readings per station
    anomalyInjectionRate: 0.02, // 2% chance per station per cycle
    activeStationIds: AFRICAN_GNSS_STATIONS.map(s => s.stationId),
  };
}