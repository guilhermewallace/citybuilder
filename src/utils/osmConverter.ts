import {
  BUILDING_CONFIG,
  PUBLIC_SPACE_CONFIG,
  ROAD_CONFIG,
  TRANSIT_LINE_CONFIG,
  TRANSIT_STATION_CONFIG,
} from '../data/catalog';
import {
  BuildingItem,
  BuildingType,
  CityData,
  GeoBounds,
  GeoOrigin,
  GeoPoint,
  OsmImportCategories,
  Point,
  PublicSpaceItem,
  PublicSpaceType,
  RoadSegment,
  RoadType,
  TransitRoute,
  TransitStation,
  TransitStationType,
  WaterFeature,
} from '../types/city';
import {
  geoPointsBounds,
  geoPolygonCentroid,
  latLonToWorld,
} from './geoCoords';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version?: number;
  generator?: string;
  elements: OverpassElement[];
}

export interface OsmImportResult {
  roads: RoadSegment[];
  buildings: BuildingItem[];
  publicSpaces: PublicSpaceItem[];
  water: WaterFeature[];
  stations: TransitStation[];
  routes: TransitRoute[];
  counts: {
    roads: number;
    buildings: number;
    publicSpaces: number;
    water: number;
    stations: number;
    routes: number;
    total: number;
  };
}

/** Ramer-Douglas-Peucker simplification in world units so dense OSM ways stay light & editable */
export function simplifyWorldPolyline(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(p.x - start.x, p.y - start.y);
    } else {
      const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / lenSq;
      const projX = start.x + t * dx;
      const projY = start.y + t * dy;
      dist = Math.hypot(p.x - projX, p.y - projY);
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyWorldPolyline(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyWorldPolyline(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

function extractPolygonMetrics(worldPts: Point[]): {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotationDeg: number;
  localFootprint: Point[];
} {
  // Remove duplicated closing vertex if present
  let pts = worldPts;
  if (
    pts.length > 3 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.5
  ) {
    pts = pts.slice(0, -1);
  }

  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    area2 += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }

  if (Math.abs(area2) > 1e-3) {
    cx /= 3 * area2;
    cy /= 3 * area2;
  } else {
    cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  }

  // Primary angle from longest polygon edge
  let bestLen = -1;
  let primaryRad = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (len > bestLen) {
      bestLen = len;
      primaryRad = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    }
  }

  const cos = Math.cos(-primaryRad);
  const sin = Math.sin(-primaryRad);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const localFootprint: Point[] = [];

  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const u = dx * cos - dy * sin;
    const v = dx * sin + dy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    localFootprint.push({
      x: Math.round(u * 10) / 10,
      y: Math.round(v * 10) / 10,
    });
  }

  const rotationDeg = (((primaryRad * 180) / Math.PI) % 360 + 360) % 360;

  return {
    cx: Math.round(cx * 10) / 10,
    cy: Math.round(cy * 10) / 10,
    width: Math.max(8, Math.round((maxU - minU) * 10) / 10),
    height: Math.max(8, Math.round((maxV - minV) * 10) / 10),
    rotationDeg: Math.round(rotationDeg * 10) / 10,
    localFootprint,
  };
}

export function classifyOsmRoad(tags: Record<string, string>): RoadType | null {
  const hw = tags.highway;
  if (!hw) return null;
  if (
    hw === 'motorway' ||
    hw === 'motorway_link' ||
    hw === 'trunk' ||
    hw === 'trunk_link'
  ) {
    return 'highway';
  }
  if (
    hw === 'primary' ||
    hw === 'primary_link' ||
    hw === 'secondary' ||
    hw === 'secondary_link' ||
    hw === 'tertiary' ||
    hw === 'tertiary_link'
  ) {
    return 'main_road';
  }
  if (hw === 'cycleway') {
    return 'bicycle_lane';
  }
  if (
    hw === 'pedestrian' ||
    hw === 'footway' ||
    hw === 'path' ||
    hw === 'steps'
  ) {
    return 'pedestrian_street';
  }
  if (
    hw === 'residential' ||
    hw === 'living_street' ||
    hw === 'unclassified' ||
    hw === 'service' ||
    hw === 'road'
  ) {
    return 'local_street';
  }
  return null;
}

