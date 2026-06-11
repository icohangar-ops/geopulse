'use client';

import dynamic from 'next/dynamic';
import { useGNSSStream } from '@/hooks/use-gnss-stream';
import { StatsPanel } from '@/components/dashboard/stats-panel';
import { StationList } from '@/components/dashboard/station-list';
import { ReadingsChart } from '@/components/dashboard/readings-chart';
import { AnomalyFeed } from '@/components/dashboard/anomaly-feed';
import { DashboardHeader } from '@/components/dashboard/header';

// Dynamic import Leaflet to avoid SSR issues
const MapView = dynamic(
  () => import('@/components/dashboard/map-view').then(m => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-neutral-600 text-sm bg-neutral-950 rounded-lg border border-border">
        Loading map...
      </div>
    ),
  },
);

export default function Home() {
  // Initialize the socket stream (connects + fetches stations)
  useGNSSStream();

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100">
      <DashboardHeader />

      {/* Stats Bar */}
      <div className="px-4 py-3 border-b border-border">
        <StatsPanel />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Station List */}
        <aside className="w-64 xl:w-72 border-r border-border bg-neutral-950/50 hidden md:flex flex-col">
          <StationList />
        </aside>

        {/* Center: Map + Charts */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Map */}
          <div className="flex-1 min-h-0 p-3 pb-1.5">
            <MapView />
          </div>
          {/* Time-series Charts */}
          <div className="h-64 lg:h-72 border-t border-border bg-neutral-950/30 rounded-t-lg">
            <ReadingsChart />
          </div>
        </div>

        {/* Right Sidebar: Anomaly Feed */}
        <aside className="w-80 xl:w-96 border-l border-border bg-neutral-950/50 hidden lg:flex flex-col">
          <AnomalyFeed />
        </aside>
      </main>

      {/* Mobile: Station list below */}
      <div className="md:hidden border-t border-border max-h-48 overflow-y-auto">
        <StationList />
      </div>

      {/* Mobile: Anomaly feed below */}
      <div className="lg:hidden border-t border-border max-h-64">
        <AnomalyFeed />
      </div>
    </div>
  );
}