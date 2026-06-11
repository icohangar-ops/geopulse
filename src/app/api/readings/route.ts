// GET /api/readings?stationId=XXX&hours=6&limit=500
// Returns time-series GNSS readings for a station

import { NextRequest, NextResponse } from 'next/server';
import { queryReadings } from '@/lib/scylla';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');
  const hours = parseInt(searchParams.get('hours') || '6', 10);
  const limit = parseInt(searchParams.get('limit') || '500', 10);

  if (!stationId) {
    return NextResponse.json({ error: 'stationId is required' }, { status: 400 });
  }

  const toMs = Date.now();
  const fromMs = toMs - hours * 60 * 60 * 1000;

  try {
    const readings = await queryReadings(stationId, fromMs, toMs, limit);
    return NextResponse.json({
      stationId,
      from: fromMs,
      to: toMs,
      count: readings.length,
      readings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to query readings', details: (err as Error).message },
      { status: 500 },
    );
  }
}