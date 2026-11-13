import {
  CityBlock,
  CityData,
  Point,
  RoadSegment,
  SelectedEntity,
} from '../types/city';
import {
  distanceBetween,
  getEntityBoundingBox,
  sampleRoadPoints,
  segmentIntersection,
} from './geometry';

export function selectionKey(item: SelectedEntity): string {
  return `${item.category}:${item.id}`;
}

export function isEntitySelected(
  selectedItems: SelectedEntity[],
  category: SelectedEntity['category'],
  id: string
): boolean {
  return selectedItems.some((s) => s.category === category && s.id === id);
}

export function getEntityGroupId(
  entity: SelectedEntity,
  city: CityData
): string | undefined {
  switch (entity.category) {
    case 'building':
      return city.buildings.find((b) => b.id === entity.id)?.groupId;
    case 'road':
      return city.roads.find((r) => r.id === entity.id)?.groupId;
    case 'zone':
      return city.zones.find((z) => z.id === entity.id)?.groupId;
    case 'block':
      return (city.blocks || []).find((bl) => bl.id === entity.id)?.groupId;
    case 'public_space':
      return city.publicSpaces.find((p) => p.id === entity.id)?.groupId;
    case 'station':
      return city.stations.find((s) => s.id === entity.id)?.groupId;
    case 'route':
      return city.routes.find((rt) => rt.id === entity.id)?.groupId;
  }
}

export function expandSelectionWithGroups(
  items: SelectedEntity[],
  city: CityData
): SelectedEntity[] {
  const groupIds = new Set<string>();
  for (const item of items) {
    const gid = getEntityGroupId(item, city);
    if (gid) groupIds.add(gid);
  }
  if (groupIds.size === 0) return items;

  const map = new Map<string, SelectedEntity>();
  for (const item of items) map.set(selectionKey(item), item);

  const addIfGrouped = (
    category: SelectedEntity['category'],
    id: string,
    groupId?: string
  ) => {
    if (groupId && groupIds.has(groupId)) {
      map.set(`${category}:${id}`, { category, id });
    }
  };

  for (const b of city.buildings) addIfGrouped('building', b.id, b.groupId);
  for (const r of city.roads) addIfGrouped('road', r.id, r.groupId);
  for (const z of city.zones) addIfGrouped('zone', z.id, z.groupId);
  for (const bl of city.blocks || []) addIfGrouped('block', bl.id, bl.groupId);
  for (const p of city.publicSpaces) addIfGrouped('public_space', p.id, p.groupId);
  for (const s of city.stations) addIfGrouped('station', s.id, s.groupId);
  for (const rt of city.routes) addIfGrouped('route', rt.id, rt.groupId);

  return Array.from(map.values());
}

export function moveSelectedEntities(
  city: CityData,
  items: SelectedEntity[],
  dx: number,
  dy: number
): CityData {
  if (items.length === 0 || (dx === 0 && dy === 0)) return city;
  const keys = new Set(items.map(selectionKey));

  const shiftPt = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

  return {
    ...city,
    buildings: city.buildings.map((b) =>
      keys.has(`building:${b.id}`) ? { ...b, x: b.x + dx, y: b.y + dy } : b
    ),
    publicSpaces: city.publicSpaces.map((ps) =>
      keys.has(`public_space:${ps.id}`)
        ? { ...ps, x: ps.x + dx, y: ps.y + dy }
        : ps
    ),
    zones: city.zones.map((z) =>
      keys.has(`zone:${z.id}`) ? { ...z, x: z.x + dx, y: z.y + dy } : z
    ),
    stations: city.stations.map((s) =>
      keys.has(`station:${s.id}`) ? { ...s, x: s.x + dx, y: s.y + dy } : s
    ),
    roads: city.roads.map((r) =>
      keys.has(`road:${r.id}`)
        ? {
            ...r,
            points: r.points.map(shiftPt),
            controlPoints: r.controlPoints?.map((cp) => (cp ? shiftPt(cp) : null)),
          }
        : r
    ),
    routes: city.routes.map((rt) =>
      keys.has(`route:${rt.id}`)
        ? { ...rt, points: rt.points.map(shiftPt) }
        : rt
    ),
    blocks: (city.blocks || []).map((bl) =>
      keys.has(`block:${bl.id}`)
        ? {
            ...bl,
            points: bl.points.map(shiftPt),
            subdividedLots: bl.subdividedLots?.map((lot) => lot.map(shiftPt)),
          }
        : bl
    ),
  };
}

