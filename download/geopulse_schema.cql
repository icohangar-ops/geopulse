-- ============================================================
-- GeoPulse — ScyllaDB Schema for GNSS Time-Series Data
-- Run this CQL after whitelisting your IP in ScyllaDB Cloud
-- ============================================================
-- Connection: node-0.aws-us-east-1.b6157e624b2b8d34a1a5.clusters.scylla.cloud:9142
-- Username: scylla | Keyspace: geopulse
-- ============================================================

CREATE KEYSPACE IF NOT EXISTS geopulse
  WITH replication = {'class': 'NetworkTopologyStrategy', 'aws-us-east-1': 3}
  AND durable_writes = true;

USE geopulse;

-- GNSS position readings: partitioned by station + 1-hour time bucket
-- Enables efficient time-range queries per station
CREATE TABLE IF NOT EXISTS gnss_readings (
  station_id       text,
  hour_bucket      timestamp,
  reading_time     timeuuid,
  latitude         double,
  longitude        double,
  elevation        double,
  north_residual   double,
  east_residual    double,
  up_residual      double,
  north_velocity   double,
  east_velocity    double,
  up_velocity      double,
  satellites       int,
  pdop             double,
  fix_quality      int,
  PRIMARY KEY ((station_id, hour_bucket), reading_time)
) WITH CLUSTERING ORDER BY (reading_time DESC)
  AND default_time_to_live = 2592000
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
  metadata         text,
  PRIMARY KEY ((station_id, day_bucket), anomaly_time)
) WITH CLUSTERING ORDER BY (anomaly_time DESC)
  AND default_time_to_live = 7776000;

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
  max_drift_mm     double,
  anomaly_count    int,
  PRIMARY KEY (station_id, hour_bucket)
) WITH CLUSTERING ORDER BY (hour_bucket DESC)
  AND default_time_to_live = 604800;