import { METERS_PER_UNIT } from '../data/catalog';
import {
  BuildingItem,
  BuildingMetrics,
  BuildingType,
  CityData,
  CityStatistics,
  RoadType,
} from '../types/city';
import { polygonAreaM2 } from './blockSubdivision';
import {
  computePolylineLengthMeters,
  computeRoadLengthMeters,
  distanceBetween,
} from './geometry';

const FLOOR_HEIGHT_METERS = 3.2;

export function calculateBuildingMetrics(building: BuildingItem): BuildingMetrics {
  const widthM = building.width * METERS_PER_UNIT;
  const heightM = building.height * METERS_PER_UNIT;
  const footprintAreaM2 =
    building.footprint && building.footprint.length >= 3
      ? Math.max(10, polygonAreaM2(building.footprint))
      : Math.round(widthM * heightM);
  const floors = Math.max(1, Math.round(building.floors));
  const grossFloorAreaM2 = footprintAreaM2 * floors;
  const buildingHeightM = Math.round(floors * FLOOR_HEIGHT_METERS * 10) / 10;

  let estimatedPopulation = 0;
  let estimatedJobs = 0;

  switch (building.type) {
    case 'residential':
      // ~38 m² per resident in low-rise housing
      estimatedPopulation = Math.max(2, Math.round(grossFloorAreaM2 / 38));
      break;
    case 'apartment':
      // ~32 m² per resident in multi-family apartments
      estimatedPopulation = Math.max(6, Math.round(grossFloorAreaM2 / 32));
      break;
    case 'commercial':
      // ~28 m² per retail/service job
      estimatedJobs = Math.max(3, Math.round(grossFloorAreaM2 / 28));
      break;
    case 'office':
      // ~20 m² per office worker
      estimatedJobs = Math.max(8, Math.round(grossFloorAreaM2 / 20));
      break;
    case 'industrial':
      // ~55 m² per industrial worker
      estimatedJobs = Math.max(4, Math.round(grossFloorAreaM2 / 55));
      break;
    case 'public':
      // Civic/public institutions generate staff jobs and serve the neighborhood
      estimatedJobs = Math.max(5, Math.round(grossFloorAreaM2 / 40));
      break;
  }

  if (
    typeof building.populationOverride === 'number' &&
    Number.isFinite(building.populationOverride) &&
    building.populationOverride >= 0
  ) {
    estimatedPopulation = Math.round(building.populationOverride);
  }

  return {
    footprintAreaM2,
    grossFloorAreaM2,
    heightM: buildingHeightM,
    estimatedPopulation,
    estimatedJobs,
  };
}

