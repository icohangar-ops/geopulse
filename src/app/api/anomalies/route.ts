// GET /api/anomalies?stationId=XXX&severity=critical&limit=50
// Returns detected anomalies

import { NextRequest, NextResponse } from 'next/server';
import { queryAnomalies } from '@/lib/scylla';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');
  const severity = searchParams.get('severity');
  const hours = parseInt(searchParams.get('hours') || '24', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  const fromMs = Date.now() - hours * 60 * 60 * 1000;

  try {
    // Query from ScyllaDB (or memory fallback)
    const anomalies = await queryAnomalies({
      stationId: stationId || undefined,
      severity: severity || undefined,
      fromMs,
      limit,
    });

    // Also get Prisma-stored alerts (acknowledged/resolved state)
    const prismaAlerts = await db.alert.findMany({
      where: {
        ...(stationId ? { stationId } : {}),
        createdAt: { gte: new Date(fromMs) },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Merge: enrich ScyllaDB anomalies with Prisma alert state
    const enriched = anomalies.map(a => {
      const alertMatch = prismaAlerts.find(pa =>
        pa.stationId === a.stationId &&
        Math.abs(pa.createdAt.getTime() - a.timestamp) < 5000,
      );
      return {
        ...a,
        acknowledged: alertMatch?.acknowledged || false,
        resolved: alertMatch?.resolved || false,
      };
    });

    return NextResponse.json({
      count: enriched.length,
      anomalies: enriched,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to query anomalies', details: (err as Error).message },
      { status: 500 },
    );
  }
}