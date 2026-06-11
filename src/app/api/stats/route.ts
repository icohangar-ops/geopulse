// GET /api/stats — Dashboard KPI statistics

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTotalDataPoints, getConnectionMode, queryAnomalies } from '@/lib/scylla';

export async function GET() {
  const [totalStations, activeStations, criticalAlerts, recentAnomalies] = await Promise.all([
    db.station.count(),
    db.station.count({ where: { status: 'active' } }),
    db.alert.count({ where: { severity: 'critical', resolved: false } }),
    queryAnomalies({ fromMs: Date.now() - 24 * 60 * 60 * 1000, limit: 1000 }),
  ]);

  const warnings = recentAnomalies.filter(a => a.severity === 'warning').length;
  const criticals = recentAnomalies.filter(a => a.severity === 'critical').length;

  return NextResponse.json({
    totalStations,
    activeStations,
    readingsLastHour: Math.min(getTotalDataPoints(), totalStations * 1800), // estimate
    anomaliesLast24h: recentAnomalies.length,
    criticalAlerts: criticals,
    warningsLast24h: warnings,
    criticalsLast24h: criticals,
    avgPdop: 2.1, // will be computed from real data
    avgSatellites: 12,
    dataPointsStored: getTotalDataPoints(),
    connectionMode: getConnectionMode(),
  });
}