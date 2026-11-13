import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Wrench } from 'lucide-react';
import { CityCanvas } from './components/CityCanvas';
import { LeftSidebar } from './components/LeftSidebar';
import { NewProjectModal, ProjectsShareModal } from './components/Modals';
import { RightSidebar } from './components/RightSidebar';
import { TopToolbar } from './components/TopToolbar';
import {
  createBlankCity,
  createRealWorldCity,
  createSampleCity,
  createTransitHubCity,
} from './data/sampleCity';
import {
  ActiveTool,
  BuildingItem,
  CameraState,
  CityBlock,
  CityData,
  GeoBounds,
  GeoOrigin,
  LayerVisibility,
  Point,
  PublicSpaceItem,
  RoadSegment,
  SelectedEntity,
  TransitRoute,
  TransitStation,
  ViewMode,
  ZoneRect,
} from './types/city';
import {
  generateBuildingsForBlock,
  subdivideBlockIntoLots,
} from './utils/blockSubdivision';
import {
  AlignMode,
  alignSelectedEntities,
  cloneSelectedEntities,
  deleteSelectedEntities,
  distributeSelectedEntities,
  groupSelectedEntities,
  moveSelectedEntities,
  splitRoadAtIntersections,
  ungroupSelectedEntities,
} from './utils/cityOperations';
import { exportCityToPngDataUrl } from './utils/cityRenderer';
import { worldToLatLon } from './utils/geoCoords';
import {
  mergeImportedEntitiesIntoCity,
  OsmImportResult,
} from './utils/osmConverter';
import { calculateCityStatistics } from './utils/simulation';
import {
  decodeCityFromShareHash,
  deleteProjectFromLibrary,
  duplicateCityProject,
  listSavedProjects,
  loadActiveCityFromStorage,
  saveActiveCityToStorage,
  SavedProjectSummary,
  saveProjectToLibrary,
} from './utils/storage';

const MAX_HISTORY = 60;

const DEFAULT_LAYERS: LayerVisibility = {
  basemap: true,
  existing: true,
  proposed: true,
  water: true,
  grid: true,
  zones: true,
  blocks: true,
  roads: true,
  buildings: true,
  publicSpaces: true,
  transit: true,
  labels: true,
};

function getInitialCity(): CityData {
  if (typeof window !== 'undefined' && window.location.hash) {
    const shared = decodeCityFromShareHash(window.location.hash);
    if (shared) return shared;
  }
  const saved = loadActiveCityFromStorage();
  if (saved) return saved;
  return createSampleCity();
}

