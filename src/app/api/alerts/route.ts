// GET /api/alerts — List alerts from Prisma
// POST /api/alerts — Create an alert (from anomaly)
// PATCH /api/alerts — Acknowledge/resolve an alert

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guardSensitiveRoute } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId');
  const severity = searchParams.get('severity');
  const acknowledged = searchParams.get('acknowledged');

  const alerts = await db.alert.findMany({
    where: {
      ...(stationId ? { stationId } : {}),
      ...(severity ? { severity } : {}),
      ...(acknowledged === 'true' ? { acknowledged: true } : acknowledged === 'false' ? { acknowledged: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ count: alerts.length, alerts });
}

export async function POST(request: NextRequest) {
  // Mutating: creates an alert. Require auth (fail-closed).
  const denied = guardSensitiveRoute(request);
  if (denied) return denied;

  const body = await request.json();
  const { stationId, type, severity, title, description, latitude, longitude, value, threshold } = body;

  if (!stationId || !title) {
    return NextResponse.json({ error: 'stationId and title required' }, { status: 400 });
  }

  const alert = await db.alert.create({
    data: {
      stationId,
      type: type || 'unknown',
      severity: severity || 'info',
      title,
      description: description || '',
      latitude,
      longitude,
      value,
      threshold,
    },
  });

  return NextResponse.json({ alert }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  // Mutating: acknowledges/resolves an alert. Require auth (fail-closed).
  const denied = guardSensitiveRoute(request);
  if (denied) return denied;

  const body = await request.json();
  const { id, acknowledged, resolved } = body;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const alert = await db.alert.update({
    where: { id },
    data: {
      ...(acknowledged !== undefined ? { acknowledged } : {}),
      ...(resolved !== undefined ? { resolved } : {}),
    },
  });

  return NextResponse.json({ alert });
}