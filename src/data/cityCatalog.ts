import {
  CityCatalogEntry,
  GeoBounds,
  GeoOrigin,
} from '../types/city';

export const DEFAULT_PUBLIC_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Decoupled multi-city geographic catalog.
 * Adding a new city only requires appending an entry here (and optionally
 * configuring its local Docker Overpass service or hosted Overpass endpoint).
 */
export const CITY_CATALOG: CityCatalogEntry[] = [
  {
    id: 'new-york',
    name: 'New York',
    country: 'United States',
    displayName: 'New York — United States',
    center: { lat: 40.758, lon: -73.9855 },
    bounds: {
      south: 40.4774,
      west: -74.2591,
      north: 40.9176,
      east: -73.7004,
    },
    dataSource: {
      localProxyPath: '/overpass/api/interpreter',
      envVarName: 'VITE_OVERPASS_URL_NYC',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf',
      extractBbox: '-74.2591,40.4774,-73.7004,40.9176',
    },
    availability: 'local_and_public',
    datasetUpdatedAt: '2026-11-13',
    estimatedElementsHint: 'Midtown & 5 Boroughs · ~1.3s local',
  },
  {
    id: 'teresina',
    name: 'Teresina',
    country: 'Brazil',
    displayName: 'Teresina — Brazil',
    center: { lat: -5.0892, lon: -42.8016 },
    bounds: {
      south: -5.22,
      west: -42.98,
      north: -4.95,
      east: -42.65,
    },
    dataSource: {
      localProxyPath: '/overpass-teresina/api/interpreter',
      envVarName: 'VITE_OVERPASS_URL_TERESINA',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf',
      extractBbox: '-42.98,-5.22,-42.65,-4.95',
    },
    availability: 'local_and_public',
    datasetUpdatedAt: '2026-11-13',
    estimatedElementsHint: 'Teresina & Timon metro · <1s local',
  },
  {
    id: 'fortaleza',
    name: 'Fortaleza',
    country: 'Brazil',
    displayName: 'Fortaleza — Brazil',
    center: { lat: -3.7319, lon: -38.5267 },
    bounds: {
      south: -3.9,
      west: -38.68,
      north: -3.68,
      east: -38.4,
    },
    dataSource: {
      envVarName: 'VITE_OVERPASS_URL_FORTALEZA',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf',
      extractBbox: '-38.68,-3.90,-38.40,-3.68',
    },
    availability: 'public_only',
    datasetUpdatedAt: 'Live OSM',
  },
  {
    id: 'sao-paulo',
    name: 'São Paulo',
    country: 'Brazil',
    displayName: 'São Paulo — Brazil',
    center: { lat: -23.5505, lon: -46.6333 },
    bounds: {
      south: -23.75,
      west: -46.85,
      north: -23.38,
      east: -46.36,
    },
    dataSource: {
      envVarName: 'VITE_OVERPASS_URL_SAO_PAULO',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf',
      extractBbox: '-46.85,-23.75,-46.36,-23.38',
    },
    availability: 'public_only',
    datasetUpdatedAt: 'Live OSM',
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    displayName: 'London — United Kingdom',
    center: { lat: 51.5072, lon: -0.1276 },
    bounds: {
      south: 51.38,
      west: -0.35,
      north: 51.62,
      east: 0.15,
    },
    dataSource: {
      envVarName: 'VITE_OVERPASS_URL_LONDON',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/europe/united-kingdom/england/greater-london-latest.osm.pbf',
      extractBbox: '-0.35,51.38,0.15,51.62',
    },
    availability: 'public_only',
    datasetUpdatedAt: 'Live OSM',
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'France',
    displayName: 'Paris — France',
    center: { lat: 48.8566, lon: 2.3522 },
    bounds: {
      south: 48.8,
      west: 2.22,
      north: 48.91,
      east: 2.47,
    },
    dataSource: {
      envVarName: 'VITE_OVERPASS_URL_PARIS',
      publicFallbackUrl: DEFAULT_PUBLIC_OVERPASS_URL,
      geofabrikExtractUrl:
        'https://download.geofabrik.de/europe/france/ile-de-france-latest.osm.pbf',
      extractBbox: '2.22,48.80,2.47,48.91',
    },
    availability: 'public_only',
    datasetUpdatedAt: 'Live OSM',
  },
];

export function boundsOverlap(a: GeoBounds, b: GeoBounds): boolean {
  return (
    a.south <= b.north &&
    a.north >= b.south &&
    a.west <= b.east &&
    a.east >= b.west
  );
}

