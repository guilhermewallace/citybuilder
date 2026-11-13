import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_SERVICE_CONFIG } from '../services/osmService';
import {
  CameraState,
  GeoBounds,
  GeoOrigin,
  GeoPoint,
} from '../types/city';
import {
  cameraZoomForLeafletZoom,
  latLonToWorld,
  leafletZoomForCameraZoom,
  worldToLatLon,
} from '../utils/geoCoords';

interface LeafletMapLayerProps {
  origin: GeoOrigin;
  camera: CameraState;
  visible: boolean;
  areaSelectMode: boolean;
  drawingSelectionBox: boolean;
  selectionBounds: GeoBounds | null;
  importedBounds?: GeoBounds[];
  onCameraChange: (next: CameraState) => void;
  onSelectionBoundsChange: (bounds: GeoBounds) => void;
  onDrawingBoxFinished?: () => void;
  onCursorLatLonChange?: (pt: GeoPoint | null) => void;
  viewportSize: { width: number; height: number };
}

export const LeafletMapLayer: React.FC<LeafletMapLayerProps> = ({
  origin,
  camera,
  visible,
  areaSelectMode,
  drawingSelectionBox,
  selectionBounds,
  importedBounds,
  onCameraChange,
  onSelectionBoundsChange,
  onDrawingBoxFinished,
  onCursorLatLonChange,
  viewportSize,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectionLayerRef = useRef<L.Rectangle | null>(null);
  const importedGroupRef = useRef<L.LayerGroup | null>(null);
  const originMarkerRef = useRef<L.CircleMarker | null>(null);

  const syncingFromCameraRef = useRef(false);
  const originRef = useRef(origin);
  originRef.current = origin;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const onSelectionBoundsChangeRef = useRef(onSelectionBoundsChange);
  onSelectionBoundsChangeRef.current = onSelectionBoundsChange;
  const onDrawingBoxFinishedRef = useRef(onDrawingBoxFinished);
  onDrawingBoxFinishedRef.current = onDrawingBoxFinished;
  const onCursorLatLonChangeRef = useRef(onCursorLatLonChange);
  onCursorLatLonChangeRef.current = onCursorLatLonChange;
  const drawingBoxStateRef = useRef<{
    active: boolean;
    startLatLng: L.LatLng | null;
  }>({ active: false, startLatLng: null });
  const drawingModeRef = useRef(drawingSelectionBox);
  drawingModeRef.current = drawingSelectionBox;

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialCenter = worldToLatLon(camera.x, camera.y, originRef.current);
    const initialZoom = Math.max(
      3,
      Math.min(19.5, leafletZoomForCameraZoom(camera.zoom, originRef.current.lat))
    );

    const map = L.map(el, {
      center: [initialCenter.lat, initialCenter.lon],
      zoom: initialZoom,
      zoomSnap: 0,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 90,
      attributionControl: false,
      zoomControl: false,
      boxZoom: false,
      doubleClickZoom: false,
    });

    L.tileLayer(OSM_SERVICE_CONFIG.tileUrlTemplate, {
      maxNativeZoom: 19,
      maxZoom: 21,
      crossOrigin: true,
    }).addTo(map);

    const importedGroup = L.layerGroup().addTo(map);
    importedGroupRef.current = importedGroup;

    const originMarker = L.circleMarker([originRef.current.lat, originRef.current.lon], {
      radius: 5,
      color: '#1D4ED8',
      weight: 2,
      fillColor: '#FFFFFF',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map);
    originMarkerRef.current = originMarker;

    const handleMapMove = () => {
      if (syncingFromCameraRef.current) return;
      const c = map.getCenter();
      const lz = map.getZoom();
      const worldCenter = latLonToWorld(c.lat, c.lng, originRef.current);
      const camZoom = Math.max(
        0.05,
        Math.min(4.0, cameraZoomForLeafletZoom(lz, originRef.current.lat))
      );
      onCameraChangeRef.current({
        x: worldCenter.x,
        y: worldCenter.y,
        zoom: camZoom,
      });
    };

    map.on('move', handleMapMove);
    map.on('zoom', handleMapMove);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      onCursorLatLonChangeRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng });
      if (drawingBoxStateRef.current.active && drawingBoxStateRef.current.startLatLng) {
        const s = drawingBoxStateRef.current.startLatLng;
        const bounds: GeoBounds = {
          north: Math.max(s.lat, e.latlng.lat),
          south: Math.min(s.lat, e.latlng.lat),
          east: Math.max(s.lng, e.latlng.lng),
          west: Math.min(s.lng, e.latlng.lng),
        };
        onSelectionBoundsChangeRef.current(bounds);
      }
    });

    map.on('mouseout', () => {
      onCursorLatLonChangeRef.current?.(null);
    });

    map.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (!drawingModeRef.current) return;
      drawingBoxStateRef.current = {
        active: true,
        startLatLng: e.latlng,
      };
      onSelectionBoundsChangeRef.current({
        north: e.latlng.lat,
        south: e.latlng.lat,
        east: e.latlng.lng,
        west: e.latlng.lng,
      });
    });

    const finishBox = () => {
      if (drawingBoxStateRef.current.active) {
        drawingBoxStateRef.current = { active: false, startLatLng: null };
        onDrawingBoxFinishedRef.current?.();
      }
    };
    map.on('mouseup', finishBox);
    window.addEventListener('mouseup', finishBox);

    mapRef.current = map;

    return () => {
      window.removeEventListener('mouseup', finishBox);
      map.remove();
      mapRef.current = null;
      selectionLayerRef.current = null;
      importedGroupRef.current = null;
      originMarkerRef.current = null;
    };
    // Only mount once per Geographic project origin change handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-size Leaflet when container resizes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize({ animate: false });
  }, [viewportSize.width, viewportSize.height]);

  // Update origin marker when switching real-world projects
  useEffect(() => {
    originMarkerRef.current?.setLatLng([origin.lat, origin.lon]);
  }, [origin.lat, origin.lon]);

  // Toggle Leaflet interactive dragging/scroll according to mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (areaSelectMode && !drawingSelectionBox) {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
    } else if (areaSelectMode && drawingSelectionBox) {
      map.dragging.disable();
      map.scrollWheelZoom.enable();
    } else {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
    }
  }, [areaSelectMode, drawingSelectionBox]);

  // Sync CityBuilder camera -> Leaflet view 1:1
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const targetLatLon = worldToLatLon(camera.x, camera.y, origin);
    const targetZoom = Math.max(
      2,
      Math.min(20, leafletZoomForCameraZoom(camera.zoom, origin.lat))
    );

    const curCenter = map.getCenter();
    const curZoom = map.getZoom();
    const latDiff = Math.abs(curCenter.lat - targetLatLon.lat);
    const lonDiff = Math.abs(curCenter.lng - targetLatLon.lon);
    const zoomDiff = Math.abs(curZoom - targetZoom);

    if (latDiff > 1e-7 || lonDiff > 1e-7 || zoomDiff > 1e-4) {
      syncingFromCameraRef.current = true;
      map.setView([targetLatLon.lat, targetLatLon.lon], targetZoom, {
        animate: false,
      });
      syncingFromCameraRef.current = false;
    }
  }, [camera.x, camera.y, camera.zoom, origin]);

  // Render imported bounding boxes on Leaflet
  useEffect(() => {
    const group = importedGroupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const b of importedBounds || []) {
      L.rectangle(
        [
          [b.south, b.west],
          [b.north, b.east],
        ],
        {
          color: '#2563EB',
          weight: 1.5,
          dashArray: '5 4',
          fillColor: '#3B82F6',
          fillOpacity: 0.05,
          interactive: false,
        }
      ).addTo(group);
    }
  }, [importedBounds]);

  // Render active import selection rectangle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!areaSelectMode || !selectionBounds) {
      if (selectionLayerRef.current) {
        selectionLayerRef.current.remove();
        selectionLayerRef.current = null;
      }
      return;
    }

    const latLngBounds: L.LatLngBoundsExpression = [
      [selectionBounds.south, selectionBounds.west],
      [selectionBounds.north, selectionBounds.east],
    ];

    if (!selectionLayerRef.current) {
      selectionLayerRef.current = L.rectangle(latLngBounds, {
        color: '#1D4ED8',
        weight: 2,
        dashArray: '6 4',
        fillColor: '#2563EB',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(map);
    } else {
      selectionLayerRef.current.setBounds(latLngBounds);
    }
  }, [areaSelectMode, selectionBounds]);

  return (
    <div
      data-testid="leaflet-map-layer"
      aria-hidden={!visible}
      className={`absolute inset-0 z-0 transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${
        areaSelectMode
          ? drawingSelectionBox
            ? 'pointer-events-auto cursor-crosshair'
            : 'pointer-events-auto cursor-grab active:cursor-grabbing'
          : 'pointer-events-none'
      }`}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
