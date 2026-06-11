// ============================================================
// GeoPulse — Core Type Definitions
// GNSS Ground Station Anomaly Detection Platform
// ============================================================

/** A GNSS ground station */
export interface Station {
  id: string;
  stationId: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  elevation: number;
  network: string;
  status: string;
  lastReading?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** A single GNSS position reading (time-series point) */
export interface GNSReading {
  stationId: string;
  timestamp: number; // Unix ms
  latitude: number;
  longitude: number;
  elevation: number;
  // 3D position residuals (mm) — deviation from reference position
  northResidual: number;
  eastResidual: number;
  upResidual: number;
  // Velocity components (mm/s)
  northVelocity: number;
  eastVelocity: number;
  upVelocity: number;
  // Signal quality metrics
  satellites: number;
  pdop: number;   // Position Dilution of Precision
  fixQuality: number; // 0=invalid, 1=GPS, 2=DGPS, 4=RTK Fixed, 5=RTK Float
}

/** An anomaly detected by the engine */
export interface Anomaly {
  id: string;
  stationId: string;
  timestamp: number;
  type: AnomalyType;
  severity: Severity;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  value: number;
  threshold: number;
  metadata?: Record<string, number | string>;
}

export type AnomalyType =
  | 'position_drift'
  | 'velocity_spike'
  | 'signal_degradation'
  | 'multipath_anomaly'
  | 'cycle_slip'
  | 'elevation_jump';

export type Severity = 'critical' | 'warning' | 'info';

/** Dashboard KPI stats */
export interface DashboardStats {
  totalStations: number;
  activeStations: number;
  readingsLastHour: number;
  anomaliesLast24h: number;
  criticalAlerts: number;
  avgPdop: number;
  avgSatellites: number;
  dataPointsStored: number;
}

/** Time-series data point for charts */
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  label?: string;
}

/** Station health summary */
export interface StationHealth {
  stationId: string;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  pdop: number;
  satellites: number;
  lastAnomaly: number | null;
  anomalyCount24h: number;
}

/** Socket.io event types */
export interface SocketEvents {
  'reading': (reading: GNSReading & { anomaly?: Anomaly }) => void;
  'anomaly': (anomaly: Anomaly) => void;
  'station_status': (stationId: string, status: StationHealth) => void;
  'simulator_status': (running: boolean, stationsActive: number) => void;
}

/** Simulator configuration */
export interface SimulatorConfig {
  running: boolean;
  intervalMs: number; // ms between readings per station
  anomalyInjectionRate: number; // 0.0 - 1.0 probability of injecting anomaly
  activeStationIds: string[];
}