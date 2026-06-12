// ============================================================
// GeoPulse — ScyllaDB Client with In-Memory Fallback
// Time-series geospatial data storage for GNSS readings
// ============================================================

import { Client as CassandraClient, auth as cassandraAuth } from 'cassandra-driver';
import type { GNSReading, Anomaly } from './types';

// ScyllaDB connection config
const SCYLLA_CONFIG = {
  contactPoints: ['node-0.aws-us-east-1.b6157e624b2b8d34a1a5.clusters.scylla.cloud:9142'],
  username: 'scylla',
  password: '6TqtUIJvF1b8NfL',
  keyspace: 'geopulse',
  localDataCenter: 'aws-us-east-1',
};

let scyllaClient: CassandraClient | null = null;
let useMemoryFallback = true;

// ---- In-Memory Fallback Stores ----
const memoryReadings: Map<string, GNSReading[]> = new Map();
const memoryAnomalies: Anomaly[] = [];
let totalDataPoints = 0;

// ---- CQL Schema (to be executed when ScyllaDB is reachable) ----
export const SCYLLA_CQL_SCHEMA = `
-- GeoPulse Keyspace for GNSS time-series data
CREATE KEYSPACE IF NOT EXISTS geopulse
  WITH replication = {'class': 'NetworkTopologyStrategy', 'aws-us-east-1': 3}
  AND durable_writes = true;

USE geopulse;

-- GNSS position readings: partitioned by station + 1-hour time bucket
-- Enables efficient time-range queries per station
CREATE TABLE IF NOT EXISTS gnss_readings (
  station_id       text,
  hour_bucket      timestamp,    -- truncated to hour for partitioning
  reading_time     timeuuid,     -- precise timestamp + UUID ordering
  latitude         double,
  longitude        double,
  elevation        double,
  north_residual   double,       -- mm deviation from reference
  east_residual    double,
  up_residual      double,
  north_velocity   double,       -- mm/s
  east_velocity    double,
  up_velocity      double,
  satellites       int,
  pdop             double,
  fix_quality      int,
  PRIMARY KEY ((station_id, hour_bucket), reading_time)
) WITH CLUSTERING ORDER BY (reading_time DESC)
  AND default_time_to_live = 2592000    -- 30 days TTL
  AND compaction = {'class': 'TimeWindowCompactionStrategy', 'compaction_window_size': 1, 'compaction_window_unit': 'DAYS'}
  AND compression = {'sstable_compression': 'LZ4Compressor'};

-- Anomaly events: partitioned by station + day bucket
CREATE TABLE IF NOT EXISTS anomalies (
  station_id       text,
  day_bucket       date,
  anomaly_time     timeuuid,
  anomaly_type     text,
  severity         text,
  title            text,
  description      text,
  latitude         double,
  longitude        double,
  value            double,
  threshold        double,
  metadata         text,          -- JSON-encoded
  PRIMARY KEY ((station_id, day_bucket), anomaly_time)
) WITH CLUSTERING ORDER BY (anomaly_time DESC)
  AND default_time_to_live = 7776000;    -- 90 days TTL

-- Materialized view: all anomalies by time (cross-station)
CREATE MATERIALIZED VIEW IF NOT EXISTS anomalies_by_time AS
  SELECT * FROM anomalies
  WHERE station_id IS NOT NULL AND day_bucket IS NOT NULL AND anomaly_time IS NOT NULL
  PRIMARY KEY (day_bucket, anomaly_time, station_id);

-- Station hourly summary for fast dashboard queries
CREATE TABLE IF NOT EXISTS station_hourly_stats (
  station_id       text,
  hour_bucket      timestamp,
  reading_count    int,
  avg_pdop         double,
  avg_satellites   double,
  max_drift_mm     double,       -- max 3D residual in the hour
  anomaly_count    int,
  PRIMARY KEY (station_id, hour_bucket)
) WITH CLUSTERING ORDER BY (hour_bucket DESC)
  AND default_time_to_live = 604800;    -- 7 days TTL
`;