export function deleteSelectedEntities(
  city: CityData,
  items: SelectedEntity[]
): CityData {
  if (items.length === 0) return city;
  const keys = new Set(items.map(selectionKey));
  return {
    ...city,
    buildings: city.buildings.filter((b) => !keys.has(`building:${b.id}`)),
    roads: city.roads.filter((r) => !keys.has(`road:${r.id}`)),
    zones: city.zones.filter((z) => !keys.has(`zone:${z.id}`)),
    blocks: (city.blocks || []).filter((bl) => !keys.has(`block:${bl.id}`)),
    publicSpaces: city.publicSpaces.filter(
      (p) => !keys.has(`public_space:${p.id}`)
    ),
    stations: city.stations.filter((s) => !keys.has(`station:${s.id}`)),
    routes: city.routes.filter((rt) => !keys.has(`route:${rt.id}`)),
  };
}

export function cloneSelectedEntities(
  city: CityData,
  items: SelectedEntity[],
  offset: Point = { x: 24, y: 24 }
): { nextCity: CityData; clonedItems: SelectedEntity[] } {
  if (items.length === 0) return { nextCity: city, clonedItems: [] };
  const keys = new Set(items.map(selectionKey));
  const clonedItems: SelectedEntity[] = [];
  const stamp = Date.now().toString(36);
  let seq = 1;
  const uid = (prefix: string) => `${prefix}-${stamp}-${seq++}`;
  const shiftPt = (p: Point): Point => ({ x: p.x + offset.x, y: p.y + offset.y });

  const newBuildings = [...city.buildings];
  for (const b of city.buildings) {
    if (keys.has(`building:${b.id}`)) {
      const id = uid('bld');
      newBuildings.push({
        ...b,
        id,
        name: `${b.name} Copy`,
        x: b.x + offset.x,
        y: b.y + offset.y,
        groupId: undefined,
        layerSource: 'proposed',
        geo: b.geo ? { ...b.geo, osmId: undefined } : undefined,
      });
      clonedItems.push({ category: 'building', id });
    }
  }

  const newPublicSpaces = [...city.publicSpaces];
  for (const ps of city.publicSpaces) {
    if (keys.has(`public_space:${ps.id}`)) {
      const id = uid('ps');
      newPublicSpaces.push({
        ...ps,
        id,
        name: `${ps.name} Copy`,
        x: ps.x + offset.x,
        y: ps.y + offset.y,
        groupId: undefined,
        layerSource: 'proposed',
        geo: ps.geo ? { ...ps.geo, osmId: undefined } : undefined,
      });
      clonedItems.push({ category: 'public_space', id });
    }
  }

  const newZones = [...city.zones];
  for (const z of city.zones) {
    if (keys.has(`zone:${z.id}`)) {
      const id = uid('zone');
      newZones.push({
        ...z,
        id,
        name: `${z.name} Copy`,
        x: z.x + offset.x,
        y: z.y + offset.y,
        groupId: undefined,
      });
      clonedItems.push({ category: 'zone', id });
    }
  }

  const newBlocks: CityBlock[] = [...(city.blocks || [])];
  for (const bl of city.blocks || []) {
    if (keys.has(`block:${bl.id}`)) {
      const id = uid('blk');
      newBlocks.push({
        ...bl,
        id,
        name: `${bl.name} Copy`,
        points: bl.points.map(shiftPt),
        subdividedLots: bl.subdividedLots?.map((lot) => lot.map(shiftPt)),
        groupId: undefined,
      });
      clonedItems.push({ category: 'block', id });
    }
  }

  const newRoads = [...city.roads];
  for (const r of city.roads) {
    if (keys.has(`road:${r.id}`)) {
      const id = uid('road');
      newRoads.push({
        ...r,
        id,
        name: `${r.name} Copy`,
        points: r.points.map(shiftPt),
        controlPoints: r.controlPoints?.map((cp) => (cp ? shiftPt(cp) : null)),
        groupId: undefined,
        layerSource: 'proposed',
        geo: r.geo ? { ...r.geo, osmId: undefined } : undefined,
      });
      clonedItems.push({ category: 'road', id });
    }
  }

  const newStations = [...city.stations];
  for (const s of city.stations) {
    if (keys.has(`station:${s.id}`)) {
      const id = uid('st');
      newStations.push({
        ...s,
        id,
        name: `${s.name} Copy`,
        x: s.x + offset.x,
        y: s.y + offset.y,
        groupId: undefined,
      });
      clonedItems.push({ category: 'station', id });
    }
  }

  const newRoutes = [...city.routes];
  for (const rt of city.routes) {
    if (keys.has(`route:${rt.id}`)) {
      const id = uid('rt');
      newRoutes.push({
        ...rt,
        id,
        name: `${rt.name} Copy`,
        points: rt.points.map(shiftPt),
        groupId: undefined,
      });
      clonedItems.push({ category: 'route', id });
    }
  }

  return {
    nextCity: {
      ...city,
      buildings: newBuildings,
      publicSpaces: newPublicSpaces,
      zones: newZones,
      blocks: newBlocks,
      roads: newRoads,
      stations: newStations,
      routes: newRoutes,
    },
    clonedItems,
  };
}

