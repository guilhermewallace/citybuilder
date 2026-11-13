import {
  ActiveTool,
  BuildingType,
  BuildingUsage,
  NeighborhoodType,
  PublicSpaceType,
  RoadType,
  TransitLineType,
  TransitStationType,
  ZoneType,
} from '../types/city';

export const METERS_PER_UNIT = 0.5; // 2 world units = 1 meter
export const GRID_SIZE = 20; // 20 world units = 10 meters

export interface ToolCatalogItem {
  id: string;
  label: string;
  description: string;
  tool: ActiveTool;
  color: string;
  shortcut?: string;
}

export interface ToolCategoryGroup {
  id: string;
  title: string;
  items: ToolCatalogItem[];
}

export const ROAD_CONFIG: Record<
  RoadType,
  {
    label: string;
    defaultWidth: number;
    casingColor: string;
    fillColor: string;
    lineColor: string;
    defaultName: string;
  }
> = {
  local_street: {
    label: 'Local street',
    defaultWidth: 14,
    casingColor: '#CBD5E1',
    fillColor: '#FFFFFF',
    lineColor: '#E2E8F0',
    defaultName: 'Local Street',
  },
  main_road: {
    label: 'Main road',
    defaultWidth: 22,
    casingColor: '#94A3B8',
    fillColor: '#FEF9E7',
    lineColor: '#F59E0B',
    defaultName: 'Avenue',
  },
  highway: {
    label: 'Highway',
    defaultWidth: 34,
    casingColor: '#EA580C',
    fillColor: '#FED7AA',
    lineColor: '#FFFFFF',
    defaultName: 'Expressway',
  },
  pedestrian_street: {
    label: 'Pedestrian street',
    defaultWidth: 12,
    casingColor: '#D6D3D1',
    fillColor: '#F5F0E6',
    lineColor: '#A8A29E',
    defaultName: 'Promenade',
  },
  bicycle_lane: {
    label: 'Bicycle lane',
    defaultWidth: 8,
    casingColor: '#059669',
    fillColor: '#D1FAE5',
    lineColor: '#059669',
    defaultName: 'Cycleway',
  },
};

export const BUILDING_CONFIG: Record<
  BuildingType,
  {
    label: string;
    defaultWidth: number;
    defaultHeight: number;
    defaultFloors: number;
    defaultZone: ZoneType;
    defaultUsage: BuildingUsage;
    roofColor: string;
    wallColor: string;
    borderColor: string;
    defaultName: string;
  }
> = {
  residential: {
    label: 'Residential building',
    defaultWidth: 34,
    defaultHeight: 28,
    defaultFloors: 2,
    defaultZone: 'residential',
    defaultUsage: 'Single-Family Home',
    roofColor: '#FCE7D2',
    wallColor: '#E6B89C',
    borderColor: '#C27849',
    defaultName: 'Townhouse',
  },
  apartment: {
    label: 'Apartment complex',
    defaultWidth: 56,
    defaultHeight: 42,
    defaultFloors: 7,
    defaultZone: 'residential',
    defaultUsage: 'Multi-Family Apartment',
    roofColor: '#FDBA74',
    wallColor: '#EA580C',
    borderColor: '#C2410C',
    defaultName: 'Residential Block',
  },
  commercial: {
    label: 'Commercial building',
    defaultWidth: 46,
    defaultHeight: 36,
    defaultFloors: 3,
    defaultZone: 'commercial',
    defaultUsage: 'Retail & Dining',
    roofColor: '#BAE6FD',
    wallColor: '#38BDF8',
    borderColor: '#0284C7',
    defaultName: 'Market Hall',
  },
  office: {
    label: 'Office building',
    defaultWidth: 52,
    defaultHeight: 52,
    defaultFloors: 12,
    defaultZone: 'commercial',
    defaultUsage: 'Corporate Office',
    roofColor: '#A5B4FC',
    wallColor: '#6366F1',
    borderColor: '#4338CA',
    defaultName: 'Office Tower',
  },
  industrial: {
    label: 'Industrial building',
    defaultWidth: 74,
    defaultHeight: 50,
    defaultFloors: 2,
    defaultZone: 'industrial',
    defaultUsage: 'Industrial & Logistics',
    roofColor: '#D8B4FE',
    wallColor: '#A855F7',
    borderColor: '#7E22CE',
    defaultName: 'Workshop Plant',
  },
  public: {
    label: 'Public building',
    defaultWidth: 60,
    defaultHeight: 46,
    defaultFloors: 4,
    defaultZone: 'mixed_use',
    defaultUsage: 'Civic & Public',
    roofColor: '#99F6E4',
    wallColor: '#14B8A6',
    borderColor: '#0F766E',
    defaultName: 'Civic Center',
  },
};

