// ============================================================
// GeoPulse — Real-time SSE Streaming API
// Server-Sent Events for GNSS readings + anomalies
// ============================================================

import { NextRequest } from 'next/server';
import { AFRICAN_GNSS_STATIONS } from '@/lib/stations';
import { v4 as uuid } from 'uuid';
import { guardSensitiveRoute } from '@/lib/api-auth';

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
let totalReadings = 0;
let totalAnomalies = 0;
let currentStationIdx = 0;
const clients = new Set<ReadableStreamDefaultController>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function gaussRand(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function getState(sid: string): SimState {
  if (!states.has(sid)) {
    states.set(sid, {
      northDrift: (Math.random() - 0.5) * 2,
      eastDrift: (Math.random() - 0.5) * 2,
      upDrift: (Math.random() - 0.5) * 2,
      prevTs: Date.now() - 3000,
      anomalyActive: false, anomalyType: null,
      anomalyStart: 0, anomalyDuration: 0, anomalyMag: 0,
    });
  }
  return states.get(sid)!;
}

function injectAnomalyState(state: SimState) {
  if (state.anomalyActive) return;
  const types = [
    { type: 'position_drift', mag: [15, 50], dur: [30000, 120000] },
    { type: 'velocity_spike', mag: [5, 20], dur: [10000, 60000] },
    { type: 'elevation_jump', mag: [20, 80], dur: [20000, 90000] },
    { type: 'multipath', mag: [8, 25], dur: [15000, 45000] },
  ];
  const c = types[Math.floor(Math.random() * types.length)];
  state.anomalyActive = true;
  state.anomalyType = c.type;
  state.anomalyStart = Date.now();
  state.anomalyDuration = c.dur[0] + Math.random() * (c.dur[1] - c.dur[0]);
  state.anomalyMag = c.mag[0] + Math.random() * (c.mag[1] - c.mag[0]);
}

function genAndBroadcast() {
  if (!running || clients.size === 0) return;
  const station = AFRICAN_GNSS_STATIONS[currentStationIdx % AFRICAN_GNSS_STATIONS.length];
  const state = getState(station.stationId);

  if (!state.anomalyActive && Math.random() < 0.02) {
    injectAnomalyState(state);
  }

  const ts = Date.now();
  const dt = (ts - state.prevTs) / 1000;
  const nN = gaussRand() * 3, nE = gaussRand() * 3, nU = gaussRand() * 8;

  const dr = station.network === 'IGS' ? 0.0002 : 0.00005;
  state.northDrift += dr * dt + gaussRand() * 0.001;
  state.eastDrift += dr * dt + gaussRand() * 0.001;
  state.upDrift += dr * 0.5 * dt + gaussRand() * 0.001;
  state.northDrift = Math.max(-50, Math.min(50, state.northDrift));
  state.eastDrift = Math.max(-50, Math.min(50, state.eastDrift));
  state.upDrift = Math.max(-80, Math.min(80, state.upDrift));

  let aN = 0, aE = 0, aU = 0;
  if (state.anomalyActive) {
    const elapsed = ts - state.anomalyStart;
    if (elapsed > state.anomalyDuration) { state.anomalyActive = false; state.anomalyType = null; }
    else {
      const env = Math.sin((elapsed / state.anomalyDuration) * Math.PI);
      switch (state.anomalyType) {
        case 'position_drift': aN = state.anomalyMag * env; aE = state.anomalyMag * 0.7 * env; break;
        case 'velocity_spike': aN = state.anomalyMag * Math.exp(-elapsed / 5000) * Math.sin(elapsed / 500); break;
        case 'elevation_jump': aU = state.anomalyMag * (elapsed < state.anomalyDuration * 0.3 ? 1 : 0.8); break;
        case 'multipath': aN = state.anomalyMag * Math.sin(elapsed / 300); aE = state.anomalyMag * Math.cos(elapsed / 400); aU = state.anomalyMag * 0.5 * Math.sin(elapsed / 250); break;
      }
    }
  }

  const tN = state.northDrift + nN + aN;
  const tE = state.eastDrift + nE + aE;
  const tU = state.upDrift + nU + aU;
  const lat = station.latitude + (tN / 1000) / 111320;
  const lon = station.longitude + (tE / 1000) / (111320 * Math.cos((station.latitude * Math.PI) / 180));
  const elev = station.elevation + tU / 1000;
  const sats = (aN !== 0 && state.anomalyType === 'multipath') ? Math.max(4, 8 + Math.floor(Math.random() * 4)) : 8 + Math.floor(Math.random() * 8);
  const pdop = (aN !== 0 && state.anomalyType === 'multipath') ? 1 + Math.random() * 2.5 + 3 : 1 + Math.random() * 2.5;

  state.prevTs = ts;
  totalReadings++;

  const reading = {
    stationId: station.stationId, timestamp: ts, latitude: lat, longitude: lon, elevation: elev,
    northResidual: tN, eastResidual: tE, upResidual: tU,
    northVelocity: 0, eastVelocity: 0, upVelocity: 0,
    satellites: sats, pdop: parseFloat(pdop.toFixed(1)), fixQuality: Math.random() > 0.05 ? 4 : 1,
  };

  broadcast('reading', reading);

  const res3d = Math.sqrt(tN ** 2 + tE ** 2 + tU ** 2);
  if (res3d > 20) {
    totalAnomalies++;
    broadcast('anomaly', {
      id: uuid(), stationId: station.stationId, timestamp: ts, type: 'position_drift',
      severity: res3d > 35 ? 'critical' : 'warning',
      title: res3d > 35 ? 'Significant Position Drift' : 'Position Drift Detected',
      description: `3D residual ${res3d.toFixed(1)}mm at ${station.stationId}. Possible tectonic precursor signal.`,
      latitude: lat, longitude: lon, value: res3d, threshold: 20,
    });
  } else if (sats < 5) {
    totalAnomalies++;
    broadcast('anomaly', {
      id: uuid(), stationId: station.stationId, timestamp: ts, type: 'signal_degradation',
      severity: sats < 4 ? 'critical' : 'warning',
      title: 'Low Satellite Count',
      description: `Only ${sats} satellites at ${station.stationId}. Position accuracy degraded.`,
      latitude: lat, longitude: lon, value: sats, threshold: 5,
    });
  }

  currentStationIdx++;
}

function broadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = new TextEncoder().encode(payload);
  for (const client of clients) {
    try { client.enqueue(encoded); }
    catch { clients.delete(client); }
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (action === 'start') {
    if (running) return new Response(JSON.stringify({ running: true, totalReadings, totalAnomalies, stations: AFRICAN_GNSS_STATIONS.length }), { headers: jsonHeaders });
    running = true;
    totalReadings = 0;
    totalAnomalies = 0;
    currentStationIdx = 0;
    intervalId = setInterval(genAndBroadcast, 300);
    return new Response(JSON.stringify({ running: true, totalReadings: 0, totalAnomalies: 0, stations: AFRICAN_GNSS_STATIONS.length }), { headers: jsonHeaders });
  }

  if (action === 'stop') {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    running = false;
    return new Response(JSON.stringify({ running: false, totalReadings, totalAnomalies, stations: AFRICAN_GNSS_STATIONS.length }), { headers: jsonHeaders });
  }

  if (action === 'status') {
    return new Response(JSON.stringify({ running, totalReadings, totalAnomalies, stations: AFRICAN_GNSS_STATIONS.length, clients: clients.size }), { headers: jsonHeaders });
  }

  if (action === 'inject') {
    // Sensitive: injects synthetic anomalies. Require auth (fail-closed).
    const denied = guardSensitiveRoute(request);
    if (denied) return denied;

    const stationId = searchParams.get('stationId');
    if (!stationId) return new Response(JSON.stringify({ error: 'stationId required' }), { status: 400, headers: jsonHeaders });
    const state = states.get(stationId);
    if (state && !state.anomalyActive) {
      injectAnomalyState(state);
      return new Response(JSON.stringify({ injected: true, stationId, type: state.anomalyType }), { headers: jsonHeaders });
    }
    return new Response(JSON.stringify({ injected: false, stationId }), { headers: jsonHeaders });
  }

  // SSE stream
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
      const initData = JSON.stringify({ type: 'connected', running, totalReadings, totalAnomalies, stations: AFRICAN_GNSS_STATIONS.length });
      controller.enqueue(new TextEncoder().encode(`event: connected\ndata: ${initData}\n\n`));

      const hb = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`)); }
        catch { clearInterval(hb); clients.delete(controller); }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(hb);
        clients.delete(controller);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}