#!/bin/sh
# Downloads the Seattle part of the Protomaps basemap into public/tiles/seattle.pmtiles (git-ignored), once (Q4).
# Needs the network and the pmtiles command-line tool (https://github.com/protomaps/go-pmtiles/releases).
# Without the file the maps are drawn on a blank paper background, with the pin, the outline and the zone name.
#   sh scripts/fetch-tiles.sh            # the latest daily build
#   PROTOMAPS_BUILD=20261101 sh scripts/fetch-tiles.sh
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
out="$here/public/tiles/seattle.pmtiles"
bbox="-122.46,47.48,-122.22,47.74"              # the city of Seattle, with a margin
build=${PROTOMAPS_BUILD:-$(date -u -d yesterday +%Y%m%d 2>/dev/null || date -u -v-1d +%Y%m%d)}
if ! command -v pmtiles >/dev/null 2>&1; then
  echo "pmtiles is not installed. Get it from https://github.com/protomaps/go-pmtiles/releases, then run this again." >&2
  exit 1
fi
mkdir -p "$(dirname "$out")"
pmtiles extract "https://build.protomaps.com/$build.pmtiles" "$out" --bbox="$bbox" --maxzoom=15
echo "wrote $out ($(du -h "$out" | cut -f1)). Map data © OpenStreetMap contributors, Protomaps."
