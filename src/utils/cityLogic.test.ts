import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITY_CATALOG,
  DEFAULT_PUBLIC_OVERPASS_URL,
  findCatalogCityForBounds,
  resolveOverpassDataSource,
} from '../data/cityCatalog';
import {
  OVERPASS_RETRY_DELAYS_MS,
  OVERPASS_TIMEOUT_MS,
  RETRYABLE_HTTP_STATUSES,
} from '../services/osmService';
import {
  createBlankCity,
  createRealWorldCity,
  createSampleCity,
} from '../data/sampleCity';
import {
  createRectBlockPoints,
  generateBuildingsForBlock,
  polygonAreaM2,
  subdivideBlockIntoLots,
} from './blockSubdivision';
import {
  alignSelectedEntities,
  cloneSelectedEntities,
  distributeSelectedEntities,
  expandSelectionWithGroups,
  groupSelectedEntities,
  splitRoadAtIntersections,
  ungroupSelectedEntities,
} from './cityOperations';
import {
  cameraZoomForLeafletZoom,
  computeBoundsMetrics,
  createDefaultBoundsAround,
  haversineDistanceMeters,
  latLonToWorld,
  leafletZoomForCameraZoom,
  worldToLatLon,
} from './geoCoords';
import {
  computeControlPointFromMidpoint,
  computePolylineLengthMeters,
  computeRoadLengthMeters,
  findRoadIntersections,
  getEntitiesInSelectionBox,
  hitTestCity,
  pointInRotatedFootprint,
  pointInRotatedRect,
  sampleRoadPoints,
  snapPointToGrid,
  snapRoadPoint,
} from './geometry';
import {
  collectExistingOsmIds,
  convertOverpassToCityEntities,
  mergeImportedEntitiesIntoCity,
  OverpassResponse,
} from './osmConverter';
import {
  calculateBuildingMetrics,
  calculateCityStatistics,
} from './simulation';
import {
  decodeCityFromShareHash,
  duplicateCityProject,
  encodeCityToShareHash,
  exportCityAsJsonString,
  parseCityFromJsonString,
} from './storage';

test('snapPointToGrid snaps coordinates to nearest grid unit when enabled', () => {
  assert.deepEqual(snapPointToGrid({ x: 28, y: -42 }, true, 20), {
    x: 20,
    y: -40,
  });
  assert.deepEqual(snapPointToGrid({ x: 28, y: -42 }, false, 20), {
    x: 28,
    y: -42,
  });
});

test('snapRoadPoint connects cleanly to nearby road endpoints and edges', () => {
  const city = createBlankCity();
  city.roads.push({
    id: 'r1',
    type: 'local_street',
    name: 'First St',
    width: 14,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
  });
  const snappedEnd = snapRoadPoint({ x: 106, y: 5 }, city.roads, true, 14);
  assert.equal(snappedEnd.snappedToEndpoint, true);
  assert.equal(snappedEnd.snapKind, 'endpoint');
  assert.deepEqual(snappedEnd.point, { x: 100, y: 0 });

  const snappedEdge = snapRoadPoint({ x: 50, y: 6 }, city.roads, true, 14);
  assert.equal(snappedEdge.snapKind, 'edge');
  assert.deepEqual(snappedEdge.point, { x: 50, y: 0 });
});

test('curved road Bezier control points increase sampled road length and pass through handle', () => {
  const cp = computeControlPointFromMidpoint(
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 100, y: 60 }
  );
  const road = {
    id: 'r-curve',
    type: 'main_road' as const,
    name: 'Curved Ave',
    width: 22,
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    controlPoints: [cp],
  };
  const sampled = sampleRoadPoints(road, 10);
  assert.equal(sampled.length, 11);
  // Straight length is 100m, curved road must be strictly longer
  assert.ok(computeRoadLengthMeters(road) > 105);
});

