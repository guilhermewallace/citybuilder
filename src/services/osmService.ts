import {
  GeoBounds,
  OsmImportCategories,
} from '../types/city';
import { computeBoundsMetrics } from '../utils/geoCoords';
import { OverpassResponse } from '../utils/osmConverter';

export const OSM_SERVICE_CONFIG = {
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  overpassEndpoints: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  minRequestIntervalMs: 1100,
};

export interface LocationSearchResult {
  placeId: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  country?: string;
  boundingBox?: GeoBounds;
}

export const PRESET_CITIES: LocationSearchResult[] = [
  {
    placeId: 'preset-teresina',
    name: 'Teresina',
    displayName: 'Teresina, Piauí, Brazil',
    lat: -5.0892,
    lon: -42.8016,
    type: 'city',
    country: 'Brazil',
  },
  {
    placeId: 'preset-fortaleza',
    name: 'Fortaleza',
    displayName: 'Fortaleza, Ceará, Brazil',
    lat: -3.7319,
    lon: -38.5267,
    type: 'city',
    country: 'Brazil',
  },
  {
    placeId: 'preset-saopaulo',
    name: 'São Paulo',
    displayName: 'São Paulo, Região Metropolitana de São Paulo, Brazil',
    lat: -23.5505,
    lon: -46.6333,
    type: 'city',
    country: 'Brazil',
  },
  {
    placeId: 'preset-manhattan',
    name: 'Manhattan',
    displayName: 'Manhattan, New York County, New York, United States',
    lat: 40.758,
    lon: -73.9855,
    type: 'borough',
    country: 'United States',
  },
];

const searchCache = new Map<string, LocationSearchResult[]>();
const overpassCache = new Map<string, OverpassResponse>();
let lastRequestTimestamp = 0;

async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  if (elapsed < OSM_SERVICE_CONFIG.minRequestIntervalMs) {
    await new Promise((r) =>
      setTimeout(r, OSM_SERVICE_CONFIG.minRequestIntervalMs - elapsed)
    );
  }
  lastRequestTimestamp = Date.now();
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function searchOsmLocations(
  query: string,
  signal?: AbortSignal
): Promise<LocationSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const cacheKey = trimmed.toLowerCase();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  await respectRateLimit();

  const url = new URL(OSM_SERVICE_CONFIG.nominatimUrl);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '7');

  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
    8000,
    signal
  );

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Geocoding rate limit reached. Please wait a moment and try again.');
    }
    throw new Error(`Location search failed (HTTP ${res.status}).`);
  }

  const raw = (await res.json()) as Array<{
    place_id: number;
    name?: string;
    display_name: string;
    lat: string;
    lon: string;
    type?: string;
    addresstype?: string;
    address?: { country?: string };
    boundingbox?: [string, string, string, string];
  }>;

  const results: LocationSearchResult[] = raw.map((item) => {
    const bb = item.boundingbox;
    return {
      placeId: String(item.place_id),
      name: item.name || item.display_name.split(',')[0].trim(),
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.addresstype || item.type || 'place',
      country: item.address?.country,
      boundingBox:
        bb && bb.length === 4
          ? {
              south: parseFloat(bb[0]),
              north: parseFloat(bb[1]),
              west: parseFloat(bb[2]),
              east: parseFloat(bb[3]),
            }
          : undefined,
    };
  });

  searchCache.set(cacheKey, results);
  return results;
}

export function buildOverpassQuery(
  bounds: GeoBounds,
  categories: OsmImportCategories
): string {
  const bbox = `${bounds.south.toFixed(6)},${bounds.west.toFixed(6)},${bounds.north.toFixed(6)},${bounds.east.toFixed(6)}`;
  const clauses: string[] = [];

  if (categories.roads) {
    clauses.push(`  way["highway"](${bbox});`);
  }
  if (categories.buildings) {
    clauses.push(`  way["building"](${bbox});`);
    clauses.push(`  relation["building"](${bbox});`);
  }
  if (categories.natural) {
    clauses.push(`  way["leisure"~"^(park|garden|playground|pitch|sports_centre|stadium|track|nature_reserve|common)$"](${bbox});`);
    clauses.push(`  way["landuse"~"^(grass|forest|recreation_ground|meadow|village_green|reservoir)$"](${bbox});`);
    clauses.push(`  way["place"="square"](${bbox});`);
    clauses.push(`  way["natural"="water"](${bbox});`);
    clauses.push(`  way["waterway"~"^(river|stream|canal)$"](${bbox});`);
    clauses.push(`  relation["natural"="water"](${bbox});`);
  }
  if (categories.transportation) {
    clauses.push(`  node["highway"="bus_stop"](${bbox});`);
    clauses.push(`  node["public_transport"="platform"]["bus"="yes"](${bbox});`);
    clauses.push(`  node["amenity"="bus_station"](${bbox});`);
    clauses.push(`  node["railway"~"^(station|halt|subway_entrance)$"](${bbox});`);
    clauses.push(`  way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"](${bbox});`);
  }

  return `[out:json][timeout:20];\n(\n${clauses.join('\n')}\n);\nout geom;`;
}

export async function fetchOsmAreaData(
  bounds: GeoBounds,
  categories: OsmImportCategories,
  signal?: AbortSignal
): Promise<OverpassResponse> {
  if (
    !categories.roads &&
    !categories.buildings &&
    !categories.natural &&
    !categories.transportation
  ) {
    throw new Error('Select at least one OpenStreetMap category to import.');
  }

  const metrics = computeBoundsMetrics(bounds);
  if (!metrics.withinLimit) {
    throw new Error(
      `Selected area (${metrics.widthM}m × ${metrics.heightM}m, ${metrics.areaKm2} km²) exceeds the single-import limit (max 2.5 km span / 3.5 km²). Please zoom in or draw a smaller selection.`
    );
  }

  const cacheKey = JSON.stringify({
    s: bounds.south.toFixed(5),
    w: bounds.west.toFixed(5),
    n: bounds.north.toFixed(5),
    e: bounds.east.toFixed(5),
    categories,
  });
  if (overpassCache.has(cacheKey)) {
    return overpassCache.get(cacheKey)!;
  }

  await respectRateLimit();
  const query = buildOverpassQuery(bounds, categories);
  let lastError: Error | null = null;

  for (const endpoint of OSM_SERVICE_CONFIG.overpassEndpoints) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json',
          },
          body: `data=${encodeURIComponent(query)}`,
        },
        9000,
        signal
      );

      if (res.status === 429) {
        lastError = new Error('Overpass API is busy (rate limit). Trying fallback mirror or retry shortly.');
        continue;
      }
      if (!res.ok) {
        lastError = new Error(`Overpass request failed (HTTP ${res.status}).`);
        continue;
      }

      const data = (await res.json()) as OverpassResponse;
      if (!data || !Array.isArray(data.elements)) {
        lastError = new Error('Unexpected response format from OpenStreetMap Overpass API.');
        continue;
      }
      overpassCache.set(cacheKey, data);
      return data;
    } catch (err) {
      if (signal?.aborted) {
        throw err;
      }
      lastError =
        err instanceof Error && err.name === 'AbortError'
          ? new Error('OpenStreetMap Overpass mirror timed out. Please retry or select a smaller area.')
          : err instanceof Error
            ? err
            : new Error('Network error reaching OpenStreetMap Overpass API.');
    }
  }

  throw lastError || new Error('Unable to fetch OpenStreetMap data right now.');
}
