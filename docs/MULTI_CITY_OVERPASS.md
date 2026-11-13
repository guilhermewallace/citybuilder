# Multi-City OpenStreetMap & Overpass Guide

CityBuilder supports multiple real-world cities through a decoupled **City Catalog** (`src/data/cityCatalog.ts`), automatic per-city Overpass endpoint routing (`src/services/osmService.ts`), Vite development proxies (`vite.config.ts`), and isolated local Docker Overpass containers (`docker-compose.yml`).

## Architecture Overview

- **Existing New York container (`overpass_nyc`, port `12345`)**: Preserved completely untouched. Vite proxies `/overpass` -> `http://localhost:12345`.
- **Teresina container (`overpass_teresina`, port `12346`)**: Isolated container + separate Docker volume (`overpass_teresina_data`) built from a clipped official Geofabrik extract (`nordeste-latest.osm.pbf`). Vite proxies `/overpass-teresina` -> `http://localhost:12346`.
- **Automatic Endpoint Routing + Public Fallback**:
  1. City-specific env override (`VITE_OVERPASS_URL_NYC`, `VITE_OVERPASS_URL_TERESINA`, etc.)
  2. In local Vite dev mode, matching catalog city local proxy (`/overpass/api/interpreter` for New York, `/overpass-teresina/api/interpreter` for Teresina)
  3. Public Overpass API fallback (`https://overpass-api.de/api/interpreter`) with 30s timeout and 2s / 4s / 8s exponential backoff for HTTP `429`, `502`, `503`, `504`.

## Adding & Running Teresina Locally (Without Touching `overpass_nyc`)

1. Make the extraction script executable and extract Teresina (`~36 km × 30 km` metro + Timon border from Geofabrik Brazil Northeast):

```bash
chmod +x scripts/extract-city-osm.sh
./scripts/extract-city-osm.sh teresina
```

2. Start the isolated `overpass_teresina` container:

```bash
docker compose up -d overpass_teresina
docker logs -f overpass_teresina
```

3. Verify both local containers respond independently:

```bash
# Existing New York Overpass
curl -s "http://localhost:12345/api/status"

# New Teresina Overpass
curl -s "http://localhost:12346/api/status"
```

4. Run CityBuilder in development:

```bash
npm run dev
```

Your existing `.env.local` (`VITE_OVERPASS_URL="/overpass/api/interpreter"`) continues working for New York, while selecting **Teresina — Brazil** inside CityBuilder automatically routes to `/overpass-teresina/api/interpreter` (and cleanly falls back to `https://overpass-api.de/api/interpreter` if `overpass_teresina` is stopped).

## Expected Resource Requirements

| City Extract | Geofabrik Source | Clipped PBF | Overpass DB Disk | Idle RAM | Peak Query RAM | Initial Import Time |
| --- | --- | --- | --- | --- | --- | --- |
| New York (`overpass_nyc`) | `new-york-latest.osm.pbf` | ~120–180 MB | ~1.2–2.0 GB | ~200–350 MB | ~1.0–1.5 GB | ~4–8 min |
| Teresina (`overpass_teresina`) | `nordeste-latest.osm.pbf` | ~10–25 MB | ~150–350 MB | ~120–220 MB | ~400–700 MB | ~1–2 min |

## Adding Another City in the Future (e.g., Fortaleza or São Paulo)

1. Extract the city's bounding box from Geofabrik:
   ```bash
   ./scripts/extract-city-osm.sh fortaleza
   ```
2. Add a new service in `docker-compose.yml` on the next port (e.g., `12347:80`) with its own volume (`overpass_fortaleza_data`).
3. Add `/overpass-fortaleza` proxy in `vite.config.ts` targeting `http://localhost:12347`.
4. Update the city's entry in `src/data/cityCatalog.ts` (`localProxyPath: '/overpass-fortaleza/api/interpreter'`, `availability: 'local_and_public'`, `datasetUpdatedAt: 'YYYY-MM-DD'`). No editor or renderer code changes are required.
