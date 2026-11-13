import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  Eye,
  Globe2,
  Grid3X3,
  Layers,
  Loader2,
  Magnet,
  Maximize2,
  Minus,
  Plus,
  SquareDashedMousePointer,
  X,
} from 'lucide-react';
import {
  BUILDING_CONFIG,
  getToolLabel,
  PUBLIC_SPACE_CONFIG,
  ROAD_CONFIG,
  TRANSIT_LINE_CONFIG,
  TRANSIT_STATION_CONFIG,
  ZONE_CONFIG,
} from '../data/catalog';
import { fetchOsmAreaData, OSM_SERVICE_CONFIG } from '../services/osmService';
import {
  ActiveTool,
  BuildingItem,
  CameraState,
  CityBlock,
  CityData,
  GeoBounds,
  GeoPoint,
  LayerVisibility,
  OsmImportCategories,
  Point,
  PublicSpaceItem,
  RoadSegment,
  SelectedEntity,
  TransitRoute,
  TransitStation,
  ViewMode,
  ZoneRect,
} from '../types/city';
import {
  createRectBlockPoints,
  subdivideBlockIntoLots,
} from '../utils/blockSubdivision';
import {
  expandSelectionWithGroups,
  isEntitySelected,
  selectionKey,
} from '../utils/cityOperations';
import { renderCityCanvas } from '../utils/cityRenderer';
import {
  computeBoundsMetrics,
  createDefaultBoundsAround,
  worldToLatLon,
} from '../utils/geoCoords';
import {
  computeControlPointFromMidpoint,
  distanceBetween,
  findNearestStation,
  getCityBounds,
  getEntitiesInSelectionBox,
  getRoadMidpointHandle,
  hitTestCity,
  screenToWorld,
  snapPointToGrid,
  snapRoadPoint,
} from '../utils/geometry';
import {
  collectExistingOsmIds,
  convertOverpassToCityEntities,
  OsmImportResult,
} from '../utils/osmConverter';
import { LeafletMapLayer } from './LeafletMapLayer';

interface CityCanvasProps {
  city: CityData;
  activeTool: ActiveTool;
  selectedItems: SelectedEntity[];
  extendingRoadId: string | null;
  previewRotation: number;
  viewMode: ViewMode;
  layers: LayerVisibility;
  snapEnabled: boolean;
  camera: CameraState;
  areaSelectMode: boolean;
  onAreaSelectModeChange: (open: boolean) => void;
  onImportOsmData: (result: OsmImportResult, bounds: GeoBounds) => void;
  onCameraChange: React.Dispatch<React.SetStateAction<CameraState>>;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleLayer: (key: keyof LayerVisibility) => void;
  onToggleSnap: () => void;
  onSelectItems: (items: SelectedEntity[]) => void;
  onAddBuilding: (b: BuildingItem) => void;
  onAddRoad: (r: RoadSegment) => void;
  onAddZone: (z: ZoneRect) => void;
  onAddBlock: (bl: CityBlock) => void;
  onAddPublicSpace: (ps: PublicSpaceItem) => void;
  onAddStation: (s: TransitStation) => void;
  onAddRoute: (rt: TransitRoute) => void;
  onMoveSelected: (
    items: SelectedEntity[],
    dx: number,
    dy: number,
    commitHistory: boolean
  ) => void;
  onEditRoadVertex: (
    roadId: string,
    vertexIndex: number,
    point: Point,
    commitHistory: boolean
  ) => void;
  onEditRoadCurve: (
    roadId: string,
    segIndex: number,
    controlPoint: Point,
    commitHistory: boolean
  ) => void;
  onFinishExtendRoad: (roadId: string, extraPoints: Point[]) => void;
  onCancelExtendRoad: () => void;
  onLoadSampleCity: () => void;
}

