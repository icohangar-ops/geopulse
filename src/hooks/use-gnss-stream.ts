'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '@/lib/store';
import type { GNSReading, Anomaly } from '@/lib/types';

/**
 * SSE hook — connects to the /api/stream endpoint and feeds
 * readings + anomalies into the Zustand store via Server-Sent Events.
 */
export function useGNSSStream() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const {
    addReading,
    addAnomaly,
    setSocketConnected,
    setSimulatorStatus,
    setConnectionMode,
    setInitialized,
    setStations,
  } = useDashboardStore();

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    const es = new EventSource('/api/stream');

    es.addEventListener('connected', (e) => {
      setSocketConnected(true);
      const data = JSON.parse(e.data);
      if (data.running) {
        setSimulatorStatus(true, data.totalReadings, data.totalAnomalies);
      }
    });

    es.addEventListener('reading', (e) => {
      try {
        const reading: GNSReading = JSON.parse(e.data);
        addReading(reading);
      } catch {}
    });

    es.addEventListener('anomaly', (e) => {
      try {
        const anomaly: Anomaly = JSON.parse(e.data);
        addAnomaly(anomaly);
      } catch {}
    });

    es.onopen = () => {
      setSocketConnected(true);
    };

    es.onerror = () => {
      setSocketConnected(false);
    };

    eventSourceRef.current = es;
  }, [addReading, addAnomaly, setSocketConnected, setSimulatorStatus, setConnectionMode, setInitialized, setStations]);

  const startSimulator = useCallback(async () => {
    try {
      const res = await fetch('/api/stream?action=start');
      const data = await res.json();
      if (data.running) {
        setSimulatorStatus(true, data.totalReadings ?? 0, data.totalAnomalies ?? 0);
      }
    } catch {}
  }, [setSimulatorStatus]);

  const stopSimulator = useCallback(async () => {
    try {
      const res = await fetch('/api/stream?action=stop');
      const data = await res.json();
      setSimulatorStatus(false, data.totalReadings, data.totalAnomalies);
    } catch {}
  }, [setSimulatorStatus]);

  const injectAnomaly = useCallback(async (stationId: string) => {
    try {
      await fetch(`/api/stream?action=inject&stationId=${stationId}`);
    } catch {}
  }, []);

  // Connect on mount + fetch initial data
  useEffect(() => {
    connect();

    fetch('/api/init', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.connectionMode) setConnectionMode(data.connectionMode);
        setInitialized(true);
      })
      .catch(() => setInitialized(true));

    fetch('/api/stations', { method: 'POST' }).catch(() => {});
    fetch('/api/stations')
      .then(r => r.json())
      .then(data => {
        if (data.stations) setStations(data.stations);
      })
      .catch(() => {});

    // Poll simulator status every 2s when running
    const statusInterval = setInterval(() => {
      const { simulatorRunning } = useDashboardStore.getState();
      if (simulatorRunning) {
        fetch('/api/stream?action=status')
          .then(r => r.json())
          .then(data => {
            setSimulatorStatus(data.running, data.totalReadings, data.totalAnomalies);
          })
          .catch(() => {});
      }
    }, 2000);

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      clearInterval(statusInterval);
    };
  }, [connect, setConnectionMode, setInitialized, setStations, setSimulatorStatus]);

  return { connect, startSimulator, stopSimulator, injectAnomaly };
}