import {
  BUILDING_CONFIG,
  GRID_SIZE,
  NEIGHBORHOOD_CONFIG,
  PUBLIC_SPACE_CONFIG,
  ROAD_CONFIG,
  TRANSIT_LINE_CONFIG,
  TRANSIT_STATION_CONFIG,
  ZONE_CONFIG,
} from '../data/catalog';
import {
  ActiveTool,
  BuildingItem,
  CameraState,
  CityBlock,
  CityData,
  LayerSource,
  LayerVisibility,
  Point,
  PublicSpaceItem,
  RoadSegment,
  SelectedEntity,
  TransitRoute,
  TransitStation,
  ViewMode,
  WaterFeature,
  ZoneRect,
} from '../types/city';
import { isEntitySelected } from './cityOperations';
import { latLonToWorld } from './geoCoords';
import {
  findRoadIntersections,
  getCityBounds,
  getEntityBoundingBox,
  getRoadMidpointHandle,
} from './geometry';

export interface RenderTransientState {
  activeTool: ActiveTool;
  hoverWorld: Point | null;
  previewRotation: number;
  drawingPoints: Point[];
  zoneDraft: { start: Point; end: Point } | null;
  blockDraft?: {
    shape: 'rect' | 'poly';
    start?: Point;
    end?: Point;
    points?: Point[];
  } | null;
  marqueeDraft?: { start: Point; end: Point } | null;
  snapIndicator: Point | null;
  selectedItems: SelectedEntity[];
  hovered: SelectedEntity | null;
  extendingRoadId?: string | null;
}

function isSourceVisible(
  source: LayerSource | undefined,
  layers: LayerVisibility
): boolean {
  if (source === 'existing') return layers.existing !== false;
  return layers.proposed !== false;
}

