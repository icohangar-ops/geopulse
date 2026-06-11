// ============================================================
// GeoPulse — GNSS Real-Time Streaming Service (Socket.io)
// Runs on port 3002, streams simulated GNSS readings to dashboard
// ============================================================

import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';

// ---- Inline types (avoid import issues in mini-service) ----
interface GNSReading {
  stationId: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  elevation: number;
  northResidual: number;
  eastResidual: number;
  upResidual: number;
  northVelocity: number;
  eastVelocity: number;
  upVelocity: number;
  satellites: number;
  pdop: number;
  fixQuality: number;
}

interface Anomaly {
  id: string;
  stationId: string;
  timestamp: number;
  type: string;
  severity: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  value: number;
  threshold: number;
}

// ---- Station registry (subset for simulator) ----
const STATIONS = [
  { stationId: 'NKLG', lat: 0.3536, lon: 9.4142, elev: 15, network: 'IGS' },
  { stationId: 'MALI', lat: 3.75, lon: 8.7833, elev: 52, network: 'IGS' },
  { stationId: 'DSRT', lat: 14.6937, lon: -17.4441, elev: 24, network: 'IGS' },
  { stationId: 'BJCO', lat: 6.3489, lon: 2.3944, elev: 8, network: 'AFREF' },
  { stationId: 'ETHI', lat: 9.025, lon: 38.7469, elev: 2355, network: 'IGS' },
  { stationId: 'NKIG', lat: -1.2197, lon: 36.8889, elev: 1798, network: 'IGS' },
  { stationId: 'DARW', lat: -6.7924, lon: 39.2083, elev: 16, network: 'AFREF' },
  { stationId: 'KAMP', lat: 0.3476, lon: 32.5825, elev: 1200, network: 'AFREF' },
  { stationId: 'RWN2', lat: -1.9403, lon: 29.8739, elev: 1567, network: 'AFREF' },
  { stationId: 'BUKO', lat: -2.5067, lon: 28.8531, elev: 1620, network: 'AFREF' },
  { stationId: 'HRAO', lat: -25.8904, lon: 27.6869, elev: 1453, network: 'IGS' },
  { stationId: 'SUTH', lat: -32.3764, lon: 20.8107, elev: 1798, network: 'IGS' },
  { stationId: 'LUSK', lat: -15.3875, lon: 28.3228, elev: 1272, network: 'AFREF' },
  { stationId: 'HARB', lat: -17.8316, lon: 31.0522, elev: 1471, network: 'AFREF' },
  { stationId: 'MASP', lat: -25.9692, lon: 32.5732, elev: 45, network: 'AFREF' },
  { stationId: 'TETN', lat: 35.5729, lon: -5.3706, elev: 75, network: 'IGS' },
  { stationId: 'ALGR', lat: 36.7538, lon: 3.0588, elev: 25, network: 'IGS' },
  { stationId: 'TUNI', lat: 36.8188, lon: 10.1658, elev: 5, network: 'AFREF' },
  { stationId: 'CAIR', lat: 30.0756, lon: 31.2344, elev: 75, network: 'IGS' },
  { stationId: 'DOUA', lat: 4.0511, lon: 9.7679, elev: 13, network: 'AFREF' },
  { stationId: 'NYAL', lat: 12.1348, lon: 15.0557, elev: 298, network: 'AFREF' },
  { stationId: 'BANG', lat: 4.3612, lon: 18.5552, elev: 367, network: 'AFREF' },
  { stationId: 'SEY1', lat: -4.6796, lon: 55.492, elev: 3, network: 'IGS' },
  { stationId: 'MRLL', lat: -18.8792, lon: 47.5079, elev: 1267, network: 'AFREF' },
];

// ---- Simulator state per station ----
interface SimState {
  northDrift: number;
  eastDrift: number;
  upDrift: number;
  prevTs: number;
  anomalyActive: boolean;
  anomalyType: string | null;
  anomalyStart: number;
  anomalyDuration: number;
  anomalyMag: number;
}

const states = new Map<string, SimState>();
let running = false;
let simInterval: ReturnType<typeof setInterval> | null = null;
let totalReadings = 0;
let totalAnomalies = 0;
let currentStationIdx = 0;

function getState(sid: string, lat: number): SimState {
  if (!states.has(sid)) {
    states.set(sid, {
      northDrift: (Math.random() - 0.5) * 2,
      eastDrift: (Math.random() - 0.5) * 2,
      upDrift: (Math.random() - 0.5) * 2,
      prevTs: Date.now() - 3000,
      anomalyActive: false,
      anomalyType: null,
      anomalyStart: 0,
      anomalyDuration: 0,
      anomalyMag: 0,
    });
  }
  return states.get(sid)!;
}