export const BUILDING_USAGES: BuildingUsage[] = [
  'Single-Family Home',
  'Multi-Family Apartment',
  'Retail & Dining',
  'Corporate Office',
  'Industrial & Logistics',
  'Civic & Public',
  'Mixed-Use',
];

export const ZONE_CONFIG: Record<
  ZoneType,
  {
    label: string;
    fillColor: string;
    strokeColor: string;
    hatchColor: string;
    defaultName: string;
  }
> = {
  residential: {
    label: 'Residential zone',
    fillColor: 'rgba(251, 146, 60, 0.14)',
    strokeColor: '#EA580C',
    hatchColor: 'rgba(234, 88, 12, 0.18)',
    defaultName: 'Residential District',
  },
  commercial: {
    label: 'Commercial zone',
    fillColor: 'rgba(56, 189, 248, 0.15)',
    strokeColor: '#0284C7',
    hatchColor: 'rgba(2, 132, 199, 0.18)',
    defaultName: 'Commercial District',
  },
  industrial: {
    label: 'Industrial zone',
    fillColor: 'rgba(168, 85, 247, 0.14)',
    strokeColor: '#7E22CE',
    hatchColor: 'rgba(126, 34, 206, 0.18)',
    defaultName: 'Industrial District',
  },
  mixed_use: {
    label: 'Mixed-use zone',
    fillColor: 'rgba(20, 184, 166, 0.15)',
    strokeColor: '#0D9488',
    hatchColor: 'rgba(13, 148, 136, 0.18)',
    defaultName: 'Mixed-Use District',
  },
};

export const NEIGHBORHOOD_CONFIG: Record<
  NeighborhoodType,
  {
    label: string;
    fillColor: string;
    strokeColor: string;
    defaultLotWidth: number;
  }
> = {
  residential: {
    label: 'Residential',
    fillColor: 'rgba(253, 186, 116, 0.18)',
    strokeColor: '#EA580C',
    defaultLotWidth: 50,
  },
  commercial: {
    label: 'Commercial',
    fillColor: 'rgba(125, 211, 252, 0.2)',
    strokeColor: '#0284C7',
    defaultLotWidth: 64,
  },
  mixed_use: {
    label: 'Mixed-use',
    fillColor: 'rgba(94, 234, 212, 0.2)',
    strokeColor: '#0D9488',
    defaultLotWidth: 58,
  },
};

export const PUBLIC_SPACE_CONFIG: Record<
  PublicSpaceType,
  {
    label: string;
    defaultWidth: number;
    defaultHeight: number;
    fillColor: string;
    borderColor: string;
    defaultName: string;
  }
> = {
  park: {
    label: 'Park',
    defaultWidth: 120,
    defaultHeight: 100,
    fillColor: '#DCFCE7',
    borderColor: '#4ADE80',
    defaultName: 'Neighborhood Park',
  },
  playground: {
    label: 'Playground',
    defaultWidth: 64,
    defaultHeight: 54,
    fillColor: '#ECFCCB',
    borderColor: '#84CC16',
    defaultName: 'Community Playground',
  },
  plaza: {
    label: 'Plaza',
    defaultWidth: 84,
    defaultHeight: 72,
    fillColor: '#F5F5F4',
    borderColor: '#A8A29E',
    defaultName: 'Civic Plaza',
  },
  sports_facility: {
    label: 'Sports facility',
    defaultWidth: 116,
    defaultHeight: 76,
    fillColor: '#D1FAE5',
    borderColor: '#10B981',
    defaultName: 'Athletic Field',
  },
};

export const TRANSIT_STATION_CONFIG: Record<
  TransitStationType,
  {
    label: string;
    color: string;
    badge: string;
    defaultName: string;
  }
> = {
  bus_stop: {
    label: 'Bus stop',
    color: '#0284C7',
    badge: 'B',
    defaultName: 'Bus Stop',
  },
  metro_station: {
    label: 'Metro station',
    color: '#DC2626',
    badge: 'M',
    defaultName: 'Metro Station',
  },
  train_station: {
    label: 'Train station',
    color: '#334155',
    badge: 'T',
    defaultName: 'Rail Station',
  },
};

