#!/usr/bin/env bash
set -euo pipefail

# Reproducible Geofabrik + Osmium bounding-box extractor for CityBuilder local Overpass cities.
# Usage:
#   ./scripts/extract-city-osm.sh teresina
#   ./scripts/extract-city-osm.sh new-york
#   ./scripts/extract-city-osm.sh fortaleza
#   ./scripts/extract-city-osm.sh <city-id> <geofabrik-pbf-url> <minLon,minLat,maxLon,maxLat>

CITY_ID="${1:-teresina}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOWNLOAD_DIR="${ROOT_DIR}/docker/downloads"
DATA_DIR="${ROOT_DIR}/docker/data"

mkdir -p "${DOWNLOAD_DIR}" "${DATA_DIR}"

case "${CITY_ID}" in
  teresina)
    EXTRACT_URL="https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf"
    BBOX="-42.98,-5.22,-42.65,-4.95"
    OUT_FILE="${DATA_DIR}/teresina.osm.pbf"
    ;;
  new-york)
    EXTRACT_URL="https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf"
    BBOX="-74.2591,40.4774,-73.7004,40.9176"
    OUT_FILE="${DATA_DIR}/new-york.osm.pbf"
    ;;
  fortaleza)
    EXTRACT_URL="https://download.geofabrik.de/south-america/brazil/nordeste-latest.osm.pbf"
    BBOX="-38.68,-3.90,-38.40,-3.68"
    OUT_FILE="${DATA_DIR}/fortaleza.osm.pbf"
    ;;
  sao-paulo)
    EXTRACT_URL="https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf"
    BBOX="-46.85,-23.75,-46.36,-23.38"
    OUT_FILE="${DATA_DIR}/sao-paulo.osm.pbf"
    ;;
  *)
    if [[ $# -lt 3 ]]; then
      echo "Usage: $0 <city-id> <geofabrik-pbf-url> <minLon,minLat,maxLon,maxLat>" >&2
      exit 1
    fi
    EXTRACT_URL="$2"
    BBOX="$3"
    OUT_FILE="${DATA_DIR}/${CITY_ID}.osm.pbf"
    ;;
esac

SRC_FILENAME="$(basename "${EXTRACT_URL}")"
SRC_FILE="${DOWNLOAD_DIR}/${SRC_FILENAME}"

if [[ ! -f "${SRC_FILE}" ]]; then
  echo "Downloading official Geofabrik extract: ${EXTRACT_URL}"
  curl -fL --progress-bar "${EXTRACT_URL}" -o "${SRC_FILE}.tmp"
  mv "${SRC_FILE}.tmp" "${SRC_FILE}"
else
  echo "Using cached Geofabrik extract: ${SRC_FILE}"
fi

echo "Clipping ${CITY_ID} bounding box (${BBOX}) -> ${OUT_FILE}"

if command -v osmium >/dev/null 2>&1; then
  osmium extract \
    --bbox="${BBOX}" \
    --strategy=complete_ways \
    --overwrite \
    "${SRC_FILE}" \
    -o "${OUT_FILE}"
else
  echo "Local 'osmium' binary not found; running osmium-tool via Docker..."
  docker run --rm \
    -v "${DOWNLOAD_DIR}:/downloads:ro" \
    -v "${DATA_DIR}:/data" \
    iboates/osmium:latest \
    extract \
    --bbox="${BBOX}" \
    --strategy=complete_ways \
    --overwrite \
    "/downloads/${SRC_FILENAME}" \
    -o "/data/$(basename "${OUT_FILE}")"
fi

ls -lh "${OUT_FILE}"
echo "Done. Start container with: docker compose up -d overpass_${CITY_ID}"