export function pointInBounds(lat: number, lon: number, b: GeoBounds): boolean {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

export function getCatalogCityById(id?: string): CityCatalogEntry | null {
  if (!id) return null;
  return CITY_CATALOG.find((c) => c.id === id) || null;
}

export function findCatalogCityForBounds(
  bounds: GeoBounds,
  origin?: Pick<GeoOrigin, 'lat' | 'lon' | 'cityCatalogId'>
): CityCatalogEntry | null {
  if (origin?.cityCatalogId) {
    const byId = getCatalogCityById(origin.cityCatalogId);
    if (byId && boundsOverlap(bounds, byId.bounds)) {
      return byId;
    }
  }
  const byBounds = CITY_CATALOG.find((c) => boundsOverlap(bounds, c.bounds));
  if (byBounds) return byBounds;

  if (origin) {
    return (
      CITY_CATALOG.find((c) => pointInBounds(origin.lat, origin.lon, c.bounds)) ||
      null
    );
  }
  return null;
}

export interface ResolvedOverpassPlan {
  endpoints: string[];
  matchedCity: CityCatalogEntry | null;
  sourceLabel: string;
  hasLocalSource: boolean;
}

export function isLocalProxyOrLocalhostUrl(url: string): boolean {
  return (
    url.startsWith('/') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  );
}

/**
 * Resolves ordered Overpass endpoints for a given bounding box & city origin:
 * 1. City-specific env var override (e.g. VITE_OVERPASS_URL_TERESINA)
 * 2. City-specific local Vite proxy in dev (or global VITE_OVERPASS_URL when appropriate)
 * 3. Public Overpass API fallback (unless explicitly disabled)
 */
export function resolveOverpassDataSource(
  bounds: GeoBounds,
  origin?: GeoOrigin,
  options?: {
    env?: Record<string, string | undefined>;
    isDev?: boolean;
  }
): ResolvedOverpassPlan {
  const env = options?.env ?? {};
  const isDev = options?.isDev ?? false;
  const matchedCity = findCatalogCityForBounds(bounds, origin);

  const candidates: string[] = [];
  const pushUnique = (url?: string | null) => {
    const trimmed = url?.trim();
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  // 1. Per-city environment override
  const cityEnvKey = matchedCity?.dataSource.envVarName;
  const cityEnvUrl = cityEnvKey ? env[cityEnvKey] : undefined;
  if (cityEnvUrl) {
    pushUnique(cityEnvUrl);
  }

  // 2. Global VITE_OVERPASS_URL
  const globalUrl = env.VITE_OVERPASS_URL?.trim();
  const globalIsLocalProxy = Boolean(
    globalUrl && globalUrl.startsWith('/overpass')
  );

  if (globalUrl) {
    if (!globalIsLocalProxy) {
      // Explicit remote/backend Overpass endpoint works for any city
      pushUnique(globalUrl);
    } else if (!matchedCity || matchedCity.id === 'new-york') {
      // Preserve Claude's exact .env.local VITE_OVERPASS_URL="/overpass/api/interpreter" for New York
      pushUnique(globalUrl);
    }
  }

  // 3. City-specific local Docker Vite proxy in dev (or when local proxy mode is enabled)
  if (
    matchedCity?.dataSource.localProxyPath &&
    (isDev || globalIsLocalProxy)
  ) {
    pushUnique(matchedCity.dataSource.localProxyPath);
  }

  // 4. Public Overpass API fallback (always available unless explicitly disabled)
  const disableFallback = env.VITE_OVERPASS_DISABLE_PUBLIC_FALLBACK === 'true';
  const publicUrl =
    matchedCity?.dataSource.publicFallbackUrl || DEFAULT_PUBLIC_OVERPASS_URL;
  if (!disableFallback) {
    pushUnique(publicUrl);
  }

  const primary = candidates[0] || DEFAULT_PUBLIC_OVERPASS_URL;
  const hasLocalSource = candidates.some((u) => isLocalProxyOrLocalhostUrl(u));

  let sourceLabel = 'Public Overpass API';
  if (matchedCity && hasLocalSource) {
    sourceLabel = `${matchedCity.name} Local (+ Public fallback)`;
  } else if (globalUrl && !globalIsLocalProxy) {
    sourceLabel = 'Configured Overpass Backend';
  } else if (hasLocalSource) {
    sourceLabel = 'Local (+ Public fallback)';
  } else if (matchedCity) {
    sourceLabel = `${matchedCity.name} · Public Overpass API`;
  }

  if (candidates.length === 0) {
    candidates.push(primary);
  }

  return {
    endpoints: candidates,
    matchedCity,
    sourceLabel,
    hasLocalSource,
  };
}
