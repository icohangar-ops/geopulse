// ============================================================
// GeoPulse — Anomaly Detection Engine
// Real-time detection of GNSS position anomalies
// for earthquake/landslide/volcanic precursor signals
// ============================================================

import type { GNSReading, Anomaly, Severity, StationHealth } from './types';
import { v4 as uuid } from 'uuid';

// Sliding window per station for statistical analysis
interface StationWindow {
  readings: GNSReading[];
  maxAge: number; // ms to keep
  // Running statistics
  mean3d: number;
  std3d: number;
  meanVel3d: number;
  stdVel3d: number;
  meanPdop: number;
  meanSatellites: number;
}

const windows = new Map<string, StationWindow>();
const WINDOW_MAX_AGE = 30 * 60 * 1000; // 30 minutes
const WINDOW_MAX_SIZE = 500;

/**
 * Detect anomalies in a new GNSS reading.
 * Returns an Anomaly if one is detected, or null if the reading is normal.
 */
export function detectAnomalies(reading: GNSReading): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const window = getWindow(reading.stationId);

  // Add reading to window
  window.readings.push(reading);
  pruneWindow(window);
  updateStatistics(window);

  // Only start detecting after we have enough data
  if (window.readings.length < 10) return anomalies;

  // ---- 1. Position Drift Detection ----
  const driftAnomaly = detectPositionDrift(reading, window);
  if (driftAnomaly) anomalies.push(driftAnomaly);

  // ---- 2. Velocity Spike Detection ----
  const velAnomaly = detectVelocitySpike(reading, window);
  if (velAnomaly) anomalies.push(velAnomaly);

  // ---- 3. Signal Degradation Detection ----
  const signalAnomaly = detectSignalDegradation(reading, window);
  if (signalAnomaly) anomalies.push(signalAnomaly);

  // ---- 4. Multipath Detection ----
  const multipathAnomaly = detectMultipath(reading, window);
  if (multipathAnomaly) anomalies.push(multipathAnomaly);

  // ---- 5. Elevation Jump Detection ----
  const elevAnomaly = detectElevationJump(reading, window);
  if (elevAnomaly) anomalies.push(elevAnomaly);

  return anomalies;
}

/**
 * Detect significant position drift from reference
 * Threshold: 3σ deviation from running mean
 */
function detectPositionDrift(reading: GNSReading, window: StationWindow): Anomaly | null {
  if (window.std3d < 0.5) return null; // Not enough variance yet

  const residual3d = Math.sqrt(
    reading.northResidual ** 2 +
    reading.eastResidual ** 2 +
    reading.upResidual ** 2,
  );

  const zScore = (residual3d - window.mean3d) / window.std3d;

  // Thresholds: >4σ = critical, >3σ = warning
  if (zScore > 4) {
    return makeAnomaly(reading, 'position_drift', 'critical',
      'Significant Position Drift Detected',
      `3D position residual ${residual3d.toFixed(1)}mm exceeds ${(4 * window.std3d).toFixed(1)}mm threshold (${zScore.toFixed(1)}σ). Possible tectonic precursor signal.`,
      residual3d, 4 * window.std3d, { zScore, residual3d });
  } else if (zScore > 3) {
    return makeAnomaly(reading, 'position_drift', 'warning',
      'Position Drift Above Normal',
      `3D residual ${residual3d.toFixed(1)}mm is ${(zScore.toFixed(1))}σ above running mean. Monitoring for escalation.`,
      residual3d, 3 * window.std3d, { zScore, residual3d });
  }

  return null;
}

/**
 * Detect sudden velocity spikes (could indicate rapid ground movement)
 */
