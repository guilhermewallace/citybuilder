import { GRID_SIZE, METERS_PER_UNIT } from '../data/catalog';
import {
  CameraState,
  CityData,
  LayerSource,
  LayerVisibility,
  Point,
  RoadSegment,
  SelectedEntity,
  TransitStation,
} from '../types/city';

export function snapValue(val: number, gridSize: number = GRID_SIZE): number {
  return Math.round(val / gridSize) * gridSize;
}

export function snapPointToGrid(
  point: Point,
  enabled: boolean,
  gridSize: number = GRID_SIZE
): Point {
  if (!enabled) return point;
  return {
    x: snapValue(point.x, gridSize),
    y: snapValue(point.y, gridSize),
  };
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const closest = closestPointOnSegment(p, a, b);
  return distanceBetween(p, closest);
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function evaluateQuadraticBezier(
  p0: Point,
  cp: Point,
  p1: Point,
  t: number
): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
  };
}

/** Computes quadratic Bezier control point so the curve at t=0.5 passes through desiredMidpoint */
export function computeControlPointFromMidpoint(
  p0: Point,
  p1: Point,
  desiredMidpoint: Point
): Point {
  return {
    x: 2 * desiredMidpoint.x - 0.5 * (p0.x + p1.x),
    y: 2 * desiredMidpoint.y - 0.5 * (p0.y + p1.y),
  };
}

