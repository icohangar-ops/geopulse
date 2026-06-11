'use client';

import { useDashboardStore } from '@/lib/store';
import { useGNSSStream } from '@/hooks/use-gnss-stream';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Play,
  Square,
  Radio,
  Zap,
  Bug,
  Trash2,
} from 'lucide-react';

export function DashboardHeader() {
  const {
    simulatorRunning,
    socketConnected,
    simulatorReadings,
    simulatorAnomalies,
    clearReadings,
    clearAnomalies,
  } = useDashboardStore();

  const { startSimulator, stopSimulator, injectAnomaly, connect } = useGNSSStream();

  return (
    <header className="border-b border-border bg-neutral-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-none">
                GeoPulse
              </h1>
              <p className="text-[10px] text-neutral-500 leading-none mt-0.5">
                GNSS Anomaly Detection · SATNAV G4D-RR
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] h-5 ml-2',
              socketConnected
                ? 'border-emerald-500/50 text-emerald-400'
                : 'border-amber-500/50 text-amber-400',
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full mr-1.5 inline-block',
                socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500',
              )}
            />
            {socketConnected ? 'LIVE' : 'CONNECTING'}
          </Badge>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Data counters */}
          {simulatorRunning && (
            <div className="hidden sm:flex items-center gap-3 mr-2 text-xs text-neutral-500">
              <span className="font-mono">{formatNum(simulatorReadings)} readings</span>
              <span>·</span>
              <span className="font-mono text-amber-400">{simulatorAnomalies} anomalies</span>
            </div>
          )}

          {/* Clear data */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-neutral-500 hover:text-neutral-300"
            onClick={() => {
              clearReadings();
              clearAnomalies();
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>

          {/* Inject anomaly */}
          {simulatorRunning && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-amber-700 text-amber-400 hover:bg-amber-950/50"
              onClick={() => {
                // Pick a random station
                const { stations, selectedStationId } = useDashboardStore.getState();
                const target = selectedStationId || stations[Math.floor(Math.random() * stations.length)]?.stationId;
                if (target) injectAnomaly(target);
              }}
            >
              <Bug className="h-3.5 w-3.5 mr-1" />
              Inject Anomaly
            </Button>
          )}

          {/* Start / Stop simulator */}
          {simulatorRunning ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={stopSimulator}
            >
              <Square className="h-3.5 w-3.5 mr-1" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={() => startSimulator(0.02)}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Start Simulator
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}