import {
  CITY_CATALOG,
  DEFAULT_PUBLIC_OVERPASS_URL,
  isLocalProxyOrLocalhostUrl,
  resolveOverpassDataSource,
} from '../data/cityCatalog';
import {
  GeoBounds,
  GeoOrigin,
  OsmImportCategories,
} from '../types/city';
import { computeBoundsMetrics } from '../utils/geoCoords';
import { OverpassResponse } from '../utils/osmConverter';

export const OVERPASS_TIMEOUT_MS = 30_000;
export const OVERPASS_RETRY_DELAYS_MS = [2000, 4000, 8000] as const;
export const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function readViteEnv(): Record<string, string | undefined> {
  try {
    return (
      (import.meta.env as unknown as Record<string, string | undefined>) || {}
    );
  } catch {
    return {};
  }
}

function isViteDevMode(): boolean {
  try {
    return Boolean((import.meta.env as unknown as { DEV?: boolean })?.DEV);
  } catch {
    return false;
  }
}

export function getConfiguredDefaultOverpassUrl(): string {
  const envUrl = readViteEnv().VITE_OVERPASS_URL?.trim();
  return envUrl || DEFAULT_PUBLIC_OVERPASS_URL;
}

export const OSM_SERVICE_CONFIG = {
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  defaultOverpassUrl: DEFAULT_PUBLIC_OVERPASS_URL,
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors',
  minRequestIntervalMs: 1100,
  timeoutMs: OVERPASS_TIMEOUT_MS,
  retryDelaysMs: OVERPASS_RETRY_DELAYS_MS,
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
  cityCatalogId?: string;
}

export const PRESET_CITIES: LocationSearchResult[] = CITY_CATALOG.filter((c) =>
  ['teresina', 'fortaleza', 'sao-paulo', 'new-york'].includes(c.id)
).map((c) => ({
  placeId: `preset-${c.id}`,
  name: c.name,
  displayName: `${c.name}, ${c.country}`,
  lat: c.center.lat,
  lon: c.center.lon,
  type: 'city',
  country: c.country,
  boundingBox: c.bounds,
  cityCatalogId: c.id,
}));

const searchCache = new Map<string, LocationSearchResult[]>();
const overpassCache = new Map<
  string,
  { response: OverpassResponse; endpointUsed: string }
>();
let lastRequestTimestamp = 0;

async function respectRateLimit(skipForLocal: boolean): Promise<void> {
  if (skipForLocal) return;
  const now = Date.now();
  const elapsed = now - lastRequestTimestamp;
  if (elapsed < OSM_SERVICE_CONFIG.minRequestIntervalMs) {
    await new Promise((r) =>
      setTimeout(r, OSM_SERVICE_CONFIG.minRequestIntervalMs - elapsed)
    );
  }
  lastRequestTimestamp = Date.now();
}

async function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Request aborted', 'AbortError');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException('Request aborted', 'AbortError')
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
          'TimeoutError'
        )
      ),
    timeoutMs
  );
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

  await respectRateLimit(false);

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
    10_000,
    signal
  );

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        'Geocoding rate limit reached. Please wait a moment and try again.'
      );
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
    clauses.push(
      `  way["leisure"~"^(park|garden|playground|pitch|sports_centre|stadium|track|nature_reserve|common)$"](${bbox});`
    );
    clauses.push(
      `  way["landuse"~"^(grass|forest|recreation_ground|meadow|village_green|reservoir)$"](${bbox});`
    );
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
    clauses.push(
      `  way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"](${bbox});`
    );
  }

  return `[out:json][timeout:25];\n(\n${clauses.join('\n')}\n);\nout geom;`;
}

export interface FetchOsmResultWithSource {
  data: OverpassResponse;
  endpointUsed: string;
  sourceLabel: string;
  matchedCityName?: string;
}

function classifyHttpError(status: number, endpoint: string): Error {
  if (status === 429) {
    return new Error(
      `Overpass API rate limit reached (HTTP 429) at ${endpoint}. Wait a moment or use a local Overpass container.`
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return new Error(
      `Overpass server temporarily unavailable (HTTP ${status}) at ${endpoint}.`
    );
  }
  return new Error(`Overpass request failed with HTTP ${status} at ${endpoint}.`);
}

function classifyCaughtError(err: unknown, endpoint: string): Error {
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new Error(
      `Overpass query timed out after ${Math.round(OVERPASS_TIMEOUT_MS / 1000)}s (${endpoint}). Dense areas work best via a local Docker Overpass instance or a smaller bounding box.`
    );
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return err;
  }
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new Error(
      `Overpass query timed out after ${Math.round(OVERPASS_TIMEOUT_MS / 1000)}s (${endpoint}).`
    );
  }
  if (err instanceof TypeError) {
    return new Error(
      `Network error reaching Overpass endpoint (${endpoint}). Check internet connectivity or local Docker Overpass container status.`
    );
  }
  return err instanceof Error
    ? err
    : new Error(`Unexpected error reaching Overpass endpoint (${endpoint}).`);
}