export function getRoadMidpointHandle(road: RoadSegment, segIndex: number): Point {
  const p0 = road.points[segIndex];
  const p1 = road.points[segIndex + 1];
  const cp = road.controlPoints?.[segIndex];
  if (cp) {
    return evaluateQuadraticBezier(p0, cp, p1, 0.5);
  }
  return { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
}

export function sampleRoadPoints(road: RoadSegment, stepsPerCurve = 12): Point[] {
  if (road.points.length < 2) return [...road.points];
  const sampled: Point[] = [road.points[0]];
  for (let i = 0; i < road.points.length - 1; i++) {
    const p0 = road.points[i];
    const p1 = road.points[i + 1];
    const cp = road.controlPoints?.[i];
    if (cp) {
      for (let s = 1; s <= stepsPerCurve; s++) {
        sampled.push(evaluateQuadraticBezier(p0, cp, p1, s / stepsPerCurve));
      }
    } else {
      sampled.push(p1);
    }
  }
  return sampled;
}

export function distancePointToPolyline(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distanceBetween(p, points[0]);
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distancePointToSegment(p, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export function computePolylineLengthUnits(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distanceBetween(points[i], points[i + 1]);
  }
  return total;
}

export function computeRoadLengthMeters(road: RoadSegment): number {
  return computePolylineLengthUnits(sampleRoadPoints(road)) * METERS_PER_UNIT;
}

export function computePolylineLengthMeters(points: Point[]): number {
  return computePolylineLengthUnits(points) * METERS_PER_UNIT;
}

export function pointInRotatedRect(
  p: Point,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDeg: number
): boolean {
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - centerX;
  const dy = p.y - centerY;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}

export function pointInRotatedFootprint(
  p: Point,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  rotationDeg: number,
  footprint?: Point[]
): boolean {
  if (!footprint || footprint.length < 3) {
    return pointInRotatedRect(p, centerX, centerY, width, height, rotationDeg);
  }
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - centerX;
  const dy = p.y - centerY;
  const localPt = {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
  return pointInPolygon(localPt, footprint);
}

export function pointInPolygon(pt: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function snapRoadPoint(
  rawPoint: Point,
  roads: RoadSegment[],
  snapEnabled: boolean,
  snapRadius: number = 14,
  ignoreRoadId?: string
): {
  point: Point;
  snappedToEndpoint: boolean;
  snapKind: 'endpoint' | 'edge' | 'grid' | 'none';
} {
  // 1. Existing road endpoints / vertices
  let closestDist = snapRadius;
  let closestPoint: Point | null = null;
  for (const road of roads) {
    if (road.id === ignoreRoadId) continue;
    for (const pt of road.points) {
      const d = distanceBetween(rawPoint, pt);
      if (d <= closestDist) {
        closestDist = d;
        closestPoint = pt;
      }
    }
  }
  if (closestPoint) {
    return {
      point: { ...closestPoint },
      snappedToEndpoint: true,
      snapKind: 'endpoint',
    };
  }

  // 2. Existing road edges (T-junction / intersection snapping)
  let edgeDist = snapRadius;
  let edgePoint: Point | null = null;
  for (const road of roads) {
    if (road.id === ignoreRoadId) continue;
    const sampled = sampleRoadPoints(road, 10);
    for (let i = 0; i < sampled.length - 1; i++) {
      const candidate = closestPointOnSegment(rawPoint, sampled[i], sampled[i + 1]);
      const d = distanceBetween(rawPoint, candidate);
      if (d <= edgeDist) {
        edgeDist = d;
        edgePoint = candidate;
      }
    }
  }
  if (edgePoint) {
    return {
      point: {
        x: Math.round(edgePoint.x * 10) / 10,
        y: Math.round(edgePoint.y * 10) / 10,
      },
      snappedToEndpoint: true,
      snapKind: 'edge',
    };
  }

  // 3. Grid snap
  return {
    point: snapPointToGrid(rawPoint, snapEnabled),
    snappedToEndpoint: false,
    snapKind: snapEnabled ? 'grid' : 'none',
  };
}

export interface SegmentIntersectionResult {
  point: Point;
  tA: number;
  tB: number;
}

export function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): SegmentIntersectionResult | null {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;

  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-6) return null; // Parallel or collinear

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const tA = (dx * dby - dy * dbx) / denom;
  const tB = (dx * day - dy * dax) / denom;

  if (tA >= -0.001 && tA <= 1.001 && tB >= -0.001 && tB <= 1.001) {
    const clampedTA = Math.max(0, Math.min(1, tA));
    const clampedTB = Math.max(0, Math.min(1, tB));
    return {
      point: {
        x: Math.round((a1.x + clampedTA * dax) * 100) / 100,
        y: Math.round((a1.y + clampedTA * day) * 100) / 100,
      },
      tA: clampedTA,
      tB: clampedTB,
    };
  }
  return null;
}

export interface RoadIntersection {
  point: Point;
  roadAId: string;
  roadBId: string;
}

export function findRoadIntersections(roads: RoadSegment[]): RoadIntersection[] {
  const results: RoadIntersection[] = [];
  const addUnique = (pt: Point, roadAId: string, roadBId: string) => {
    const exists = results.some(
      (r) =>
        distanceBetween(r.point, pt) < 3 &&
        ((r.roadAId === roadAId && r.roadBId === roadBId) ||
          (r.roadAId === roadBId && r.roadBId === roadAId))
    );
    if (!exists) {
      results.push({ point: pt, roadAId, roadBId });
    }
  };

  for (let i = 0; i < roads.length; i++) {
    const ptsA = sampleRoadPoints(roads[i], 10);
    for (let j = i + 1; j < roads.length; j++) {
      const ptsB = sampleRoadPoints(roads[j], 10);
      for (let sa = 0; sa < ptsA.length - 1; sa++) {
        for (let sb = 0; sb < ptsB.length - 1; sb++) {
          const hit = segmentIntersection(
            ptsA[sa],
            ptsA[sa + 1],
            ptsB[sb],
            ptsB[sb + 1]
          );
          if (hit) {
            addUnique(hit.point, roads[i].id, roads[j].id);
          }
        }
      }
    }
  }
  return results;
}

export function findNearestStation(
  rawPoint: Point,
  stations: TransitStation[],
  snapRadius: number = 22
): TransitStation | null {
  let best: TransitStation | null = null;
  let bestDist = snapRadius;
  for (const st of stations) {
    const d = distanceBetween(rawPoint, { x: st.x, y: st.y });
    if (d <= bestDist) {
      bestDist = d;
      best = st;
    }
  }
  return best;
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  camera: CameraState
): Point {
  return {
    x: camera.x + (screenX - viewportWidth / 2) / camera.zoom,
    y: camera.y + (screenY - viewportHeight / 2) / camera.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  viewportWidth: number,
  viewportHeight: number,
  camera: CameraState
): Point {
  return {
    x: (worldX - camera.x) * camera.zoom + viewportWidth / 2,
    y: (worldY - camera.y) * camera.zoom + viewportHeight / 2,
  };
}

function isLayerSourceVisible(
  source: LayerSource | undefined,
  layers?: Partial<LayerVisibility>
): boolean {
  if (!layers) return true;
  if (source === 'existing') return layers.existing !== false;
  return layers.proposed !== false;
}

export function hitTestCity(
  worldPt: Point,
  city: CityData,
  zoom: number,
  layers?: Partial<LayerVisibility>
): SelectedEntity | null {
  const stationHitRadius = Math.max(12, 14 / zoom);
  // 1. Transit stations
  if (!layers || layers.transit !== false) {
    for (let i = city.stations.length - 1; i >= 0; i--) {
      const st = city.stations[i];
      if (!isLayerSourceVisible(st.layerSource, layers)) continue;
      if (distanceBetween(worldPt, { x: st.x, y: st.y }) <= stationHitRadius) {
        return { category: 'station', id: st.id };
      }
    }
  }

  // 2. Buildings
  if (!layers || layers.buildings !== false) {
    for (let i = city.buildings.length - 1; i >= 0; i--) {
      const b = city.buildings[i];
      if (!isLayerSourceVisible(b.layerSource, layers)) continue;
      if (
        pointInRotatedFootprint(
          worldPt,
          b.x,
          b.y,
          b.width,
          b.height,
          b.rotation,
          b.footprint
        )
      ) {
        return { category: 'building', id: b.id };
      }
    }
  }

  // 3. Transit routes
  if (!layers || layers.transit !== false) {
    const routeHitDist = Math.max(8, 9 / zoom);
    for (let i = city.routes.length - 1; i >= 0; i--) {
      const r = city.routes[i];
      if (!isLayerSourceVisible(r.layerSource, layers)) continue;
      if (distancePointToPolyline(worldPt, r.points) <= routeHitDist) {
        return { category: 'route', id: r.id };
      }
    }
  }

  // 4. Roads (including curved roads via sampling)
  if (!layers || layers.roads !== false) {
    for (let i = city.roads.length - 1; i >= 0; i--) {
      const road = city.roads[i];
      if (!isLayerSourceVisible(road.layerSource, layers)) continue;
      const hitTol = Math.max(road.width / 2 + 4, 10 / zoom);
      if (distancePointToPolyline(worldPt, sampleRoadPoints(road, 12)) <= hitTol) {
        return { category: 'road', id: road.id };
      }
    }
  }

  // 5. Public spaces
  if (!layers || layers.publicSpaces !== false) {
    for (let i = city.publicSpaces.length - 1; i >= 0; i--) {
      const ps = city.publicSpaces[i];
      if (!isLayerSourceVisible(ps.layerSource, layers)) continue;
      if (
        pointInRotatedFootprint(
          worldPt,
          ps.x,
          ps.y,
          ps.width,
          ps.height,
          ps.rotation,
          ps.footprint
        )
      ) {
        return { category: 'public_space', id: ps.id };
      }
    }
  }

  // 6. City Blocks
  if (!layers || layers.blocks !== false) {
    const blocks = city.blocks || [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (!isLayerSourceVisible(blocks[i].layerSource, layers)) continue;
      if (pointInPolygon(worldPt, blocks[i].points)) {
        return { category: 'block', id: blocks[i].id };
      }
    }
  }

  // 7. Zones (lowest priority background layer)
  if (!layers || layers.zones !== false) {
    for (let i = city.zones.length - 1; i >= 0; i--) {
      const z = city.zones[i];
      if (!isLayerSourceVisible(z.layerSource, layers)) continue;
      if (
        worldPt.x >= z.x &&
        worldPt.x <= z.x + z.width &&
        worldPt.y >= z.y &&
        worldPt.y <= z.y + z.height
      ) {
        return { category: 'zone', id: z.id };
      }
    }
  }

  return null;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export function getEntityBoundingBox(
  entity: SelectedEntity,
  city: CityData
): BoundingBox | null {
  const fromPoints = (pts: Point[], pad = 0): BoundingBox | null => {
    if (pts.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x - pad < minX) minX = p.x - pad;
      if (p.y - pad < minY) minY = p.y - pad;
      if (p.x + pad > maxX) maxX = p.x + pad;
      if (p.y + pad > maxY) maxY = p.y + pad;
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  switch (entity.category) {
    case 'building': {
      const b = city.buildings.find((item) => item.id === entity.id);
      if (!b) return null;
      const rad = (b.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = b.width * cos + b.height * sin;
      const h = b.width * sin + b.height * cos;
      return {
        minX: b.x - w / 2,
        minY: b.y - h / 2,
        maxX: b.x + w / 2,
        maxY: b.y + h / 2,
        cx: b.x,
        cy: b.y,
        width: w,
        height: h,
      };
    }
    case 'public_space': {
      const ps = city.publicSpaces.find((item) => item.id === entity.id);
      if (!ps) return null;
      const rad = (ps.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = ps.width * cos + ps.height * sin;
      const h = ps.width * sin + ps.height * cos;
      return {
        minX: ps.x - w / 2,
        minY: ps.y - h / 2,
        maxX: ps.x + w / 2,
        maxY: ps.y + h / 2,
        cx: ps.x,
        cy: ps.y,
        width: w,
        height: h,
      };
    }
    case 'zone': {
      const z = city.zones.find((item) => item.id === entity.id);
      if (!z) return null;
      return {
        minX: z.x,
        minY: z.y,
        maxX: z.x + z.width,
        maxY: z.y + z.height,
        cx: z.x + z.width / 2,
        cy: z.y + z.height / 2,
        width: z.width,
        height: z.height,
      };
    }
    case 'station': {
      const s = city.stations.find((item) => item.id === entity.id);
      if (!s) return null;
      return {
        minX: s.x - 10,
        minY: s.y - 10,
        maxX: s.x + 10,
        maxY: s.y + 10,
        cx: s.x,
        cy: s.y,
        width: 20,
        height: 20,
      };
    }
    case 'road': {
      const r = city.roads.find((item) => item.id === entity.id);
      if (!r) return null;
      return fromPoints(sampleRoadPoints(r, 8), r.width / 2);
    }
    case 'route': {
      const rt = city.routes.find((item) => item.id === entity.id);
      if (!rt) return null;
      return fromPoints(rt.points, 4);
    }
    case 'block': {
      const bl = (city.blocks || []).find((item) => item.id === entity.id);
      if (!bl) return null;
      return fromPoints(bl.points, 0);
    }
  }
}

export function boxesIntersect(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY
  );
}

export function getEntitiesInSelectionBox(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  city: CityData,
  layers?: Partial<LayerVisibility>
): SelectedEntity[] {
  const hits: SelectedEntity[] = [];
  const check = (
    category: SelectedEntity['category'],
    id: string,
    source?: LayerSource
  ) => {
    if (!isLayerSourceVisible(source, layers)) return;
    const bb = getEntityBoundingBox({ category, id }, city);
    if (bb && boxesIntersect(box, bb)) {
      hits.push({ category, id });
    }
  };

  if (!layers || layers.buildings !== false) {
    for (const b of city.buildings) check('building', b.id, b.layerSource);
  }
  if (!layers || layers.publicSpaces !== false) {
    for (const ps of city.publicSpaces) check('public_space', ps.id, ps.layerSource);
  }
  if (!layers || layers.transit !== false) {
    for (const st of city.stations) check('station', st.id, st.layerSource);
    for (const rt of city.routes) check('route', rt.id, rt.layerSource);
  }
  if (!layers || layers.roads !== false) {
    for (const r of city.roads) check('road', r.id, r.layerSource);
  }
  if (!layers || layers.blocks !== false) {
    for (const bl of city.blocks || []) check('block', bl.id, bl.layerSource);
  }

  return hits;
}

export function getCityBounds(city: CityData): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expand = (x: number, y: number, pad = 0) => {
    if (x - pad < minX) minX = x - pad;
    if (y - pad < minY) minY = y - pad;
    if (x + pad > maxX) maxX = x + pad;
    if (y + pad > maxY) maxY = y + pad;
  };

  for (const r of city.roads) {
    for (const p of sampleRoadPoints(r, 8)) expand(p.x, p.y, r.width);
  }
  for (const b of city.buildings) {
    const rad = Math.max(b.width, b.height) * 0.75;
    expand(b.x, b.y, rad);
  }
  for (const ps of city.publicSpaces) {
    const rad = Math.max(ps.width, ps.height) * 0.75;
    expand(ps.x, ps.y, rad);
  }
  for (const z of city.zones) {
    expand(z.x, z.y, 0);
    expand(z.x + z.width, z.y + z.height, 0);
  }
  for (const bl of city.blocks || []) {
    for (const p of bl.points) expand(p.x, p.y, 0);
  }
  for (const s of city.stations) {
    expand(s.x, s.y, 20);
  }
  for (const rt of city.routes) {
    for (const p of rt.points) expand(p.x, p.y, 12);
  }

  if (!Number.isFinite(minX)) {
    return { minX: -400, minY: -300, maxX: 400, maxY: 300 };
  }

  return { minX, minY, maxX, maxY };
}
