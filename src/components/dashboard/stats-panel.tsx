'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDashboardStore } from '@/lib/store';
import {
  Radio,
  Activity,
  AlertTriangle,
  Database,
  Zap,
  Satellite,
} from 'lucide-react';

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const variantClasses = {
    default: 'border-border',
    warning: 'border-amber-500/30 bg-amber-950/20',
    danger: 'border-red-500/30 bg-red-950/20',
    success: 'border-emerald-500/30 bg-emerald-950/20',
  };

  return (
    <Card className={`${variantClasses[variant]} transition-colors`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsPanel() {
  const {
    stations,
    simulatorRunning,
    simulatorReadings,
    simulatorAnomalies,
    socketConnected,
    connectionMode,
    anomalies,
  } = useDashboardStore();

  const activeStations = stations.filter(s => s.status === 'active').length;
  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        title="Stations"
        value={stations.length}
        subtitle={`${activeStations} active`}
        icon={Radio}
      />
      <StatCard
        title="Data Points"
        value={simulatorReadings > 0 ? formatNumber(simulatorReadings) : '—'}
        subtitle={simulatorRunning ? 'streaming live' : 'idle'}
        icon={Database}
        variant={simulatorRunning ? 'success' : 'default'}
      />
      <StatCard
        title="Anomalies"
        value={simulatorAnomalies > 0 ? simulatorAnomalies : anomalies.length}
        subtitle={criticalCount > 0 ? `${criticalCount} critical` : 'session total'}
        icon={AlertTriangle}
        variant={criticalCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'default'}
      />
      <StatCard
        title="Avg Satellites"
        value="12"
        subtitle="per station"
        icon={Satellite}
        variant="success"
      />
      <StatCard
        title="Avg PDOP"
        value="2.1"
        subtitle="good geometry"
        icon={Activity}
        variant="success"
      />
      <StatCard
        title="Backend"
        value={connectionMode === 'scylladb' ? 'ScyllaDB' : 'Memory'}
        subtitle={
          socketConnected
            ? `stream ${simulatorRunning ? 'LIVE' : 'ready'}`
            : 'connecting...'
        }
        icon={Zap}
        variant={socketConnected ? 'success' : 'warning'}
      />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}