test('findRoadIntersections and splitRoadAtIntersections split crossing roads accurately', () => {
  const city = createBlankCity();
  city.roads = [
    {
      id: 'r-h',
      type: 'main_road',
      name: 'Horizontal Ave',
      width: 22,
      points: [
        { x: -100, y: 0 },
        { x: 100, y: 0 },
      ],
    },
    {
      id: 'r-v',
      type: 'local_street',
      name: 'Vertical St',
      width: 14,
      points: [
        { x: 0, y: -100 },
        { x: 0, y: 100 },
      ],
    },
  ];
  const ixs = findRoadIntersections(city.roads);
  assert.equal(ixs.length, 1);
  assert.deepEqual(ixs[0].point, { x: 0, y: 0 });

  const split = splitRoadAtIntersections('r-h', city.roads);
  assert.equal(split.length, 3); // 2 halves of r-h + r-v
});

test('pointInRotatedRect accurately tests hit inside 90-degree rotated building', () => {
  assert.equal(pointInRotatedRect({ x: 0, y: 15 }, 0, 0, 40, 20, 90), true);
  assert.equal(pointInRotatedRect({ x: 15, y: 0 }, 0, 0, 40, 20, 90), false);
});

test('computePolylineLengthMeters converts world units (2 units = 1m) accurately', () => {
  const meters = computePolylineLengthMeters([
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ]);
  assert.equal(meters, 100);
});

test('calculateBuildingMetrics honors populationOverride and scales with floors', () => {
  const aptMetrics = calculateBuildingMetrics({
    id: 'b1',
    type: 'apartment',
    name: 'Tower',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    floors: 5,
    zone: 'residential',
  });
  assert.equal(aptMetrics.footprintAreaM2, 400);
  assert.equal(aptMetrics.grossFloorAreaM2, 2000);
  assert.ok(aptMetrics.estimatedPopulation > 50);

  const overridden = calculateBuildingMetrics({
    id: 'b1-ov',
    type: 'apartment',
    name: 'Tower',
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    floors: 5,
    zone: 'residential',
    populationOverride: 250,
  });
  assert.equal(overridden.estimatedPopulation, 250);
});

test('calculateCityStatistics returns meaningful stats for Verdant Harbor and zero for Blank City', () => {
  const sample = createSampleCity();
  const sampleStats = calculateCityStatistics(sample);
  assert.ok(sampleStats.totalPopulation > 200);
  assert.ok(sampleStats.totalJobs > 100);
  assert.equal(sampleStats.buildingCount, sample.buildings.length);
  assert.ok(sampleStats.totalRoadLengthKm > 1);

  const blankStats = calculateCityStatistics(createBlankCity());
  assert.equal(blankStats.totalPopulation, 0);
  assert.equal(blankStats.buildingCount, 0);
});

test('multi-selection, grouping, alignment, distribution, and cloning work cleanly', () => {
  const city = createBlankCity();
  city.buildings = [
    {
      id: 'b1',
      type: 'residential',
      name: 'B1',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      rotation: 0,
      floors: 2,
      zone: 'residential',
    },
    {
      id: 'b2',
      type: 'residential',
      name: 'B2',
      x: 60,
      y: 40,
      width: 20,
      height: 20,
      rotation: 0,
      floors: 2,
      zone: 'residential',
    },
    {
      id: 'b3',
      type: 'residential',
      name: 'B3',
      x: 100,
      y: 80,
      width: 20,
      height: 20,
      rotation: 0,
      floors: 2,
      zone: 'residential',
    },
  ];

  const boxSelected = getEntitiesInSelectionBox(
    { minX: -20, minY: -20, maxX: 120, maxY: 100 },
    city
  );
  assert.equal(boxSelected.length, 3);

  const grouped = groupSelectedEntities(city, boxSelected);
  assert.ok(grouped.buildings[0].groupId);
  assert.equal(
    grouped.buildings[0].groupId,
    grouped.buildings[2].groupId
  );

  const expanded = expandSelectionWithGroups(
    [{ category: 'building', id: 'b1' }],
    grouped
  );
  assert.equal(expanded.length, 3);

  const aligned = alignSelectedEntities(grouped, expanded, 'top');
  assert.equal(aligned.buildings[1].y, 0);
  assert.equal(aligned.buildings[2].y, 0);

  const distributed = distributeSelectedEntities(aligned, expanded, 'horizontal');
  assert.equal(distributed.buildings[1].x, 50);

  const ungrouped = ungroupSelectedEntities(distributed, expanded);
  assert.equal(ungrouped.buildings[0].groupId, undefined);

  const { nextCity, clonedItems } = cloneSelectedEntities(
    ungrouped,
    [{ category: 'building', id: 'b1' }],
    { x: 24, y: 24 }
  );
  assert.equal(clonedItems.length, 1);
  assert.equal(nextCity.buildings.length, 4);
});

