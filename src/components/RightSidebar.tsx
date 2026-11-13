import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Copy,
  Group,
  RotateCw,
  Scissors,
  Sparkles,
  Spline,
  Trash2,
  Ungroup,
  Waypoints,
} from 'lucide-react';
import {
  BUILDING_CONFIG,
  BUILDING_USAGES,
  METERS_PER_UNIT,
  NEIGHBORHOOD_CONFIG,
  PUBLIC_SPACE_CONFIG,
  ROAD_CONFIG,
  TRANSIT_LINE_CONFIG,
  TRANSIT_STATION_CONFIG,
  ZONE_CONFIG,
} from '../data/catalog';
import {
  BuildingItem,
  BuildingType,
  BuildingUsage,
  CityBlock,
  CityData,
  CityStatistics,
  GeoMetadata,
  LayerSource,
  NeighborhoodType,
  ObjectAppearance,
  Point,
  PublicSpaceItem,
  PublicSpaceType,
  RoadSegment,
  RoadType,
  SelectedEntity,
  TransitLineType,
  TransitRoute,
  TransitStation,
  TransitStationType,
  ZoneRect,
  ZoneType,
} from '../types/city';
import { polygonAreaM2, polygonCentroid } from '../utils/blockSubdivision';
import { AlignMode, getEntityGroupId } from '../utils/cityOperations';
import { worldToLatLon } from '../utils/geoCoords';
import {
  computePolylineLengthMeters,
  computeRoadLengthMeters,
  findRoadIntersections,
} from '../utils/geometry';
import { calculateBuildingMetrics } from '../utils/simulation';

interface RightSidebarProps {
  city: CityData;
  stats: CityStatistics;
  selectedItems: SelectedEntity[];
  extendingRoadId: string | null;
  onClearSelection: () => void;
  onUpdateBuilding: (id: string, patch: Partial<BuildingItem>) => void;
  onUpdateRoad: (id: string, patch: Partial<RoadSegment>) => void;
  onUpdateZone: (id: string, patch: Partial<ZoneRect>) => void;
  onUpdateBlock: (id: string, patch: Partial<CityBlock>) => void;
  onUpdatePublicSpace: (id: string, patch: Partial<PublicSpaceItem>) => void;
  onUpdateStation: (id: string, patch: Partial<TransitStation>) => void;
  onUpdateRoute: (id: string, patch: Partial<TransitRoute>) => void;
  onMoveSingleItem: (item: SelectedEntity, dx: number, dy: number) => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onAlignSelected: (mode: AlignMode) => void;
  onDistributeSelected: (axis: 'horizontal' | 'vertical') => void;
  onStartExtendRoad: (roadId: string) => void;
  onSplitRoadAtIntersections: (roadId: string) => void;
  onStraightenRoad: (roadId: string) => void;
  onSubdivideBlock: (blockId: string, fillBuildings: boolean) => void;
}

const AppearanceEditor: React.FC<{
  appearance?: ObjectAppearance;
  defaultFill: string;
  defaultStroke: string;
  onChange: (next: ObjectAppearance | undefined) => void;
}> = ({ appearance, defaultFill, defaultStroke, onChange }) => {
  const fill = appearance?.fillColor || defaultFill;
  const stroke = appearance?.strokeColor || defaultStroke;
  const opacity = appearance?.opacity ?? 1;

  return (
    <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500">
          Visual appearance
        </span>
        {appearance && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[11px] text-blue-600 hover:underline cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between px-2 py-1 rounded border border-slate-200 bg-white">
          <span className="text-slate-600">Fill</span>
          <input
            type="color"
            aria-label="Fill color"
            value={fill.startsWith('#') ? fill : '#94a3B8'}
            onChange={(e) =>
              onChange({ ...appearance, fillColor: e.target.value })
            }
            className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
          />
        </label>
        <label className="flex items-center justify-between px-2 py-1 rounded border border-slate-200 bg-white">
          <span className="text-slate-600">Stroke</span>
          <input
            type="color"
            aria-label="Stroke color"
            value={stroke.startsWith('#') ? stroke : '#475569'}
            onChange={(e) =>
              onChange({ ...appearance, strokeColor: e.target.value })
            }
            className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
          />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="app-opacity" className="text-slate-500 w-14">
          Opacity
        </label>
        <input
          id="app-opacity"
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) =>
            onChange({ ...appearance, opacity: Number(e.target.value) })
          }
          className="flex-1 accent-slate-900"
        />
        <span className="font-mono-tabular w-9 text-right text-slate-700">
          {Math.round(opacity * 100)}%
        </span>
      </div>
    </div>
  );
};