export const TRANSIT_LINE_CONFIG: Record<
  TransitLineType,
  {
    label: string;
    defaultColor: string;
    width: number;
    defaultName: string;
  }
> = {
  bus_route: {
    label: 'Bus route',
    defaultColor: '#0284C7',
    width: 5,
    defaultName: 'Bus Line',
  },
  metro_line: {
    label: 'Metro line',
    defaultColor: '#DC2626',
    width: 7,
    defaultName: 'Metro Line',
  },
  railway: {
    label: 'Railway',
    defaultColor: '#334155',
    width: 6,
    defaultName: 'Commuter Rail',
  },
};

export const TOOL_CATEGORIES: ToolCategoryGroup[] = [
  {
    id: 'roads',
    title: 'Roads',
    items: [
      {
        id: 'local_street',
        label: 'Local street',
        description: 'Click and drag or click points to draw neighborhood streets',
        tool: { kind: 'road', roadType: 'local_street' },
        color: '#64748B',
      },
      {
        id: 'main_road',
        label: 'Main road',
        description: 'Arterial avenue with lane dividers for medium traffic',
        tool: { kind: 'road', roadType: 'main_road' },
        color: '#D97706',
      },
      {
        id: 'highway',
        label: 'Highway',
        description: 'High-capacity multi-lane express corridor',
        tool: { kind: 'road', roadType: 'highway' },
        color: '#EA580C',
      },
      {
        id: 'pedestrian_street',
        label: 'Pedestrian street',
        description: 'Car-free paved promenade for walking and cafés',
        tool: { kind: 'road', roadType: 'pedestrian_street' },
        color: '#78716C',
      },
      {
        id: 'bicycle_lane',
        label: 'Bicycle lane',
        description: 'Dedicated protected green cycling path',
        tool: { kind: 'road', roadType: 'bicycle_lane' },
        color: '#059669',
      },
    ],
  },
  {
    id: 'buildings',
    title: 'Buildings',
    items: [
      {
        id: 'residential',
        label: 'Residential building',
        description: 'Low-rise home or townhouse (press R to rotate)',
        tool: { kind: 'building', buildingType: 'residential' },
        color: '#EA580C',
      },
      {
        id: 'apartment',
        label: 'Apartment complex',
        description: 'Multi-story urban housing block',
        tool: { kind: 'building', buildingType: 'apartment' },
        color: '#C2410C',
      },
      {
        id: 'commercial',
        label: 'Commercial building',
        description: 'Retail shops, markets, and street-level businesses',
        tool: { kind: 'building', buildingType: 'commercial' },
        color: '#0284C7',
      },
      {
        id: 'office',
        label: 'Office building',
        description: 'Mid/high-rise workplace and business tower',
        tool: { kind: 'building', buildingType: 'office' },
        color: '#4F46E5',
      },
      {
        id: 'industrial',
        label: 'Industrial building',
        description: 'Manufacturing, logistics, and fabrication plant',
        tool: { kind: 'building', buildingType: 'industrial' },
        color: '#9333EA',
      },
      {
        id: 'public',
        label: 'Public building',
        description: 'School, library, clinic, or civic institution',
        tool: { kind: 'building', buildingType: 'public' },
        color: '#0D9488',
      },
    ],
  },
  {
    id: 'blocks',
    title: 'Blocks',
    items: [
      {
        id: 'block_rect',
        label: 'Block (Rectangle)',
        description: 'Drag to create a rectangular city block and subdivide into lots',
        tool: { kind: 'block', shape: 'rect' },
        color: '#2563EB',
      },
      {
        id: 'block_poly',
        label: 'Block (Polygon)',
        description: 'Click corners to draw a custom polygonal city block',
        tool: { kind: 'block', shape: 'poly' },
        color: '#0D9488',
      },
    ],
  },
  {
    id: 'zones',
    title: 'Zones',
    items: [
      {
        id: 'zone_residential',
        label: 'Residential',
        description: 'Drag on canvas to designate housing land use',
        tool: { kind: 'zone', zoneType: 'residential' },
        color: '#EA580C',
      },
      {
        id: 'zone_commercial',
        label: 'Commercial',
        description: 'Drag on canvas to designate retail & office land use',
        tool: { kind: 'zone', zoneType: 'commercial' },
        color: '#0284C7',
      },
      {
        id: 'zone_industrial',
        label: 'Industrial',
        description: 'Drag on canvas to designate manufacturing land use',
        tool: { kind: 'zone', zoneType: 'industrial' },
        color: '#7E22CE',
      },
      {
        id: 'zone_mixed_use',
        label: 'Mixed-use',
        description: 'Drag on canvas for blended living, retail & civic spaces',
        tool: { kind: 'zone', zoneType: 'mixed_use' },
        color: '#0D9488',
      },
    ],
  },
  {
    id: 'public_spaces',
    title: 'Public spaces',
    items: [
      {
        id: 'park',
        label: 'Park',
        description: 'Green canopy park that improves city livability',
        tool: { kind: 'public_space', spaceType: 'park' },
        color: '#16A34A',
      },
      {
        id: 'playground',
        label: 'Playground',
        description: 'Neighborhood play area for families',
        tool: { kind: 'public_space', spaceType: 'playground' },
        color: '#65A30D',
      },
      {
        id: 'plaza',
        label: 'Plaza',
        description: 'Paved urban gathering square with central fountain',
        tool: { kind: 'public_space', spaceType: 'plaza' },
        color: '#78716C',
      },
      {
        id: 'sports_facility',
        label: 'Sports facility',
        description: 'Outdoor athletic pitch and recreation track',
        tool: { kind: 'public_space', spaceType: 'sports_facility' },
        color: '#059669',
      },
    ],
  },
  {
    id: 'transportation',
    title: 'Transportation',
    items: [
      {
        id: 'bus_stop',
        label: 'Bus stop',
        description: 'Place a surface transit stop along a street',
        tool: { kind: 'station', stationType: 'bus_stop' },
        color: '#0284C7',
      },
      {
        id: 'bus_route',
        label: 'Bus route',
        description: 'Draw a bus corridor connecting stops',
        tool: { kind: 'route', routeType: 'bus_route' },
        color: '#0284C7',
      },
      {
        id: 'metro_station',
        label: 'Metro station',
        description: 'Place an underground rapid transit station',
        tool: { kind: 'station', stationType: 'metro_station' },
        color: '#DC2626',
      },
      {
        id: 'metro_line',
        label: 'Metro line',
        description: 'Draw a high-capacity metro line between stations',
        tool: { kind: 'route', routeType: 'metro_line' },
        color: '#DC2626',
      },
      {
        id: 'train_station',
        label: 'Train station',
        description: 'Place a regional commuter rail terminal',
        tool: { kind: 'station', stationType: 'train_station' },
        color: '#334155',
      },
      {
        id: 'railway',
        label: 'Railway',
        description: 'Draw regional rail tracks across the city',
        tool: { kind: 'route', routeType: 'railway' },
        color: '#334155',
      },
    ],
  },
];