export async function fetchOsmAreaDataWithSource(
  bounds: GeoBounds,
  categories: OsmImportCategories,
  signal?: AbortSignal,
  origin?: GeoOrigin
): Promise<FetchOsmResultWithSource> {
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

  const plan = resolveOverpassDataSource(bounds, origin, {
    env: readViteEnv(),
    isDev: isViteDevMode(),
  });

  const cacheKey = JSON.stringify({
    s: bounds.south.toFixed(5),
    w: bounds.west.toFixed(5),
    n: bounds.north.toFixed(5),
    e: bounds.east.toFixed(5),
    categories,
    city: plan.matchedCity?.id || 'custom',
  });
  if (overpassCache.has(cacheKey)) {
    const cached = overpassCache.get(cacheKey)!;
    return {
      data: cached.response,
      endpointUsed: cached.endpointUsed,
      sourceLabel: isLocalProxyOrLocalhostUrl(cached.endpointUsed)
        ? `${plan.matchedCity?.name || 'Local'} Overpass`
        : 'Public Overpass API',
      matchedCityName: plan.matchedCity?.name,
    };
  }

  const query = buildOverpassQuery(bounds, categories);
  let lastError: Error | null = null;

  for (let i = 0; i < plan.endpoints.length; i++) {
    const endpoint = plan.endpoints[i];
    const isLocal = isLocalProxyOrLocalhostUrl(endpoint);
    const hasNextFallback = i < plan.endpoints.length - 1;

    // Local Overpass does not need public-API rate limiting; public endpoints keep polite spacing
    await respectRateLimit(isLocal);

    // Retry with 2s, 4s, 8s exponential backoff on retryable Overpass server errors (429/502/503/504)
    // Skip multi-second retry loops on a local dev proxy when a public fallback exists and the local port is down.
    const maxAttempts = isLocal && hasNextFallback ? 1 : OVERPASS_RETRY_DELAYS_MS.length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
          OVERPASS_TIMEOUT_MS,
          signal
        );

        if (RETRYABLE_HTTP_STATUSES.has(res.status)) {
          lastError = classifyHttpError(res.status, endpoint);
          if (attempt < maxAttempts - 1) {
            await waitWithAbort(OVERPASS_RETRY_DELAYS_MS[attempt], signal);
            continue;
          }
          break;
        }

        if (!res.ok) {
          lastError = classifyHttpError(res.status, endpoint);
          break;
        }

        const data = (await res.json()) as OverpassResponse;
        if (!data || !Array.isArray(data.elements)) {
          lastError = new Error(
            `Unexpected response format from Overpass (${endpoint}).`
          );
          break;
        }

        // If a local partial-dataset proxy returns 0 elements while a public fallback exists,
        // try the public fallback in case the queried area lies outside the local extract bbox.
        if (data.elements.length === 0 && isLocal && hasNextFallback) {
          lastError = new Error(
            `No features in local extract (${endpoint}); checking public Overpass fallback.`
          );
          break;
        }

        overpassCache.set(cacheKey, { response: data, endpointUsed: endpoint });
        return {
          data,
          endpointUsed: endpoint,
          sourceLabel: isLocal
            ? `${plan.matchedCity?.name || 'Local'} Overpass`
            : 'Public Overpass API',
          matchedCityName: plan.matchedCity?.name,
        };
      } catch (err) {
        if (signal?.aborted) {
          throw err;
        }
        const classified = classifyCaughtError(err, endpoint);
        lastError = classified;
        if (attempt < maxAttempts - 1 && !(err instanceof TypeError && hasNextFallback)) {
          await waitWithAbort(OVERPASS_RETRY_DELAYS_MS[attempt], signal);
          continue;
        }
        break;
      }
    }
  }

  throw (
    lastError || new Error('Unable to fetch OpenStreetMap data right now.')
  );
}

export async function fetchOsmAreaData(
  bounds: GeoBounds,
  categories: OsmImportCategories,
  signal?: AbortSignal,
  origin?: GeoOrigin
): Promise<OverpassResponse> {
  const result = await fetchOsmAreaDataWithSource(
    bounds,
    categories,
    signal,
    origin
  );
  return result.data;
}