function detectVelocitySpike(reading: GNSReading, window: StationWindow): Anomaly | null {
  if (window.stdVel3d < 0.1) return null;

  const vel3d = Math.sqrt(
    reading.northVelocity ** 2 +
    reading.eastVelocity ** 2 +
    reading.upVelocity ** 2,
  );

  // Velocity thresholds: absolute values in mm/s
  // Normal tectonic: <0.001 mm/s, co-seismic: >1 mm/s
  const criticalVel = 2.0; // mm/s
  const warningVel = 0.5; // mm/s

  if (vel3d > criticalVel) {
    return makeAnomaly(reading, 'velocity_spike', 'critical',
      'Critical Velocity Spike',
      `3D velocity ${vel3d.toFixed(2)} mm/s detected — exceeds ${criticalVel} mm/s critical threshold. Possible co-seismic signal or equipment malfunction.`,
      vel3d, criticalVel, { velocity3d: vel3d });
  } else if (vel3d > warningVel) {
    return makeAnomaly(reading, 'velocity_spike', 'warning',
      'Elevated Velocity Detected',
      `3D velocity ${vel3d.toFixed(2)} mm/s exceeds ${warningVel} mm/s warning threshold. Could indicate rapid deformation.`,
      vel3d, warningVel, { velocity3d: vel3d });
  }

  return null;
}

/**
 * Detect degradation in signal quality (fewer satellites, high PDOP)
 */
function detectSignalDegradation(reading: GNSReading, window: StationWindow): Anomaly | null {
  // Low satellite count
  if (reading.satellites < 5) {
    const severity: Severity = reading.satellites < 4 ? 'critical' : 'warning';
    return makeAnomaly(reading, 'signal_degradation', severity,
      `${severity === 'critical' ? 'Critical' : 'Low'} Satellite Count`,
      `Only ${reading.satellites} satellites tracked (avg: ${window.meanSatellites.toFixed(1)}). Position accuracy significantly degraded.`,
      reading.satellites, 5, { satellites: reading.satellites, avgSatellites: window.meanSatellites });
  }

  // High PDOP
  if (reading.pdop > 6) {
    const severity: Severity = reading.pdop > 10 ? 'critical' : 'warning';
    return makeAnomaly(reading, 'signal_degradation', severity,
      `${severity === 'critical' ? 'Critical' : 'High'} PDOP Value`,
      `PDOP of ${reading.pdop.toFixed(1)} indicates poor geometric satellite configuration (avg: ${window.meanPdop.toFixed(1)}).`,
      reading.pdop, 6, { pdop: reading.pdop, avgPdop: window.meanPdop });
  }

  return null;
}

/**
 * Detect multipath interference patterns
 * Characterized by oscillating position residuals + high PDOP simultaneously
 */
function detectMultipath(reading: GNSReading, window: StationWindow): Anomaly | null {
  if (window.readings.length < 15) return null;

  // Check recent readings for oscillation pattern
  const recent = window.readings.slice(-10);
  const residuals = recent.map(r =>
    Math.sqrt(r.northResidual ** 2 + r.eastResidual ** 2 + r.upResidual ** 2),
  );

  // Calculate sign changes (oscillation indicator)
  let signChanges = 0;
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  for (let i = 1; i < residuals.length; i++) {
    if ((residuals[i] - mean) * (residuals[i - 1] - mean) < 0) {
      signChanges++;
    }
  }

  // Multipath: high oscillation + elevated PDOP
  const oscillationRate = signChanges / (residuals.length - 1);
  if (oscillationRate > 0.6 && reading.pdop > 4) {
    return makeAnomaly(reading, 'multipath_anomaly', 'warning',
      'Multipath Interference Suspected',
      `Oscillation rate ${(oscillationRate * 100).toFixed(0)}% with PDOP ${reading.pdop.toFixed(1)} suggests multipath interference. Position reliability reduced.`,
      oscillationRate, 0.6, { oscillationRate, pdop: reading.pdop });
  }

  return null;
}

/**
 * Detect sudden elevation changes (landslide/vertical displacement)
 */
