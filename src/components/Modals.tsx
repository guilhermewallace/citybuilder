import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileDown,
  FileUp,
  Globe2,
  Loader2,
  Map,
  MapPin,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  LocationSearchResult,
  PRESET_CITIES,
  searchOsmLocations,
} from '../services/osmService';
import { CityData, GeoOrigin } from '../types/city';
import {
  encodeCityToShareHash,
  exportCityAsJsonString,
  parseCityFromJsonString,
  SavedProjectSummary,
} from '../utils/storage';

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreateBlank: (name: string) => void;
  onCreateRealCity: (origin: GeoOrigin, name?: string) => void;
  onLoadVerdantHarbor: () => void;
  onLoadTransitDistrict: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  open,
  onClose,
  onCreateBlank,
  onCreateRealCity,
  onLoadVerdantHarbor,
  onLoadTransitDistrict,
}) => {
  const [modeTab, setModeTab] = useState<'blank' | 'real'>('blank');
  const [cityName, setCityName] = useState('New Metropolis');

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<LocationSearchResult[]>(PRESET_CITIES);
  const [selectedLoc, setSelectedLoc] = useState<LocationSearchResult | null>(
    null
  );
  const [realProjectName, setRealProjectName] = useState('');

  if (!open) return null;

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setResults(PRESET_CITIES);
      setHasSearched(false);
      setSearchError('');
      return;
    }
    setSearching(true);
    setSearchError('');
    setHasSearched(true);
    try {
      const found = await searchOsmLocations(trimmed);
      setResults(found);
      if (found.length > 0) {
        setSelectedLoc(found[0]);
        setRealProjectName(found[0].name);
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Unable to search locations right now.'
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSelectLocation = (loc: LocationSearchResult) => {
    setSelectedLoc(loc);
    setRealProjectName(loc.name);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
      className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="new-project-title" className="text-base font-semibold text-slate-900">
            Start a City Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher: Blank City vs Real City */}
        <div className="px-5 pt-4">
          <div
            role="tablist"
            aria-label="Project creation mode"
            className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'blank'}
              onClick={() => setModeTab('blank')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                modeTab === 'blank'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>Blank City</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'real'}
              onClick={() => setModeTab('real')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                modeTab === 'real'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Real City (OpenStreetMap)</span>
            </button>
          </div>
        </div>

        {modeTab === 'blank' ? (
          <div className="p-5 space-y-4">
            <div>
              <label
                htmlFor="new-city-name"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                Project name (for blank canvas)
              </label>
              <input
                id="new-city-name"
                type="text"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onCreateBlank(cityName.trim() || 'Untitled City');
                  onClose();
                }}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Map className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Blank Map Canvas
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Start with an open grid and design every street and block from zero.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onLoadVerdantHarbor();
                  onClose();
                }}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Verdant Harbor (Sample City)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Complete waterfront town with metro line, bus loop, parks, and districts.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  onLoadTransitDistrict();
                  onClose();
                }}
                className="w-full flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Map className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Metro Crossing (Transit Starter)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Compact transit-oriented hub ready for surrounding neighborhood expansion.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
              className="space-y-2"
            >
              <label
                htmlFor="osm-location-search"
                className="block text-xs font-medium text-slate-600"
              >
                Search city, neighborhood, or street address
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="osm-location-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Teresina, Brazil or Manhattan, New York"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer shrink-0"
                >
                  {searching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Search</span>
                </button>
              </div>
            </form>

            {/* Quick Example Locations */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 mr-0.5">Examples:</span>
              {PRESET_CITIES.map((preset) => (
                <button
                  key={preset.placeId}
                  type="button"
                  onClick={() => {
                    setQuery(`${preset.name}, ${preset.country || ''}`.trim());
                    handleSelectLocation(preset);
                  }}
                  className={`px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    selectedLoc?.placeId === preset.placeId
                      ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset.name}, {preset.country === 'United States' ? 'New York' : preset.country}
                </button>
              ))}
            </div>

            {searchError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {searchError}
              </p>
            )}

            {/* Search Results */}
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
              {results.length === 0 ? (
                <div className="px-3.5 py-5 text-center text-xs text-slate-500">
                  {hasSearched
                    ? 'No matching locations found. Try another city, neighborhood, or address.'
                    : 'Enter a location above to search OpenStreetMap.'}
                </div>
              ) : (
                results.map((loc) => {
                  const isSel = selectedLoc?.placeId === loc.placeId;
                  return (
                    <button
                      key={loc.placeId}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className={`w-full px-3.5 py-2.5 flex items-start justify-between gap-2 text-left transition-colors cursor-pointer ${
                        isSel ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <MapPin
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            isSel ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {loc.name}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {loc.displayName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-medium text-slate-500 capitalize block">
                          {loc.type}
                        </span>
                        <span className="text-[10px] font-mono-tabular text-slate-400">
                          {loc.lat.toFixed(3)}, {loc.lon.toFixed(3)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedLoc && (
              <div className="pt-2 border-t border-slate-100 flex items-end gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="real-city-name"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Project name
                  </label>
                  <input
                    id="real-city-name"
                    type="text"
                    value={realProjectName}
                    onChange={(e) => setRealProjectName(e.target.value)}
                    placeholder={selectedLoc.name}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:border-blue-500 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onCreateRealCity(
                      {
                        lat: selectedLoc.lat,
                        lon: selectedLoc.lon,
                        label: selectedLoc.name,
                        displayName: selectedLoc.displayName,
                      },
                      realProjectName.trim() || selectedLoc.name
                    );
                    onClose();
                  }}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Real-World Map
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface ProjectsShareModalProps {
  open: boolean;
  onClose: () => void;
  currentCity: CityData;
  savedProjects: SavedProjectSummary[];
  onLoadProject: (city: CityData) => void;
  onDeleteProject: (id: string) => void;
  onImportCity: (city: CityData) => void;
  onSaveCurrent: () => void;
  onDuplicateProject: (newName: string) => void;
}

export const ProjectsShareModal: React.FC<ProjectsShareModalProps> = ({
  open,
  onClose,
  currentCity,
  savedProjects,
  onLoadProject,
  onDeleteProject,
  onImportCity,
  onSaveCurrent,
  onDuplicateProject,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [importError, setImportError] = useState('');
  const [dupName, setDupName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const shareUrl = `${window.location.origin}${window.location.pathname}${encodeCityToShareHash(currentCity)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      window.location.hash = encodeCityToShareHash(currentCity);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleDownloadJson = () => {
    const json = exportCityAsJsonString(currentCity);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (currentCity.name || 'city')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    a.href = url;
    a.download = `${safeName}.citybuilder.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCityFromJsonString(String(reader.result || ''));
      if (parsed) {
        onImportCity(parsed);
        onClose();
      } else {
        setImportError('Invalid CityBuilder JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="projects-share-title"
      className="fixed inset-0 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="projects-share-title" className="text-base font-semibold text-slate-900">
            Saved Projects & Sharing
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Duplicate Project Under New Name */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500">
              Duplicate Current Project
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Duplicate project name"
                value={dupName}
                onChange={(e) => setDupName(e.target.value)}
                placeholder={`${currentCity.name} Copy`}
                className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 focus:border-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onDuplicateProject(dupName.trim() || `${currentCity.name} Copy`);
                  setDupName('');
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                Duplicate As New
              </button>
            </div>
          </div>

          {/* Shareable Link & JSON Import/Export */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500">
              Share or Export “{currentCity.name}”
            </h3>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                aria-label="Shareable project URL"
                value={shareUrl}
                className="flex-1 px-2.5 py-1.5 text-xs font-mono-tabular bg-slate-50 border border-slate-200 rounded-md text-slate-600 truncate"
              />
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download JSON</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Import JSON</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>

            {importError && (
              <p className="text-xs text-red-600">{importError}</p>
            )}
          </div>

          {/* Saved Browser Projects */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500">
                Browser Saved Projects
              </h3>
              <button
                type="button"
                onClick={onSaveCurrent}
                className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
              >
                Save Current Snapshot
              </button>
            </div>

            {savedProjects.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No saved snapshots yet. Click “Save” in the top bar or “Save Current Snapshot” above to store cities locally.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {savedProjects.map((proj) => (
                  <div
                    key={proj.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {proj.name}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular">
                        {proj.buildingCount} buildings · {proj.roadCount} roads
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadProject(proj.data);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProject(proj.id)}
                        aria-label={`Delete saved project ${proj.name}`}
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