export function calculateCityStatistics(city: CityData): CityStatistics {
  let totalPopulation = 0;
  let totalJobs = 0;

  const buildingsByType: Record<BuildingType, number> = {
    residential: 0,
    apartment: 0,
    commercial: 0,
    office: 0,
    industrial: 0,
    public: 0,
  };

  let buildingsNearTransit = 0;
  let buildingsNearGreen = 0;
  let buildingsNearRoad = 0;

  const transitCatchmentUnits = 260; // 130m walk radius
  const greenCatchmentUnits = 220; // 110m walk radius
  const roadAccessUnits = 110; // 55m road frontage

  for (const b of city.buildings) {
    buildingsByType[b.type] = (buildingsByType[b.type] || 0) + 1;
    const m = calculateBuildingMetrics(b);
    totalPopulation += m.estimatedPopulation;
    totalJobs += m.estimatedJobs;

    const bPos = { x: b.x, y: b.y };

    if (
      city.stations.some(
        (s) => distanceBetween(bPos, { x: s.x, y: s.y }) <= transitCatchmentUnits
      )
    ) {
      buildingsNearTransit++;
    }

    if (
      city.publicSpaces.some(
        (ps) =>
          distanceBetween(bPos, { x: ps.x, y: ps.y }) <=
          greenCatchmentUnits + Math.max(ps.width, ps.height) / 2
      )
    ) {
      buildingsNearGreen++;
    }

    if (
      city.roads.some((road) =>
        road.points.some((pt, idx) => {
          if (idx === road.points.length - 1) {
            return distanceBetween(bPos, pt) <= roadAccessUnits;
          }
          const next = road.points[idx + 1];
          const mid = { x: (pt.x + next.x) / 2, y: (pt.y + next.y) / 2 };
          return (
            distanceBetween(bPos, pt) <= roadAccessUnits ||
            distanceBetween(bPos, mid) <= roadAccessUnits ||
            distanceBetween(bPos, next) <= roadAccessUnits
          );
        })
      )
    ) {
      buildingsNearRoad++;
    }
  }

  const roadLengthByTypeKm: Record<RoadType, number> = {
    local_street: 0,
    main_road: 0,
    highway: 0,
    pedestrian_street: 0,
    bicycle_lane: 0,
  };

  let totalRoadMeters = 0;
  let activeTransportMeters = 0;
  for (const road of city.roads) {
    const meters = computeRoadLengthMeters(road);
    totalRoadMeters += meters;
    roadLengthByTypeKm[road.type] =
      (roadLengthByTypeKm[road.type] || 0) + meters / 1000;
    if (
      road.type === 'pedestrian_street' ||
      road.type === 'bicycle_lane' ||
      road.type === 'local_street'
    ) {
      activeTransportMeters += meters;
    }
  }

  let greenSpaceAreaM2 = 0;
  for (const ps of city.publicSpaces) {
    const areaM2 =
      ps.footprint && ps.footprint.length >= 3
        ? polygonAreaM2(ps.footprint)
        : ps.width * METERS_PER_UNIT * (ps.height * METERS_PER_UNIT);
    // Plazas count 45% toward green/civic open space, parks/sports/playgrounds 100%
    const factor = ps.type === 'plaza' ? 0.45 : 1.0;
    greenSpaceAreaM2 += areaM2 * factor;
  }

  let zoneAreaM2 = 0;
  for (const z of city.zones) {
    zoneAreaM2 += z.width * METERS_PER_UNIT * (z.height * METERS_PER_UNIT);
  }

  let transitRouteMeters = 0;
  for (const route of city.routes) {
    transitRouteMeters += computePolylineLengthMeters(route.points);
  }

  const buildingCount = city.buildings.length;
  const transitCoverageRatio =
    buildingCount > 0 ? buildingsNearTransit / buildingCount : 0;
  const routeBonus = Math.min(20, city.routes.length * 7);
  const transitAccessScore =
    buildingCount === 0 && city.stations.length === 0
      ? 0
      : Math.min(100, Math.round(transitCoverageRatio * 80 + routeBonus));

  const greenPerCapitaM2 =
    totalPopulation > 0
      ? Math.round((greenSpaceAreaM2 / totalPopulation) * 10) / 10
      : Math.round(greenSpaceAreaM2);

  const jobsHousingRatio =
    totalPopulation > 0
      ? Math.round((totalJobs / (totalPopulation * 0.55)) * 100) / 100
      : 0;

  const greenProximityRatio =
    buildingCount > 0 ? buildingsNearGreen / buildingCount : 0;
  const roadConnectRatio =
    buildingCount > 0 ? buildingsNearRoad / buildingCount : 0;
  const activeRatio =
    totalRoadMeters > 0
      ? Math.min(1, activeTransportMeters / Math.max(1, totalRoadMeters * 0.6))
      : 0;

  const walkabilityScore =
    buildingCount === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            roadConnectRatio * 35 +
              greenProximityRatio * 35 +
              activeRatio * 30
          )
        );

  return {
    totalPopulation,
    totalJobs,
    buildingCount,
    buildingsByType,
    totalRoadLengthKm: Math.round((totalRoadMeters / 1000) * 100) / 100,
    roadLengthByTypeKm,
    greenSpaceAreaM2: Math.round(greenSpaceAreaM2),
    greenSpaceAreaHa: Math.round((greenSpaceAreaM2 / 10000) * 100) / 100,
    transitStationCount: city.stations.length,
    transitRouteLengthKm: Math.round((transitRouteMeters / 1000) * 100) / 100,
    zoneAreaHa: Math.round((zoneAreaM2 / 10000) * 100) / 100,
    metrics: {
      transitAccessScore,
      greenPerCapitaM2,
      jobsHousingRatio,
      walkabilityScore,
    },
  };
}