function gaussRand(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function genReading(s: typeof STATIONS[0]): GNSReading {
  const state = getState(s.stationId, s.lat);
  const ts = Date.now();
  const dt = (ts - state.prevTs) / 1000;

  const nNoise = gaussRand() * 3;
  const eNoise = gaussRand() * 3;
  const uNoise = gaussRand() * 8;

  const driftRate = s.network === 'IGS' ? 0.0002 : 0.00005;
  state.northDrift += driftRate * dt + gaussRand() * 0.001;
  state.eastDrift += driftRate * dt + gaussRand() * 0.001;
  state.upDrift += driftRate * 0.5 * dt + gaussRand() * 0.001;
  state.northDrift = Math.max(-50, Math.min(50, state.northDrift));
  state.eastDrift = Math.max(-50, Math.min(50, state.eastDrift));
  state.upDrift = Math.max(-80, Math.min(80, state.upDrift));

  let aN = 0, aE = 0, aU = 0;
  if (state.anomalyActive) {
    const elapsed = ts - state.anomalyStart;
    if (elapsed > state.anomalyDuration) {
      state.anomalyActive = false;
      state.anomalyType = null;
    } else {
      const progress = elapsed / state.anomalyDuration;
      const env = Math.sin(progress * Math.PI);
      switch (state.anomalyType) {
        case 'position_drift': aN = state.anomalyMag * env; aE = state.anomalyMag * 0.7 * env; break;
        case 'velocity_spike': aN = state.anomalyMag * Math.exp(-elapsed / 5000) * Math.sin(elapsed / 500); break;
        case 'elevation_jump': aU = state.anomalyMag * (elapsed < state.anomalyDuration * 0.3 ? 1 : 0.8); break;
        case 'multipath': aN = state.anomalyMag * Math.sin(elapsed / 300); aE = state.anomalyMag * Math.cos(elapsed / 400); aU = state.anomalyMag * 0.5 * Math.sin(elapsed / 250); break;
      }
    }
  }

  const tN = state.northDrift + nNoise + aN;
  const tE = state.eastDrift + eNoise + aE;
  const tU = state.upDrift + uNoise + aU;

  const lat = s.lat + (tN / 1000) / 111320;
  const lon = s.lon + (tE / 1000) / (111320 * Math.cos((s.lat * Math.PI) / 180));
  const elev = s.elev + tU / 1000;

  const sats = (aN !== 0 && state.anomalyType === 'multipath') ? Math.max(4, 8 + Math.floor(Math.random() * 4)) : 8 + Math.floor(Math.random() * 8);
  const pdop = (aN !== 0 && state.anomalyType === 'multipath') ? 1 + Math.random() * 2.5 + 3 : 1 + Math.random() * 2.5;

  const prevLat = s.lat + (state.northDrift + gaussRand() * 3) / 1000 / 111320;
  const prevLon = s.lon + (state.eastDrift + gaussRand() * 3) / 1000 / (111320 * Math.cos((s.lat * Math.PI) / 180));
  const velN = dt > 0 ? ((lat - prevLat) * 111320 * 1000) / dt : 0;
  const velE = dt > 0 ? ((lon - prevLon) * 111320 * Math.cos((s.lat * Math.PI) / 180) * 1000) / dt : 0;
  const velU = dt > 0 ? (tU / 1000) / dt : 0;

  state.prevTs = ts;

  return {
    stationId: s.stationId, timestamp: ts, latitude: lat, longitude: lon, elevation: elev,
    northResidual: tN, eastResidual: tE, upResidual: tU,
    northVelocity: velN, eastVelocity: velE, upVelocity: velU,
    satellites: sats, pdop, fixQuality: Math.random() > 0.05 ? 4 : 1,
  };
}

// Simple anomaly detection for the stream service
function detectAnomaly(r: GNSReading, station: typeof STATIONS[0]): Anomaly | null {
  const res3d = Math.sqrt(r.northResidual ** 2 + r.eastResidual ** 2 + r.upResidual ** 2);
  const vel3d = Math.sqrt(r.northVelocity ** 2 + r.eastVelocity ** 2 + r.upVelocity ** 2);

  if (res3d > 20) {
    return {
      id: uuid(), stationId: r.stationId, timestamp: r.timestamp,
      type: 'position_drift', severity: res3d > 35 ? 'critical' : 'warning',
      title: res3d > 35 ? 'Significant Position Drift' : 'Position Drift Detected',
      description: `3D residual ${res3d.toFixed(1)}mm at ${station.stationId}. Possible tectonic precursor.`,
      latitude: r.latitude, longitude: r.longitude, value: res3d, threshold: 20,
    };
  }
  if (vel3d > 0.5) {
    return {
      id: uuid(), stationId: r.stationId, timestamp: r.timestamp,
      type: 'velocity_spike', severity: vel3d > 2 ? 'critical' : 'warning',
      title: vel3d > 2 ? 'Critical Velocity Spike' : 'Elevated Velocity',
      description: `3D velocity ${vel3d.toFixed(2)} mm/s at ${station.stationId}.`,
      latitude: r.latitude, longitude: r.longitude, value: vel3d, threshold: 0.5,
    };
  }
  if (r.satellites < 5) {
    return {
      id: uuid(), stationId: r.stationId, timestamp: r.timestamp,
      type: 'signal_degradation', severity: r.satellites < 4 ? 'critical' : 'warning',
      title: 'Low Satellite Count',
      description: `Only ${r.satellites} satellites at ${station.stationId}.`,
      latitude: r.latitude, longitude: r.longitude, value: r.satellites, threshold: 5,
    };
  }
  return null;
}

function injectAnomaly(state: SimState) {
  if (state.anomalyActive) return;
  const types = [
    { type: 'position_drift', mag: [15, 50], dur: [30000, 120000] },
    { type: 'velocity_spike', mag: [5, 20], dur: [10000, 60000] },
    { type: 'elevation_jump', mag: [20, 80], dur: [20000, 90000] },
    { type: 'multipath', mag: [8, 25], dur: [15000, 45000] },
  ];
  const chosen = types[Math.floor(Math.random() * types.length)];
  state.anomalyActive = true;
  state.anomalyType = chosen.type;
  state.anomalyStart = Date.now();
  state.anomalyDuration = chosen.dur[0] + Math.random() * (chosen.dur[1] - chosen.dur[0]);
  state.anomalyMag = chosen.mag[0] + Math.random() * (chosen.mag[1] - chosen.mag[0]);
}

// ---- Socket.io Server ----
const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

io.on('connection', (socket) => {
  console.log(`[GeoPulse Stream] Client connected: ${socket.id}`);

  socket.on('start_simulator', (config?: { anomalyRate?: number }) => {
    if (running) {
      socket.emit('simulator_status', { running: true, totalReadings, totalAnomalies, stations: STATIONS.length });
      return;
    }
    running = true;
    totalReadings = 0;
    totalAnomalies = 0;
    currentStationIdx = 0;
    const anomalyRate = config?.anomalyRate ?? 0.02;

    // Cycle through stations, emitting one reading every 300ms
    simInterval = setInterval(() => {
      if (!running) return;

      const station = STATIONS[currentStationIdx % STATIONS.length];
      const state = getState(station.stationId, station.lat);

      // Maybe inject anomaly
      if (!state.anomalyActive && Math.random() < anomalyRate) {
        injectAnomaly(state);
      }

      const reading = genReading(station);
      totalReadings++;

      io.emit('reading', reading);

      // Check for anomaly
      const anomaly = detectAnomaly(reading, station);
      if (anomaly) {
        totalAnomalies++;
        io.emit('anomaly', anomaly);
      }

      currentStationIdx++;
    }, 300);

    io.emit('simulator_status', { running: true, totalReadings: 0, totalAnomalies: 0, stations: STATIONS.length });
    console.log(`[GeoPulse Stream] Simulator started (${STATIONS.length} stations, anomaly rate: ${anomalyRate})`);
  });

  socket.on('stop_simulator', () => {
    if (simInterval) {
      clearInterval(simInterval);
      simInterval = null;
    }
    running = false;
    io.emit('simulator_status', { running: false, totalReadings, totalAnomalies, stations: STATIONS.length });
    console.log(`[GeoPulse Stream] Simulator stopped (${totalReadings} readings, ${totalAnomalies} anomalies)`);
  });

  socket.on('get_status', () => {
    socket.emit('simulator_status', { running, totalReadings, totalAnomalies, stations: STATIONS.length });
  });

  socket.on('inject_anomaly', (stationId: string) => {
    const state = states.get(stationId);
    if (state && !state.anomalyActive) {
      injectAnomaly(state);
      socket.emit('anomaly_injected', { stationId, type: state.anomalyType });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[GeoPulse Stream] Client disconnected: ${socket.id}`);
  });
});

const PORT = 3002;
io.listen(PORT);
console.log(`[GeoPulse Stream] Socket.io server running on port ${PORT}`);