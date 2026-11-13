import { BUILDING_CONFIG, METERS_PER_UNIT } from '../data/catalog';
import { BuildingItem, BuildingType, CityBlock, Point } from '../types/city';
import { distanceBetween, pointInPolygon } from './geometry';

export function createRectBlockPoints(
  x: number,
  y: number,
  width: number,
  height: number
): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function polygonAreaM2(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  const worldArea = Math.abs(area) / 2;
  return Math.round(worldArea * METERS_PER_UNIT * METERS_PER_UNIT);
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** Finds primary orientation angle (radians) along the longest edge of the block */
export function getBlockPrimaryAngleRad(points: Point[]): number {
  if (points.length < 2) return 0;
  let bestLen = -1;
  let bestAngle = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = distanceBetween(a, b);
    if (len > bestLen) {
      bestLen = len;
      bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  return bestAngle;
}

/**
 * Subdivides a rectangular or polygonal CityBlock into smaller parcel lots
 * aligned to the block's primary street edge.
 */
export function subdivideBlockIntoLots(block: CityBlock): Point[][] {
  if (block.points.length < 3) return [];
  const angle = getBlockPrimaryAngleRad(block.points);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const invCos = Math.cos(angle);
  const invSin = Math.sin(angle);
  const origin = polygonCentroid(block.points);

  const toLocal = (p: Point): Point => {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const toWorld = (p: Point): Point => ({
    x: origin.x + p.x * invCos - p.y * invSin,
    y: origin.y + p.x * invSin + p.y * invCos,
  });

  const localPoly = block.points.map(toLocal);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of localPoly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const setback = Math.max(0, Math.min(20, block.setback ?? 8));
  const innerMinX = minX + setback;
  const innerMaxX = maxX - setback;
  const innerMinY = minY + setback;
  const innerMaxY = maxY - setback;

  const availW = innerMaxX - innerMinX;
  const availH = innerMaxY - innerMinY;
  if (availW < 24 || availH < 24) return [];

  const targetLotW = Math.max(30, block.lotTargetWidth || 52);
  const targetLotH = Math.max(34, Math.min(72, targetLotW * 1.15));

  const cols = Math.max(1, Math.round(availW / targetLotW));
  const rows = Math.max(1, Math.round(availH / targetLotH));
  const lotW = availW / cols;
  const lotH = availH / rows;

  const lots: Point[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx0 = innerMinX + c * lotW;
      const ly0 = innerMinY + r * lotH;
      const lx1 = lx0 + lotW;
      const ly1 = ly0 + lotH;

      const cornersWorld = [
        toWorld({ x: lx0, y: ly0 }),
        toWorld({ x: lx1, y: ly0 }),
        toWorld({ x: lx1, y: ly1 }),
        toWorld({ x: lx0, y: ly1 }),
      ];

      const centerWorld = toWorld({
        x: (lx0 + lx1) / 2,
        y: (ly0 + ly1) / 2,
      });

      // Keep lot if its center and at least 3 corners lie inside the block polygon
      if (pointInPolygon(centerWorld, block.points)) {
        const cornersInside = cornersWorld.filter((pt) =>
          pointInPolygon(pt, block.points)
        ).length;
        if (cornersInside >= 3) {
          lots.push(cornersWorld);
        }
      }
    }
  }

  return lots;
}

/**
 * Generates oriented buildings inside each subdivided lot based on neighborhood type.
 */
export function generateBuildingsForBlock(
  block: CityBlock,
  lots: Point[][]
): BuildingItem[] {
  const angleRad = getBlockPrimaryAngleRad(block.points);
  let angleDeg = Math.round((angleRad * 180) / Math.PI);
  // Normalize cleanly
  angleDeg = ((angleDeg % 360) + 360) % 360;

  const buildings: BuildingItem[] = [];

  lots.forEach((lot, idx) => {
    const center = polygonCentroid(lot);
    const lotW = distanceBetween(lot[0], lot[1]);
    const lotH = distanceBetween(lot[1], lot[2]);
    const margin = Math.max(6, Math.min(lotW, lotH) * 0.22);
    const bW = Math.max(20, Math.round(lotW - margin));
    const bH = Math.max(18, Math.round(lotH - margin));

    let type: BuildingType = 'residential';
    let floors = 2;

    if (block.neighborhoodType === 'residential') {
      type = idx % 4 === 0 && bW >= 34 ? 'apartment' : 'residential';
      floors = type === 'apartment' ? 5 + (idx % 3) : 2 + (idx % 2);
    } else if (block.neighborhoodType === 'commercial') {
      type = idx % 3 === 0 ? 'office' : 'commercial';
      floors = type === 'office' ? 8 + (idx % 5) : 3 + (idx % 2);
    } else {
      // Mixed-use neighborhood
      const mod = idx % 4;
      if (mod === 0) {
        type = 'commercial';
        floors = 3;
      } else if (mod === 1) {
        type = 'apartment';
        floors = 6;
      } else if (mod === 2) {
        type = 'office';
        floors = 7;
      } else {
        type = 'public';
        floors = 3;
      }
    }

    const cfg = BUILDING_CONFIG[type];
    buildings.push({
      id: `bld-blk-${block.id}-${idx}-${Date.now().toString(36).slice(-4)}`,
      type,
      name: `${block.name} #${idx + 1}`,
      x: Math.round(center.x * 10) / 10,
      y: Math.round(center.y * 10) / 10,
      width: Math.min(bW, cfg.defaultWidth * 1.4),
      height: Math.min(bH, cfg.defaultHeight * 1.4),
      rotation: angleDeg,
      floors,
      zone:
        block.neighborhoodType === 'residential'
          ? 'residential'
          : block.neighborhoodType === 'commercial'
            ? 'commercial'
            : 'mixed_use',
      usage: cfg.defaultUsage,
    });
  });

  return buildings;
}
