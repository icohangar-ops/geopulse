# GeoPulse — GNSS Ground Station Anomaly Detection

**Real-time GNSS position monitoring and anomaly detection for disaster early warning in Africa.**

Built for the [SATNAV G4D-RR Hackathon](https://dorahacks.io/hackathon/satnav) — EU-funded GNSS for Disaster Risk Reduction & Early Warning Systems.

## Overview

GeoPulse ingests continuous GNSS position streams from a network of 24 ground stations across Africa, stores time-series geospatial data in [ScyllaDB](https://www.scylladb.com/), and runs real-time anomaly detection to flag precursor signals for earthquakes, landslides, and volcanic activity.

### Architecture

```
┌─────────────┐     SSE      ┌──────────────┐     ┌───────────────┐
│  Dashboard   │◄────────────│  Next.js API  │────►│  ScyllaDB     │
│  (React 19)  │             │  /api/stream  │     │  gnss_readings│
│  Leaflet Map │             │  Simulator    │     │  anomalies    │
│  Recharts    │             │  Detection    │     │  hourly_stats │
└─────────────┘             └──────────────┘     └───────────────┘
                                   │
                                   ▼
                             ┌───────────┐
                             │  SQLite   │
                             │ (Stations,│
                             │  Alerts)  │
                             └───────────┘
```

## Features

### Real-Time Monitoring
- **24 GNSS stations** across 7 African tectonic risk zones
- **Live data streaming** via Server-Sent Events (300ms per station cycle)
- **Interactive map** with health-colored markers (green/amber/red)
- **Time-series charts** — 3D position residual + N/E/U component decomposition
- **Station health popups** with PDOP, satellite count, and 3D residual

### Anomaly Detection Engine (5 Algorithms)
| Algorithm | Method | Warning | Critical |
|-----------|--------|---------|----------|
| Position Drift | Running z-score on 3D residual | >3σ | >4σ |
| Velocity Spike | Absolute 3D velocity threshold | >0.5 mm/s | >2.0 mm/s |
| Signal Degradation | Satellite count + PDOP | <5 sats / PDOP>6 | <4 sats / PDOP>10 |
| Multipath Detection | Oscillation rate + PDOP correlation | >60% oscillation + PDOP>4 | — |
| Elevation Jump | Sudden vertical displacement | >15mm | >20mm |

### Risk Zones Monitored
- **East African Rift** — Active divergent plate boundary (6 stations: ETHI, NKIG, DARW, KAMP, RWN2, BUKO)
- **Gulf of Guinea** — Intraplate seismicity & coastal subsidence (4 stations: NKLG, MALI, DSRT, BJCO)
- **Mediterranean Belt** — Convergent boundary earthquake early warning (4 stations: TETN, ALGR, TUNI, CAIR)
- **Southern Craton** — Mining-induced deformation & reference frame (5 stations: HRAO, SUTH, LUSK, HARB, MASP)
- **Indian Ocean** — Volcanic & tsunami precursor monitoring (2 stations: SEY1, MRLL)
- **West African Coast** (1 station: DSRT)
- **Central Africa** — Volcanic & tectonic activity (2 stations: NYAL, BANG)

### Simulator
Realistic GNSS data generation with:
- Gaussian noise model matching real GNSS receivers (σ=3mm horizontal, σ=8mm vertical)
- Tectonic drift rates (IGS: 0.2mm/yr, AFREF: 0.05mm/yr)
- Configurable anomaly injection (position drift, velocity spike, elevation jump, multipath)
- Smooth anomaly envelopes (sinusoidal rise/fall patterns)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| UI Components | shadcn/ui, Lucide Icons |
| Map | Leaflet + CARTO dark basemap |
| Charts | Recharts (AreaChart, LineChart) |
| State | Zustand |
| Streaming | Server-Sent Events (SSE) |
| Database (time-series) | ScyllaDB (cassandra-driver) |
| Database (metadata) | SQLite via Prisma ORM |
| Runtime | Bun |

## ScyllaDB Schema

Designed for high-throughput GNSS time-series data:

- **`gnss_readings`** — Partitioned by `(station_id, hour_bucket)`, clustered by `timeuuid`
  - `TimeWindowCompactionStrategy` (1-day windows)
  - `LZ4Compressor` for fast reads
  - 30-day TTL
- **`anomalies`** — Partitioned by `(station_id, day_bucket)`, 90-day TTL
- **`anomalies_by_time`** — Materialized view for cross-station temporal queries
- **`station_hourly_stats`** — Pre-aggregated hourly stats, 7-day TTL

See [`geopulse_schema.cql`](./download/geopulse_schema.cql) for the full schema.

## Getting Started

### Prerequisites
- Bun runtime
- Node.js 20+
- (Optional) ScyllaDB Cloud cluster with IP whitelisted

### Install & Run

```bash
# Install dependencies
bun install

# Push database schema
bun run db:push

# Start development server
bun run dev
```

Open the dashboard and click **Start Simulator** to begin streaming live GNSS data.

### Connecting ScyllaDB

1. Add your server's IP to ScyllaDB Cloud → General → Allowed IPs
2. The app auto-connects on startup; falls back to in-memory mode if unreachable
3. Run the schema: `cqlsh --ssl -u scylla -p <password> <host> -f geopulse_schema.cql`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stream` | GET (SSE) | Real-time GNSS reading + anomaly stream |
| `/api/stream?action=start` | GET | Start the GNSS simulator |
| `/api/stream?action=stop` | GET | Stop the simulator |
| `/api/stream?action=inject&stationId=X` | GET | Inject anomaly into station X |
| `/api/stream?action=status` | GET | Get simulator status |
| `/api/stations` | GET/POST | List/create stations |
| `/api/readings?stationId=X&hours=6` | GET | Query time-series readings |
| `/api/anomalies?severity=critical` | GET | Query detected anomalies |
| `/api/alerts` | GET/POST/PATCH | Manage alerts (acknowledge/resolve) |
| `/api/stats` | GET | Dashboard KPI statistics |
| `/api/init` | POST | Initialize ScyllaDB + seed stations |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── stream/route.ts      # SSE streaming + simulator
│   │   ├── stations/route.ts    # Station CRUD
│   │   ├── readings/route.ts    # Time-series queries
│   │   ├── anomalies/route.ts   # Anomaly queries
│   │   ├── alerts/route.ts      # Alert management
│   │   ├── stats/route.ts       # KPI statistics
│   │   └── init/route.ts        # Initialization
│   ├── page.tsx                 # Main dashboard
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Dark theme styles
├── components/dashboard/
│   ├── header.tsx               # Top bar with controls
│   ├── stats-panel.tsx          # 6 KPI cards
│   ├── map-view.tsx             # Leaflet map with markers
│   ├── station-list.tsx         # Station sidebar (by risk zone)
│   ├── readings-chart.tsx       # Time-series charts
│   └── anomaly-feed.tsx         # Real-time anomaly cards
├── hooks/
│   └── use-gnss-stream.ts       # SSE connection hook
└── lib/
    ├── scylla.ts                # ScyllaDB client + fallback
    ├── gnss-simulator.ts        # GNSS data generator
    ├── anomaly-detector.ts      # 5 detection algorithms
    ├── stations.ts              # 24 African stations + risk zones
    ├── store.ts                 # Zustand dashboard state
    ├── types.ts                 # TypeScript type definitions
    └── db.ts                    # Prisma client
```

## License

MIT