export default function App() {
  const [city, setCity] = useState<CityData>(getInitialCity);
  const [past, setPast] = useState<CityData[]>([]);
  const [future, setFuture] = useState<CityData[]>([]);

  const [activeTool, setActiveTool] = useState<ActiveTool>({ kind: 'select' });
  const [selectedItems, setSelectedItems] = useState<SelectedEntity[]>([]);
  const [extendingRoadId, setExtendingRoadId] = useState<string | null>(null);
  const [previewRotation, setPreviewRotation] = useState<number>(0);

  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [layers, setLayers] = useState<LayerVisibility>(() => ({
    ...DEFAULT_LAYERS,
    ...(city.layers || {}),
  }));

  const [camera, setCamera] = useState<CameraState>(() => ({
    x: city.mode === 'geographic' ? 0 : 20,
    y: 0,
    zoom: city.mode === 'geographic' ? 0.42 : 1,
  }));

  const [areaSelectMode, setAreaSelectMode] = useState<boolean>(
    () =>
      city.mode === 'geographic' &&
      city.roads.length === 0 &&
      city.buildings.length === 0 &&
      city.publicSpaces.length === 0
  );

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>(() =>
    listSavedProjects()
  );

  const [mobilePanel, setMobilePanel] = useState<'none' | 'tools' | 'stats'>(
    'none'
  );

  // Pre-drag history snapshot so continuous drags push one clean undo entry
  const preDragCityRef = useRef<CityData | null>(null);

  // Clipboard stores copied selection snapshot + paste count for cascading offsets
  const clipboardRef = useRef<{
    sourceCity: CityData;
    items: SelectedEntity[];
    pasteCount: number;
  } | null>(null);

  // Sync layers into city state & persist active city to localStorage
  useEffect(() => {
    saveActiveCityToStorage({ ...city, layers });
  }, [city, layers]);

  const stats = useMemo(() => calculateCityStatistics(city), [city]);

  const commitCityChange = useCallback(
    (updater: (prev: CityData) => CityData) => {
      setCity((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), prev]);
        setFuture([]);
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setCity((current) => {
        setFuture((f) => [current, ...f]);
        return previous;
      });
      setSelectedItems([]);
      setExtendingRoadId(null);
      return prevPast.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      setCity((current) => {
        setPast((p) => [...p, current]);
        return next;
      });
      setSelectedItems([]);
      setExtendingRoadId(null);
      return prevFuture.slice(1);
    });
  }, []);

  const handleSave = useCallback(() => {
    const cityWithLayers: CityData = { ...city, layers };
    const nextList = saveProjectToLibrary(cityWithLayers);
    setSavedProjects(nextList);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }, [city, layers]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedItems.length === 0) return;
    commitCityChange((prev) => deleteSelectedEntities(prev, selectedItems));
    setSelectedItems([]);
    setExtendingRoadId(null);
  }, [commitCityChange, selectedItems]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedItems.length === 0) return;
    let newlyCloned: SelectedEntity[] = [];
    commitCityChange((prev) => {
      const res = cloneSelectedEntities(prev, selectedItems, { x: 24, y: 24 });
      newlyCloned = res.clonedItems;
      return res.nextCity;
    });
    if (newlyCloned.length > 0) {
      setSelectedItems(newlyCloned);
    }
  }, [commitCityChange, selectedItems]);

  const handleCopy = useCallback(() => {
    if (selectedItems.length === 0) return;
    clipboardRef.current = {
      sourceCity: city,
      items: [...selectedItems],
      pasteCount: 0,
    };
  }, [city, selectedItems]);

  const handlePaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.items.length === 0) return;
    clip.pasteCount += 1;
    const offsetAmt = 24 * clip.pasteCount;
    const { nextCity: clonedFromSource, clonedItems } = cloneSelectedEntities(
      clip.sourceCity,
      clip.items,
      { x: offsetAmt, y: offsetAmt }
    );
    if (clonedItems.length === 0) return;

    // Extract only the newly created items from clonedFromSource and append to current city
    const newIds = new Set(clonedItems.map((c) => `${c.category}:${c.id}`));
    commitCityChange((prev) => ({
      ...prev,
      buildings: [
        ...prev.buildings,
        ...clonedFromSource.buildings.filter((b) =>
          newIds.has(`building:${b.id}`)
        ),
      ],
      publicSpaces: [
        ...prev.publicSpaces,
        ...clonedFromSource.publicSpaces.filter((ps) =>
          newIds.has(`public_space:${ps.id}`)
        ),
      ],
      zones: [
        ...prev.zones,
        ...clonedFromSource.zones.filter((z) => newIds.has(`zone:${z.id}`)),
      ],
      blocks: [
        ...(prev.blocks || []),
        ...(clonedFromSource.blocks || []).filter((bl) =>
          newIds.has(`block:${bl.id}`)
        ),
      ],
      roads: [
        ...prev.roads,
        ...clonedFromSource.roads.filter((r) => newIds.has(`road:${r.id}`)),
      ],
      stations: [
        ...prev.stations,
        ...clonedFromSource.stations.filter((s) =>
          newIds.has(`station:${s.id}`)
        ),
      ],
      routes: [
        ...prev.routes,
        ...clonedFromSource.routes.filter((rt) => newIds.has(`route:${rt.id}`)),
      ],
    }));
    setSelectedItems(clonedItems);
  }, [commitCityChange]);

  const handleRotateAction = useCallback(() => {
    if (selectedItems.length === 1) {
      const sel = selectedItems[0];
      if (sel.category === 'building') {
        commitCityChange((prev) => ({
          ...prev,
          buildings: prev.buildings.map((b) =>
            b.id === sel.id ? { ...b, rotation: (b.rotation + 45) % 360 } : b
          ),
        }));
        return;
      }
      if (sel.category === 'public_space') {
        commitCityChange((prev) => ({
          ...prev,
          publicSpaces: prev.publicSpaces.map((ps) =>
            ps.id === sel.id
              ? { ...ps, rotation: (ps.rotation + 45) % 360 }
              : ps
          ),
        }));
        return;
      }
    }
    setPreviewRotation((r) => (r + 90) % 360);
  }, [commitCityChange, selectedItems]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          handleCopy();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardRef.current) {
          e.preventDefault();
          handlePaste();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          handleDuplicateSelected();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems.length > 0) {
          e.preventDefault();
          handleDeleteSelected();
        }
      } else if (e.key.toLowerCase() === 'v') {
        setActiveTool({ kind: 'select' });
      } else if (e.key.toLowerCase() === 'h') {
        setActiveTool({ kind: 'pan' });
      } else if (e.key.toLowerCase() === 'g') {
        setLayers((prev) => ({ ...prev, grid: !prev.grid }));
      } else if (e.key.toLowerCase() === 'r') {
        handleRotateAction();
      } else if (e.key === 'Escape') {
        setSelectedItems([]);
        setExtendingRoadId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleCopy,
    handleDeleteSelected,
    handleDuplicateSelected,
    handlePaste,
    handleRedo,
    handleRotateAction,
    handleSave,
    handleUndo,
    selectedItems,
  ]);

  const handleMoveSelected = useCallback(
    (
      items: SelectedEntity[],
      dx: number,
      dy: number,
      commitHistory: boolean
    ) => {
      if (commitHistory) {
        if (preDragCityRef.current) {
          const snapshot = preDragCityRef.current;
          preDragCityRef.current = null;
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), snapshot]);
          setFuture([]);
        }
        return;
      }

      setCity((prev) => {
        if (!preDragCityRef.current) {
          preDragCityRef.current = prev;
        }
        return moveSelectedEntities(prev, items, dx, dy);
      });
    },
    []
  );

  const handleEditRoadVertex = useCallback(
    (
      roadId: string,
      vertexIndex: number,
      point: Point,
      commitHistory: boolean
    ) => {
      if (commitHistory) {
        if (preDragCityRef.current) {
          const snapshot = preDragCityRef.current;
          preDragCityRef.current = null;
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), snapshot]);
          setFuture([]);
        }
        return;
      }
      setCity((prev) => {
        if (!preDragCityRef.current) {
          preDragCityRef.current = prev;
        }
        return {
          ...prev,
          roads: prev.roads.map((r) =>
            r.id === roadId
              ? {
                  ...r,
                  points: r.points.map((pt, i) =>
                    i === vertexIndex ? point : pt
                  ),
                }
              : r
          ),
        };
      });
    },
    []
  );

  const handleEditRoadCurve = useCallback(
    (
      roadId: string,
      segIndex: number,
      controlPoint: Point,
      commitHistory: boolean
    ) => {
      if (commitHistory) {
        if (preDragCityRef.current) {
          const snapshot = preDragCityRef.current;
          preDragCityRef.current = null;
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), snapshot]);
          setFuture([]);
        }
        return;
      }
      setCity((prev) => {
        if (!preDragCityRef.current) {
          preDragCityRef.current = prev;
        }
        return {
          ...prev,
          roads: prev.roads.map((r) => {
            if (r.id !== roadId) return r;
            const cps = [...(r.controlPoints || [])];
            while (cps.length < r.points.length - 1) cps.push(null);
            cps[segIndex] = controlPoint;
            return { ...r, controlPoints: cps };
          }),
        };
      });
    },
    []
  );

  const handleFinishExtendRoad = useCallback(
    (roadId: string, extraPoints: Point[]) => {
      if (extraPoints.length > 0) {
        commitCityChange((prev) => ({
          ...prev,
          roads: prev.roads.map((r) =>
            r.id === roadId
              ? { ...r, points: [...r.points, ...extraPoints] }
              : r
          ),
        }));
      }
      setExtendingRoadId(null);
    },
    [commitCityChange]
  );

  const handleSubdivideBlock = useCallback(
    (blockId: string, fillBuildings: boolean) => {
      commitCityChange((prev) => {
        const block = (prev.blocks || []).find((b) => b.id === blockId);
        if (!block) return prev;
        const lots = subdivideBlockIntoLots(block);
        const updatedBlocks = (prev.blocks || []).map((b) =>
          b.id === blockId ? { ...b, subdividedLots: lots } : b
        );
        if (!fillBuildings) {
          return { ...prev, blocks: updatedBlocks };
        }
        const generated = generateBuildingsForBlock(block, lots).map((b) => ({
          ...b,
          layerSource: 'proposed' as const,
          geo: prev.geoOrigin
            ? {
                ...worldToLatLon(b.x, b.y, prev.geoOrigin),
              }
            : undefined,
        }));
        return {
          ...prev,
          blocks: updatedBlocks,
          buildings: [...prev.buildings, ...generated],
        };
      });
    },
    [commitCityChange]
  );

  const loadNewCityState = useCallback((nextCity: CityData) => {
    setCity(nextCity);
    setLayers({ ...DEFAULT_LAYERS, ...(nextCity.layers || {}) });
    setPast([]);
    setFuture([]);
    setSelectedItems([]);
    setExtendingRoadId(null);
    const isGeo = nextCity.mode === 'geographic';
    setCamera({ x: 0, y: 0, zoom: isGeo ? 0.42 : 1 });
    setAreaSelectMode(
      isGeo &&
        nextCity.roads.length === 0 &&
        nextCity.buildings.length === 0 &&
        nextCity.publicSpaces.length === 0
    );
  }, []);

  const handleCreateRealCity = useCallback(
    (origin: GeoOrigin, name?: string) => {
      const realCity = createRealWorldCity(origin, name);
      loadNewCityState(realCity);
      setActiveTool({ kind: 'select' });
    },
    [loadNewCityState]
  );

  const handleImportOsmData = useCallback(
    (result: OsmImportResult, bounds: GeoBounds) => {
      commitCityChange((prev) => mergeImportedEntitiesIntoCity(prev, result, bounds));
    },
    [commitCityChange]
  );

  const handleExportPng = () => {
    const dataUrl = exportCityToPngDataUrl(city, viewMode, layers);
    if (!dataUrl) return;
    const a = document.createElement('a');
    const safeName = (city.name || 'city')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    a.href = dataUrl;
    a.download = `${safeName}-map.png`;
    a.click();
  };

  return (
    <div
      data-testid="citybuilder-app"
      data-population={stats.totalPopulation}
      data-buildings={stats.buildingCount}
      className="h-screen w-screen flex flex-col overflow-hidden bg-[#F7F8FA] text-slate-900"
    >
      <TopToolbar
        projectName={city.name}
        onProjectNameChange={(name) => setCity((prev) => ({ ...prev, name }))}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNewProject={() => setNewModalOpen(true)}
        onSave={handleSave}
        justSaved={justSaved}
        onExportPng={handleExportPng}
        onOpenShareModal={() => {
          setSavedProjects(listSavedProjects());
          setShareModalOpen(true);
        }}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Desktop Left Sidebar / Mobile Drawer */}
        <div
          className={`${
            mobilePanel === 'tools'
              ? 'flex absolute inset-y-0 left-0 z-30 shadow-xl'
              : 'hidden'
          } md:flex md:static md:shadow-none`}
        >
          <LeftSidebar
            activeTool={activeTool}
            onSelectTool={(tool) => {
              setActiveTool(tool);
              setExtendingRoadId(null);
              setMobilePanel('none');
            }}
            previewRotation={previewRotation}
            onRotatePreview={() => setPreviewRotation((r) => (r + 90) % 360)}
          />
        </div>

        {/* Center Interactive City Canvas */}
        <CityCanvas
          city={city}
          activeTool={activeTool}
          selectedItems={selectedItems}
          extendingRoadId={extendingRoadId}
          previewRotation={previewRotation}
          viewMode={viewMode}
          layers={layers}
          snapEnabled={snapEnabled}
          camera={camera}
          areaSelectMode={areaSelectMode}
          onAreaSelectModeChange={setAreaSelectMode}
          onImportOsmData={handleImportOsmData}
          onCameraChange={setCamera}
          onViewModeChange={setViewMode}
          onToggleLayer={(key) =>
            setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
          }
          onToggleSnap={() => setSnapEnabled((s) => !s)}
          onSelectItems={setSelectedItems}
          onAddBuilding={(b: BuildingItem) => {
            commitCityChange((prev) => ({
              ...prev,
              buildings: [
                ...prev.buildings,
                {
                  ...b,
                  layerSource: 'proposed',
                  geo:
                    b.geo ||
                    (prev.geoOrigin
                      ? worldToLatLon(b.x, b.y, prev.geoOrigin)
                      : undefined),
                },
              ],
            }));
          }}
          onAddRoad={(r: RoadSegment) => {
            commitCityChange((prev) => ({
              ...prev,
              roads: [
                ...prev.roads,
                {
                  ...r,
                  layerSource: 'proposed',
                  geo:
                    r.geo ||
                    (prev.geoOrigin && r.points[0]
                      ? worldToLatLon(r.points[0].x, r.points[0].y, prev.geoOrigin)
                      : undefined),
                },
              ],
            }));
          }}
          onAddZone={(z: ZoneRect) => {
            commitCityChange((prev) => ({
              ...prev,
              zones: [
                ...prev.zones,
                {
                  ...z,
                  layerSource: 'proposed',
                  geo:
                    z.geo ||
                    (prev.geoOrigin
                      ? worldToLatLon(
                          z.x + z.width / 2,
                          z.y + z.height / 2,
                          prev.geoOrigin
                        )
                      : undefined),
                },
              ],
            }));
          }}
          onAddBlock={(bl: CityBlock) => {
            commitCityChange((prev) => ({
              ...prev,
              blocks: [
                ...(prev.blocks || []),
                {
                  ...bl,
                  layerSource: 'proposed',
                },
              ],
            }));
            setSelectedItems([{ category: 'block', id: bl.id }]);
            setActiveTool({ kind: 'select' });
          }}
          onAddPublicSpace={(ps: PublicSpaceItem) => {
            commitCityChange((prev) => ({
              ...prev,
              publicSpaces: [
                ...prev.publicSpaces,
                {
                  ...ps,
                  layerSource: 'proposed',
                  geo:
                    ps.geo ||
                    (prev.geoOrigin
                      ? worldToLatLon(ps.x, ps.y, prev.geoOrigin)
                      : undefined),
                },
              ],
            }));
          }}
          onAddStation={(s: TransitStation) => {
            commitCityChange((prev) => ({
              ...prev,
              stations: [
                ...prev.stations,
                {
                  ...s,
                  layerSource: 'proposed',
                  geo:
                    s.geo ||
                    (prev.geoOrigin
                      ? worldToLatLon(s.x, s.y, prev.geoOrigin)
                      : undefined),
                },
              ],
            }));
          }}
          onAddRoute={(rt: TransitRoute) => {
            commitCityChange((prev) => ({
              ...prev,
              routes: [
                ...prev.routes,
                {
                  ...rt,
                  layerSource: 'proposed',
                  geo:
                    rt.geo ||
                    (prev.geoOrigin && rt.points[0]
                      ? worldToLatLon(rt.points[0].x, rt.points[0].y, prev.geoOrigin)
                      : undefined),
                },
              ],
            }));
          }}
          onMoveSelected={handleMoveSelected}
          onEditRoadVertex={handleEditRoadVertex}
          onEditRoadCurve={handleEditRoadCurve}
          onFinishExtendRoad={handleFinishExtendRoad}
          onCancelExtendRoad={() => setExtendingRoadId(null)}
          onLoadSampleCity={() => loadNewCityState(createSampleCity())}
        />

        {/* Desktop Right Sidebar / Mobile Drawer */}
        <div
          className={`${
            mobilePanel === 'stats'
              ? 'flex absolute inset-y-0 right-0 z-30 shadow-xl'
              : 'hidden'
          } lg:flex lg:static lg:shadow-none`}
        >
          <RightSidebar
            city={city}
            stats={stats}
            selectedItems={selectedItems}
            extendingRoadId={extendingRoadId}
            onClearSelection={() => {
              setSelectedItems([]);
              setExtendingRoadId(null);
            }}
            onUpdateBuilding={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                buildings: prev.buildings.map((b) =>
                  b.id === id ? { ...b, ...patch } : b
                ),
              }))
            }
            onUpdateRoad={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                roads: prev.roads.map((r) =>
                  r.id === id ? { ...r, ...patch } : r
                ),
              }))
            }
            onUpdateZone={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                zones: prev.zones.map((z) =>
                  z.id === id ? { ...z, ...patch } : z
                ),
              }))
            }
            onUpdateBlock={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                blocks: (prev.blocks || []).map((bl) => {
                  if (bl.id !== id) return bl;
                  const next = { ...bl, ...patch };
                  if (
                    patch.lotTargetWidth !== undefined ||
                    patch.setback !== undefined
                  ) {
                    next.subdividedLots = subdivideBlockIntoLots(next);
                  }
                  return next;
                }),
              }))
            }
            onUpdatePublicSpace={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                publicSpaces: prev.publicSpaces.map((p) =>
                  p.id === id ? { ...p, ...patch } : p
                ),
              }))
            }
            onUpdateStation={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                stations: prev.stations.map((s) =>
                  s.id === id ? { ...s, ...patch } : s
                ),
              }))
            }
            onUpdateRoute={(id, patch) =>
              commitCityChange((prev) => ({
                ...prev,
                routes: prev.routes.map((rt) =>
                  rt.id === id ? { ...rt, ...patch } : rt
                ),
              }))
            }
            onMoveSingleItem={(item, dx, dy) =>
              commitCityChange((prev) => moveSelectedEntities(prev, [item], dx, dy))
            }
            onDeleteSelected={handleDeleteSelected}
            onDuplicateSelected={handleDuplicateSelected}
            onGroupSelected={() =>
              commitCityChange((prev) => groupSelectedEntities(prev, selectedItems))
            }
            onUngroupSelected={() =>
              commitCityChange((prev) =>
                ungroupSelectedEntities(prev, selectedItems)
              )
            }
            onAlignSelected={(mode: AlignMode) =>
              commitCityChange((prev) =>
                alignSelectedEntities(prev, selectedItems, mode)
              )
            }
            onDistributeSelected={(axis) =>
              commitCityChange((prev) =>
                distributeSelectedEntities(prev, selectedItems, axis)
              )
            }
            onStartExtendRoad={(roadId) =>
              setExtendingRoadId((prev) => (prev === roadId ? null : roadId))
            }
            onSplitRoadAtIntersections={(roadId) => {
              commitCityChange((prev) => ({
                ...prev,
                roads: splitRoadAtIntersections(roadId, prev.roads),
              }));
              setSelectedItems([]);
            }}
            onStraightenRoad={(roadId) =>
              commitCityChange((prev) => ({
                ...prev,
                roads: prev.roads.map((r) =>
                  r.id === roadId ? { ...r, controlPoints: undefined } : r
                ),
              }))
            }
            onSubdivideBlock={handleSubdivideBlock}
          />
        </div>

        {/* Mobile Drawer Toggles */}
        <div className="lg:hidden fixed bottom-16 left-3 flex items-center gap-2 z-20">
          <button
            type="button"
            onClick={() =>
              setMobilePanel((p) => (p === 'tools' ? 'none' : 'tools'))
            }
            className="md:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 shadow-md text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Tools</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setMobilePanel((p) => (p === 'stats' ? 'none' : 'stats'))
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 shadow-md text-xs font-semibold text-slate-800 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Stats & Inspector</span>
          </button>
        </div>
      </div>

      <NewProjectModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreateBlank={(name) => loadNewCityState(createBlankCity(name))}
        onCreateRealCity={handleCreateRealCity}
        onLoadVerdantHarbor={() => loadNewCityState(createSampleCity())}
        onLoadTransitDistrict={() => loadNewCityState(createTransitHubCity())}
      />

      <ProjectsShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        currentCity={{ ...city, layers }}
        savedProjects={savedProjects}
        onLoadProject={(loaded) => loadNewCityState(loaded)}
        onDeleteProject={(id) =>
          setSavedProjects(deleteProjectFromLibrary(id))
        }
        onImportCity={(imported) => loadNewCityState(imported)}
        onSaveCurrent={handleSave}
        onDuplicateProject={(newName) => {
          const duplicated = duplicateCityProject({ ...city, layers }, newName);
          const nextList = saveProjectToLibrary(duplicated);
          setSavedProjects(nextList);
          loadNewCityState(duplicated);
        }}
      />
    </div>
  );
}
