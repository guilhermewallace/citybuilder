import React, { useState } from 'react';
import {
  Bike,
  Building,
  Building2,
  Bus,
  ChevronDown,
  ChevronRight,
  Factory,
  Footprints,
  GitCommitHorizontal,
  Hand,
  Home,
  Landmark,
  Layers,
  LayoutGrid,
  MapPin,
  MousePointer2,
  Route,
  Shapes,
  Store,
  TrainFront,
  TrainTrack,
  Trees,
  Trophy,
  Sparkles,
  CircleDot,
} from 'lucide-react';
import { isSameTool, TOOL_CATEGORIES } from '../data/catalog';
import { ActiveTool } from '../types/city';

interface LeftSidebarProps {
  activeTool: ActiveTool;
  onSelectTool: (tool: ActiveTool) => void;
  previewRotation: number;
  onRotatePreview: () => void;
}

function getToolIcon(id: string) {
  switch (id) {
    case 'local_street':
      return <Route className="w-4 h-4" />;
    case 'main_road':
      return <GitCommitHorizontal className="w-4 h-4" />;
    case 'highway':
      return <Route className="w-4 h-4 stroke-[2.5]" />;
    case 'pedestrian_street':
      return <Footprints className="w-4 h-4" />;
    case 'bicycle_lane':
      return <Bike className="w-4 h-4" />;
    case 'residential':
      return <Home className="w-4 h-4" />;
    case 'apartment':
      return <Building className="w-4 h-4" />;
    case 'commercial':
      return <Store className="w-4 h-4" />;
    case 'office':
      return <Building2 className="w-4 h-4" />;
    case 'industrial':
      return <Factory className="w-4 h-4" />;
    case 'public':
      return <Landmark className="w-4 h-4" />;
    case 'block_rect':
      return <LayoutGrid className="w-4 h-4" />;
    case 'block_poly':
      return <Shapes className="w-4 h-4" />;
    case 'zone_residential':
    case 'zone_commercial':
    case 'zone_industrial':
    case 'zone_mixed_use':
      return <Layers className="w-4 h-4" />;
    case 'park':
      return <Trees className="w-4 h-4" />;
    case 'playground':
      return <Sparkles className="w-4 h-4" />;
    case 'plaza':
      return <CircleDot className="w-4 h-4" />;
    case 'sports_facility':
      return <Trophy className="w-4 h-4" />;
    case 'bus_stop':
      return <Bus className="w-4 h-4" />;
    case 'bus_route':
      return <Route className="w-4 h-4" />;
    case 'metro_station':
      return <MapPin className="w-4 h-4" />;
    case 'metro_line':
      return <GitCommitHorizontal className="w-4 h-4" />;
    case 'train_station':
      return <TrainFront className="w-4 h-4" />;
    case 'railway':
      return <TrainTrack className="w-4 h-4" />;
    default:
      return <Building className="w-4 h-4" />;
  }
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTool,
  onSelectTool,
  previewRotation,
  onRotatePreview,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isSelect = activeTool.kind === 'select';
  const isPan = activeTool.kind === 'pan';
  const canRotatePreview =
    activeTool.kind === 'building' || activeTool.kind === 'public_space';

  return (
    <aside
      aria-label="Building tools"
      className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0 select-none z-10"
    >
      {/* Primary Cursor Tools */}
      <div className="p-3 border-b border-slate-200">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onSelectTool({ kind: 'select' })}
            title="Select, move, or edit objects (V)"
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              isSelect
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool({ kind: 'pan' })}
            title="Pan around the map (H or Space+Drag)"
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              isPan
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>Pan</span>
          </button>
        </div>

        {canRotatePreview && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Orientation: {previewRotation}°</span>
            <button
              type="button"
              onClick={onRotatePreview}
              title="Rotate placement (R)"
              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium cursor-pointer"
            >
              Rotate 90°
            </button>
          </div>
        )}
      </div>

      {/* Categorized Urban Elements */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1.5 space-y-0.5">
        {TOOL_CATEGORIES.map((group) => {
          const isCollapsed = !!collapsed[group.id];
          return (
            <div key={group.id} className="pb-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
              >
                <span>{group.title}</span>
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {!isCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isSameTool(activeTool, item.tool);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectTool(item.tool)}
                        title={item.description}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-left text-xs transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-inset ring-blue-200'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <span
                          className="w-4.5 h-4.5 rounded flex items-center justify-center shrink-0"
                          style={{
                            color: active ? '#1D4ED8' : item.color,
                            backgroundColor: active
                              ? 'rgba(37, 99, 235, 0.1)'
                              : 'rgba(148, 163, 184, 0.1)',
                          }}
                        >
                          {getToolIcon(item.id)}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Subtle shortcut footer */}
      <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50/70 text-[10.5px] text-slate-500 flex items-center justify-between">
        <span>V/H/R · Shift+Click</span>
        <span>Ctrl+C/V · Del</span>
      </div>
    </aside>
  );
};