export function isSameTool(a: ActiveTool, b: ActiveTool): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'select':
    case 'pan':
      return true;
    case 'road':
      return b.kind === 'road' && a.roadType === b.roadType;
    case 'building':
      return b.kind === 'building' && a.buildingType === b.buildingType;
    case 'zone':
      return b.kind === 'zone' && a.zoneType === b.zoneType;
    case 'block':
      return b.kind === 'block' && a.shape === b.shape;
    case 'public_space':
      return b.kind === 'public_space' && a.spaceType === b.spaceType;
    case 'station':
      return b.kind === 'station' && a.stationType === b.stationType;
    case 'route':
      return b.kind === 'route' && a.routeType === b.routeType;
  }
}

export function getToolLabel(tool: ActiveTool): string {
  switch (tool.kind) {
    case 'select':
      return 'Select & Move';
    case 'pan':
      return 'Pan Canvas';
    case 'road':
      return ROAD_CONFIG[tool.roadType].label;
    case 'building':
      return BUILDING_CONFIG[tool.buildingType].label;
    case 'zone':
      return ZONE_CONFIG[tool.zoneType].label;
    case 'block':
      return tool.shape === 'rect' ? 'Block (Rectangle)' : 'Block (Polygon)';
    case 'public_space':
      return PUBLIC_SPACE_CONFIG[tool.spaceType].label;
    case 'station':
      return TRANSIT_STATION_CONFIG[tool.stationType].label;
    case 'route':
      return TRANSIT_LINE_CONFIG[tool.routeType].label;
  }
}