const GeoLayerMeta: React.FC<{
  city: CityData;
  worldPoint: Point;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
  onChangeLayerSource: (next: LayerSource) => void;
}> = ({ city, worldPoint, layerSource, geo, onChangeLayerSource }) => {
  if (city.mode !== 'geographic' && !geo) return null;

  const isExisting = layerSource === 'existing';
  const coords = city.geoOrigin
    ? worldToLatLon(worldPoint.x, worldPoint.y, city.geoOrigin)
    : geo
      ? { lat: geo.lat, lon: geo.lon }
      : null;

  return (
    <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">
          Layer:{' '}
          <strong
            className={
              isExisting ? 'text-slate-800 font-semibold' : 'text-blue-700 font-semibold'
            }
          >
            {isExisting ? 'Existing Infrastructure' : 'Proposed Change'}
          </strong>
        </span>
        <button
          type="button"
          onClick={() => onChangeLayerSource(isExisting ? 'proposed' : 'existing')}
          className="text-blue-600 hover:underline font-medium cursor-pointer shrink-0"
        >
          {isExisting ? 'Mark Proposed' : 'Mark Existing'}
        </button>
      </div>

      {coords && (
        <div className="flex items-center justify-between text-slate-600 font-mono-tabular">
          <span>
            {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
          </span>
          {geo?.osmId && (
            <span className="text-slate-400">OSM {geo.osmId}</span>
          )}
        </div>
      )}
    </div>
  );
};

export const RightSidebar: React.FC<RightSidebarProps> = ({
  city,
  stats,
  selectedItems,
  extendingRoadId,
  onClearSelection,
  onUpdateBuilding,
  onUpdateRoad,
  onUpdateZone,
  onUpdateBlock,
  onUpdatePublicSpace,
  onUpdateStation,
  onUpdateRoute,
  onMoveSingleItem,
  onDeleteSelected,
  onDuplicateSelected,
  onGroupSelected,
  onUngroupSelected,
  onAlignSelected,
  onDistributeSelected,
  onStartExtendRoad,
  onSplitRoadAtIntersections,
  onStraightenRoad,
  onSubdivideBlock,
}) => {
  const renderMultiSelectionPanel = () => {
    const anyGrouped = selectedItems.some((item) =>
      Boolean(getEntityGroupId(item, city))
    );

    return (
      <section
        aria-label="Multi-selection tools"
        className="p-4 border-b border-slate-200 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-blue-600">
              Multi-Selection
            </p>
            <h2 className="text-sm font-semibold text-slate-900">
              {selectedItems.length} objects selected
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicateSelected}
              title="Duplicate selection (Ctrl+C / Ctrl+V)"
              aria-label="Duplicate selected objects"
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              title="Delete selected objects (Del)"
              aria-label="Delete selected objects"
              className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Grouping */}
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <button
            type="button"
            onClick={onGroupSelected}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium cursor-pointer"
          >
            <Group className="w-3.5 h-3.5" />
            <span>Group</span>
          </button>
          <button
            type="button"
            onClick={onUngroupSelected}
            disabled={!anyGrouped}
            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <Ungroup className="w-3.5 h-3.5" />
            <span>Ungroup</span>
          </button>
        </div>

        {/* Alignment */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-slate-500 block">
            Align objects
          </span>
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              onClick={() => onAlignSelected('left')}
              title="Align left"
              aria-label="Align left"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignStartVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignSelected('center')}
              title="Align horizontal center"
              aria-label="Align horizontal center"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignCenterVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignSelected('right')}
              title="Align right"
              aria-label="Align right"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignEndVertical className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignSelected('top')}
              title="Align top"
              aria-label="Align top"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignStartHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignSelected('middle')}
              title="Align vertical middle"
              aria-label="Align vertical middle"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignCenterHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onAlignSelected('bottom')}
              title="Align bottom"
              aria-label="Align bottom"
              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center text-slate-700 cursor-pointer"
            >
              <AlignEndHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Distribution */}
        {selectedItems.length >= 3 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-500 block">
              Distribute evenly
            </span>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => onDistributeSelected('horizontal')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <AlignHorizontalSpaceAround className="w-3.5 h-3.5" />
                <span>Horizontal</span>
              </button>
              <button
                type="button"
                onClick={() => onDistributeSelected('vertical')}
                className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
                <span>Vertical</span>
              </button>
            </div>
          </div>
        )}
      </section>
    );
  };

  const renderSingleInspector = () => {
    if (selectedItems.length !== 1) return null;
    const selected = selectedItems[0];
    const isGrouped = Boolean(getEntityGroupId(selected, city));

    if (selected.category === 'building') {
      const b = city.buildings.find((item) => item.id === selected.id);
      if (!b) return null;
      const metrics = calculateBuildingMetrics(b);
      const cfg = BUILDING_CONFIG[b.type];

      return (
        <section
          aria-label="Selected building properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                Selected Building{isGrouped ? ' · Grouped' : ''}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[155px]">
                {b.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                title="Duplicate building"
                aria-label="Duplicate selected building"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateBuilding(b.id, { rotation: (b.rotation + 45) % 360 })
                }
                title="Rotate 45° (R)"
                aria-label="Rotate building 45 degrees"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                title="Delete building (Del)"
                aria-label={`Delete ${b.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="bld-name" className="block text-slate-500 mb-1">
                Building name
              </label>
              <input
                id="bld-name"
                type="text"
                value={b.name}
                onChange={(e) => onUpdateBuilding(b.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="bld-type" className="block text-slate-500 mb-1">
                  Category
                </label>
                <select
                  id="bld-type"
                  value={b.type}
                  onChange={(e) => {
                    const nextType = e.target.value as BuildingType;
                    onUpdateBuilding(b.id, {
                      type: nextType,
                      usage: BUILDING_CONFIG[nextType].defaultUsage,
                    });
                  }}
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
                >
                  {(Object.keys(BUILDING_CONFIG) as BuildingType[]).map((t) => (
                    <option key={t} value={t}>
                      {BUILDING_CONFIG[t].label.replace(' building', '')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="bld-zone" className="block text-slate-500 mb-1">
                  Zone class
                </label>
                <select
                  id="bld-zone"
                  value={b.zone}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, { zone: e.target.value as ZoneType })
                  }
                  className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
                >
                  {(Object.keys(ZONE_CONFIG) as ZoneType[]).map((z) => (
                    <option key={z} value={z}>
                      {ZONE_CONFIG[z].label.replace(' zone', '')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="bld-usage" className="block text-slate-500 mb-1">
                Building usage
              </label>
              <select
                id="bld-usage"
                value={b.usage || cfg.defaultUsage}
                onChange={(e) =>
                  onUpdateBuilding(b.id, {
                    usage: e.target.value as BuildingUsage,
                  })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
              >
                {BUILDING_USAGES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Position & Rotation */}
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label htmlFor="bld-x" className="block text-slate-500 mb-1">
                  X (m)
                </label>
                <input
                  id="bld-x"
                  type="number"
                  value={Math.round(b.x * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      x: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="bld-y" className="block text-slate-500 mb-1">
                  Y (m)
                </label>
                <input
                  id="bld-y"
                  type="number"
                  value={Math.round(b.y * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      y: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="bld-rot" className="block text-slate-500 mb-1">
                  Rot (°)
                </label>
                <input
                  id="bld-rot"
                  type="number"
                  min={0}
                  max={359}
                  value={Math.round(b.rotation)}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      rotation: ((Number(e.target.value) || 0) % 360 + 360) % 360,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="bld-floors" className="text-slate-500">
                  Floors
                </label>
                <span className="font-mono-tabular text-slate-800 font-medium">
                  {b.floors}F · {metrics.heightM}m
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="bld-floors"
                  type="range"
                  min={1}
                  max={40}
                  value={b.floors}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      floors: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="flex-1 accent-slate-900"
                />
                <input
                  aria-label="Floors count"
                  type="number"
                  min={1}
                  max={80}
                  value={b.floors}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      floors: Math.max(1, Math.min(80, Number(e.target.value) || 1)),
                    })
                  }
                  className="w-14 px-2 py-1 rounded border border-slate-200 font-mono-tabular text-right"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="bld-w" className="block text-slate-500 mb-1">
                  Width (m)
                </label>
                <input
                  id="bld-w"
                  type="number"
                  min={6}
                  max={120}
                  value={Math.round(b.width * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      width: Math.max(
                        12,
                        (Number(e.target.value) || 10) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="bld-h" className="block text-slate-500 mb-1">
                  Depth (m)
                </label>
                <input
                  id="bld-h"
                  type="number"
                  min={6}
                  max={120}
                  value={Math.round(b.height * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateBuilding(b.id, {
                      height: Math.max(
                        12,
                        (Number(e.target.value) || 10) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="bld-pop" className="text-slate-500">
                  Estimated population
                </label>
                {typeof b.populationOverride === 'number' && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateBuilding(b.id, { populationOverride: null })
                    }
                    className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                  >
                    Auto
                  </button>
                )}
              </div>
              <input
                id="bld-pop"
                type="number"
                min={0}
                max={20000}
                value={metrics.estimatedPopulation}
                onChange={(e) =>
                  onUpdateBuilding(b.id, {
                    populationOverride: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-2.5 py-1 rounded border border-slate-200 font-mono-tabular"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-y-1.5 text-xs">
              <div>
                <span className="text-slate-500 block">Footprint</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {metrics.footprintAreaM2.toLocaleString()} m²
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Est. jobs</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {metrics.estimatedJobs.toLocaleString()}
                </span>
              </div>
            </div>

            <AppearanceEditor
              appearance={b.appearance}
              defaultFill={cfg.roofColor}
              defaultStroke={cfg.borderColor}
              onChange={(appearance) => onUpdateBuilding(b.id, { appearance })}
            />

            <GeoLayerMeta
              city={city}
              worldPoint={{ x: b.x, y: b.y }}
              layerSource={b.layerSource}
              geo={b.geo}
              onChangeLayerSource={(layerSource) =>
                onUpdateBuilding(b.id, { layerSource })
              }
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'road') {
      const road = city.roads.find((r) => r.id === selected.id);
      if (!road) return null;
      const cfg = ROAD_CONFIG[road.type];
      const lengthM = Math.round(computeRoadLengthMeters(road));
      const intersectionsCount = findRoadIntersections(city.roads).filter(
        (ix) => ix.roadAId === road.id || ix.roadBId === road.id
      ).length;
      const hasCurves = Boolean(road.controlPoints?.some(Boolean));

      return (
        <section
          aria-label="Selected road properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                Selected Road{isGrouped ? ' · Grouped' : ''}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[165px]">
                {road.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                title="Duplicate road"
                aria-label="Duplicate road"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${road.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="road-name" className="block text-slate-500 mb-1">
                Street name
              </label>
              <input
                id="road-name"
                type="text"
                value={road.name}
                onChange={(e) => onUpdateRoad(road.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label htmlFor="road-type" className="block text-slate-500 mb-1">
                Road class
              </label>
              <select
                id="road-type"
                value={road.type}
                onChange={(e) => {
                  const newType = e.target.value as RoadType;
                  onUpdateRoad(road.id, {
                    type: newType,
                    width: ROAD_CONFIG[newType].defaultWidth,
                  });
                }}
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900 focus:border-blue-500 outline-none"
              >
                {(Object.keys(ROAD_CONFIG) as RoadType[]).map((t) => (
                  <option key={t} value={t}>
                    {ROAD_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="road-width" className="text-slate-500">
                  Road width (m)
                </label>
                <span className="font-mono-tabular text-slate-800 font-medium">
                  {Math.round(road.width * METERS_PER_UNIT)} m
                </span>
              </div>
              <input
                id="road-width"
                type="range"
                min={6}
                max={56}
                step={2}
                value={road.width}
                onChange={(e) =>
                  onUpdateRoad(road.id, { width: Number(e.target.value) })
                }
                className="w-full accent-slate-900"
              />
            </div>

            {/* Road Geometry & Network Tools */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500">
                Road geometry & network
              </p>
              <p className="text-[11px] text-slate-500">
                Drag diamond midpoint handles on map to curve, or square handles to move vertices.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => onStartExtendRoad(road.id)}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md font-medium cursor-pointer ${
                    extendingRoadId === road.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <Waypoints className="w-3.5 h-3.5" />
                  <span>
                    {extendingRoadId === road.id
                      ? 'Extending on canvas...'
                      : 'Extend Road'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSplitRoadAtIntersections(road.id)}
                  disabled={intersectionsCount === 0}
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>
                    Split at Intersections ({intersectionsCount})
                  </span>
                </button>

                {hasCurves && (
                  <button
                    type="button"
                    onClick={() => onStraightenRoad(road.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                  >
                    <Spline className="w-3.5 h-3.5" />
                    <span>Straighten Curve</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 block">Length</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {lengthM.toLocaleString()} m
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Vertices</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {road.points.length}
                </span>
              </div>
            </div>

            <AppearanceEditor
              appearance={road.appearance}
              defaultFill={cfg.fillColor}
              defaultStroke={cfg.casingColor}
              onChange={(appearance) => onUpdateRoad(road.id, { appearance })}
            />

            <GeoLayerMeta
              city={city}
              worldPoint={road.points[0] || { x: 0, y: 0 }}
              layerSource={road.layerSource}
              geo={road.geo}
              onChangeLayerSource={(layerSource) =>
                onUpdateRoad(road.id, { layerSource })
              }
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'block') {
      const bl = (city.blocks || []).find((item) => item.id === selected.id);
      if (!bl) return null;
      const cfg = NEIGHBORHOOD_CONFIG[bl.neighborhoodType];
      const areaM2 = polygonAreaM2(bl.points);
      const center = polygonCentroid(bl.points);

      return (
        <section
          aria-label="Selected city block properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                City Block{isGrouped ? ' · Grouped' : ''}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[165px]">
                {bl.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                aria-label="Duplicate block"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${bl.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="blk-name" className="block text-slate-500 mb-1">
                Neighborhood name
              </label>
              <input
                id="blk-name"
                type="text"
                value={bl.name}
                onChange={(e) => onUpdateBlock(bl.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="blk-type" className="block text-slate-500 mb-1">
                Neighborhood type
              </label>
              <select
                id="blk-type"
                value={bl.neighborhoodType}
                onChange={(e) =>
                  onUpdateBlock(bl.id, {
                    neighborhoodType: e.target.value as NeighborhoodType,
                  })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              >
                {(Object.keys(NEIGHBORHOOD_CONFIG) as NeighborhoodType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {NEIGHBORHOOD_CONFIG[t].label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label htmlFor="blk-x" className="block text-slate-500 mb-1">
                  Center X (m)
                </label>
                <input
                  id="blk-x"
                  type="number"
                  value={Math.round(center.x * METERS_PER_UNIT)}
                  onChange={(e) => {
                    const targetX = (Number(e.target.value) || 0) / METERS_PER_UNIT;
                    onMoveSingleItem(selected, targetX - center.x, 0);
                  }}
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="blk-y" className="block text-slate-500 mb-1">
                  Center Y (m)
                </label>
                <input
                  id="blk-y"
                  type="number"
                  value={Math.round(center.y * METERS_PER_UNIT)}
                  onChange={(e) => {
                    const targetY = (Number(e.target.value) || 0) / METERS_PER_UNIT;
                    onMoveSingleItem(selected, 0, targetY - center.y);
                  }}
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="blk-lotw" className="text-slate-500">
                  Target lot width
                </label>
                <span className="font-mono-tabular text-slate-800">
                  {Math.round(bl.lotTargetWidth * METERS_PER_UNIT)} m
                </span>
              </div>
              <input
                id="blk-lotw"
                type="range"
                min={30}
                max={100}
                step={2}
                value={bl.lotTargetWidth}
                onChange={(e) =>
                  onUpdateBlock(bl.id, {
                    lotTargetWidth: Number(e.target.value),
                  })
                }
                className="w-full accent-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => onSubdivideBlock(bl.id, false)}
                className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium cursor-pointer"
              >
                Subdivide Into Lots
              </button>
              <button
                type="button"
                onClick={() => onSubdivideBlock(bl.id, true)}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Subdivide & Fill Buildings</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 block">Block area</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {areaM2.toLocaleString()} m²
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Parcel lots</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {bl.subdividedLots?.length || 0}
                </span>
              </div>
            </div>

            <AppearanceEditor
              appearance={bl.appearance}
              defaultFill="#FDBA74"
              defaultStroke={cfg.strokeColor}
              onChange={(appearance) => onUpdateBlock(bl.id, { appearance })}
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'public_space') {
      const ps = city.publicSpaces.find((p) => p.id === selected.id);
      if (!ps) return null;
      const cfg = PUBLIC_SPACE_CONFIG[ps.type];
      const areaM2 =
        ps.footprint && ps.footprint.length >= 3
          ? polygonAreaM2(ps.footprint)
          : Math.round(ps.width * METERS_PER_UNIT * (ps.height * METERS_PER_UNIT));

      return (
        <section
          aria-label="Selected public space properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-emerald-700">
                Public Space{isGrouped ? ' · Grouped' : ''}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[145px]">
                {ps.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                aria-label="Duplicate public space"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdatePublicSpace(ps.id, {
                    rotation: (ps.rotation + 45) % 360,
                  })
                }
                aria-label="Rotate public space"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${ps.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="ps-name" className="block text-slate-500 mb-1">
                Name
              </label>
              <input
                id="ps-name"
                type="text"
                value={ps.name}
                onChange={(e) =>
                  onUpdatePublicSpace(ps.id, { name: e.target.value })
                }
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="ps-type" className="block text-slate-500 mb-1">
                Category
              </label>
              <select
                id="ps-type"
                value={ps.type}
                onChange={(e) =>
                  onUpdatePublicSpace(ps.id, {
                    type: e.target.value as PublicSpaceType,
                  })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              >
                {(Object.keys(PUBLIC_SPACE_CONFIG) as PublicSpaceType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {PUBLIC_SPACE_CONFIG[t].label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label htmlFor="ps-x" className="block text-slate-500 mb-1">
                  X (m)
                </label>
                <input
                  id="ps-x"
                  type="number"
                  value={Math.round(ps.x * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdatePublicSpace(ps.id, {
                      x: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="ps-y" className="block text-slate-500 mb-1">
                  Y (m)
                </label>
                <input
                  id="ps-y"
                  type="number"
                  value={Math.round(ps.y * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdatePublicSpace(ps.id, {
                      y: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="ps-rot" className="block text-slate-500 mb-1">
                  Rot (°)
                </label>
                <input
                  id="ps-rot"
                  type="number"
                  value={Math.round(ps.rotation)}
                  onChange={(e) =>
                    onUpdatePublicSpace(ps.id, {
                      rotation: ((Number(e.target.value) || 0) % 360 + 360) % 360,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ps-w" className="block text-slate-500 mb-1">
                  Width (m)
                </label>
                <input
                  id="ps-w"
                  type="number"
                  min={15}
                  max={250}
                  value={Math.round(ps.width * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdatePublicSpace(ps.id, {
                      width: Math.max(
                        30,
                        (Number(e.target.value) || 30) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="ps-h" className="block text-slate-500 mb-1">
                  Depth (m)
                </label>
                <input
                  id="ps-h"
                  type="number"
                  min={15}
                  max={250}
                  value={Math.round(ps.height * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdatePublicSpace(ps.id, {
                      height: Math.max(
                        30,
                        (Number(e.target.value) || 30) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500">{cfg.label} area</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {areaM2.toLocaleString()} m²
              </span>
            </div>

            <AppearanceEditor
              appearance={ps.appearance}
              defaultFill={cfg.fillColor}
              defaultStroke={cfg.borderColor}
              onChange={(appearance) =>
                onUpdatePublicSpace(ps.id, { appearance })
              }
            />

            <GeoLayerMeta
              city={city}
              worldPoint={{ x: ps.x, y: ps.y }}
              layerSource={ps.layerSource}
              geo={ps.geo}
              onChangeLayerSource={(layerSource) =>
                onUpdatePublicSpace(ps.id, { layerSource })
              }
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'zone') {
      const z = city.zones.find((item) => item.id === selected.id);
      if (!z) return null;
      const cfg = ZONE_CONFIG[z.type];
      const areaHa =
        Math.round(
          ((z.width * METERS_PER_UNIT * (z.height * METERS_PER_UNIT)) / 10000) *
            100
        ) / 100;

      return (
        <section
          aria-label="Selected zone properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                Selected Zone{isGrouped ? ' · Grouped' : ''}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[165px]">
                {z.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                aria-label="Duplicate zone"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${z.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="zone-name" className="block text-slate-500 mb-1">
                District name
              </label>
              <input
                id="zone-name"
                type="text"
                value={z.name}
                onChange={(e) => onUpdateZone(z.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="zone-type" className="block text-slate-500 mb-1">
                Category
              </label>
              <select
                id="zone-type"
                value={z.type}
                onChange={(e) =>
                  onUpdateZone(z.id, { type: e.target.value as ZoneType })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              >
                {(Object.keys(ZONE_CONFIG) as ZoneType[]).map((t) => (
                  <option key={t} value={t}>
                    {ZONE_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="zone-w" className="block text-slate-500 mb-1">
                  Width (m)
                </label>
                <input
                  id="zone-w"
                  type="number"
                  min={20}
                  value={Math.round(z.width * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateZone(z.id, {
                      width: Math.max(
                        40,
                        (Number(e.target.value) || 40) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="zone-h" className="block text-slate-500 mb-1">
                  Depth (m)
                </label>
                <input
                  id="zone-h"
                  type="number"
                  min={20}
                  value={Math.round(z.height * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateZone(z.id, {
                      height: Math.max(
                        40,
                        (Number(e.target.value) || 40) / METERS_PER_UNIT
                      ),
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500">Zone area</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {areaHa} ha
              </span>
            </div>

            <AppearanceEditor
              appearance={z.appearance}
              defaultFill="#FB923C"
              defaultStroke={cfg.strokeColor}
              onChange={(appearance) => onUpdateZone(z.id, { appearance })}
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'station') {
      const st = city.stations.find((item) => item.id === selected.id);
      if (!st) return null;
      const cfg = TRANSIT_STATION_CONFIG[st.type];

      return (
        <section
          aria-label="Selected station properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                {cfg.label}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[165px]">
                {st.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                aria-label="Duplicate station"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${st.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="station-name" className="block text-slate-500 mb-1">
                Station name
              </label>
              <input
                id="station-name"
                type="text"
                value={st.name}
                onChange={(e) => onUpdateStation(st.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="station-type" className="block text-slate-500 mb-1">
                Category
              </label>
              <select
                id="station-type"
                value={st.type}
                onChange={(e) =>
                  onUpdateStation(st.id, {
                    type: e.target.value as TransitStationType,
                  })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              >
                {(
                  Object.keys(TRANSIT_STATION_CONFIG) as TransitStationType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {TRANSIT_STATION_CONFIG[t].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="st-x" className="block text-slate-500 mb-1">
                  X (m)
                </label>
                <input
                  id="st-x"
                  type="number"
                  value={Math.round(st.x * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateStation(st.id, {
                      x: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="st-y" className="block text-slate-500 mb-1">
                  Y (m)
                </label>
                <input
                  id="st-y"
                  type="number"
                  value={Math.round(st.y * METERS_PER_UNIT)}
                  onChange={(e) =>
                    onUpdateStation(st.id, {
                      y: (Number(e.target.value) || 0) / METERS_PER_UNIT,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 font-mono-tabular"
                />
              </div>
            </div>

            <AppearanceEditor
              appearance={st.appearance}
              defaultFill="#FFFFFF"
              defaultStroke={cfg.color}
              onChange={(appearance) => onUpdateStation(st.id, { appearance })}
            />

            <GeoLayerMeta
              city={city}
              worldPoint={{ x: st.x, y: st.y }}
              layerSource={st.layerSource}
              geo={st.geo}
              onChangeLayerSource={(layerSource) =>
                onUpdateStation(st.id, { layerSource })
              }
            />
          </div>
        </section>
      );
    }

    if (selected.category === 'route') {
      const rt = city.routes.find((item) => item.id === selected.id);
      if (!rt) return null;
      const lenM = Math.round(computePolylineLengthMeters(rt.points));

      return (
        <section
          aria-label="Selected transit route properties"
          className="p-4 border-b border-slate-200 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-blue-600">
                {TRANSIT_LINE_CONFIG[rt.type].label}
              </p>
              <h2 className="text-sm font-semibold text-slate-900 truncate max-w-[165px]">
                {rt.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDuplicateSelected}
                aria-label="Duplicate transit line"
                className="p-1.5 rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDeleteSelected}
                aria-label={`Delete ${rt.name}`}
                className="p-1.5 rounded text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label htmlFor="route-name" className="block text-slate-500 mb-1">
                Line name
              </label>
              <input
                id="route-name"
                type="text"
                value={rt.name}
                onChange={(e) => onUpdateRoute(rt.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="route-type" className="block text-slate-500 mb-1">
                Category
              </label>
              <select
                id="route-type"
                value={rt.type}
                onChange={(e) =>
                  onUpdateRoute(rt.id, {
                    type: e.target.value as TransitLineType,
                  })
                }
                className="w-full px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-900"
              >
                {(Object.keys(TRANSIT_LINE_CONFIG) as TransitLineType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {TRANSIT_LINE_CONFIG[t].label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="route-color" className="text-slate-500">
                Line color
              </label>
              <input
                id="route-color"
                type="color"
                value={rt.color}
                onChange={(e) => onUpdateRoute(rt.id, { color: e.target.value })}
                className="w-8 h-6 rounded border border-slate-200 cursor-pointer"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-slate-500">Route length</span>
              <span className="font-mono-tabular font-semibold text-slate-900">
                {lenM.toLocaleString()} m
              </span>
            </div>

            <GeoLayerMeta
              city={city}
              worldPoint={rt.points[0] || { x: 0, y: 0 }}
              layerSource={rt.layerSource}
              geo={rt.geo}
              onChangeLayerSource={(layerSource) =>
                onUpdateRoute(rt.id, { layerSource })
              }
            />
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <aside
      aria-label="Properties and city statistics"
      className="w-72 bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {selectedItems.length > 1 ? (
          <div>
            {renderMultiSelectionPanel()}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Drag any selected item to move all
              </span>
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        ) : selectedItems.length === 1 ? (
          <div>
            {renderSingleInspector()}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              {getEntityGroupId(selectedItems[0], city) ? (
                <button
                  type="button"
                  onClick={onUngroupSelected}
                  className="text-[11px] font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                >
                  Ungroup item
                </button>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Drag object on map to move
                </span>
              )}
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <p className="text-xs font-medium text-slate-700">Inspector</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click any object or drag a selection box to inspect, group, align, or edit properties.
            </p>
          </div>
        )}

        {/* City Statistics */}
        <section aria-label="City statistics" className="p-4 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-500">
              City Statistics
            </h2>
            <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
              {city.mode === 'geographic' && city.geoOrigin
                ? city.geoOrigin.label
                : 'Live simulation'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <div>
              <span className="text-[11px] text-slate-500 block">Population</span>
              <span
                data-testid="stat-population"
                className="text-lg font-bold text-slate-900 font-mono-tabular"
              >
                {stats.totalPopulation.toLocaleString()}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Employment</span>
              <span
                data-testid="stat-jobs"
                className="text-lg font-bold text-slate-900 font-mono-tabular"
              >
                {stats.totalJobs.toLocaleString()}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Buildings</span>
              <span
                data-testid="stat-buildings"
                className="text-base font-semibold text-slate-900 font-mono-tabular"
              >
                {stats.buildingCount.toLocaleString()}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Road network</span>
              <span
                data-testid="stat-roads"
                className="text-base font-semibold text-slate-900 font-mono-tabular"
              >
                {stats.totalRoadLengthKm.toFixed(2)} km
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Green space</span>
              <span
                data-testid="stat-green"
                className="text-base font-semibold text-slate-900 font-mono-tabular"
              >
                {stats.greenSpaceAreaHa.toFixed(2)} ha
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Transit stations</span>
              <span
                data-testid="stat-stations"
                className="text-base font-semibold text-slate-900 font-mono-tabular"
              >
                {stats.transitStationCount}
              </span>
            </div>
          </div>

          {/* Urban Simulation Feedback */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500">
              Urban Balance
            </h3>

            <MetricBar
              label="Walkability & streets"
              value={`${stats.metrics.walkabilityScore}%`}
              percent={stats.metrics.walkabilityScore}
              colorClass="bg-emerald-600"
            />
            <MetricBar
              label="Transit coverage"
              value={`${stats.metrics.transitAccessScore}%`}
              percent={stats.metrics.transitAccessScore}
              colorClass="bg-blue-600"
            />

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="py-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 block">
                  Green / resident
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {stats.metrics.greenPerCapitaM2} m²
                </span>
              </div>
              <div className="py-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 block">
                  Jobs / labor ratio
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {stats.metrics.jobsHousingRatio.toFixed(2)}x
                </span>
              </div>
            </div>
          </div>

          {stats.buildingCount > 0 && (
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500">
                Building Mix
              </h3>
              <div className="space-y-1.5 text-xs">
                {(Object.keys(stats.buildingsByType) as BuildingType[])
                  .filter((t) => stats.buildingsByType[t] > 0)
                  .map((t) => (
                    <div
                      key={t}
                      className="flex items-center justify-between text-slate-700"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm inline-block border"
                          style={{
                            backgroundColor: BUILDING_CONFIG[t].roofColor,
                            borderColor: BUILDING_CONFIG[t].borderColor,
                          }}
                        />
                        {BUILDING_CONFIG[t].label.replace(' building', '')}
                      </span>
                      <span className="font-mono-tabular font-medium text-slate-900">
                        {stats.buildingsByType[t]}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};

const MetricBar: React.FC<{
  label: string;
  value: string;
  percent: number;
  colorClass: string;
}> = ({ label, value, percent, colorClass }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono-tabular font-semibold text-slate-900">
        {value}
      </span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  </div>
);