test('city block subdivision creates parcel lots and oriented buildings', () => {
  const block = {
    id: 'blk-1',
    name: 'Oak District',
    neighborhoodType: 'mixed_use' as const,
    points: createRectBlockPoints(0, 0, 200, 140),
    lotTargetWidth: 50,
    setback: 8,
  };
  assert.equal(polygonAreaM2(block.points), 7000);
  const lots = subdivideBlockIntoLots(block);
  assert.ok(lots.length >= 4);
  const buildings = generateBuildingsForBlock(block, lots);
  assert.equal(buildings.length, lots.length);
});

test('hitTestCity prioritizes stations above buildings and buildings above zones', () => {
  const sample = createSampleCity();
  const hitStation = hitTestCity({ x: -100, y: 0 }, sample, 1);
  assert.deepEqual(hitStation, { category: 'station', id: 'st-metro-2' });
});

test('JSON, URL share hash, and duplicateCityProject preserve full city data', () => {
  const sample = createSampleCity();
  const dup = duplicateCityProject(sample, 'Verdant Clone');
  assert.notEqual(dup.id, sample.id);
  assert.equal(dup.name, 'Verdant Clone');
  assert.equal(dup.buildings.length, sample.buildings.length);

  const json = exportCityAsJsonString(sample);
  const fromJson = parseCityFromJsonString(json);
  assert.ok(fromJson);
  assert.equal(fromJson?.name, sample.name);

  const hash = encodeCityToShareHash(sample);
  const fromHash = decodeCityFromShareHash(hash);
  assert.ok(fromHash);
  assert.equal(fromHash?.id, sample.id);
});

test('latLonToWorld and worldToLatLon preserve real-world metric scale and round-trip cleanly', () => {
  const manhattan = { lat: 40.758, lon: -73.9855 };
  const target = { lat: 40.7615, lon: -73.9812 };
  const world = latLonToWorld(target.lat, target.lon, manhattan);

  // North is -y, East is +x
  assert.ok(world.x > 0);
  assert.ok(world.y < 0);

  // Metric distance matches haversine within 1%
  const expectedM = haversineDistanceMeters(manhattan, target);
  const projectedM = Math.hypot(world.x, world.y) * 0.5;
  assert.ok(Math.abs(projectedM - expectedM) / expectedM < 0.01);

  // Round-trip inverse
  const back = worldToLatLon(world.x, world.y, manhattan);
  assert.ok(Math.abs(back.lat - target.lat) < 1e-6);
  assert.ok(Math.abs(back.lon - target.lon) < 1e-6);

  // Leaflet <-> camera zoom inverse
  const lz = leafletZoomForCameraZoom(0.42, -5.0892);
  const backZoom = cameraZoomForLeafletZoom(lz, -5.0892);
  assert.ok(Math.abs(backZoom - 0.42) < 1e-6);
});

test('computeBoundsMetrics enforces max single-import area & span limits', () => {
  const normal = createDefaultBoundsAround(-5.0892, -42.8016, 300);
  const normalMetrics = computeBoundsMetrics(normal);
  assert.equal(normalMetrics.withinLimit, true);
  assert.ok(normalMetrics.widthM > 500 && normalMetrics.widthM < 700);

  const huge = createDefaultBoundsAround(-5.0892, -42.8016, 2000);
  const hugeMetrics = computeBoundsMetrics(huge);
  assert.equal(hugeMetrics.withinLimit, false);
});

