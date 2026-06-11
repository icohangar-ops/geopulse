// ============================================================
// GeoPulse — African GNSS Station Registry
// Real IGS/AFREF stations across Africa for disaster monitoring
// ============================================================

import type { Station } from './types';

export const AFRICAN_GNSS_STATIONS: Omit<Station, 'id' | 'createdAt' | 'updatedAt' | 'lastReading'>[] = [
  // West Africa — seismically active Gulf of Guinea region
  { stationId: 'NKLG', name: 'Libreville', country: 'Gabon', latitude: 0.3536, longitude: 9.4142, elevation: 15, network: 'IGS', status: 'active' },
  { stationId: 'MALI', name: 'Malabo', country: 'Equatorial Guinea', latitude: 3.7500, longitude: 8.7833, elevation: 52, network: 'IGS', status: 'active' },
  { stationId: 'DSRT', name: 'Dakar Rosso', country: 'Senegal', latitude: 14.6937, longitude: -17.4441, elevation: 24, network: 'IGS', status: 'active' },
  { stationId: 'BJCO', name: 'Cotonou', country: 'Benin', latitude: 6.3489, longitude: 2.3944, elevation: 8, network: 'AFREF', status: 'active' },

  // East African Rift — highly active tectonic zone
  { stationId: 'ETHI', name: 'Addis Ababa', country: 'Ethiopia', latitude: 9.0250, longitude: 38.7469, elevation: 2355, network: 'IGS', status: 'active' },
  { stationId: 'NKIG', name: 'Nairobi', country: 'Kenya', latitude: -1.2197, longitude: 36.8889, elevation: 1798, network: 'IGS', status: 'active' },
  { stationId: 'DARW', name: 'Dar es Salaam', country: 'Tanzania', latitude: -6.7924, longitude: 39.2083, elevation: 16, network: 'AFREF', status: 'active' },
  { stationId: 'KAMP', name: 'Kampala', country: 'Uganda', latitude: 0.3476, longitude: 32.5825, elevation: 1200, network: 'AFREF', status: 'active' },
  { stationId: 'RWN2', name: 'Kigali', country: 'Rwanda', latitude: -1.9403, longitude: 29.8739, elevation: 1567, network: 'AFREF', status: 'active' },
  { stationId: 'BUKO', name: 'Bukavu', country: 'DR Congo', latitude: -2.5067, longitude: 28.8531, elevation: 1620, network: 'AFREF', status: 'active' },

  // Southern Africa — stable craton with mining subsidence monitoring
  { stationId: 'HRAO', name: 'Hartebeesthoek', country: 'South Africa', latitude: -25.8904, longitude: 27.6869, elevation: 1453, network: 'IGS', status: 'active' },
  { stationId: 'SUTH', name: 'Sutherland', country: 'South Africa', latitude: -32.3764, longitude: 20.8107, elevation: 1798, network: 'IGS', status: 'active' },
  { stationId: 'LUSK', name: 'Lusaka', country: 'Zambia', latitude: -15.3875, longitude: 28.3228, elevation: 1272, network: 'AFREF', status: 'active' },
  { stationId: 'HARB', name: 'Harare', country: 'Zimbabwe', latitude: -17.8316, longitude: 31.0522, elevation: 1471, network: 'AFREF', status: 'active' },
  { stationId: 'MASP', name: 'Maputo', country: 'Mozambique', latitude: -25.9692, longitude: 32.5732, elevation: 45, network: 'AFREF', status: 'active' },

  // North Africa — Mediterranean seismic belt
  { stationId: 'TETN', name: 'Tetouan', country: 'Morocco', latitude: 35.5729, longitude: -5.3706, elevation: 75, network: 'IGS', status: 'active' },
  { stationId: 'ALGR', name: 'Algiers', country: 'Algeria', latitude: 36.7538, longitude: 3.0588, elevation: 25, network: 'IGS', status: 'active' },
  { stationId: 'TUNI', name: 'Tunis', country: 'Tunisia', latitude: 36.8188, longitude: 10.1658, elevation: 5, network: 'AFREF', status: 'active' },
  { stationId: 'CAIR', name: 'Cairo', country: 'Egypt', latitude: 30.0756, longitude: 31.2344, elevation: 75, network: 'IGS', status: 'active' },

  // Central Africa — volcanic monitoring (Mt. Cameroon, Virunga)
  { stationId: 'DOUA', name: 'Douala', country: 'Cameroon', latitude: 4.0511, longitude: 9.7679, elevation: 13, network: 'AFREF', status: 'active' },
  { stationId: 'NYAL', name: 'N\'Djamena', country: 'Chad', latitude: 12.1348, longitude: 15.0557, elevation: 298, network: 'AFREF', status: 'active' },
  { stationId: 'BANG', name: 'Bangui', country: 'CAR', latitude: 4.3612, longitude: 18.5552, elevation: 367, network: 'AFREF', status: 'active' },

  // Indian Ocean islands — volcanic/tsunami monitoring
  { stationId: 'SEY1', name: 'Mahé', country: 'Seychelles', latitude: -4.6796, longitude: 55.4920, elevation: 3, network: 'IGS', status: 'active' },
  { stationId: 'MRLL', name: 'Antananarivo', country: 'Madagascar', latitude: -18.8792, longitude: 47.5079, elevation: 1267, network: 'AFREF', status: 'active' },
];

/** Risk categories for station placement */
export const RISK_ZONES = {
  'East African Rift': {
    description: 'Active divergent plate boundary — earthquake & volcanic precursor detection',
    color: '#ef4444',
    stationIds: ['ETHI', 'NKIG', 'DARW', 'KAMP', 'RWN2', 'BUKO'],
  },
  'Gulf of Guinea': {
    description: 'Intraplate seismicity & coastal subsidence monitoring',
    color: '#f59e0b',
    stationIds: ['NKLG', 'MALI', 'BJCO', 'DOUA'],
  },
  'Mediterranean Belt': {
    description: 'Convergent boundary — earthquake early warning',
    color: '#ef4444',
    stationIds: ['TETN', 'ALGR', 'TUNI', 'CAIR'],
  },
  'Southern Craton': {
    description: 'Stable platform — mining-induced deformation & reference frame',
    color: '#22c55e',
    stationIds: ['HRAO', 'SUTH', 'LUSK', 'HARB', 'MASP'],
  },
  'Indian Ocean': {
    description: 'Volcanic & tsunami precursor monitoring',
    color: '#3b82f6',
    stationIds: ['SEY1', 'MRLL'],
  },
  'West African Coast': {
    description: 'Coastal & intraplate seismic monitoring',
    color: '#f59e0b',
    stationIds: ['DSRT'],
  },
  'Central Africa': {
    description: 'Volcanic & tectonic activity monitoring',
    color: '#f97316',
    stationIds: ['NYAL', 'BANG'],
  },
} as const;