/**
 * Initialize ScyllaDB connection.
 * Falls back to in-memory storage if connection fails.
 */
export async function initScyllaDB(): Promise<{ connected: boolean; mode: 'scylladb' | 'memory' }> {
  try {
    const client = new CassandraClient({
      contactPoints: SCYLLA_CONFIG.contactPoints,
      authProvider: new cassandraAuth.PlainTextAuthProvider(
        SCYLLA_CONFIG.username,
        SCYLLA_CONFIG.password,
      ),
      localDataCenter: SCYLLA_CONFIG.localDataCenter,
      sslOptions: {
        rejectUnauthorized: false, // Will use CA cert in production
      },
      protocolOptions: {
        maxVersion: 4,
      },
      socketOptions: {
        connectTimeout: 8000,
        readTimeout: 12000,
      },
      pooling: {
        coreConnectionsPerHost: { [SCYLLA_CONFIG.localDataCenter]: 2 },
      },
    });

    await client.connect();
    scyllaClient = client;
    useMemoryFallback = false;
    console.log('[GeoPulse] Connected to ScyllaDB cluster');

    // Execute schema
    const queries = SCYLLA_CQL_SCHEMA.split(';').filter(q => q.trim());
    for (const query of queries) {
      if (query.trim()) {
        await client.execute(query);
      }
    }
    console.log('[GeoPulse] ScyllaDB schema initialized');

    return { connected: true, mode: 'scylladb' };
  } catch (err) {
    console.warn('[GeoPulse] ScyllaDB unavailable, using in-memory fallback:', (err as Error).message);
    useMemoryFallback = true;
    return { connected: false, mode: 'memory' };
  }
}

/**
 * Store a GNSS reading
 */