test('convertOverpassToCityEntities converts OSM roads, polygon buildings, parks, water, and transit into existing layer', () => {
  const teresina = { lat: -5.0892, lon: -42.8016, label: 'Teresina' };
  const sampleOverpass: OverpassResponse = {
    elements: [
      {
        type: 'way',
        id: 101,
        tags: { highway: 'primary', name: 'Av. Frei Serafim' },
        geometry: [
          { lat: -5.0892, lon: -42.803 },
          { lat: -5.0892, lon: -42.800 },
        ],
      },
      {
        type: 'way',
        id: 202,
        tags: { building: 'commercial', name: 'Mercado Central', 'building:levels': '3' },
        geometry: [
          { lat: -5.0890, lon: -42.8018 },
          { lat: -5.0890, lon: -42.8014 },
          { lat: -5.0893, lon: -42.8014 },
          { lat: -5.0893, lon: -42.8018 },
          { lat: -5.0890, lon: -42.8018 },
        ],
      },
      {
        type: 'way',
        id: 303,
        tags: { leisure: 'park', name: 'Praça da Bandeira' },
        geometry: [
          { lat: -5.0885, lon: -42.8020 },
          { lat: -5.0885, lon: -42.8015 },
          { lat: -5.0888, lon: -42.8015 },
          { lat: -5.0888, lon: -42.8020 },
        ],
      },
      {
        type: 'way',
        id: 404,
        tags: { waterway: 'river', name: 'Rio Poti' },
        geometry: [
          { lat: -5.0870, lon: -42.8040 },
          { lat: -5.0910, lon: -42.7990 },
        ],
      },
      {
        type: 'node',
        id: 505,
        lat: -5.0891,
        lon: -42.8010,
        tags: { highway: 'bus_stop', name: 'Parada Centro' },
      },
      {
        type: 'way',
        id: 606,
        tags: { railway: 'subway', name: 'Metrô de Teresina' },
        geometry: [
          { lat: -5.0895, lon: -42.8030 },
          { lat: -5.0895, lon: -42.7990 },
        ],
      },
    ],
  };

  const categories = {
    roads: true,
    buildings: true,
    natural: true,
    transportation: true,
  };

  const imported = convertOverpassToCityEntities(sampleOverpass, teresina, categories);
  assert.equal(imported.counts.roads, 1);
  assert.equal(imported.counts.buildings, 1);
  assert.equal(imported.counts.publicSpaces, 1);
  assert.equal(imported.counts.water, 1);
  assert.equal(imported.counts.stations, 1);
  assert.equal(imported.counts.routes, 1);

  assert.equal(imported.roads[0].type, 'main_road');
  assert.equal(imported.roads[0].layerSource, 'existing');
  assert.equal(imported.buildings[0].type, 'commercial');
  assert.equal(imported.buildings[0].floors, 3);
  assert.ok((imported.buildings[0].footprint?.length || 0) >= 4);
  assert.equal(imported.buildings[0].geo?.osmId, 'way/202');

  const city = mergeImportedEntitiesIntoCity(
    createRealWorldCity(teresina, 'Teresina Plan'),
    imported,
    createDefaultBoundsAround(teresina.lat, teresina.lon, 300)
  );
  assert.equal(city.mode, 'geographic');
  assert.equal(city.buildings.length, 1);

  // Deduplication prevents importing the exact same OSM IDs twice
  const secondImport = convertOverpassToCityEntities(
    sampleOverpass,
    teresina,
    categories,
    collectExistingOsmIds(city)
  );
  assert.equal(secondImport.counts.total, 0);

  // Hit-testing respects existing vs proposed visibility & clones promote to proposed
  const b = city.buildings[0];
  assert.equal(
    pointInRotatedFootprint({ x: b.x, y: b.y }, b.x, b.y, b.width, b.height, b.rotation, b.footprint),
    true
  );
  assert.deepEqual(
    hitTestCity({ x: b.x, y: b.y }, city, 1, { existing: true, proposed: true }),
    { category: 'building', id: b.id }
  );
  assert.equal(
    hitTestCity({ x: b.x, y: b.y }, city, 1, { existing: false, proposed: true }),
    null
  );

  const { nextCity, clonedItems } = cloneSelectedEntities(
    city,
    [{ category: 'building', id: b.id }],
    { x: 20, y: 20 }
  );
  assert.equal(clonedItems.length, 1);
  assert.equal(nextCity.buildings[1].layerSource, 'proposed');
  assert.equal(nextCity.buildings[1].geo?.osmId, undefined);

  // Persistence preserves geographic metadata
  const parsed = parseCityFromJsonString(exportCityAsJsonString(nextCity));
  assert.ok(parsed);
  assert.equal(parsed?.mode, 'geographic');
  assert.equal(parsed?.geoOrigin?.label, 'Teresina');
  assert.equal(parsed?.importedBounds?.length, 1);
});