function detectElevationJump(reading: GNSReading, window: StationWindow): Anomaly | null {
  if (window.readings.length < 10) return null;

  const recent = window.readings.slice(-5);
  const elevChange = Math.abs(
    reading.upResidual - recent[0].upResidual,
  );

  // Threshold: >15mm sudden change
  if (elevChange > 20) {
    return makeAnomaly(reading, 'elevation_jump', 'critical',
      'Sudden Elevation Change',
      `Vertical displacement of ${elevChange.toFixed(1)}mm detected over ${(window.readings.length * 2).toFixed(0)}s. Possible landslide, subsidence, or volcanic activity.`,
      elevChange, 20, { elevationChange: elevChange });
  } else if (elevChange > 15) {
    return makeAnomaly(reading, 'elevation_jump', 'warning',
      'Elevation Change Detected',
      `Vertical change of ${elevChange.toFixed(1)}mm. Below critical threshold but notable.`,
      elevChange, 15, { elevationChange: elevChange });
  }

  return null;
}

/**
 * Get station health assessment
 */
export function getStationHealth(stationId: string): StationHealth {
  const window = windows.get(stationId);
  if (!window || window.readings.length < 3) {
    return {
      stationId,
      status: 'offline',
      pdop: 0,
      satellites: 0,
      lastAnomaly: null,
      anomalyCount24h: 0,
    };
  }

  const latest = window.readings[window.readings.length - 1];
  const recentAnomalies = window.readings.filter(r => {
    const age = Date.now() - r.timestamp;
    return age < 24 * 60 * 60 * 1000;
  }).length;

  let status: StationHealth['status'] = 'healthy';
  if (latest.pdop > 6 || latest.satellites < 5) status = 'degraded';
  if (latest.pdop > 10 || latest.satellites < 4) status = 'critical';

  return {
    stationId,
    status,
    pdop: window.meanPdop,
    satellites: window.meanSatellites,
    lastAnomaly: null, // Would need anomaly tracking
    anomalyCount24h: recentAnomalies,
  };
}

// ---- Helpers ----

function getWindow(stationId: string): StationWindow {
  let w = windows.get(stationId);
  if (!w) {
    w = {
      readings: [],
      maxAge: WINDOW_MAX_AGE,
      mean3d: 0,
      std3d: 0,
      meanVel3d: 0,
      stdVel3d: 0,
      meanPdop: 0,
      meanSatellites: 0,
    };
    windows.set(stationId, w);
  }
  return w;
}

function pruneWindow(window: StationWindow) {
  const cutoff = Date.now() - window.maxAge;
  window.readings = window.readings.filter(r => r.timestamp >= cutoff);
  if (window.readings.length > WINDOW_MAX_SIZE) {
    window.readings = window.readings.slice(-WINDOW_MAX_SIZE);
  }
}

function updateStatistics(window: StationWindow) {
  const n = window.readings.length;
  if (n < 2) return;

  // 3D residuals
  const residuals3d = window.readings.map(r =>
    Math.sqrt(r.northResidual ** 2 + r.eastResidual ** 2 + r.upResidual ** 2),
  );
  window.mean3d = residuals3d.reduce((a, b) => a + b, 0) / n;
  window.std3d = Math.sqrt(residuals3d.reduce((a, b) => a + (b - window.mean3d) ** 2, 0) / (n - 1));

  // 3D velocities
  const vels3d = window.readings.map(r =>
    Math.sqrt(r.northVelocity ** 2 + r.eastVelocity ** 2 + r.upVelocity ** 2),
  );
  window.meanVel3d = vels3d.reduce((a, b) => a + b, 0) / n;
  window.stdVel3d = Math.sqrt(vels3d.reduce((a, b) => a + (b - window.meanVel3d) ** 2, 0) / (n - 1));

  // Signal quality
  window.meanPdop = window.readings.reduce((a, r) => a + r.pdop, 0) / n;
  window.meanSatellites = window.readings.reduce((a, r) => a + r.satellites, 0) / n;
}

function makeAnomaly(
  reading: GNSReading,
  type: Anomaly['type'],
  severity: Severity,
  title: string,
  description: string,
  value: number,
  threshold: number,
  metadata?: Record<string, number | string>,
): Anomaly {
  return {
    id: uuid(),
    stationId: reading.stationId,
    timestamp: reading.timestamp,
    type,
    severity,
    title,
    description,
    latitude: reading.latitude,
    longitude: reading.longitude,
    value,
    threshold,
    metadata,
  };
}