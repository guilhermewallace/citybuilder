import { METERS_PER_UNIT } from '../data/catalog';
import { GeoBounds, GeoOrigin, GeoPoint, Point } from '../types/city';

export const EARTH_RADIUS_M = 6378137;
export const MAX_IMPORT_AREA_KM2 = 3.5;
export const MAX_IMPORT_SPAN_M = 2500;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function mercatorX(lonDeg: number): number {
  return EARTH_RADIUS_M * degToRad(lonDeg);
}

function mercatorY(latDeg: number): number {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
  const latRad = degToRad(clampedLat);
  return EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

/**
 * Converts geographic coordinates (WGS84 lat/lon) to CityBuilder's local metric
 * world coordinates centered on `origin`, using local-scaled Web Mercator so:
 *  - +x is East, +y is South (screen/canvas convention)
 *  - 1 world unit === METERS_PER_UNIT (0.5m) horizontally and vertically
 *  - Shapes align 1:1 with Leaflet EPSG:3857 tiles around the city origin.
 */
export function latLonToWorld(
  lat: number,
  lon: number,
  origin: Pick<GeoOrigin, 'lat' | 'lon'>
): Point {
  const cosOrigin = Math.cos(degToRad(origin.lat));
  const dxMerc = mercatorX(lon) - mercatorX(origin.lon);
  const dyMerc = mercatorY(lat) - mercatorY(origin.lat);
  return {
    x: (dxMerc * cosOrigin) / METERS_PER_UNIT,
    y: -(dyMerc * cosOrigin) / METERS_PER_UNIT,
  };
}

/**
 * Inverse of `latLonToWorld`: converts CityBuilder local world coordinates back
 * to WGS84 latitude & longitude relative to `origin`.
 */
export function worldToLatLon(
  x: number,
  y: number,
  origin: Pick<GeoOrigin, 'lat' | 'lon'>
): GeoPoint {
  const cosOrigin = Math.max(1e-6, Math.cos(degToRad(origin.lat)));
  const dxMerc = (x * METERS_PER_UNIT) / cosOrigin;
  const dyMerc = -(y * METERS_PER_UNIT) / cosOrigin;

  const mx = mercatorX(origin.lon) + dxMerc;
  const my = mercatorY(origin.lat) + dyMerc;

  const lon = radToDeg(mx / EARTH_RADIUS_M);
  const lat = radToDeg(2 * Math.atan(Math.exp(my / EARTH_RADIUS_M)) - Math.PI / 2);
  return { lat, lon };
}

/**
 * Computes the continuous Leaflet Web Mercator zoom level matching CityBuilder's `camera.zoom`
 * (pixels per world unit) at `originLat`.
 */
export function leafletZoomForCameraZoom(
  cameraZoom: number,
  originLat: number
): number {
  const cosOrigin = Math.max(1e-6, Math.cos(degToRad(originLat)));
  const worldCircumference = 2 * Math.PI * EARTH_RADIUS_M;
  const twoPowZ =
    (cameraZoom * worldCircumference * cosOrigin) / (256 * METERS_PER_UNIT);
  return Math.log2(Math.max(1e-6, twoPowZ));
}

/**
 * Inverse of `leafletZoomForCameraZoom`: converts Leaflet zoom level to CityBuilder `camera.zoom`.
 */
export function cameraZoomForLeafletZoom(
  leafletZoom: number,
  originLat: number
): number {
  const cosOrigin = Math.max(1e-6, Math.cos(degToRad(originLat)));
  const worldCircumference = 2 * Math.PI * EARTH_RADIUS_M;
  return (Math.pow(2, leafletZoom) * 256 * METERS_PER_UNIT) / (worldCircumference * cosOrigin);
}

/** Great-circle Haversine distance in meters between two WGS84 points. */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function computeBoundsMetrics(bounds: GeoBounds): {
  widthM: number;
  heightM: number;
  areaKm2: number;
  center: GeoPoint;
  withinLimit: boolean;
} {
  const midLat = (bounds.north + bounds.south) / 2;
  const midLon = (bounds.east + bounds.west) / 2;
  const widthM = haversineDistanceMeters(
    { lat: midLat, lon: bounds.west },
    { lat: midLat, lon: bounds.east }
  );
  const heightM = haversineDistanceMeters(
    { lat: bounds.south, lon: midLon },
    { lat: bounds.north, lon: midLon }
  );
  const areaKm2 = (widthM * heightM) / 1_000_000;
  const withinLimit =
    widthM <= MAX_IMPORT_SPAN_M &&
    heightM <= MAX_IMPORT_SPAN_M &&
    areaKm2 <= MAX_IMPORT_AREA_KM2 &&
    widthM >= 30 &&
    heightM >= 30;

  return {
    widthM: Math.round(widthM),
    heightM: Math.round(heightM),
    areaKm2: Math.round(areaKm2 * 100) / 100,
    center: { lat: midLat, lon: midLon },
    withinLimit,
  };
}

export function createDefaultBoundsAround(
  lat: number,
  lon: number,
  halfSpanMeters = 320
): GeoBounds {
  const dLat = radToDeg(halfSpanMeters / EARTH_RADIUS_M);
  const cosLat = Math.max(0.1, Math.cos(degToRad(lat)));
  const dLon = radToDeg(halfSpanMeters / (EARTH_RADIUS_M * cosLat));
  return {
    north: lat + dLat,
    south: lat - dLat,
    east: lon + dLon,
    west: lon - dLon,
  };
}

export function geoPointsBounds(pts: GeoPoint[]): GeoBounds | undefined {
  if (pts.length === 0) return undefined;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const p of pts) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lon > east) east = p.lon;
    if (p.lon < west) west = p.lon;
  }
  return { north, south, east, west };
}

export function geoPolygonCentroid(pts: GeoPoint[]): GeoPoint {
  if (pts.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  for (const p of pts) {
    sumLat += p.lat;
    sumLon += p.lon;
  }
  return { lat: sumLat / pts.length, lon: sumLon / pts.length };
}
