// GET /api/stations — List all GNSS stations
// POST /api/stations — Seed stations into database

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AFRICAN_GNSS_STATIONS, RISK_ZONES } from '@/lib/stations';
import { getTotalDataPoints, getConnectionMode } from '@/lib/scylla';

export async function GET() {
  const stations = await db.station.findMany({
    orderBy: { stationId: 'asc' },
  });

  const dataPoints = getTotalDataPoints();
  const connMode = getConnectionMode();

  // Enrich with risk zone info
  const enriched = stations.map(s => {
    const zoneEntry = Object.entries(RISK_ZONES).find(([, z]) =>
      z.stationIds.includes(s.stationId),
    );
    return {
      ...s,
      riskZone: zoneEntry ? zoneEntry[0] : null,
      riskColor: zoneEntry ? zoneEntry[1].color : null,
    };
  });

  return NextResponse.json({
    stations: enriched,
    riskZones: RISK_ZONES,
    meta: {
      total: stations.length,
      dataPoints,
      connectionMode: connMode,
    },
  });
}

export async function POST() {
  // Seed stations into the database
  const count = await db.station.count();

  if (count > 0) {
    return NextResponse.json({ message: 'Stations already seeded', count });
  }

  for (const station of AFRICAN_GNSS_STATIONS) {
    await db.station.upsert({
      where: { stationId: station.stationId },
      update: station,
      create: station,
    });
  }

  const total = await db.station.count();
  return NextResponse.json({ message: `${total} stations seeded`, count: total });
}