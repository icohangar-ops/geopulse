'use client';

import { useDashboardStore } from '@/lib/store';
import { RISK_ZONES } from '@/lib/stations';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Radio, AlertTriangle, ChevronRight } from 'lucide-react';

export function StationList() {
  const {
    stations,
    selectedStationId,
    selectStation,
    readings,
    anomalies,
  } = useDashboardStore();

  // Group stations by risk zone
  const zones = Object.entries(RISK_ZONES).map(([name, zone]) => ({
    name,
    description: zone.description,
    color: zone.color,
    stations: zone.stationIds
      .map(id => stations.find(s => s.stationId === id))
      .filter(Boolean) as typeof stations,
  }));

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {zones.map(zone => (
          <div key={zone.name}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: zone.color }}
              />
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                {zone.name}
              </h3>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {zone.stations.length}
              </Badge>
            </div>
            <p className="text-[10px] text-neutral-500 mb-2 leading-tight">
              {zone.description}
            </p>
            <div className="space-y-1">
              {zone.stations.map(station => {
                const isSelected = station.stationId === selectedStationId;
                const stationReadings = readings.get(station.stationId) || [];
                const latest = stationReadings[stationReadings.length - 1];
                const stationAnomalies = anomalies.filter(
                  a => a.stationId === station.stationId,
                );
                const hasAnomaly = stationAnomalies.length > 0;
                const hasCritical = stationAnomalies.some(a => a.severity === 'critical');

                return (
                  <button
                    key={station.stationId}
                    onClick={() =>
                      selectStation(
                        isSelected ? null : station.stationId,
                      )
                    }
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-all',
                      'hover:bg-neutral-800/80',
                      isSelected && 'bg-neutral-800 ring-1 ring-neutral-600',
                    )}
                  >
                    <Radio
                      className={cn(
                        'h-3.5 w-3.5 flex-shrink-0',
                        latest ? 'text-emerald-500' : 'text-neutral-600',
                        hasCritical && 'text-red-500',
                        hasAnomaly && !hasCritical && 'text-amber-500',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-sm font-mono font-medium',
                          isSelected ? 'text-white' : 'text-neutral-300',
                        )}>
                          {station.stationId}
                        </span>
                        <span className="text-[10px] text-neutral-500 truncate">
                          {station.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                        <span>{station.country}</span>
                        {latest && (
                          <>
                            <span>·</span>
                            <span>PDOP {latest.pdop.toFixed(1)}</span>
                            <span>·</span>
                            <span>{latest.satellites} sat</span>
                          </>
                        )}
                        {stationReadings.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{stationReadings.length} pts</span>
                          </>
                        )}
                      </div>
                    </div>
                    {hasAnomaly && (
                      <AlertTriangle
                        className={cn(
                          'h-3.5 w-3.5 flex-shrink-0',
                          hasCritical ? 'text-red-500' : 'text-amber-500',
                        )}
                      />
                    )}
                    <ChevronRight className="h-3 w-3 text-neutral-600 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}