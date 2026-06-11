'use client';

import { useDashboardStore } from '@/lib/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  MapPin,
  Activity,
  Crosshair,
  Satellite,
  ArrowUpCircle,
  Radio,
} from 'lucide-react';
import type { Anomaly } from '@/lib/types';

const TYPE_ICONS: Record<string, React.ElementType> = {
  position_drift: Crosshair,
  velocity_spike: Activity,
  signal_degradation: Satellite,
  multipath_anomaly: Radio,
  elevation_jump: ArrowUpCircle,
};

const SEVERITY_STYLES: Record<string, { bg: string; border: string; badge: string; icon: React.ElementType }> = {
  critical: {
    bg: 'bg-red-950/40',
    border: 'border-red-500/30',
    badge: 'destructive',
    icon: AlertOctagon,
  },
  warning: {
    bg: 'bg-amber-950/30',
    border: 'border-amber-500/30',
    badge: 'secondary',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-sky-950/30',
    border: 'border-sky-500/30',
    badge: 'secondary',
    icon: Info,
  },
};

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const { selectStation } = useDashboardStore();
  const severity = SEVERITY_STYLES[anomaly.severity] || SEVERITY_STYLES.info;
  const TypeIcon = TYPE_ICONS[anomaly.type] || AlertTriangle;
  const SeverityIcon = severity.icon;
  const timeAgo = getTimeAgo(anomaly.timestamp);

  return (
    <button
      onClick={() => selectStation(anomaly.stationId)}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all hover:brightness-110',
        severity.bg,
        severity.border,
      )}
    >
      <div className="flex items-start gap-2">
        <SeverityIcon
          className={cn(
            'h-4 w-4 mt-0.5 flex-shrink-0',
            anomaly.severity === 'critical' ? 'text-red-500' : 'text-amber-500',
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-neutral-200 truncate">
              {anomaly.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mb-1.5">
            <MapPin className="h-3 w-3" />
            <span className="font-mono font-medium text-neutral-400">{anomaly.stationId}</span>
            <span>·</span>
            <span>{timeAgo}</span>
            <span>·</span>
            <TypeIcon className="h-3 w-3" />
            <span>{anomaly.type.replace('_', ' ')}</span>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
            {anomaly.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={severity.badge as any} className="text-[10px] h-5">
              {anomaly.severity.toUpperCase()}
            </Badge>
            <span className="text-[10px] text-neutral-600">
              Value: {typeof anomaly.value === 'number' ? anomaly.value.toFixed(1) : anomaly.value}
              {' / '}
              Threshold: {typeof anomaly.threshold === 'number' ? anomaly.threshold.toFixed(1) : anomaly.threshold}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function AnomalyFeed() {
  const { anomalies, selectStation } = useDashboardStore();
  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-neutral-300">Anomaly Feed</span>
          <span className="text-xs text-neutral-500">({anomalies.length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5">
              {criticalCount} Critical
            </Badge>
          )}
          {warningCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 bg-amber-950 text-amber-400">
              {warningCount} Warning
            </Badge>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {anomalies.length === 0 ? (
            <div className="text-center text-neutral-600 text-sm py-8">
              <Radio className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No anomalies detected</p>
              <p className="text-xs mt-1">Start the simulator to generate data</p>
            </div>
          ) : (
            anomalies.map(anomaly => (
              <AnomalyCard key={anomaly.id} anomaly={anomaly} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}