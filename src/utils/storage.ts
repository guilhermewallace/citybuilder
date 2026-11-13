import { CityData } from '../types/city';

const ACTIVE_CITY_KEY = 'citybuilder_active_city_v1';
const SAVED_PROJECTS_KEY = 'citybuilder_saved_projects_v1';

export interface SavedProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  buildingCount: number;
  roadCount: number;
  data: CityData;
}

export function saveActiveCityToStorage(city: CityData): void {
  try {
    const payload: CityData = {
      ...city,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(ACTIVE_CITY_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadActiveCityFromStorage(): CityData | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isValidCityData(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function listSavedProjects(): SavedProjectSummary[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && p.data && isValidCityData(p.data));
  } catch {
    return [];
  }
}

export function saveProjectToLibrary(city: CityData): SavedProjectSummary[] {
  const existing = listSavedProjects();
  const updatedCity: CityData = {
    ...city,
    updatedAt: new Date().toISOString(),
  };
  const summary: SavedProjectSummary = {
    id: updatedCity.id,
    name: updatedCity.name,
    updatedAt: updatedCity.updatedAt,
    buildingCount: updatedCity.buildings.length,
    roadCount: updatedCity.roads.length,
    data: updatedCity,
  };
  const filtered = existing.filter((p) => p.id !== updatedCity.id);
  const next = [summary, ...filtered].slice(0, 25);
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(next));
    saveActiveCityToStorage(updatedCity);
  } catch {
    // Ignore quota error
  }
  return next;
}

export function deleteProjectFromLibrary(projectId: string): SavedProjectSummary[] {
  const next = listSavedProjects().filter((p) => p.id !== projectId);
  try {
    localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function isValidCityData(obj: unknown): obj is CityData {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    Array.isArray(c.roads) &&
    Array.isArray(c.buildings) &&
    Array.isArray(c.zones) &&
    Array.isArray(c.publicSpaces) &&
    Array.isArray(c.stations) &&
    Array.isArray(c.routes)
  );
}

export function duplicateCityProject(city: CityData, newName: string): CityData {
  const cloned = JSON.parse(JSON.stringify(city)) as CityData;
  return {
    ...cloned,
    id: `city-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: newName.trim() || `${city.name} Copy`,
    updatedAt: new Date().toISOString(),
  };
}

export function exportCityAsJsonString(city: CityData): string {
  return JSON.stringify(city, null, 2);
}

export function parseCityFromJsonString(raw: string): CityData | null {
  try {
    const parsed = JSON.parse(raw);
    if (isValidCityData(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeCityToShareHash(city: CityData): string {
  const json = JSON.stringify(city);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#city=${b64}`;
}

export function decodeCityFromShareHash(hash: string): CityData | null {
  try {
    if (!hash || !hash.startsWith('#city=')) return null;
    let b64 = hash.slice('#city='.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    return parseCityFromJsonString(json);
  } catch {
    return null;
  }
}
