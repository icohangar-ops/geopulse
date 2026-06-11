'use client';

import { useMemo } from 'react';
import { useDashboardStore } from '@/lib/store';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area,
} from 'recharts';

export function ReadingsChart() {
  const { readings, selectedStationId, stations } = useDashboardStore();

  const selectedStation = stations.find(s => s.stationId === selectedStationId);

  const chartData = useMemo(() => {
    if (!selectedStationId) return [];
    const stationReadings = readings.get(selectedStationId) || [];
    return stationReadings.map(r => {
      const res3d = Math.sqrt(r.northResidual ** 2 + r.eastResidual ** 2 + r.upResidual ** 2);
      const vel3d = Math.sqrt(r.northVelocity ** 2 + r.eastVelocity ** 2 + r.upVelocity ** 2);
      return {
        time: new Date(r.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        ts: r.timestamp,
        north: r.northResidual,
        east: r.eastResidual,
        up: r.upResidual,
        res3d: parseFloat(res3d.toFixed(2)),
        vel3d: parseFloat(vel3d.toFixed(2)),
        pdop: parseFloat(r.pdop.toFixed(1)),
        sats: r.satellites,
      };
    });
  }, [readings, selectedStationId]);

  if (!selectedStationId || chartData.length < 3) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        {selectedStationId
          ? 'Waiting for data...'
          : 'Select a station on the map to view time-series data'}
      </div>
    );
  }

  // Downsample if too many points
  const maxPoints = 150;
  let displayData = chartData;
  if (chartData.length > maxPoints) {
    const step = Math.ceil(chartData.length / maxPoints);
    displayData = chartData.filter((_, i) => i % step === 0);
  }

  const maxRes3d = Math.max(...displayData.map(d => d.res3d), 10);

  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">
            {selectedStationId} — {selectedStation?.name}
          </h3>
          <p className="text-xs text-neutral-500">
            {selectedStation?.country} · {displayData.length} data points
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> N
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-sky-500 inline-block rounded" /> E
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-violet-500 inline-block rounded" /> U
          </span>
        </div>
      </div>

      {/* 3D Position Residual */}
      <div className="flex-1 min-h-0">
        <p className="text-[10px] text-neutral-500 mb-1 uppercase tracking-wider">3D Position Residual (mm)</p>
        <ResponsiveContainer width="100%" height="calc(100% - 16px)">
          <AreaChart data={displayData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="res3dGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#737373' }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10, fill: '#737373' }} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#171717',
                border: '1px solid #404040',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#e5e5e5',
              }}
              labelStyle={{ color: '#a3a3a3' }}
            />
            <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Warning', fill: '#ef4444', fontSize: 9, position: 'insideTopLeft' }} />
            <ReferenceLine y={35} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'Critical', fill: '#dc2626', fontSize: 9, position: 'insideTopLeft' }} />
            <Area
              type="monotone"
              dataKey="res3d"
              stroke="#f59e0b"
              fill="url(#res3dGrad)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* N/E/U Residuals */}
      <div className="flex-1 min-h-0">
        <p className="text-[10px] text-neutral-500 mb-1 uppercase tracking-wider">N / E / U Residuals (mm)</p>
        <ResponsiveContainer width="100%" height="calc(100% - 16px)">
          <LineChart data={displayData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: '#737373' }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 10, fill: '#737373' }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#171717',
                border: '1px solid #404040',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#e5e5e5',
              }}
              labelStyle={{ color: '#a3a3a3' }}
            />
            <Line type="monotone" dataKey="north" stroke="#22c55e" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="east" stroke="#0ea5e9" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="up" stroke="#a855f7" strokeWidth={1} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}