export function classifyOsmBuilding(tags: Record<string, string>): BuildingType {
  const b = (tags.building || '').toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const shop = tags.shop;

  if (b === 'apartments' || b === 'dormitory' || b === 'residential_apartments') {
    return 'apartment';
  }
  if (
    b === 'office' ||
    tags.office
  ) {
    return 'office';
  }
  if (
    b === 'commercial' ||
    b === 'retail' ||
    b === 'supermarket' ||
    b === 'hotel' ||
    Boolean(shop)
  ) {
    return 'commercial';
  }
  if (
    b === 'industrial' ||
    b === 'warehouse' ||
    b === 'factory' ||
    b === 'manufacture'
  ) {
    return 'industrial';
  }
  if (
    b === 'public' ||
    b === 'civic' ||
    b === 'school' ||
    b === 'university' ||
    b === 'college' ||
    b === 'hospital' ||
    b === 'government' ||
    b === 'church' ||
    b === 'cathedral' ||
    b === 'kindergarten' ||
    b === 'train_station' ||
    amenity === 'school' ||
    amenity === 'hospital' ||
    amenity === 'library' ||
    amenity === 'townhall' ||
    amenity === 'university'
  ) {
    return 'public';
  }
  return 'residential';
}

function parseOsmBuildingFloors(
  tags: Record<string, string>,
  type: BuildingType
): number {
  const levelsRaw = tags['building:levels'];
  if (levelsRaw) {
    const parsed = parseFloat(levelsRaw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(80, Math.round(parsed));
    }
  }
  const heightRaw = tags.height;
  if (heightRaw) {
    const parsed = parseFloat(heightRaw);
    if (Number.isFinite(parsed) && parsed >= 2) {
      return Math.max(1, Math.min(80, Math.round(parsed / 3.2)));
    }
  }
  return BUILDING_CONFIG[type].defaultFloors;
}

export function classifyOsmPublicSpace(
  tags: Record<string, string>
): PublicSpaceType | null {
  const leisure = tags.leisure;
  const landuse = tags.landuse;
  const place = tags.place;
  if (leisure === 'playground') return 'playground';
  if (
    leisure === 'pitch' ||
    leisure === 'sports_centre' ||
    leisure === 'stadium' ||
    leisure === 'track'
  ) {
    return 'sports_facility';
  }
  if (
    place === 'square' ||
    (tags.highway === 'pedestrian' && tags.area === 'yes') ||
    leisure === 'common'
  ) {
    return 'plaza';
  }
  if (
    leisure === 'park' ||
    leisure === 'garden' ||
    leisure === 'nature_reserve' ||
    landuse === 'grass' ||
    landuse === 'forest' ||
    landuse === 'recreation_ground' ||
    landuse === 'meadow' ||
    landuse === 'village_green'
  ) {
    return 'park';
  }
  return null;
}

export function collectExistingOsmIds(city: CityData): Set<string> {
  const ids = new Set<string>();
  const add = (osmId?: string) => {
    if (osmId) ids.add(osmId);
  };
  for (const r of city.roads) add(r.geo?.osmId);
  for (const b of city.buildings) add(b.geo?.osmId);
  for (const p of city.publicSpaces) add(p.geo?.osmId);
  for (const s of city.stations) add(s.geo?.osmId);
  for (const rt of city.routes) add(rt.geo?.osmId);
  for (const w of city.water || []) add(w.geo?.osmId);
  return ids;
}

