# signalk-weather-routing — Specification

## Confirmed Requirements

| # | Requirement | Status |
|---|---|---|
| 1 | SignalK Node.js plugin, TypeScript | done |
| 2 | GRIB2 wind data from OpenSkiron — ICON-EU model, 7 km grid, hourly to 78 h then 3-hourly to 120 h | done |
| 3 | Routing algorithm is modular — a common interface allows multiple algorithm implementations; isochrone is the first | done |
| 4 | Polar diagram: ORC/OpenCPN semicolon-delimited CSV, same format as signalk-polar-performance-plugin (read file directly — that plugin has no query API yet) | done |
| 5 | Land avoidance: GSHHG intermediate-resolution shapefile (https://www.soest.hawaii.edu/pwessel/gshhg/) | done |
| 6 | GSHHG downloaded and land mask built automatically on first plugin start if not already present | done |
| 7 | Routes saved to SignalK `resources/routes` as GeoJSON — visible in freeboard-sk natively | done |
| 8 | Separate Leaflet-based UI served from plugin `public/` — not embedded in freeboard-sk | done |
| 9 | No turf.js — pure math for all geographic calculations | done |
| 10 | No runtime npm dependencies beyond explicitly approved packages | done |
| 11 | The webapp is registered as a SignalK webapp (`signalk-webapp` keyword) so it appears in the app dock | done |
| 12 | Map chart tiles are sourced via the SignalK resources charts API (`GET /signalk/v1/api/resources/charts`) — no hardcoded external tile URL | done |
| 13 | The loaded GRIB file's geographic coverage is shown on the map as a dashed rectangle | open |
| 14 | The weather routing webapp displays the calculated route on the map, with wind conditions at each waypoint interpolated to the time the vessel is estimated to be at that location | open |
| 15 | Wind barbs on the route map are larger | open |
| 16 | Expected time of arrival (ETA) is shown at each waypoint on the route map | open |

## Design Decisions

| # | Decision |
|---|---|
| D1 | All code must be SignalK-native — TypeScript/Node.js only. No external scripts, no other languages. Python scripts are not acceptable. |
| D2 | GRIB2 parsing: **gdal-async** npm package (bundles GDAL with GRIB driver + OpenJPEG for JPEG2000 compression used by OpenSkiron files) |
| D3 | Land mask build: **gdal-async** shapefile driver to read GSHHG, rasterized in Node.js — no Python |
| D4 | The `scripts/` directory and all `.py` files must be removed |
| D5 | ZIP extraction: **adm-zip** npm package (pure JS, no system binary dependency) |
| D6 | GRIB2 band identification scoped to OpenSkiron/ICON-EU: `GRIB_ELEMENT` = UGRD/VGRD, `GRIB_SHORT_NAME` = `10-HTGL`; clear error if not found |
| D7 | Land mask ships as a pre-built binary (`data/landmask.bin`) in the package; auto-rebuild in background if missing or version mismatch |
| D8 | Routing algorithm interface includes an optional `options` bag for per-algorithm tuning (headingStep, sectorSize, arrivalRadiusNm, minBoatSpeed) |
| D9 | GRIB2 file is provided by the user on the filesystem; no download component |

## Process Rules

- Requirements and design decisions are captured here before any code is written.
- No code without an explicit plan approved by the user.