export function renderCityCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  city: CityData,
  camera: CameraState,
  viewMode: ViewMode,
  layers: LayerVisibility,
  transient: RenderTransientState,
  forceOpaqueBackground = false
): void {
  const showBasemap =
    !forceOpaqueBackground &&
    city.mode === 'geographic' &&
    layers.basemap !== false;

  if (showBasemap) {
    ctx.clearRect(0, 0, width, height);
  } else {
    // Base map land color
    ctx.fillStyle = viewMode === 'transit' ? '#F8FAFC' : '#F2F4F0';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  const halfW = width / (2 * camera.zoom);
  const halfH = height / (2 * camera.zoom);
  const viewBounds = {
    minX: camera.x - halfW,
    maxX: camera.x + halfW,
    minY: camera.y - halfH,
    maxY: camera.y + halfH,
  };

  const isGeo = city.mode === 'geographic';

  // 1. Grid overlay
  if (layers.grid) {
    drawGrid(ctx, viewBounds, camera.zoom, showBasemap);
  }

  // 1b. Imported OSM area frames in geographic mode
  if (isGeo && city.geoOrigin && city.importedBounds?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.32)';
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
    for (const b of city.importedBounds) {
      const nw = latLonToWorld(b.north, b.west, city.geoOrigin);
      const se = latLonToWorld(b.south, b.east, city.geoOrigin);
      ctx.strokeRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 2. Water features
  if (layers.water !== false && city.water && city.water.length > 0) {
    for (const w of city.water) {
      if (!isSourceVisible(w.layerSource, layers)) continue;
      drawWaterFeature(
        ctx,
        w,
        layers.labels && camera.zoom > 0.45
      );
    }
  }

  // 3. Zones
  if (layers.zones) {
    const zoneAlpha = viewMode === 'zoning' ? 0.34 : 0.14;
    for (const z of city.zones) {
      if (!isSourceVisible(z.layerSource, layers)) continue;
      const isSelected = isEntitySelected(transient.selectedItems, 'zone', z.id);
      const isHovered =
        transient.hovered?.category === 'zone' && transient.hovered.id === z.id;
      drawZone(
        ctx,
        z,
        zoneAlpha,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.45
      );
    }
  }

  // 4. City Blocks & Subdivided Lots
  if (layers.blocks) {
    for (const bl of city.blocks || []) {
      if (!isSourceVisible(bl.layerSource, layers)) continue;
      const isSelected = isEntitySelected(transient.selectedItems, 'block', bl.id);
      const isHovered =
        transient.hovered?.category === 'block' && transient.hovered.id === bl.id;
      drawCityBlock(
        ctx,
        bl,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.55
      );
    }
  }

  // 5. Public spaces
  if (layers.publicSpaces) {
    for (const ps of city.publicSpaces) {
      if (!isSourceVisible(ps.layerSource, layers)) continue;
      const isSelected = isEntitySelected(
        transient.selectedItems,
        'public_space',
        ps.id
      );
      const isHovered =
        transient.hovered?.category === 'public_space' &&
        transient.hovered.id === ps.id;
      drawPublicSpace(
        ctx,
        ps,
        viewMode,
        isGeo,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.5
      );
    }
  }

  // 6. Roads (casing first, then surface + markings)
  if (layers.roads) {
    const dimRoads = viewMode === 'transit';
    for (const road of city.roads) {
      if (!isSourceVisible(road.layerSource, layers)) continue;
      drawRoadCasing(ctx, road, dimRoads, isGeo);
    }
    for (const road of city.roads) {
      if (!isSourceVisible(road.layerSource, layers)) continue;
      const isSelected = isEntitySelected(transient.selectedItems, 'road', road.id);
      const isHovered =
        transient.hovered?.category === 'road' && transient.hovered.id === road.id;
      drawRoadSurface(
        ctx,
        road,
        dimRoads,
        isGeo,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.55
      );
    }
  }

  // 7. Buildings
  if (layers.buildings) {
    for (const b of city.buildings) {
      if (!isSourceVisible(b.layerSource, layers)) continue;
      const isSelected = isEntitySelected(
        transient.selectedItems,
        'building',
        b.id
      );
      const isHovered =
        transient.hovered?.category === 'building' && transient.hovered.id === b.id;
      drawBuilding(
        ctx,
        b,
        viewMode,
        isGeo,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.65
      );
    }
  }

  // 8. Transit Routes & Stations
  if (layers.transit) {
    for (const route of city.routes) {
      if (!isSourceVisible(route.layerSource, layers)) continue;
      const isSelected = isEntitySelected(
        transient.selectedItems,
        'route',
        route.id
      );
      const isHovered =
        transient.hovered?.category === 'route' && transient.hovered.id === route.id;
      drawTransitRoute(
        ctx,
        route,
        viewMode,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.55
      );
    }

    for (const st of city.stations) {
      if (!isSourceVisible(st.layerSource, layers)) continue;
      const isSelected = isEntitySelected(
        transient.selectedItems,
        'station',
        st.id
      );
      const isHovered =
        transient.hovered?.category === 'station' && transient.hovered.id === st.id;
      drawTransitStation(
        ctx,
        st,
        camera.zoom,
        isGeo,
        isSelected,
        isHovered,
        layers.labels && camera.zoom >= 0.45
      );
    }
  }

  // 9. Multi-selection group outline & single road geometry handles
  drawSelectionOverlays(ctx, city, transient, camera.zoom);

  // 10. Transient previews (ghosts, road/block/zone drafts, marquee box, snap ring)
  drawTransientPreview(ctx, transient, camera.zoom);

  ctx.restore();
}

function traceRoadPath(ctx: CanvasRenderingContext2D, road: RoadSegment): void {
  if (road.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(road.points[0].x, road.points[0].y);
  for (let i = 0; i < road.points.length - 1; i++) {
    const next = road.points[i + 1];
    const cp = road.controlPoints?.[i];
    if (cp) {
      ctx.quadraticCurveTo(cp.x, cp.y, next.x, next.y);
    } else {
      ctx.lineTo(next.x, next.y);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  zoom: number,
  overBasemap = false
): void {
  const minor = GRID_SIZE;
  const major = GRID_SIZE * 5;

  const startX = Math.floor(bounds.minX / minor) * minor;
  const endX = Math.ceil(bounds.maxX / minor) * minor;
  const startY = Math.floor(bounds.minY / minor) * minor;
  const endY = Math.ceil(bounds.maxY / minor) * minor;

  if (zoom >= 0.45) {
    ctx.beginPath();
    ctx.strokeStyle = overBasemap
      ? 'rgba(100, 116, 139, 0.14)'
      : 'rgba(148, 163, 184, 0.22)';
    ctx.lineWidth = 1 / zoom;
    for (let x = startX; x <= endX; x += minor) {
      if (x % major === 0) continue;
      ctx.moveTo(x, bounds.minY);
      ctx.lineTo(x, bounds.maxY);
    }
    for (let y = startY; y <= endY; y += minor) {
      if (y % major === 0) continue;
      ctx.moveTo(bounds.minX, y);
      ctx.lineTo(bounds.maxX, y);
    }
    ctx.stroke();
  }

  const majorStartX = Math.floor(bounds.minX / major) * major;
  const majorStartY = Math.floor(bounds.minY / major) * major;
  ctx.beginPath();
  ctx.strokeStyle = overBasemap
    ? 'rgba(71, 85, 105, 0.20)'
    : 'rgba(100, 116, 139, 0.24)';
  ctx.lineWidth = 1 / zoom;
  for (let x = majorStartX; x <= endX; x += major) {
    ctx.moveTo(x, bounds.minY);
    ctx.lineTo(x, bounds.maxY);
  }
  for (let y = majorStartY; y <= endY; y += major) {
    ctx.moveTo(bounds.minX, y);
    ctx.lineTo(bounds.maxX, y);
  }
  ctx.stroke();
}

function drawWaterFeature(
  ctx: CanvasRenderingContext2D,
  w: WaterFeature,
  showLabel: boolean
): void {
  const { points, width, name, isArea } = w;
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isArea && points.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.58)';
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (showLabel && name) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
      ctx.fillStyle = '#0369A1';
      ctx.font = 'italic 600 10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, cx, cy);
    }
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.78)';
  ctx.lineWidth = width + 8;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
  ctx.lineWidth = width;
  ctx.stroke();

  if (showLabel && name) {
    const mid = points[Math.floor(points.length / 2)];
    ctx.fillStyle = '#0369A1';
    ctx.font = 'italic 600 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, mid.x, mid.y);
  }
  ctx.restore();
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  zone: ZoneRect,
  alpha: number,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  const cfg = ZONE_CONFIG[zone.type];
  ctx.save();

  const opacityMult = zone.appearance?.opacity ?? 1;
  ctx.globalAlpha = Math.min(1, (alpha / 0.15) * opacityMult);
  ctx.fillStyle = zone.appearance?.fillColor || cfg.fillColor;
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
  ctx.globalAlpha = opacityMult;

  ctx.save();
  ctx.beginPath();
  ctx.rect(zone.x, zone.y, zone.width, zone.height);
  ctx.clip();
  ctx.strokeStyle = cfg.hatchColor;
  ctx.lineWidth = 1;
  const step = 16;
  ctx.beginPath();
  for (let x = zone.x - zone.height; x < zone.x + zone.width; x += step) {
    ctx.moveTo(x, zone.y);
    ctx.lineTo(x + zone.height, zone.y + zone.height);
  }
  ctx.stroke();
  ctx.restore();

  const strokeCol = zone.appearance?.strokeColor || cfg.strokeColor;
  ctx.strokeStyle = isSelected ? '#2563EB' : strokeCol;
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1.25;
  ctx.setLineDash(isSelected ? [] : [5, 4]);
  ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
  ctx.setLineDash([]);

  if (showLabel && zone.name) {
    ctx.fillStyle = strokeCol;
    ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(zone.name.toUpperCase(), zone.x + 6, zone.y + 6);
  }
  ctx.restore();
}

function drawCityBlock(
  ctx: CanvasRenderingContext2D,
  block: CityBlock,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  if (block.points.length < 3) return;
  const cfg = NEIGHBORHOOD_CONFIG[block.neighborhoodType];
  ctx.save();
  ctx.globalAlpha = block.appearance?.opacity ?? 1;

  ctx.beginPath();
  ctx.moveTo(block.points[0].x, block.points[0].y);
  for (let i = 1; i < block.points.length; i++) {
    ctx.lineTo(block.points[i].x, block.points[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = block.appearance?.fillColor || cfg.fillColor;
  ctx.fill();

  const strokeCol = block.appearance?.strokeColor || cfg.strokeColor;
  ctx.strokeStyle = isSelected ? '#2563EB' : isHovered ? '#0F172A' : strokeCol;
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 1.8 : 1.4;
  ctx.stroke();

  // Subdivided parcel lot lines
  if (block.subdividedLots && block.subdividedLots.length > 0) {
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 2]);
    for (const lot of block.subdividedLots) {
      if (lot.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(lot[0].x, lot[0].y);
      for (let i = 1; i < lot.length; i++) {
        ctx.lineTo(lot[i].x, lot[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if (showLabel && block.name) {
    const p0 = block.points[0];
    ctx.fillStyle = strokeCol;
    ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(block.name, p0.x + 6, p0.y + 5);
  }

  ctx.restore();
}

function tracePolygonPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

function drawPublicSpace(
  ctx: CanvasRenderingContext2D,
  ps: PublicSpaceItem,
  viewMode: ViewMode,
  isGeo: boolean,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  const cfg = PUBLIC_SPACE_CONFIG[ps.type];
  const isExisting = ps.layerSource === 'existing';
  ctx.save();
  ctx.translate(ps.x, ps.y);
  ctx.rotate((ps.rotation * Math.PI) / 180);

  const baseAlpha = viewMode === 'transit' ? 0.55 : isGeo && isExisting ? 0.68 : 0.92;
  ctx.globalAlpha = baseAlpha * (ps.appearance?.opacity ?? 1);

  const hw = ps.width / 2;
  const hh = ps.height / 2;
  const hasPolygon = Boolean(ps.footprint && ps.footprint.length >= 3);

  if (hasPolygon && ps.footprint) {
    tracePolygonPath(ctx, ps.footprint);
  } else {
    roundRectPath(ctx, -hw, -hh, ps.width, ps.height, 4);
  }

  ctx.fillStyle = ps.appearance?.fillColor || cfg.fillColor;
  ctx.fill();
  ctx.strokeStyle = isSelected
    ? '#2563EB'
    : isHovered
      ? '#0F172A'
      : ps.appearance?.strokeColor || cfg.borderColor;
  ctx.lineWidth = isSelected ? 2.5 : 1.3;
  ctx.stroke();

  if (isGeo && !isExisting) {
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!hasPolygon) {
    if (ps.type === 'park') {
      ctx.beginPath();
      ctx.moveTo(-hw + 8, 0);
      ctx.quadraticCurveTo(0, -hh * 0.35, hw - 8, 0);
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 4;
      ctx.stroke();

      const cols = Math.max(2, Math.floor(ps.width / 34));
      const rows = Math.max(2, Math.floor(ps.height / 32));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tx = -hw + ((c + 0.5) / cols) * ps.width + ((r % 2) * 6 - 3);
          const ty = -hh + ((r + 0.5) / rows) * ps.height;
          const rad = 7 + ((c + r) % 3) * 2;
          ctx.beginPath();
          ctx.arc(tx + 1.5, ty + 1.5, rad, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(22, 101, 52, 0.14)';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(tx, ty, rad, 0, Math.PI * 2);
          ctx.fillStyle = (c + r) % 2 === 0 ? '#4ADE80' : '#22C55E';
          ctx.fill();
        }
      }
    } else if (ps.type === 'plaza') {
      ctx.strokeStyle = 'rgba(168, 162, 158, 0.35)';
      ctx.lineWidth = 0.8;
      for (let x = -hw + 14; x < hw; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, -hh + 2);
        ctx.lineTo(x, hh - 2);
        ctx.stroke();
      }
      const r = Math.min(hw, hh) * 0.42;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#BAE6FD';
      ctx.fill();
      ctx.strokeStyle = '#78716C';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (ps.type === 'playground') {
      ctx.fillStyle = '#FDE68A';
      roundRectPath(ctx, -hw + 8, -hh + 8, ps.width - 16, ps.height - 16, 6);
      ctx.fill();
      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.arc(-8, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0EA5E9';
      ctx.fillRect(4, -5, 10, 10);
    } else if (ps.type === 'sports_facility') {
      const pad = 7;
      roundRectPath(
        ctx,
        -hw + pad,
        -hh + pad,
        ps.width - pad * 2,
        ps.height - pad * 2,
        (ps.height - pad * 2) / 2
      );
      ctx.strokeStyle = '#F87171';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#34D399';
      ctx.fillRect(-hw + 18, -hh + 14, ps.width - 36, ps.height - 28);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw + 18, -hh + 14, ps.width - 36, ps.height - 28);
      ctx.beginPath();
      ctx.moveTo(0, -hh + 14);
      ctx.lineTo(0, hh - 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (showLabel && ps.name) {
    ctx.fillStyle = '#1E293B';
    ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    const labelY = hasPolygon ? 0 : hh - 9;
    ctx.strokeText(ps.name, 0, labelY);
    ctx.fillText(ps.name, 0, labelY);
  }

  ctx.restore();
}

function drawRoadCasing(
  ctx: CanvasRenderingContext2D,
  road: RoadSegment,
  dimmed: boolean,
  isGeo: boolean
): void {
  if (road.points.length < 2) return;
  const cfg = ROAD_CONFIG[road.type];
  const isExisting = road.layerSource === 'existing';
  ctx.save();
  if (dimmed) {
    ctx.globalAlpha = 0.45;
  } else if (isGeo && isExisting) {
    ctx.globalAlpha = 0.72;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  traceRoadPath(ctx, road);
  ctx.strokeStyle =
    road.appearance?.strokeColor ||
    (isGeo && !isExisting ? '#2563EB' : cfg.casingColor);
  ctx.lineWidth = road.width + (isGeo && !isExisting ? 4.5 : 3);
  ctx.stroke();
  ctx.restore();
}

function drawRoadSurface(
  ctx: CanvasRenderingContext2D,
  road: RoadSegment,
  dimmed: boolean,
  isGeo: boolean,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  if (road.points.length < 2) return;
  const cfg = ROAD_CONFIG[road.type];
  const isExisting = road.layerSource === 'existing';
  ctx.save();
  const baseAlpha = dimmed ? 0.45 : isGeo && isExisting ? 0.82 : 1;
  ctx.globalAlpha = baseAlpha * (road.appearance?.opacity ?? 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isSelected || isHovered) {
    traceRoadPath(ctx, road);
    ctx.strokeStyle = isSelected ? '#2563EB' : 'rgba(37, 99, 235, 0.45)';
    ctx.lineWidth = road.width + 7;
    ctx.stroke();
  }

  traceRoadPath(ctx, road);
  ctx.strokeStyle =
    road.appearance?.fillColor ||
    (isGeo && isExisting && road.type === 'local_street' ? '#F8FAFC' : cfg.fillColor);
  ctx.lineWidth = road.width;
  ctx.stroke();

  if (road.type === 'main_road') {
    traceRoadPath(ctx, road);
    ctx.strokeStyle = cfg.lineColor;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
  } else if (road.type === 'highway') {
    traceRoadPath(ctx, road);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    traceRoadPath(ctx, road);
    ctx.strokeStyle = '#EA580C';
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 8]);
    ctx.stroke();
  } else if (road.type === 'pedestrian_street') {
    traceRoadPath(ctx, road);
    ctx.strokeStyle = '#D6D3D1';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
  } else if (road.type === 'bicycle_lane') {
    traceRoadPath(ctx, road);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  if (showLabel && road.name && road.points.length >= 2) {
    const a = road.points[0];
    const b = road.points[1];
    const mx = road.controlPoints?.[0]
      ? getRoadMidpointHandle(road, 0).x
      : a.x + (b.x - a.x) * 0.32;
    const my = road.controlPoints?.[0]
      ? getRoadMidpointHandle(road, 0).y
      : a.y + (b.y - a.y) * 0.32;
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      angle += Math.PI;
    }
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(road.name, 0, 0);
    ctx.fillStyle = '#475569';
    ctx.fillText(road.name, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: BuildingItem,
  viewMode: ViewMode,
  isGeo: boolean,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  const cfg = BUILDING_CONFIG[b.type];
  const isExisting = b.layerSource === 'existing';
  const hasFootprint = Boolean(b.footprint && b.footprint.length >= 3);
  ctx.save();

  const baseAlpha = viewMode === 'transit' ? 0.55 : isGeo && isExisting ? 0.85 : 1;
  ctx.globalAlpha = baseAlpha * (b.appearance?.opacity ?? 1);

  const hw = b.width / 2;
  const hh = b.height / 2;
  const extrude = Math.min(18, 2 + b.floors * 1.1);

  ctx.save();
  ctx.translate(b.x + extrude * 0.7, b.y + extrude * 0.9);
  ctx.rotate((b.rotation * Math.PI) / 180);
  if (hasFootprint && b.footprint) {
    tracePolygonPath(ctx, b.footprint);
  } else {
    roundRectPath(ctx, -hw, -hh, b.width, b.height, 3);
  }
  ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.fill();
  ctx.restore();

  ctx.translate(b.x, b.y);
  ctx.rotate((b.rotation * Math.PI) / 180);

  let roofColor =
    b.appearance?.fillColor ||
    (isGeo && isExisting && viewMode === 'standard' ? '#CBD5E1' : cfg.roofColor);
  let borderColor =
    b.appearance?.strokeColor ||
    (isGeo && isExisting && viewMode === 'standard'
      ? '#64748B'
      : isGeo && !isExisting && viewMode === 'standard'
        ? '#1D4ED8'
        : cfg.borderColor);
  if (viewMode === 'density') {
    const t = Math.min(1, b.floors / 15);
    roofColor = interpolateDensityColor(t);
    borderColor = '#334155';
  } else if (viewMode === 'zoning') {
    roofColor = ZONE_CONFIG[b.zone].strokeColor;
  }

  if (hasFootprint && b.footprint) {
    tracePolygonPath(ctx, b.footprint);
  } else {
    roundRectPath(ctx, -hw, -hh, b.width, b.height, 2.5);
  }
  ctx.fillStyle = roofColor;
  ctx.fill();

  ctx.strokeStyle = isSelected ? '#2563EB' : isHovered ? '#0F172A' : borderColor;
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : isGeo && !isExisting ? 1.8 : 1.1;
  ctx.stroke();

  if (!hasFootprint && !(isGeo && isExisting)) {
    if (b.type === 'office' || b.type === 'apartment') {
      const inset = 6;
      if (b.width > inset * 2 && b.height > inset * 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          -hw + inset,
          -hh + inset,
          b.width - inset * 2,
          b.height - inset * 2
        );
      }
      if (b.type === 'office') {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(-5, -5, 10, 10);
      }
    } else if (b.type === 'industrial') {
      ctx.strokeStyle = 'rgba(126, 34, 206, 0.25)';
      ctx.lineWidth = 1;
      for (let x = -hw + 12; x < hw; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, -hh + 3);
        ctx.lineTo(x, hh - 3);
        ctx.stroke();
      }
    } else if (b.type === 'residential') {
      ctx.beginPath();
      ctx.moveTo(-hw + 4, 0);
      ctx.lineTo(hw - 4, 0);
      ctx.strokeStyle = 'rgba(154, 52, 18, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  if (isSelected) {
    const pad = 4;
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(-hw - pad, -hh - pad, b.width + pad * 2, b.height + pad * 2);
    ctx.setLineDash([]);
  }

  if (showLabel) {
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = b.floors > 3 ? `${b.floors}F` : b.name;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}

function drawTransitRoute(
  ctx: CanvasRenderingContext2D,
  route: TransitRoute,
  viewMode: ViewMode,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  if (route.points.length < 2) return;
  const cfg = TRANSIT_LINE_CONFIG[route.type];
  const color = route.appearance?.fillColor || route.color || cfg.defaultColor;
  const width = viewMode === 'transit' ? cfg.width + 2 : cfg.width;

  ctx.save();
  ctx.globalAlpha = route.appearance?.opacity ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(route.points[0].x, route.points[0].y);
    for (let i = 1; i < route.points.length; i++) {
      ctx.lineTo(route.points[i].x, route.points[i].y);
    }
  };

  if (isSelected || isHovered) {
    trace();
    ctx.strokeStyle = isSelected ? '#2563EB' : 'rgba(37, 99, 235, 0.45)';
    ctx.lineWidth = width + 6;
    ctx.stroke();
  }

  if (route.type === 'railway') {
    ctx.save();
    ctx.lineCap = 'butt';
    trace();
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = width + 4;
    ctx.setLineDash([2, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    trace();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (route.type === 'bus_route') {
    trace();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = width + 2;
    ctx.stroke();

    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = width - 1;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    trace();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = width + 3;
    ctx.stroke();

    trace();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  if (showLabel && route.name && route.points.length >= 2) {
    const p0 = route.points[0];
    const p1 = route.points[1];
    const lx = (p0.x + p1.x) / 2;
    const ly = (p0.y + p1.y) / 2 - 12;
    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeText(route.name, lx, ly);
    ctx.fillStyle = color;
    ctx.fillText(route.name, lx, ly);
  }

  ctx.restore();
}

function drawTransitStation(
  ctx: CanvasRenderingContext2D,
  st: TransitStation,
  zoom: number,
  isGeo: boolean,
  isSelected: boolean,
  isHovered: boolean,
  showLabel: boolean
): void {
  const cfg = TRANSIT_STATION_CONFIG[st.type];
  const color = st.appearance?.strokeColor || cfg.color;
  const isProposedInGeo = isGeo && st.layerSource !== 'existing';
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.globalAlpha = st.appearance?.opacity ?? 1;

  const r = Math.max(7, Math.min(11, 9 / Math.sqrt(zoom)));

  if (isSelected || isHovered || isProposedInGeo) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = isSelected
      ? '#2563EB'
      : isHovered
        ? '#64748B'
        : 'rgba(37, 99, 235, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = st.appearance?.fillColor || '#FFFFFF';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(r * 1.05)}px "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cfg.badge, 0, 0.5);

  if (showLabel && st.name) {
    ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(st.name, 0, r + 9);
    ctx.fillStyle = '#0F172A';
    ctx.fillText(st.name, 0, r + 9);
  }

  ctx.restore();
}

function drawSelectionOverlays(
  ctx: CanvasRenderingContext2D,
  city: CityData,
  transient: RenderTransientState,
  zoom: number
): void {
  const { selectedItems } = transient;
  if (selectedItems.length === 0) return;

  ctx.save();

  // Multi-selection combined bounding box
  if (selectedItems.length > 1) {
    const boxes = selectedItems
      .map((it) => getEntityBoundingBox(it, city))
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (boxes.length > 1) {
      const minX = Math.min(...boxes.map((b) => b.minX)) - 6;
      const minY = Math.min(...boxes.map((b) => b.minY)) - 6;
      const maxX = Math.max(...boxes.map((b) => b.maxX)) + 6;
      const maxY = Math.max(...boxes.map((b) => b.maxY)) + 6;
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
    }
  }

  // Single road interactive geometry handles (vertex squares + Bezier midpoint diamonds + intersections)
  if (selectedItems.length === 1 && selectedItems[0].category === 'road') {
    const road = city.roads.find((r) => r.id === selectedItems[0].id);
    if (road && road.points.length >= 2) {
      const handleSize = 6 / zoom;

      // Highlight intersections involving this road
      const intersections = findRoadIntersections(city.roads).filter(
        (ix) => ix.roadAId === road.id || ix.roadBId === road.id
      );
      for (const ix of intersections) {
        ctx.beginPath();
        ctx.arc(ix.point.x, ix.point.y, 7 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
      }

      // Segment midpoint curve handles
      for (let i = 0; i < road.points.length - 1; i++) {
        const mid = getRoadMidpointHandle(road, i);
        ctx.save();
        ctx.translate(mid.x, mid.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = road.controlPoints?.[i] ? '#2563EB' : '#FFFFFF';
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 1.5 / zoom;
        ctx.fillRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
        ctx.restore();
      }

      // Vertex / endpoint handles
      for (const pt of road.points) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#1D4ED8';
        ctx.lineWidth = 1.8 / zoom;
        ctx.fillRect(
          pt.x - handleSize * 0.65,
          pt.y - handleSize * 0.65,
          handleSize * 1.3,
          handleSize * 1.3
        );
        ctx.strokeRect(
          pt.x - handleSize * 0.65,
          pt.y - handleSize * 0.65,
          handleSize * 1.3,
          handleSize * 1.3
        );
      }
    }
  }

  ctx.restore();
}

function drawTransientPreview(
  ctx: CanvasRenderingContext2D,
  transient: RenderTransientState,
  zoom: number
): void {
  const {
    activeTool,
    hoverWorld,
    previewRotation,
    drawingPoints,
    zoneDraft,
    blockDraft,
    marqueeDraft,
    snapIndicator,
  } = transient;

  ctx.save();

  // Marquee selection box
  if (marqueeDraft) {
    const x = Math.min(marqueeDraft.start.x, marqueeDraft.end.x);
    const y = Math.min(marqueeDraft.start.y, marqueeDraft.end.y);
    const w = Math.abs(marqueeDraft.end.x - marqueeDraft.start.x);
    const h = Math.abs(marqueeDraft.end.y - marqueeDraft.start.y);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  // Zone drag box
  if (zoneDraft) {
    const x = Math.min(zoneDraft.start.x, zoneDraft.end.x);
    const y = Math.min(zoneDraft.start.y, zoneDraft.end.y);
    const w = Math.abs(zoneDraft.end.x - zoneDraft.start.x);
    const h = Math.abs(zoneDraft.end.y - zoneDraft.start.y);
    const zoneType =
      activeTool.kind === 'zone' ? activeTool.zoneType : 'residential';
    const cfg = ZONE_CONFIG[zoneType];
    ctx.fillStyle = cfg.fillColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = cfg.strokeColor;
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  // Block rectangle or polygon draft
  if (blockDraft) {
    if (blockDraft.shape === 'rect' && blockDraft.start && blockDraft.end) {
      const x = Math.min(blockDraft.start.x, blockDraft.end.x);
      const y = Math.min(blockDraft.start.y, blockDraft.end.y);
      const w = Math.abs(blockDraft.end.x - blockDraft.start.x);
      const h = Math.abs(blockDraft.end.y - blockDraft.start.y);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    } else if (
      blockDraft.shape === 'poly' &&
      blockDraft.points &&
      blockDraft.points.length > 0
    ) {
      const pts = hoverWorld
        ? [...blockDraft.points, hoverWorld]
        : blockDraft.points;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length >= 3) ctx.closePath();
      ctx.fillStyle = 'rgba(13, 148, 136, 0.14)';
      ctx.fill();
      ctx.strokeStyle = '#0D9488';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();
      for (const pt of blockDraft.points) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#0D9488';
        ctx.fill();
      }
    }
  }

  // Active road or transit route drawing polyline
  if (drawingPoints.length > 0 && hoverWorld) {
    const pts = [...drawingPoints, hoverWorld];
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (activeTool.kind === 'road' || transient.extendingRoadId) {
      const roadType =
        activeTool.kind === 'road' ? activeTool.roadType : 'local_street';
      const cfg = ROAD_CONFIG[roadType];
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = cfg.casingColor;
      ctx.lineWidth = cfg.defaultWidth + 3;
      ctx.stroke();
      ctx.strokeStyle = cfg.fillColor;
      ctx.lineWidth = cfg.defaultWidth;
      ctx.stroke();
    } else if (activeTool.kind === 'route') {
      const cfg = TRANSIT_LINE_CONFIG[activeTool.routeType];
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = cfg.defaultColor;
      ctx.lineWidth = cfg.width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const pt of drawingPoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#2563EB';
      ctx.fill();
    }
  }

  // Ghost placement preview
  if (hoverWorld) {
    if (activeTool.kind === 'building') {
      const cfg = BUILDING_CONFIG[activeTool.buildingType];
      ctx.save();
      ctx.translate(hoverWorld.x, hoverWorld.y);
      ctx.rotate((previewRotation * Math.PI) / 180);
      ctx.globalAlpha = 0.65;
      roundRectPath(
        ctx,
        -cfg.defaultWidth / 2,
        -cfg.defaultHeight / 2,
        cfg.defaultWidth,
        cfg.defaultHeight,
        3
      );
      ctx.fillStyle = cfg.roofColor;
      ctx.fill();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    } else if (activeTool.kind === 'public_space') {
      const cfg = PUBLIC_SPACE_CONFIG[activeTool.spaceType];
      ctx.save();
      ctx.translate(hoverWorld.x, hoverWorld.y);
      ctx.rotate((previewRotation * Math.PI) / 180);
      ctx.globalAlpha = 0.6;
      roundRectPath(
        ctx,
        -cfg.defaultWidth / 2,
        -cfg.defaultHeight / 2,
        cfg.defaultWidth,
        cfg.defaultHeight,
        4
      );
      ctx.fillStyle = cfg.fillColor;
      ctx.fill();
      ctx.strokeStyle = '#16A34A';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    } else if (activeTool.kind === 'station') {
      const cfg = TRANSIT_STATION_CONFIG[activeTool.stationType];
      ctx.save();
      ctx.translate(hoverWorld.x, hoverWorld.y);
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Snap target ring
  if (snapIndicator) {
    ctx.beginPath();
    ctx.arc(snapIndicator.x, snapIndicator.y, 7 / zoom, 0, Math.PI * 2);
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  ctx.restore();
}

function interpolateDensityColor(t: number): string {
  const r = Math.round(254 - t * 34);
  const g = Math.round(240 - t * 165);
  const b = Math.round(199 - t * 155);
  return `rgb(${r}, ${g}, ${b})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function exportCityToPngDataUrl(
  city: CityData,
  viewMode: ViewMode,
  layers: LayerVisibility
): string {
  const bounds = getCityBounds(city);
  const pad = 80;
  const worldW = Math.max(400, bounds.maxX - bounds.minX + pad * 2);
  const worldH = Math.max(300, bounds.maxY - bounds.minY + pad * 2);
  const maxDim = 2000;
  const scale = Math.min(2.2, maxDim / Math.max(worldW, worldH));
  const outW = Math.round(worldW * scale);
  const outH = Math.round(worldH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const centerCam: CameraState = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: scale,
  };

  renderCityCanvas(
    ctx,
    outW,
    outH,
    city,
    centerCam,
    viewMode,
    layers,
    {
      activeTool: { kind: 'select' },
      hoverWorld: null,
      previewRotation: 0,
      drawingPoints: [],
      zoneDraft: null,
      blockDraft: null,
      marqueeDraft: null,
      snapIndicator: null,
      selectedItems: [],
      hovered: null,
    },
    true
  );

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillRect(24, outH - 68, 280, 44);
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, outH - 68, 280, 44);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(city.name || 'Untitled City', 36, outH - 59);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `${city.buildings.length} buildings · ${city.roads.length} streets · CityBuilder`,
    36,
    outH - 39
  );

  return canvas.toDataURL('image/png');
}
