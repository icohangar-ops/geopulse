// ============================================================
// GeoPulse — Zustand Store for Dashboard State
// ============================================================

import { create } from 'zustand';
import type { GNSReading, Anomaly, Station, DashboardStats, SimulatorConfig } from './types';

interface DashboardStore {
  // Stations
  stations: Station[];
  selectedStationId: string | null;
  setStations: (stations: Station[]) => void;
  selectStation: (stationId: string | null) => void;

  // Readings buffer (rolling window for charts)
  readings: Map<string, GNSReading[]>;
  maxReadingsPerStation: number;
  addReading: (reading: GNSReading) => void;
  clearReadings: () => void;

  // Anomalies
  anomalies: Anomaly[];
  maxAnomalies: number;
  addAnomaly: (anomaly: Anomaly) => void;
  clearAnomalies: () => void;

  // Stats
  stats: DashboardStats | null;
  setStats: (stats: DashboardStats) => void;

  // Simulator
  simulatorRunning: boolean;
  simulatorReadings: number;
  simulatorAnomalies: number;
  setSimulatorStatus: (running: boolean, readings?: number, anomalies?: number) => void;

  // Connection
  socketConnected: boolean;
  connectionMode: 'scylladb' | 'memory' | 'unknown';
  setSocketConnected: (connected: boolean) => void;
  setConnectionMode: (mode: 'scylladb' | 'memory' | 'unknown') => void;

  // Initialization
  initialized: boolean;
  setInitialized: (v: boolean) => void;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  stations: [],
  selectedStationId: null,
  setStations: (stations) => set({ stations }),
  selectStation: (stationId) => set({ selectedStationId: stationId }),

  readings: new Map(),
  maxReadingsPerStation: 300,
  addReading: (reading) => {
    const { readings, maxReadingsPerStation } = get();
    const stationReadings = [...(readings.get(reading.stationId) || []), reading];
    if (stationReadings.length > maxReadingsPerStation) {
      stationReadings.splice(0, stationReadings.length - maxReadingsPerStation);
    }
    const newMap = new Map(readings);
    newMap.set(reading.stationId, stationReadings);
    set({ readings: newMap });
  },
  clearReadings: () => set({ readings: new Map() }),

  anomalies: [],
  maxAnomalies: 200,
  addAnomaly: (anomaly) => {
    const { anomalies, maxAnomalies } = get();
    set({ anomalies: [anomaly, ...anomalies].slice(0, maxAnomalies) });
  },
  clearAnomalies: () => set({ anomalies: [] }),

  stats: null,
  setStats: (stats) => set({ stats }),

  simulatorRunning: false,
  simulatorReadings: 0,
  simulatorAnomalies: 0,
  setSimulatorStatus: (running, readings, anomalies) => set((s) => ({
    simulatorRunning: running,
    ...(readings !== undefined ? { simulatorReadings: readings } : {}),
    ...(anomalies !== undefined ? { simulatorAnomalies: anomalies } : {}),
  })),

  socketConnected: false,
  connectionMode: 'unknown',
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setConnectionMode: (mode) => set({ connectionMode: mode }),

  initialized: false,
  setInitialized: (v) => set({ initialized: v }),
}));