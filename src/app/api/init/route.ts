// POST /api/init — Initialize ScyllaDB connection and seed stations

import { NextRequest, NextResponse } from 'next/server';
import { initScyllaDB } from '@/lib/scylla';
import { db } from '@/lib/db';
import { AFRICAN_GNSS_STATIONS } from '@/lib/stations';
import { guardSensitiveRoute } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  // Destructive: re-seeds the DB. Require auth (fail-closed).
  const denied = guardSensitiveRoute(request);
  if (denied) return denied;

  try {
    // Initialize ScyllaDB
    const scyllaResult = await initScyllaDB();

    // Seed stations
    for (const station of AFRICAN_GNSS_STATIONS) {
      await db.station.upsert({
        where: { stationId: station.stationId },
        update: station,
        create: station,
      });
    }

    const stationCount = await db.station.count();

    return NextResponse.json({
      success: true,
      scylla: scyllaResult,
      stations: stationCount,
      message: `GeoPulse initialized: ${stationCount} stations, data backend: ${scyllaResult.mode}`,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}