export function convertOverpassToCityEntities(
  response: OverpassResponse,
  origin: GeoOrigin,
  categories: OsmImportCategories,
  existingOsmIds: Set<string> = new Set()
): OsmImportResult {
  const nodeLookup = new Map<number, GeoPoint>();
  for (const el of response.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeLookup.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const resolveElementGeometry = (el: OverpassElement): GeoPoint[] => {
    if (el.geometry && el.geometry.length > 0) {
      return el.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
    }
    if (el.nodes && el.nodes.length > 0) {
      const pts: GeoPoint[] = [];
      for (const nid of el.nodes) {
        const pt = nodeLookup.get(nid);
        if (pt) pts.push(pt);
      }
      return pts;
    }
    if (el.members && el.members.length > 0) {
      const outer = el.members.find((m) => m.role === 'outer' && m.geometry?.length) ||
        el.members.find((m) => m.geometry?.length);
      if (outer?.geometry) {
        return outer.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
      }
    }
    return [];
  };

  const roads: RoadSegment[] = [];
  const buildings: BuildingItem[] = [];
  const publicSpaces: PublicSpaceItem[] = [];
  const water: WaterFeature[] = [];
  const stations: TransitStation[] = [];
  const routes: TransitRoute[] = [];

  for (const el of response.elements) {
    const tags = el.tags || {};
    const osmId = `${el.type}/${el.id}`;
    if (existingOsmIds.has(osmId)) continue;

    // 1. Point nodes -> Transit stations / bus stops
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      if (!categories.transportation) continue;
      let stationType: TransitStationType | null = null;
      if (
        tags.station === 'subway' ||
        tags.subway === 'yes' ||
        (tags.railway === 'station' && tags.station === 'subway')
      ) {
        stationType = 'metro_station';
      } else if (tags.railway === 'station' || tags.railway === 'halt') {
        stationType = 'train_station';
      } else if (
        tags.highway === 'bus_stop' ||
        (tags.public_transport === 'platform' && tags.bus === 'yes') ||
        tags.amenity === 'bus_station'
      ) {
        stationType = 'bus_stop';
      }

      if (stationType) {
        const w = latLonToWorld(el.lat, el.lon, origin);
        stations.push({
          id: `osm-st-${el.id}`,
          type: stationType,
          name: tags.name || TRANSIT_STATION_CONFIG[stationType].defaultName,
          x: Math.round(w.x * 10) / 10,
          y: Math.round(w.y * 10) / 10,
          layerSource: 'existing',
          geo: {
            lat: el.lat,
            lon: el.lon,
            osmId,
            osmType: 'node',
            osmTags: tags,
          },
        });
      }
      continue;
    }

    const geoPts = resolveElementGeometry(el);
    if (geoPts.length < 2) continue;

    const worldPtsRaw = geoPts.map((g) => latLonToWorld(g.lat, g.lon, origin));
    const centroid = geoPolygonCentroid(geoPts);
    const bounds = geoPointsBounds(geoPts);

    // 2. Buildings (ways or outer relations)
    if (categories.buildings && tags.building && geoPts.length >= 3) {
      const bType = classifyOsmBuilding(tags);
      const cfg = BUILDING_CONFIG[bType];
      const metrics = extractPolygonMetrics(worldPtsRaw);
      buildings.push({
        id: `osm-bld-${el.type}-${el.id}`,
        type: bType,
        name: tags.name || tags['addr:housename'] || cfg.defaultName,
        x: metrics.cx,
        y: metrics.cy,
        width: metrics.width,
        height: metrics.height,
        rotation: metrics.rotationDeg,
        floors: parseOsmBuildingFloors(tags, bType),
        zone: cfg.defaultZone,
        usage: cfg.defaultUsage,
        footprint: metrics.localFootprint,
        layerSource: 'existing',
        geo: {
          lat: centroid.lat,
          lon: centroid.lon,
          osmId,
          osmType: el.type,
          osmTags: tags,
          geometry: geoPts,
          bounds,
        },
      });
      continue;
    }

    // 3. Natural & Water features
    if (categories.natural) {
      if (
        (tags.natural === 'water' || tags.landuse === 'reservoir' || tags.water) &&
        geoPts.length >= 3
      ) {
        const simplified = simplifyWorldPolyline(worldPtsRaw, 2.0);
        water.push({
          id: `osm-water-${el.type}-${el.id}`,
          name: tags.name || 'Water Body',
          points: simplified,
          width: 24,
          isArea: true,
          layerSource: 'existing',
          geo: {
            lat: centroid.lat,
            lon: centroid.lon,
            osmId,
            osmType: el.type,
            osmTags: tags,
            geometry: geoPts,
            bounds,
          },
        });
        continue;
      }

      if (tags.waterway && (tags.waterway === 'river' || tags.waterway === 'stream' || tags.waterway === 'canal')) {
        const simplified = simplifyWorldPolyline(worldPtsRaw, 2.0);
        const wWidth =
          tags.waterway === 'river' ? 42 : tags.waterway === 'canal' ? 28 : 14;
        water.push({
          id: `osm-river-${el.type}-${el.id}`,
          name: tags.name || 'Waterway',
          points: simplified,
          width: wWidth,
          isArea: false,
          layerSource: 'existing',
          geo: {
            lat: centroid.lat,
            lon: centroid.lon,
            osmId,
            osmType: el.type,
            osmTags: tags,
            geometry: geoPts,
            bounds,
          },
        });
        continue;
      }

      const psType = classifyOsmPublicSpace(tags);
      if (psType && geoPts.length >= 3) {
        const cfg = PUBLIC_SPACE_CONFIG[psType];
        const metrics = extractPolygonMetrics(worldPtsRaw);
        publicSpaces.push({
          id: `osm-ps-${el.type}-${el.id}`,
          type: psType,
          name: tags.name || cfg.defaultName,
          x: metrics.cx,
          y: metrics.cy,
          width: metrics.width,
          height: metrics.height,
          rotation: metrics.rotationDeg,
          footprint: metrics.localFootprint,
          layerSource: 'existing',
          geo: {
            lat: centroid.lat,
            lon: centroid.lon,
            osmId,
            osmType: el.type,
            osmTags: tags,
            geometry: geoPts,
            bounds,
          },
        });
        continue;
      }
    }

    // 4. Transportation lines (railways & subway)
    if (categories.transportation && tags.railway) {
      const rw = tags.railway;
      if (
        rw === 'rail' ||
        rw === 'light_rail' ||
        rw === 'subway' ||
        rw === 'tram' ||
        rw === 'narrow_gauge'
      ) {
        const lineType = rw === 'subway' ? 'metro_line' : 'railway';
        const cfg = TRANSIT_LINE_CONFIG[lineType];
        routes.push({
          id: `osm-rt-${el.type}-${el.id}`,
          type: lineType,
          name: tags.name || cfg.defaultName,
          color: cfg.defaultColor,
          points: simplifyWorldPolyline(worldPtsRaw, 1.5),
          stationIds: [],
          layerSource: 'existing',
          geo: {
            lat: centroid.lat,
            lon: centroid.lon,
            osmId,
            osmType: el.type,
            osmTags: tags,
            geometry: geoPts,
            bounds,
          },
        });
        continue;
      }
    }

    // 5. Roads (highways)
    if (categories.roads && tags.highway) {
      // Skip pedestrian areas already captured as plazas
      if (tags.area === 'yes' && tags.highway === 'pedestrian') continue;
      const roadType = classifyOsmRoad(tags);
      if (roadType) {
        const cfg = ROAD_CONFIG[roadType];
        roads.push({
          id: `osm-rd-${el.type}-${el.id}`,
          type: roadType,
          name: tags.name || tags.ref || cfg.defaultName,
          width: cfg.defaultWidth,
          points: simplifyWorldPolyline(worldPtsRaw, 1.2),
          layerSource: 'existing',
          geo: {
            lat: centroid.lat,
            lon: centroid.lon,
            osmId,
            osmType: el.type,
            osmTags: tags,
            geometry: geoPts,
            bounds,
          },
        });
      }
    }
  }

  const total =
    roads.length +
    buildings.length +
    publicSpaces.length +
    water.length +
    stations.length +
    routes.length;

  return {
    roads,
    buildings,
    publicSpaces,
    water,
    stations,
    routes,
    counts: {
      roads: roads.length,
      buildings: buildings.length,
      publicSpaces: publicSpaces.length,
      water: water.length,
      stations: stations.length,
      routes: routes.length,
      total,
    },
  };
}

export function mergeImportedEntitiesIntoCity(
  city: CityData,
  imported: OsmImportResult,
  bounds?: GeoBounds
): CityData {
  return {
    ...city,
    attribution: city.attribution || '© OpenStreetMap contributors',
    importedBounds: bounds
      ? [...(city.importedBounds || []), bounds]
      : city.importedBounds,
    roads: [...city.roads, ...imported.roads],
    buildings: [...city.buildings, ...imported.buildings],
    publicSpaces: [...city.publicSpaces, ...imported.publicSpaces],
    water: [...(city.water || []), ...imported.water],
    stations: [...city.stations, ...imported.stations],
    routes: [...city.routes, ...imported.routes],
  };
}