export function groupSelectedEntities(
  city: CityData,
  items: SelectedEntity[]
): CityData {
  if (items.length < 2) return city;
  const groupId = `grp-${Date.now().toString(36)}`;
  const keys = new Set(items.map(selectionKey));

  return {
    ...city,
    buildings: city.buildings.map((b) =>
      keys.has(`building:${b.id}`) ? { ...b, groupId } : b
    ),
    roads: city.roads.map((r) =>
      keys.has(`road:${r.id}`) ? { ...r, groupId } : r
    ),
    zones: city.zones.map((z) =>
      keys.has(`zone:${z.id}`) ? { ...z, groupId } : z
    ),
    blocks: (city.blocks || []).map((bl) =>
      keys.has(`block:${bl.id}`) ? { ...bl, groupId } : bl
    ),
    publicSpaces: city.publicSpaces.map((ps) =>
      keys.has(`public_space:${ps.id}`) ? { ...ps, groupId } : ps
    ),
    stations: city.stations.map((s) =>
      keys.has(`station:${s.id}`) ? { ...s, groupId } : s
    ),
    routes: city.routes.map((rt) =>
      keys.has(`route:${rt.id}`) ? { ...rt, groupId } : rt
    ),
  };
}

export function ungroupSelectedEntities(
  city: CityData,
  items: SelectedEntity[]
): CityData {
  const keys = new Set(items.map(selectionKey));
  return {
    ...city,
    buildings: city.buildings.map((b) =>
      keys.has(`building:${b.id}`) ? { ...b, groupId: undefined } : b
    ),
    roads: city.roads.map((r) =>
      keys.has(`road:${r.id}`) ? { ...r, groupId: undefined } : r
    ),
    zones: city.zones.map((z) =>
      keys.has(`zone:${z.id}`) ? { ...z, groupId: undefined } : z
    ),
    blocks: (city.blocks || []).map((bl) =>
      keys.has(`block:${bl.id}`) ? { ...bl, groupId: undefined } : bl
    ),
    publicSpaces: city.publicSpaces.map((ps) =>
      keys.has(`public_space:${ps.id}`) ? { ...ps, groupId: undefined } : ps
    ),
    stations: city.stations.map((s) =>
      keys.has(`station:${s.id}`) ? { ...s, groupId: undefined } : s
    ),
    routes: city.routes.map((rt) =>
      keys.has(`route:${rt.id}`) ? { ...rt, groupId: undefined } : rt
    ),
  };
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignSelectedEntities(
  city: CityData,
  items: SelectedEntity[],
  mode: AlignMode
): CityData {
  if (items.length < 2) return city;
  const boxes = items
    .map((item) => ({ item, box: getEntityBoundingBox(item, city) }))
    .filter((entry): entry is { item: SelectedEntity; box: NonNullable<ReturnType<typeof getEntityBoundingBox>> } => entry.box !== null);

  if (boxes.length < 2) return city;

  const minX = Math.min(...boxes.map((b) => b.box.minX));
  const maxX = Math.max(...boxes.map((b) => b.box.maxX));
  const minY = Math.min(...boxes.map((b) => b.box.minY));
  const maxY = Math.max(...boxes.map((b) => b.box.maxY));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  let nextCity = city;
  for (const { item, box } of boxes) {
    let dx = 0;
    let dy = 0;
    if (mode === 'left') dx = minX - box.minX;
    else if (mode === 'center') dx = midX - box.cx;
    else if (mode === 'right') dx = maxX - box.maxX;
    else if (mode === 'top') dy = minY - box.minY;
    else if (mode === 'middle') dy = midY - box.cy;
    else if (mode === 'bottom') dy = maxY - box.maxY;

    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      nextCity = moveSelectedEntities(nextCity, [item], dx, dy);
    }
  }
  return nextCity;
}