export const CityCanvas: React.FC<CityCanvasProps> = ({
  city,
  activeTool,
  selectedItems,
  extendingRoadId,
  previewRotation,
  viewMode,
  layers,
  snapEnabled,
  camera,
  areaSelectMode,
  onAreaSelectModeChange,
  onImportOsmData,
  onCameraChange,
  onViewModeChange,
  onToggleLayer,
  onToggleSnap,
  onSelectItems,
  onAddBuilding,
  onAddRoad,
  onAddZone,
  onAddBlock,
  onAddPublicSpace,
  onAddStation,
  onAddRoute,
  onMoveSelected,
  onEditRoadVertex,
  onEditRoadCurve,
  onFinishExtendRoad,
  onCancelExtendRoad,
  onLoadSampleCity,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState({ width: 960, height: 640 });

  const isGeoProject = city.mode === 'geographic' && Boolean(city.geoOrigin);

  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);
  const [cursorLatLon, setCursorLatLon] = useState<GeoPoint | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<SelectedEntity | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [drawingStationIds, setDrawingStationIds] = useState<string[]>([]);
  const [zoneDraft, setZoneDraft] = useState<{ start: Point; end: Point } | null>(null);
  const [blockDraft, setBlockDraft] = useState<{
    shape: 'rect' | 'poly';
    start?: Point;
    end?: Point;
    points?: Point[];
  } | null>(null);
  const [marqueeDraft, setMarqueeDraft] = useState<{
    start: Point;
    end: Point;
  } | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<Point | null>(null);
  const [snapKindLabel, setSnapKindLabel] = useState<string>('');
  const [layersOpen, setLayersOpen] = useState(false);

  // OSM Import & Geographic Area Selection state
  const [drawingSelectionBox, setDrawingSelectionBox] = useState(false);
  const [selectionBounds, setSelectionBounds] = useState<GeoBounds | null>(() =>
    city.geoOrigin
      ? createDefaultBoundsAround(city.geoOrigin.lat, city.geoOrigin.lon, 280)
      : null
  );
  const [importCategories, setImportCategories] = useState<OsmImportCategories>({
    roads: true,
    buildings: true,
    natural: true,
    transportation: true,
  });
  const [importingOsm, setImportingOsm] = useState(false);
  const [importError, setImportError] = useState('');
  const [importToast, setImportToast] = useState('');

  // Re-initialize default selection bounds when switching to another geographic city
  useEffect(() => {
    if (city.mode === 'geographic' && city.geoOrigin) {
      setSelectionBounds(
        createDefaultBoundsAround(city.geoOrigin.lat, city.geoOrigin.lon, 280)
      );
      setImportError('');
      setDrawingSelectionBox(false);
    } else {
      setSelectionBounds(null);
    }
  }, [city.id, city.mode, city.geoOrigin?.lat, city.geoOrigin?.lon]);

  const boundsMetrics = useMemo(
    () => (selectionBounds ? computeBoundsMetrics(selectionBounds) : null),
    [selectionBounds]
  );

  const handleUseVisibleArea = useCallback(() => {
    if (!city.geoOrigin) return;
    const wCenter = { x: camera.x, y: camera.y };
    const halfSpanW = Math.min(950, (viewport.width * 0.34) / camera.zoom);
    const halfSpanH = Math.min(950, (viewport.height * 0.34) / camera.zoom);
    const nw = worldToLatLon(
      wCenter.x - halfSpanW,
      wCenter.y - halfSpanH,
      city.geoOrigin
    );
    const se = worldToLatLon(
      wCenter.x + halfSpanW,
      wCenter.y + halfSpanH,
      city.geoOrigin
    );
    setSelectionBounds({
      north: nw.lat,
      south: se.lat,
      west: nw.lon,
      east: se.lon,
    });
    setImportError('');
  }, [camera.x, camera.y, camera.zoom, city.geoOrigin, viewport.height, viewport.width]);

  const handleImportOsmArea = async () => {
    if (!city.geoOrigin || !selectionBounds) return;
    setImportingOsm(true);
    setImportError('');
    try {
      const response = await fetchOsmAreaData(selectionBounds, importCategories);
      const existingIds = collectExistingOsmIds(city);
      const converted = convertOverpassToCityEntities(
        response,
        city.geoOrigin,
        importCategories,
        existingIds
      );
      if (converted.counts.total === 0) {
        setImportError(
          'No new OpenStreetMap features found in this bounding box for the selected categories. Try expanding the area or picking another neighborhood.'
        );
        return;
      }
      onImportOsmData(converted, selectionBounds);
      onAreaSelectModeChange(false);
      setDrawingSelectionBox(false);
      setImportToast(
        `Imported ${converted.counts.roads} roads, ${converted.counts.buildings} buildings, ${converted.counts.publicSpaces + converted.counts.water} parks/water, ${converted.counts.stations + converted.counts.routes} transit items`
      );
      setTimeout(() => setImportToast(''), 5500);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : 'Failed to import OpenStreetMap data.'
      );
    } finally {
      setImportingOsm(false);
    }
  };

  const spacePressedRef = useRef(false);
  const panDragRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });

  const entityDragRef = useRef<{
    active: boolean;
    items: SelectedEntity[];
    lastWorld: Point;
    totalDx: number;
    totalDy: number;
  }>({
    active: false,
    items: [],
    lastWorld: { x: 0, y: 0 },
    totalDx: 0,
    totalDy: 0,
  });

  const roadHandleDragRef = useRef<{
    kind: 'vertex' | 'curve';
    roadId: string;
    index: number;
    moved: boolean;
  } | null>(null);

  const roadDragRef = useRef<{
    pointerDown: boolean;
    startScreen: Point;
    startWorld: Point;
    startStationId: string | null;
    didDrag: boolean;
  } | null>(null);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewport({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset polyline drawing when tool changes
  useEffect(() => {
    setDrawingPoints([]);
    setDrawingStationIds([]);
    setZoneDraft(null);
    setBlockDraft(null);
    setMarqueeDraft(null);
    roadDragRef.current = null;
  }, [activeTool]);

  const roadsRef = useRef(city.roads);
  roadsRef.current = city.roads;

  // Seed starting point when entering extend road mode
  useEffect(() => {
    if (extendingRoadId) {
      const road = roadsRef.current.find((r) => r.id === extendingRoadId);
      if (road && road.points.length > 0) {
        setDrawingPoints([road.points[road.points.length - 1]]);
      }
    } else {
      setDrawingPoints([]);
    }
  }, [extendingRoadId]);

  const commitPolyline = useCallback(
    (pts: Point[], stIds: string[]) => {
      if (extendingRoadId) {
        if (pts.length >= 2) {
          onFinishExtendRoad(extendingRoadId, pts.slice(1));
        } else {
          onCancelExtendRoad();
        }
        return;
      }
      if (pts.length < 2) return;
      if (activeTool.kind === 'road') {
        const cfg = ROAD_CONFIG[activeTool.roadType];
        onAddRoad({
          id: `road-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: activeTool.roadType,
          name: `${cfg.defaultName} ${city.roads.length + 1}`,
          width: cfg.defaultWidth,
          points: pts,
        });
      } else if (activeTool.kind === 'route') {
        const cfg = TRANSIT_LINE_CONFIG[activeTool.routeType];
        onAddRoute({
          id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: activeTool.routeType,
          name: `${cfg.defaultName} ${city.routes.length + 1}`,
          color: cfg.defaultColor,
          points: pts,
          stationIds: stIds,
        });
      }
    },
    [
      activeTool,
      city.roads.length,
      city.routes.length,
      extendingRoadId,
      onAddRoad,
      onAddRoute,
      onCancelExtendRoad,
      onFinishExtendRoad,
    ]
  );

  const commitPolyBlock = useCallback(
    (pts: Point[]) => {
      if (pts.length < 3) return;
      const newBlock: CityBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Block ${(city.blocks?.length || 0) + 1}`,
        neighborhoodType: 'residential',
        points: pts,
        lotTargetWidth: 50,
        setback: 8,
      };
      newBlock.subdividedLots = subdivideBlockIntoLots(newBlock);
      onAddBlock(newBlock);
    },
    [city.blocks?.length, onAddBlock]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space') {
        spacePressedRef.current = true;
      } else if (e.key === 'Escape') {
        setDrawingPoints([]);
        setDrawingStationIds([]);
        setZoneDraft(null);
        setBlockDraft(null);
        setMarqueeDraft(null);
        roadDragRef.current = null;
        if (extendingRoadId) onCancelExtendRoad();
      } else if (e.key === 'Enter') {
        if (drawingPoints.length >= 2) {
          commitPolyline(drawingPoints, drawingStationIds);
          setDrawingPoints([]);
          setDrawingStationIds([]);
        } else if (
          blockDraft?.shape === 'poly' &&
          blockDraft.points &&
          blockDraft.points.length >= 3
        ) {
          commitPolyBlock(blockDraft.points);
          setBlockDraft(null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    blockDraft,
    commitPolyBlock,
    commitPolyline,
    drawingPoints,
    drawingStationIds,
    extendingRoadId,
    onCancelExtendRoad,
  ]);

  // Draw Canvas whenever state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderCityCanvas(ctx, w, h, city, camera, viewMode, layers, {
      activeTool,
      hoverWorld,
      previewRotation,
      drawingPoints,
      zoneDraft,
      blockDraft,
      marqueeDraft,
      snapIndicator,
      selectedItems,
      hovered: hoveredEntity,
      extendingRoadId,
    });
    ctx.restore();
  }, [
    viewport,
    city,
    camera,
    viewMode,
    layers,
    activeTool,
    hoverWorld,
    previewRotation,
    drawingPoints,
    zoneDraft,
    blockDraft,
    marqueeDraft,
    snapIndicator,
    selectedItems,
    hoveredEntity,
    extendingRoadId,
  ]);

  const getLocalCoords = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const resolveToolPoint = (
    rawWorld: Point,
    ignoreRoadId?: string
  ): {
    point: Point;
    snapPt: Point | null;
    snapLabel: string;
    stationId: string | null;
  } => {
    if (activeTool.kind === 'road' || extendingRoadId || ignoreRoadId) {
      const snapped = snapRoadPoint(
        rawWorld,
        city.roads,
        snapEnabled,
        14 / Math.sqrt(camera.zoom),
        ignoreRoadId
      );
      return {
        point: snapped.point,
        snapPt: snapped.snappedToEndpoint ? snapped.point : null,
        snapLabel:
          snapped.snapKind === 'endpoint'
            ? 'Snap: Road endpoint'
            : snapped.snapKind === 'edge'
              ? 'Snap: Road junction'
              : '',
        stationId: null,
      };
    }
    if (activeTool.kind === 'route') {
      const nearest = findNearestStation(rawWorld, city.stations, 22 / camera.zoom);
      if (nearest) {
        return {
          point: { x: nearest.x, y: nearest.y },
          snapPt: { x: nearest.x, y: nearest.y },
          snapLabel: `Snap: ${nearest.name}`,
          stationId: nearest.id,
        };
      }
      return {
        point: snapPointToGrid(rawWorld, snapEnabled),
        snapPt: null,
        snapLabel: '',
        stationId: null,
      };
    }
    return {
      point: snapPointToGrid(rawWorld, snapEnabled),
      snapPt: null,
      snapLabel: '',
      stationId: null,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setLayersOpen(false);
    const local = getLocalCoords(e.clientX, e.clientY);
    const rawWorld = screenToWorld(
      local.x,
      local.y,
      viewport.width,
      viewport.height,
      camera
    );

    // Pan
    if (
      e.button === 1 ||
      (e.button === 2 && drawingPoints.length === 0 && !blockDraft) ||
      (e.button === 0 && (activeTool.kind === 'pan' || spacePressedRef.current))
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      panDragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
      return;
    }

    // Right click while drawing cancels
    if (e.button === 2) {
      setDrawingPoints([]);
      setDrawingStationIds([]);
      setBlockDraft(null);
      if (extendingRoadId) onCancelExtendRoad();
      return;
    }

    if (e.button !== 0) return;

    // Active road extension mode takes priority
    if (extendingRoadId) {
      const { point } = resolveToolPoint(rawWorld, extendingRoadId);
      setDrawingPoints((prev) => {
        const last = prev[prev.length - 1];
        if (last && distanceBetween(last, point) < 4) return prev;
        return [...prev, point];
      });
      return;
    }

    if (activeTool.kind === 'select') {
      // 1. Check selected road vertex & curve midpoint handles first
      if (selectedItems.length === 1 && selectedItems[0].category === 'road') {
        const road = city.roads.find((r) => r.id === selectedItems[0].id);
        if (road && road.points.length >= 2) {
          const hitR = 9 / camera.zoom;
          for (let i = 0; i < road.points.length; i++) {
            if (distanceBetween(rawWorld, road.points[i]) <= hitR) {
              e.currentTarget.setPointerCapture(e.pointerId);
              roadHandleDragRef.current = {
                kind: 'vertex',
                roadId: road.id,
                index: i,
                moved: false,
              };
              return;
            }
          }
          for (let i = 0; i < road.points.length - 1; i++) {
            const mid = getRoadMidpointHandle(road, i);
            if (distanceBetween(rawWorld, mid) <= hitR) {
              e.currentTarget.setPointerCapture(e.pointerId);
              roadHandleDragRef.current = {
                kind: 'curve',
                roadId: road.id,
                index: i,
                moved: false,
              };
              return;
            }
          }
        }
      }

      // 2. Hit test city entities
      const hit = hitTestCity(rawWorld, city, camera.zoom, layers);
      if (hit) {
        let nextSel: SelectedEntity[];
        if (e.shiftKey) {
          if (isEntitySelected(selectedItems, hit.category, hit.id)) {
            nextSel = selectedItems.filter(
              (s) => selectionKey(s) !== selectionKey(hit)
            );
          } else {
            nextSel = [...selectedItems, hit];
          }
          onSelectItems(nextSel);
          return;
        }

        if (isEntitySelected(selectedItems, hit.category, hit.id)) {
          nextSel = selectedItems;
        } else {
          nextSel = expandSelectionWithGroups([hit], city);
          onSelectItems(nextSel);
        }

        e.currentTarget.setPointerCapture(e.pointerId);
        entityDragRef.current = {
          active: true,
          items: nextSel,
          lastWorld: rawWorld,
          totalDx: 0,
          totalDy: 0,
        };
        return;
      }

      // 3. Clicked empty canvas -> start marquee selection box
      if (!e.shiftKey) {
        onSelectItems([]);
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setMarqueeDraft({ start: rawWorld, end: rawWorld });
      return;
    }

    const { point, stationId } = resolveToolPoint(rawWorld);

    if (activeTool.kind === 'building') {
      const cfg = BUILDING_CONFIG[activeTool.buildingType];
      const newB: BuildingItem = {
        id: `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: activeTool.buildingType,
        name: `${cfg.defaultName} ${city.buildings.length + 1}`,
        x: point.x,
        y: point.y,
        width: cfg.defaultWidth,
        height: cfg.defaultHeight,
        rotation: previewRotation,
        floors: cfg.defaultFloors,
        zone: cfg.defaultZone,
        usage: cfg.defaultUsage,
      };
      onAddBuilding(newB);
      return;
    }

    if (activeTool.kind === 'public_space') {
      const cfg = PUBLIC_SPACE_CONFIG[activeTool.spaceType];
      const newPs: PublicSpaceItem = {
        id: `ps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: activeTool.spaceType,
        name: `${cfg.defaultName} ${city.publicSpaces.length + 1}`,
        x: point.x,
        y: point.y,
        width: cfg.defaultWidth,
        height: cfg.defaultHeight,
        rotation: previewRotation,
      };
      onAddPublicSpace(newPs);
      return;
    }

    if (activeTool.kind === 'station') {
      const cfg = TRANSIT_STATION_CONFIG[activeTool.stationType];
      const newSt: TransitStation = {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: activeTool.stationType,
        name: `${cfg.defaultName} ${city.stations.length + 1}`,
        x: point.x,
        y: point.y,
      };
      onAddStation(newSt);
      return;
    }

    if (activeTool.kind === 'zone') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setZoneDraft({ start: point, end: point });
      return;
    }

    if (activeTool.kind === 'block') {
      if (activeTool.shape === 'rect') {
        e.currentTarget.setPointerCapture(e.pointerId);
        setBlockDraft({ shape: 'rect', start: point, end: point });
      } else {
        // Polygon block: click vertices, click near start to close
        if (blockDraft?.shape === 'poly' && blockDraft.points) {
          const pts = blockDraft.points;
          if (pts.length >= 3 && distanceBetween(point, pts[0]) <= 14 / camera.zoom) {
            commitPolyBlock(pts);
            setBlockDraft(null);
            return;
          }
          setBlockDraft({ shape: 'poly', points: [...pts, point] });
        } else {
          setBlockDraft({ shape: 'poly', points: [point] });
        }
      }
      return;
    }

    if (activeTool.kind === 'road' || activeTool.kind === 'route') {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (drawingPoints.length === 0) {
        roadDragRef.current = {
          pointerDown: true,
          startScreen: local,
          startWorld: point,
          startStationId: stationId,
          didDrag: false,
        };
        setDrawingPoints([point]);
        setDrawingStationIds(stationId ? [stationId] : []);
      } else {
        const last = drawingPoints[drawingPoints.length - 1];
        if (distanceBetween(last, point) >= 4) {
          const nextPts = [...drawingPoints, point];
          const nextSt = stationId
            ? [...drawingStationIds, stationId]
            : drawingStationIds;
          setDrawingPoints(nextPts);
          setDrawingStationIds(nextSt);
        }
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const local = getLocalCoords(e.clientX, e.clientY);

    if (panDragRef.current.active) {
      const dx = e.clientX - panDragRef.current.lastX;
      const dy = e.clientY - panDragRef.current.lastY;
      panDragRef.current.lastX = e.clientX;
      panDragRef.current.lastY = e.clientY;
      onCameraChange((prev) => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
      return;
    }

    const rawWorld = screenToWorld(
      local.x,
      local.y,
      viewport.width,
      viewport.height,
      camera
    );

    if (roadHandleDragRef.current) {
      const h = roadHandleDragRef.current;
      h.moved = true;
      if (h.kind === 'vertex') {
        const { point, snapPt } = resolveToolPoint(rawWorld, h.roadId);
        setSnapIndicator(snapPt);
        onEditRoadVertex(h.roadId, h.index, point, false);
      } else {
        const road = city.roads.find((r) => r.id === h.roadId);
        if (road && road.points[h.index] && road.points[h.index + 1]) {
          const cp = computeControlPointFromMidpoint(
            road.points[h.index],
            road.points[h.index + 1],
            rawWorld
          );
          onEditRoadCurve(h.roadId, h.index, cp, false);
        }
      }
      return;
    }

    if (entityDragRef.current.active && entityDragRef.current.items.length > 0) {
      const dx = rawWorld.x - entityDragRef.current.lastWorld.x;
      const dy = rawWorld.y - entityDragRef.current.lastWorld.y;
      entityDragRef.current.lastWorld = rawWorld;
      entityDragRef.current.totalDx += dx;
      entityDragRef.current.totalDy += dy;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        onMoveSelected(entityDragRef.current.items, dx, dy, false);
      }
      return;
    }

    if (marqueeDraft) {
      setMarqueeDraft((prev) => (prev ? { ...prev, end: rawWorld } : null));
      return;
    }

    if (zoneDraft) {
      const snapped = snapPointToGrid(rawWorld, snapEnabled);
      setZoneDraft((prev) => (prev ? { ...prev, end: snapped } : null));
      setHoverWorld(snapped);
      return;
    }

    if (blockDraft?.shape === 'rect') {
      const snapped = snapPointToGrid(rawWorld, snapEnabled);
      setBlockDraft((prev) => (prev ? { ...prev, end: snapped } : null));
      setHoverWorld(snapped);
      return;
    }

    if (roadDragRef.current?.pointerDown) {
      const dragScreenDist = distanceBetween(local, roadDragRef.current.startScreen);
      if (dragScreenDist > 12) {
        roadDragRef.current.didDrag = true;
      }
    }

    const { point, snapPt, snapLabel } = resolveToolPoint(rawWorld);
    setHoverWorld(point);
    setSnapIndicator(snapPt);
    setSnapKindLabel(snapLabel);

    if (activeTool.kind === 'select' && !extendingRoadId) {
      setHoveredEntity(hitTestCity(rawWorld, city, camera.zoom, layers));
    } else {
      setHoveredEntity(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current.active) {
      panDragRef.current.active = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      return;
    }

    if (roadHandleDragRef.current) {
      const h = roadHandleDragRef.current;
      roadHandleDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (h.moved) {
        if (h.kind === 'vertex') {
          const road = city.roads.find((r) => r.id === h.roadId);
          if (road && road.points[h.index]) {
            onEditRoadVertex(h.roadId, h.index, road.points[h.index], true);
          }
        } else {
          const road = city.roads.find((r) => r.id === h.roadId);
          const cp = road?.controlPoints?.[h.index];
          if (cp) {
            onEditRoadCurve(h.roadId, h.index, cp, true);
          }
        }
      }
      return;
    }

    if (entityDragRef.current.active) {
      const { items, totalDx, totalDy } = entityDragRef.current;
      entityDragRef.current.active = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (Math.hypot(totalDx, totalDy) > 1) {
        onMoveSelected(items, 0, 0, true);
      }
      return;
    }

    if (marqueeDraft) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const minX = Math.min(marqueeDraft.start.x, marqueeDraft.end.x);
      const maxX = Math.max(marqueeDraft.start.x, marqueeDraft.end.x);
      const minY = Math.min(marqueeDraft.start.y, marqueeDraft.end.y);
      const maxY = Math.max(marqueeDraft.start.y, marqueeDraft.end.y);
      if (maxX - minX > 6 || maxY - minY > 6) {
        const inside = getEntitiesInSelectionBox(
          { minX, minY, maxX, maxY },
          city,
          layers
        );
        const expanded = expandSelectionWithGroups(inside, city);
        if (e.shiftKey) {
          const merged = new Map<string, SelectedEntity>();
          for (const s of selectedItems) merged.set(selectionKey(s), s);
          for (const s of expanded) merged.set(selectionKey(s), s);
          onSelectItems(Array.from(merged.values()));
        } else {
          onSelectItems(expanded);
        }
      }
      setMarqueeDraft(null);
      return;
    }

    if (zoneDraft) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const x = Math.min(zoneDraft.start.x, zoneDraft.end.x);
      const y = Math.min(zoneDraft.start.y, zoneDraft.end.y);
      const w = Math.abs(zoneDraft.end.x - zoneDraft.start.x);
      const h = Math.abs(zoneDraft.end.y - zoneDraft.start.y);
      const zoneType =
        activeTool.kind === 'zone' ? activeTool.zoneType : 'residential';
      const cfg = ZONE_CONFIG[zoneType];

      const finalW = w >= 20 ? w : 140;
      const finalH = h >= 20 ? h : 120;
      const finalX = w >= 20 ? x : zoneDraft.start.x - finalW / 2;
      const finalY = h >= 20 ? y : zoneDraft.start.y - finalH / 2;

      onAddZone({
        id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: zoneType,
        name: `${cfg.defaultName} ${city.zones.length + 1}`,
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
      });
      setZoneDraft(null);
      return;
    }

    if (blockDraft?.shape === 'rect' && blockDraft.start && blockDraft.end) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const x = Math.min(blockDraft.start.x, blockDraft.end.x);
      const y = Math.min(blockDraft.start.y, blockDraft.end.y);
      const w = Math.abs(blockDraft.end.x - blockDraft.start.x);
      const h = Math.abs(blockDraft.end.y - blockDraft.start.y);

      const finalW = w >= 30 ? w : 180;
      const finalH = h >= 30 ? h : 140;
      const finalX = w >= 30 ? x : blockDraft.start.x - finalW / 2;
      const finalY = h >= 30 ? y : blockDraft.start.y - finalH / 2;

      const newBlock: CityBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Block ${(city.blocks?.length || 0) + 1}`,
        neighborhoodType: 'residential',
        points: createRectBlockPoints(finalX, finalY, finalW, finalH),
        lotTargetWidth: 50,
        setback: 8,
      };
      newBlock.subdividedLots = subdivideBlockIntoLots(newBlock);
      onAddBlock(newBlock);
      setBlockDraft(null);
      return;
    }

    if (roadDragRef.current?.pointerDown) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const dragInfo = roadDragRef.current;
      roadDragRef.current = null;

      if (dragInfo.didDrag) {
        const local = getLocalCoords(e.clientX, e.clientY);
        const rawWorld = screenToWorld(
          local.x,
          local.y,
          viewport.width,
          viewport.height,
          camera
        );
        const { point, stationId } = resolveToolPoint(rawWorld);
        if (distanceBetween(dragInfo.startWorld, point) >= 12) {
          const stIds = [
            ...(dragInfo.startStationId ? [dragInfo.startStationId] : []),
            ...(stationId && stationId !== dragInfo.startStationId
              ? [stationId]
              : []),
          ];
          commitPolyline([dragInfo.startWorld, point], stIds);
        }
        setDrawingPoints([]);
        setDrawingStationIds([]);
      }
    }
  };

  const handleDoubleClick = () => {
    if (
      (activeTool.kind === 'road' ||
        activeTool.kind === 'route' ||
        extendingRoadId) &&
      drawingPoints.length >= 2
    ) {
      commitPolyline(drawingPoints, drawingStationIds);
      setDrawingPoints([]);
      setDrawingStationIds([]);
    } else if (
      blockDraft?.shape === 'poly' &&
      blockDraft.points &&
      blockDraft.points.length >= 3
    ) {
      commitPolyBlock(blockDraft.points);
      setBlockDraft(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const local = getLocalCoords(e.clientX, e.clientY);
    const worldBefore = screenToWorld(
      local.x,
      local.y,
      viewport.width,
      viewport.height,
      camera
    );
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.91;
    const minZoom = isGeoProject ? 0.06 : 0.25;
    const nextZoom = Math.max(minZoom, Math.min(4.0, camera.zoom * zoomFactor));

    const nextCamX =
      worldBefore.x - (local.x - viewport.width / 2) / nextZoom;
    const nextCamY =
      worldBefore.y - (local.y - viewport.height / 2) / nextZoom;

    onCameraChange({ x: nextCamX, y: nextCamY, zoom: nextZoom });
  };

  const handleZoomStep = (factor: number) => {
    const minZoom = isGeoProject ? 0.06 : 0.25;
    onCameraChange((prev) => ({
      ...prev,
      zoom: Math.max(minZoom, Math.min(4.0, prev.zoom * factor)),
    }));
  };

  const handleFitCity = () => {
    const b = getCityBounds(city);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const spanX = Math.max(200, b.maxX - b.minX + 120);
    const spanY = Math.max(200, b.maxY - b.minY + 120);
    const zoom = Math.max(
      isGeoProject ? 0.1 : 0.3,
      Math.min(1.6, Math.min(viewport.width / spanX, viewport.height / spanY))
    );
    onCameraChange({ x: cx, y: cy, zoom });
  };

  const isEmptyCity =
    !isGeoProject &&
    city.roads.length === 0 &&
    city.buildings.length === 0 &&
    city.publicSpaces.length === 0 &&
    city.zones.length === 0 &&
    (city.blocks?.length || 0) === 0 &&
    city.stations.length === 0 &&
    city.routes.length === 0;

  const cursorClass =
    activeTool.kind === 'pan' || spacePressedRef.current
      ? 'cursor-grab active:cursor-grabbing'
      : activeTool.kind === 'select' && !extendingRoadId
        ? hoveredEntity
          ? 'cursor-pointer'
          : 'cursor-default'
        : 'cursor-crosshair';

  const toolInstruction = (() => {
    if (extendingRoadId) {
      return 'Click points to extend road · Double-click or press Enter to finish · Esc to cancel';
    }
    if (snapKindLabel) {
      return snapKindLabel;
    }
    if (drawingPoints.length > 0) {
      return 'Click to add points · Double-click or press Enter to finish · Esc to cancel';
    }
    if (blockDraft?.shape === 'poly' && blockDraft.points) {
      return 'Click corners for city block · Click start point, double-click, or press Enter to close';
    }
    switch (activeTool.kind) {
      case 'select':
        return 'Click or drag box to select · Shift+Click multi-select · Drag handles on selected road to curve';
      case 'pan':
        return 'Drag anywhere on the map to pan · Scroll to zoom';
      case 'road':
        return `Drawing ${getToolLabel(activeTool)} · Drag or click points (snaps to roads)`;
      case 'route':
        return `Drawing ${getToolLabel(activeTool)} · Click stations or points to route`;
      case 'zone':
        return `Drag on map to paint ${getToolLabel(activeTool)}`;
      case 'block':
        return activeTool.shape === 'rect'
          ? 'Drag on map to draw rectangular city block · Subdivide in Inspector'
          : 'Click corners to draw polygonal city block';
      case 'building':
      case 'public_space':
        return `Click on map to place ${getToolLabel(activeTool)} · Press R to rotate`;
      case 'station':
        return `Click on map to place ${getToolLabel(activeTool)}`;
    }
  })();

  const liveLatLon: GeoPoint | null = useMemo(() => {
    if (!isGeoProject || !city.geoOrigin) return null;
    if (areaSelectMode && cursorLatLon) return cursorLatLon;
    if (hoverWorld) return worldToLatLon(hoverWorld.x, hoverWorld.y, city.geoOrigin);
    return worldToLatLon(camera.x, camera.y, city.geoOrigin);
  }, [areaSelectMode, camera.x, camera.y, city.geoOrigin, cursorLatLon, hoverWorld, isGeoProject]);

  return (
    <main
      ref={containerRef}
      className="relative flex-1 bg-[#F2F4F0] overflow-hidden select-none"
    >
      {isGeoProject && city.geoOrigin && (
        <LeafletMapLayer
          origin={city.geoOrigin}
          camera={camera}
          visible={layers.basemap !== false}
          areaSelectMode={areaSelectMode}
          drawingSelectionBox={drawingSelectionBox}
          selectionBounds={selectionBounds}
          importedBounds={city.importedBounds}
          onCameraChange={onCameraChange}
          onSelectionBoundsChange={(b) => {
            setSelectionBounds(b);
            setImportError('');
          }}
          onDrawingBoxFinished={() => setDrawingSelectionBox(false)}
          onCursorLatLonChange={setCursorLatLon}
          viewportSize={viewport}
        />
      )}

      <canvas
        ref={canvasRef}
        data-testid="city-canvas"
        data-mode={city.mode || 'fictional'}
        data-buildings={city.buildings.length}
        data-roads={city.roads.length}
        data-stations={city.stations.length}
        data-zones={city.zones.length}
        data-blocks={city.blocks?.length || 0}
        data-public-spaces={city.publicSpaces.length}
        data-selected-count={selectedItems.length}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setHoverWorld(null);
          setSnapIndicator(null);
          setSnapKindLabel('');
        }}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative z-[1] w-full h-full block touch-none ${
          isGeoProject && areaSelectMode ? 'pointer-events-none' : cursorClass
        }`}
      />

      {/* Top-Center Floating View & Layer Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-max max-w-[calc(100%-24px)] flex items-center gap-2 z-10 flex-wrap justify-center">
        <div
          role="tablist"
          aria-label="Map visualization mode"
          className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
        >
          {(
            [
              { id: 'standard', label: 'Map' },
              { id: 'zoning', label: 'Zoning' },
              { id: 'transit', label: 'Transit' },
              { id: 'density', label: 'Density' },
            ] as { id: ViewMode; label: string }[]
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={viewMode === mode.id}
              onClick={() => onViewModeChange(mode.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === mode.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {isGeoProject && (
          <button
            type="button"
            onClick={() => onAreaSelectModeChange(!areaSelectMode)}
            aria-pressed={areaSelectMode}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              areaSelectMode
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-white/95 text-blue-700 border-blue-200 hover:bg-blue-50'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>{areaSelectMode ? 'Back to Editing' : 'Import OSM Area'}</span>
          </button>
        )}

        {isGeoProject && (
          <div className="flex items-center gap-0.5 p-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm">
            <button
              type="button"
              onClick={() => onToggleLayer('existing')}
              aria-pressed={layers.existing !== false}
              title="Toggle imported OpenStreetMap existing infrastructure"
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layers.existing !== false
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => onToggleLayer('proposed')}
              aria-pressed={layers.proposed !== false}
              title="Toggle your proposed changes"
              className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                layers.proposed !== false
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Proposed
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleSnap}
          title="Snap placement to grid & roads"
          aria-pressed={snapEnabled}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            snapEnabled
              ? 'bg-white text-blue-700 border-blue-200'
              : 'bg-white/95 text-slate-600 border-slate-200 hover:text-slate-900'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Snap</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            aria-expanded={layersOpen}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white/95 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layers</span>
          </button>

          {layersOpen && (
            <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-lg shadow-lg p-1.5 z-20">
              {(
                [
                  ...(isGeoProject
                    ? [
                        { key: 'basemap' as keyof LayerVisibility, label: 'OSM base map' },
                        { key: 'existing' as keyof LayerVisibility, label: 'Existing infrastructure' },
                        { key: 'proposed' as keyof LayerVisibility, label: 'Proposed changes' },
                      ]
                    : []),
                  { key: 'water' as keyof LayerVisibility, label: 'Rivers & water' },
                  { key: 'grid' as keyof LayerVisibility, label: 'Grid overlay' },
                  { key: 'zones' as keyof LayerVisibility, label: 'Zoning districts' },
                  { key: 'blocks' as keyof LayerVisibility, label: 'City blocks' },
                  { key: 'roads' as keyof LayerVisibility, label: 'Streets & roads' },
                  { key: 'buildings' as keyof LayerVisibility, label: 'Buildings' },
                  { key: 'publicSpaces' as keyof LayerVisibility, label: 'Parks & plazas' },
                  { key: 'transit' as keyof LayerVisibility, label: 'Public transit' },
                  { key: 'labels' as keyof LayerVisibility, label: 'Map labels' },
                ] as { key: keyof LayerVisibility; label: string }[]
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onToggleLayer(item.key)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  <span>{item.label}</span>
                  {layers[item.key] !== false && (
                    <Check className="w-3.5 h-3.5 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Geographic OSM Import Panel (when areaSelectMode is active) */}
      {isGeoProject && areaSelectMode && (
        <section
          aria-label="OpenStreetMap Area Import"
          className="absolute top-16 left-3 w-72 max-h-[calc(100%-6.5rem)] overflow-y-auto custom-scrollbar bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg p-3.5 space-y-3 z-20"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                Real-World Map Explorer
              </p>
              <h2 className="text-sm font-semibold text-slate-900">
                Import OpenStreetMap Area
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                onAreaSelectModeChange(false);
                setDrawingSelectionBox(false);
              }}
              aria-label="Exit area selection"
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            Pan and zoom the map, then draw a box or frame your current view to import real streets, buildings, parks, and transit.
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setDrawingSelectionBox((v) => !v)}
              aria-pressed={drawingSelectionBox}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                drawingSelectionBox
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SquareDashedMousePointer className="w-3.5 h-3.5" />
              <span>{drawingSelectionBox ? 'Drag on map...' : 'Draw Area Box'}</span>
            </button>
            <button
              type="button"
              onClick={handleUseVisibleArea}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fit to View</span>
            </button>
          </div>

          {boundsMetrics && (
            <div
              className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono-tabular flex items-center justify-between ${
                boundsMetrics.withinLimit
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <span>
                {boundsMetrics.widthM}m × {boundsMetrics.heightM}m
              </span>
              <span>
                {boundsMetrics.areaKm2} km²
                {!boundsMetrics.withinLimit ? ' (Too large)' : ''}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-500">
              Feature categories
            </p>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {(
                [
                  { key: 'roads', label: 'Roads & paths' },
                  { key: 'buildings', label: 'Buildings' },
                  { key: 'natural', label: 'Parks & water' },
                  { key: 'transportation', label: 'Transit & rail' },
                ] as { key: keyof OsmImportCategories; label: string }[]
              ).map((cat) => (
                <label
                  key={cat.key}
                  className="flex items-center gap-2 px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={importCategories[cat.key]}
                    onChange={(e) =>
                      setImportCategories((prev) => ({
                        ...prev,
                        [cat.key]: e.target.checked,
                      }))
                    }
                    className="accent-blue-600 rounded"
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {importError && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          <button
            type="button"
            disabled={importingOsm || !selectionBounds || !boundsMetrics?.withinLimit}
            onClick={handleImportOsmArea}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {importingOsm ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Importing OpenStreetMap Data...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Import Selected Area</span>
              </>
            )}
          </button>
        </section>
      )}

      {/* Import Success Toast */}
      {importToast && (
        <div
          role="status"
          className="absolute top-14 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3.5 py-2 rounded-lg shadow-md flex items-center gap-2 z-20"
        >
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{importToast}</span>
        </div>
      )}

      {/* Empty Map Helpful State (Fictional Only) */}
      {isEmptyCity && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm px-5 py-4 max-w-md text-center z-10">
          <h2 className="text-sm font-semibold text-slate-900">
            Empty City Canvas
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Select a road, building, block, park, or transit tool from the left sidebar to begin designing your city from scratch.
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onLoadSampleCity}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Load Sample City
            </button>
          </div>
        </div>
      )}

      {/* Active Polyline / Extension / Polygon Block Finish Helper */}
      {(drawingPoints.length >= 2 ||
        (blockDraft?.shape === 'poly' &&
          blockDraft.points &&
          blockDraft.points.length >= 3)) && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-md text-xs z-10">
          <span>
            {blockDraft?.shape === 'poly'
              ? `${blockDraft.points?.length || 0} corners placed`
              : extendingRoadId
                ? `Extending road (${drawingPoints.length} pts)`
                : `${drawingPoints.length} points placed`}
          </span>
          <button
            type="button"
            onClick={() => {
              if (blockDraft?.shape === 'poly' && blockDraft.points) {
                commitPolyBlock(blockDraft.points);
                setBlockDraft(null);
              } else {
                commitPolyline(drawingPoints, drawingStationIds);
                setDrawingPoints([]);
                setDrawingStationIds([]);
              }
            }}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded font-medium cursor-pointer"
          >
            Finish
          </button>
          <button
            type="button"
            onClick={() => {
              setDrawingPoints([]);
              setDrawingStationIds([]);
              setBlockDraft(null);
              if (extendingRoadId) onCancelExtendRoad();
            }}
            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bottom HUD: Contextual Hint + Geographic Coordinates (Left) & Attribution + Zoom Controls (Right) */}
      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2 z-10 pointer-events-none">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="bg-white/92 backdrop-blur-sm border border-slate-200 rounded-md px-2.5 py-1 text-[11px] text-slate-600 shadow-sm hidden sm:block truncate min-w-0">
            {areaSelectMode
              ? drawingSelectionBox
                ? 'Drag diagonally to frame your OSM import area'
                : 'Map explorer · Drag to pan, scroll to zoom · Draw Area Box or Import'
              : toolInstruction}
          </div>
          {isGeoProject && liveLatLon && (
            <div
              data-testid="geo-coords-readout"
              className="bg-white/92 backdrop-blur-sm border border-slate-200 rounded-md px-2 py-1 text-[11px] font-mono-tabular text-slate-700 shadow-sm whitespace-nowrap shrink-0"
            >
              {liveLatLon.lat.toFixed(5)}, {liveLatLon.lon.toFixed(5)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 pointer-events-auto">
          {isGeoProject && (
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white/92 backdrop-blur-sm border border-slate-200 rounded-md px-2 py-1 text-[10px] text-slate-600 hover:text-slate-900 shadow-sm whitespace-nowrap"
            >
              {city.attribution || OSM_SERVICE_CONFIG.attribution}
            </a>
          )}

          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-1 shadow-sm">
            <button
              type="button"
              onClick={() => onToggleLayer('grid')}
              title="Toggle grid (G)"
              aria-label="Toggle grid overlay"
              aria-pressed={layers.grid}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                layers.grid
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onToggleLayer('labels')}
              title="Toggle labels"
              aria-label="Toggle map labels"
              aria-pressed={layers.labels}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                layers.labels
                  ? 'text-blue-600 bg-blue-50'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => handleZoomStep(0.85)}
              title="Zoom out"
              aria-label="Zoom out"
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onCameraChange((prev) => ({ ...prev, zoom: isGeoProject ? 0.42 : 1 }))}
              title="Reset zoom"
              className="px-2 py-1 text-xs font-mono-tabular font-medium text-slate-700 hover:bg-slate-100 rounded min-w-[46px] text-center cursor-pointer"
            >
              {Math.round(camera.zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={() => handleZoomStep(1.18)}
              title="Zoom in"
              aria-label="Zoom in"
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleFitCity}
              title="Fit city in view"
              aria-label="Fit city in view"
              className="p-1.5 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
