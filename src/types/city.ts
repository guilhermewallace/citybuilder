export interface Point {
  x: number;
  y: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeoMetadata {
  lat: number;
  lon: number;
  osmId?: string;
  osmType?: 'node' | 'way' | 'relation';
  osmTags?: Record<string, string>;
  geometry?: GeoPoint[];
  bounds?: GeoBounds;
}

export type LayerSource = 'existing' | 'proposed';

export type ProjectMode = 'fictional' | 'geographic';

export interface GeoOrigin {
  lat: number;
  lon: number;
  label: string;
  displayName?: string;
}

export interface OsmImportCategories {
  roads: boolean;
  buildings: boolean;
  natural: boolean;
  transportation: boolean;
}

export type RoadType =
  | 'local_street'
  | 'main_road'
  | 'highway'
  | 'pedestrian_street'
  | 'bicycle_lane';

export type BuildingType =
  | 'residential'
  | 'apartment'
  | 'commercial'
  | 'office'
  | 'industrial'
  | 'public';

export type BuildingUsage =
  | 'Single-Family Home'
  | 'Multi-Family Apartment'
  | 'Retail & Dining'
  | 'Corporate Office'
  | 'Industrial & Logistics'
  | 'Civic & Public'
  | 'Mixed-Use';

export type ZoneType = 'residential' | 'commercial' | 'industrial' | 'mixed_use';

export type PublicSpaceType = 'park' | 'playground' | 'plaza' | 'sports_facility';

export type TransitStationType = 'bus_stop' | 'metro_station' | 'train_station';

export type TransitLineType = 'bus_route' | 'metro_line' | 'railway';

export interface ObjectAppearance {
  fillColor?: string;
  strokeColor?: string;
  opacity?: number; // 0.1 to 1
}

export interface RoadSegment {
  id: string;
  type: RoadType;
  name: string;
  points: Point[];
  /** Optional quadratic Bezier control point per segment i (from points[i] to points[i+1]) */
  controlPoints?: (Point | null)[];
  width: number; // world units (1 unit = 0.5m)
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface BuildingItem {
  id: string;
  type: BuildingType;
  name: string;
  x: number; // center x in world units
  y: number; // center y in world units
  width: number; // world units
  height: number; // world units
  rotation: number; // degrees
  floors: number;
  zone: ZoneType;
  usage?: BuildingUsage;
  populationOverride?: number | null;
  /** Optional local polygon vertices relative to (x, y) in unrotated building frame */
  footprint?: Point[];
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface ZoneRect {
  id: string;
  type: ZoneType;
  name: string;
  x: number; // top-left x in world units
  y: number; // top-left y in world units
  width: number;
  height: number;
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface PublicSpaceItem {
  id: string;
  type: PublicSpaceType;
  name: string;
  x: number; // center x
  y: number; // center y
  width: number;
  height: number;
  rotation: number;
  /** Optional local polygon vertices relative to (x, y) in unrotated frame */
  footprint?: Point[];
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface TransitStation {
  id: string;
  type: TransitStationType;
  name: string;
  x: number;
  y: number;
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface TransitRoute {
  id: string;
  type: TransitLineType;
  name: string;
  color: string;
  points: Point[];
  stationIds: string[];
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export type NeighborhoodType = 'residential' | 'commercial' | 'mixed_use';

export interface CityBlock {
  id: string;
  name: string;
  neighborhoodType: NeighborhoodType;
  points: Point[]; // Polygon vertices (4+ points)
  lotTargetWidth: number; // world units
  setback: number; // world units
  subdividedLots?: Point[][];
  groupId?: string;
  appearance?: ObjectAppearance;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface WaterFeature {
  id: string;
  name: string;
  points: Point[];
  width: number;
  isArea?: boolean;
  layerSource?: LayerSource;
  geo?: GeoMetadata;
}

export interface LayerVisibility {
  basemap: boolean;
  existing: boolean;
  proposed: boolean;
  grid: boolean;
  water: boolean;
  zones: boolean;
  blocks: boolean;
  roads: boolean;
  buildings: boolean;
  publicSpaces: boolean;
  transit: boolean;
  labels: boolean;
}

export interface CityData {
  id: string;
  name: string;
  updatedAt: string;
  mode?: ProjectMode;
  geoOrigin?: GeoOrigin;
  importedBounds?: GeoBounds[];
  attribution?: string;
  roads: RoadSegment[];
  buildings: BuildingItem[];
  zones: ZoneRect[];
  blocks?: CityBlock[];
  publicSpaces: PublicSpaceItem[];
  stations: TransitStation[];
  routes: TransitRoute[];
  water?: WaterFeature[];
  layers?: Partial<LayerVisibility>;
}

export type ActiveTool =
  | { kind: 'select' }
  | { kind: 'pan' }
  | { kind: 'road'; roadType: RoadType }
  | { kind: 'building'; buildingType: BuildingType }
  | { kind: 'zone'; zoneType: ZoneType }
  | { kind: 'block'; shape: 'rect' | 'poly' }
  | { kind: 'public_space'; spaceType: PublicSpaceType }
  | { kind: 'station'; stationType: TransitStationType }
  | { kind: 'route'; routeType: TransitLineType };

export type EntityCategory =
  | 'road'
  | 'building'
  | 'zone'
  | 'block'
  | 'public_space'
  | 'station'
  | 'route';

export interface SelectedEntity {
  category: EntityCategory;
  id: string;
}

export type ViewMode = 'standard' | 'zoning' | 'transit' | 'density';

export interface CameraState {
  x: number; // world coordinate at screen center
  y: number;
  zoom: number; // pixels per world unit
}

export interface BuildingMetrics {
  footprintAreaM2: number;
  grossFloorAreaM2: number;
  heightM: number;
  estimatedPopulation: number;
  estimatedJobs: number;
}

export interface CityStatistics {
  totalPopulation: number;
  totalJobs: number;
  buildingCount: number;
  buildingsByType: Record<BuildingType, number>;
  totalRoadLengthKm: number;
  roadLengthByTypeKm: Record<RoadType, number>;
  greenSpaceAreaM2: number;
  greenSpaceAreaHa: number;
  transitStationCount: number;
  transitRouteLengthKm: number;
  zoneAreaHa: number;
  metrics: {
    transitAccessScore: number; // 0-100
    greenPerCapitaM2: number;
    jobsHousingRatio: number;
    walkabilityScore: number; // 0-100
  };
}