export function distributeSelectedEntities(
  city: CityData,
  items: SelectedEntity[],
  axis: 'horizontal' | 'vertical'
): CityData {
  if (items.length < 3) return city;
  const boxes = items
    .map((item) => ({ item, box: getEntityBoundingBox(item, city) }))
    .filter((entry): entry is { item: SelectedEntity; box: NonNullable<ReturnType<typeof getEntityBoundingBox>> } => entry.box !== null);

  if (boxes.length < 3) return city;

  boxes.sort((a, b) =>
    axis === 'horizontal' ? a.box.cx - b.box.cx : a.box.cy - b.box.cy
  );

  const first = boxes[0].box;
  const last = boxes[boxes.length - 1].box;
  const span =
    axis === 'horizontal' ? last.cx - first.cx : last.cy - first.cy;
  const step = span / (boxes.length - 1);

  let nextCity = city;
  for (let i = 1; i < boxes.length - 1; i++) {
    const target = (axis === 'horizontal' ? first.cx : first.cy) + step * i;
    const current = axis === 'horizontal' ? boxes[i].box.cx : boxes[i].box.cy;
    const delta = target - current;
    if (Math.abs(delta) > 0.01) {
      nextCity = moveSelectedEntities(
        nextCity,
        [boxes[i].item],
        axis === 'horizontal' ? delta : 0,
        axis === 'vertical' ? delta : 0
      );
    }
  }
  return nextCity;
}

/**
 * Splits a road segment cleanly at all intersections with other roads.
 * Preserves curved approximation when splitting curved segments.
 */
export function splitRoadAtIntersections(
  targetRoadId: string,
  roads: RoadSegment[]
): RoadSegment[] {
  const target = roads.find((r) => r.id === targetRoadId);
  if (!target || target.points.length < 2) return roads;

  const sampledTarget = sampleRoadPoints(target, 12);
  // Collect intersection parameter distances along the sampled polyline
  interface CutPoint {
    segIndex: number;
    t: number;
    point: Point;
  }
  const cuts: CutPoint[] = [];

  for (const other of roads) {
    if (other.id === target.id) continue;
    const sampledOther = sampleRoadPoints(other, 12);
    for (let sa = 0; sa < sampledTarget.length - 1; sa++) {
      for (let sb = 0; sb < sampledOther.length - 1; sb++) {
        const hit = segmentIntersection(
          sampledTarget[sa],
          sampledTarget[sa + 1],
          sampledOther[sb],
          sampledOther[sb + 1]
        );
        if (hit) {
          // Ignore exact start/end of target road (already endpoints)
          const atVeryStart =
            sa === 0 && distanceBetween(hit.point, sampledTarget[0]) < 3;
          const atVeryEnd =
            sa === sampledTarget.length - 2 &&
            distanceBetween(hit.point, sampledTarget[sampledTarget.length - 1]) < 3;
          if (!atVeryStart && !atVeryEnd) {
            const dup = cuts.some((c) => distanceBetween(c.point, hit.point) < 3);
            if (!dup) {
              cuts.push({ segIndex: sa, t: hit.tA, point: hit.point });
            }
          }
        }
      }
    }
  }

  if (cuts.length === 0) return roads;

  cuts.sort((a, b) => a.segIndex - b.segIndex || a.t - b.t);

  // Build split sub-polylines
  const chunks: Point[][] = [];
  let current: Point[] = [sampledTarget[0]];
  let cutIdx = 0;

  for (let i = 0; i < sampledTarget.length - 1; i++) {
    while (cutIdx < cuts.length && cuts[cutIdx].segIndex === i) {
      const cutPt = cuts[cutIdx].point;
      if (distanceBetween(current[current.length - 1], cutPt) > 1) {
        current.push(cutPt);
      }
      if (current.length >= 2) {
        chunks.push(current);
      }
      current = [cutPt];
      cutIdx++;
    }
    const nextPt = sampledTarget[i + 1];
    if (distanceBetween(current[current.length - 1], nextPt) > 1) {
      current.push(nextPt);
    }
  }
  if (current.length >= 2) {
    chunks.push(current);
  }

  if (chunks.length <= 1) return roads;

  const replacementRoads: RoadSegment[] = chunks.map((pts, idx) => ({
    ...target,
    id: idx === 0 ? target.id : `${target.id}-split-${idx}-${Date.now().toString(36)}`,
    name: idx === 0 ? target.name : `${target.name} (${idx + 1})`,
    points: pts,
    controlPoints: undefined,
  }));

  const out: RoadSegment[] = [];
  for (const r of roads) {
    if (r.id === targetRoadId) {
      out.push(...replacementRoads);
    } else {
      out.push(r);
    }
  }
  return out;
}