export async function storeReading(reading: GNSReading): Promise<void> {
  if (useMemoryFallback || !scyllaClient) {
    const stationReadings = memoryReadings.get(reading.stationId) || [];
    stationReadings.push(reading);
    // Keep last 10000 readings per station in memory
    if (stationReadings.length > 10000) {
      stationReadings.splice(0, stationReadings.length - 10000);
    }
    memoryReadings.set(reading.stationId, stationReadings);
    totalDataPoints++;
    return;
  }

  const hourBucket = new Date(Math.floor(reading.timestamp / 3600000) * 3600000);

  await scyllaClient.execute(
    `INSERT INTO gnss_readings (
      station_id, hour_bucket, reading_time, latitude, longitude, elevation,
      north_residual, east_residual, up_residual,
      north_velocity, east_velocity, up_velocity,
      satellites, pdop, fix_quality
    ) VALUES (?, ?, now(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reading.stationId,
      hourBucket,
      reading.latitude, reading.longitude, reading.elevation,
      reading.northResidual, reading.eastResidual, reading.upResidual,
      reading.northVelocity, reading.eastVelocity, reading.upVelocity,
      reading.satellites, reading.pdop, reading.fixQuality,
    ],
    { prepare: true },
  );
  totalDataPoints++;
}

/**
 * Store an anomaly event
 */
export async function storeAnomaly(anomaly: Anomaly): Promise<void> {
  if (useMemoryFallback || !scyllaClient) {
    memoryAnomalies.push(anomaly);
    if (memoryAnomalies.length > 5000) {
      memoryAnomalies.splice(0, memoryAnomalies.length - 5000);
    }
    return;
  }

  const dayBucket = new Date(Math.floor(anomaly.timestamp / 86400000) * 86400000);

  await scyllaClient.execute(
    `INSERT INTO anomalies (
      station_id, day_bucket, anomaly_time, anomaly_type, severity,
      title, description, latitude, longitude, value, threshold, metadata
    ) VALUES (?, ?, now(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      anomaly.stationId,
      dayBucket,
      anomaly.type, anomaly.severity,
      anomaly.title, anomaly.description,
      anomaly.latitude, anomaly.longitude,
      anomaly.value, anomaly.threshold,
      anomaly.metadata ? JSON.stringify(anomaly.metadata) : null,
    ],
    { prepare: true },
  );
}

/**
 * Query readings for a station within a time range
 */
export async function queryReadings(
  stationId: string,
  fromMs: number,
  toMs: number,
  limit = 500,
): Promise<GNSReading[]> {
  if (useMemoryFallback || !scyllaClient) {
    const stationReadings = memoryReadings.get(stationId) || [];
    return stationReadings
      .filter(r => r.timestamp >= fromMs && r.timestamp <= toMs)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  // Query across hourly buckets
  const results: GNSReading[] = [];
  const fromBucket = new Date(Math.floor(fromMs / 3600000) * 3600000);
  const toBucket = new Date(Math.floor(toMs / 3600000) * 3600000);

  // Limit bucket span to prevent scanning too many partitions
  const maxBuckets = 48;
  let bucketCount = Math.round((toBucket.getTime() - fromBucket.getTime()) / 3600000) + 1;
  const startBucket = bucketCount > maxBuckets
    ? new Date(toBucket.getTime() - (maxBuckets - 1) * 3600000)
    : fromBucket;

  const query = `SELECT latitude, longitude, elevation,
    north_residual, east_residual, up_residual,
    north_velocity, east_velocity, up_velocity,
    satellites, pdop, fix_quality,
    dateOf(reading_time) as ts
    FROM gnss_readings
    WHERE station_id = ? AND hour_bucket = ?
    LIMIT ?`;

  const current = new Date(startBucket);
  while (current <= toBucket && results.length < limit) {
    const result = await scyllaClient.execute(query, [stationId, current, Math.min(limit - results.length, 100)], { prepare: true });
    for (const row of result.rows) {
      results.push({
        stationId,
        timestamp: new Date(row.ts).getTime(),
        latitude: row.latitude,
        longitude: row.longitude,
        elevation: row.elevation,
        northResidual: row.north_residual,
        eastResidual: row.east_residual,
        upResidual: row.up_residual,
        northVelocity: row.north_velocity,
        eastVelocity: row.east_velocity,
        upVelocity: row.up_velocity,
        satellites: row.satellites,
        pdop: row.pdop,
        fixQuality: row.fix_quality,
      });
    }
    current.setHours(current.getHours() + 1);
  }

  return results.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Query anomalies with optional filters
 */
export async function queryAnomalies(opts: {
  stationId?: string;
  severity?: string;
  fromMs?: number;
  toMs?: number;
  limit?: number;
}): Promise<Anomaly[]> {
  const { stationId, severity, fromMs, toMs, limit = 100 } = opts;

  if (useMemoryFallback || !scyllaClient) {
    let results = [...memoryAnomalies];
    if (stationId) results = results.filter(a => a.stationId === stationId);
    if (severity) results = results.filter(a => a.severity === severity);
    if (fromMs) results = results.filter(a => a.timestamp >= fromMs);
    if (toMs) results = results.filter(a => a.timestamp <= toMs);
    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  let query = 'SELECT * FROM anomalies';
  const conditions: string[] = [];
  const params: any[] = [];

  if (stationId) {
    conditions.push('station_id = ?');
    params.push(stationId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' LIMIT ?';
  params.push(limit);

  const result = await scyllaClient.execute(query, params, { prepare: false });
  return result.rows.map(row => ({
    id: row.anomaly_time.toString(),
    stationId: row.station_id,
    timestamp: new Date(row.anomaly_time).getTime(),
    type: row.anomaly_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    value: row.value,
    threshold: row.threshold,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  }));
}

/**
 * Get total data points count
 */
export function getTotalDataPoints(): number {
  return totalDataPoints;
}

/**
 * Get connection status
 */
export function getConnectionMode(): 'scylladb' | 'memory' {
  return useMemoryFallback ? 'memory' : 'scylladb';
}