test('multi-city catalog contains New York and Teresina with independent data sources and metadata', () => {
  const nyc = CITY_CATALOG.find((c) => c.id === 'new-york');
  const teresina = CITY_CATALOG.find((c) => c.id === 'teresina');
  assert.ok(nyc);
  assert.ok(teresina);
  assert.equal(nyc?.availability, 'local_and_public');
  assert.equal(teresina?.availability, 'local_and_public');
  assert.ok(nyc?.dataSource.localProxyPath === '/overpass/api/interpreter');
  assert.ok(teresina?.dataSource.localProxyPath === '/overpass-teresina/api/interpreter');
  assert.ok(nyc?.datasetUpdatedAt);
  assert.ok(teresina?.datasetUpdatedAt);
});

test('resolveOverpassDataSource routes New York and Teresina independently in dev and safely falls back in production', () => {
  const nycBounds = createDefaultBoundsAround(40.758, -73.9855, 350);
  const teresinaBounds = createDefaultBoundsAround(-5.0892, -42.8016, 350);
  const spBounds = createDefaultBoundsAround(-23.5505, -46.6333, 350);

  assert.equal(findCatalogCityForBounds(nycBounds)?.id, 'new-york');
  assert.equal(findCatalogCityForBounds(teresinaBounds)?.id, 'teresina');

  // Claude's .env.local setting (VITE_OVERPASS_URL="/overpass/api/interpreter")
  const devEnv = { VITE_OVERPASS_URL: '/overpass/api/interpreter' };

  const nycPlan = resolveOverpassDataSource(
    nycBounds,
    { lat: 40.758, lon: -73.9855, label: 'New York', cityCatalogId: 'new-york' },
    { env: devEnv, isDev: true }
  );
  assert.deepEqual(nycPlan.endpoints, [
    '/overpass/api/interpreter',
    DEFAULT_PUBLIC_OVERPASS_URL,
  ]);
  assert.equal(nycPlan.hasLocalSource, true);

  // Teresina must NOT be routed to NYC's /overpass container; it routes to /overpass-teresina + public fallback
  const teresinaPlan = resolveOverpassDataSource(
    teresinaBounds,
    { lat: -5.0892, lon: -42.8016, label: 'Teresina', cityCatalogId: 'teresina' },
    { env: devEnv, isDev: true }
  );
  assert.deepEqual(teresinaPlan.endpoints, [
    '/overpass-teresina/api/interpreter',
    DEFAULT_PUBLIC_OVERPASS_URL,
  ]);
  assert.equal(teresinaPlan.hasLocalSource, true);

  // Production build with no local env vars never hits localhost/dev proxy
  const prodTeresina = resolveOverpassDataSource(
    teresinaBounds,
    { lat: -5.0892, lon: -42.8016, label: 'Teresina', cityCatalogId: 'teresina' },
    { env: {}, isDev: false }
  );
  assert.deepEqual(prodTeresina.endpoints, [DEFAULT_PUBLIC_OVERPASS_URL]);
  assert.equal(prodTeresina.hasLocalSource, false);

  // Custom hosted Overpass backend in production works for all cities
  const prodHosted = resolveOverpassDataSource(
    spBounds,
    { lat: -23.5505, lon: -46.6333, label: 'São Paulo', cityCatalogId: 'sao-paulo' },
    { env: { VITE_OVERPASS_URL: 'https://overpass.example.org/api/interpreter' }, isDev: false }
  );
  assert.deepEqual(prodHosted.endpoints, [
    'https://overpass.example.org/api/interpreter',
    DEFAULT_PUBLIC_OVERPASS_URL,
  ]);

  // Verify Claude's Overpass timeout (30s) and exponential backoff (2s, 4s, 8s) constants are preserved
  assert.equal(OVERPASS_TIMEOUT_MS, 30_000);
  assert.deepEqual([...OVERPASS_RETRY_DELAYS_MS], [2000, 4000, 8000]);
  assert.equal(RETRYABLE_HTTP_STATUSES.has(429), true);
  assert.equal(RETRYABLE_HTTP_STATUSES.has(502), true);
  assert.equal(RETRYABLE_HTTP_STATUSES.has(503), true);
  assert.equal(RETRYABLE_HTTP_STATUSES.has(504), true);
});

