# signalk-weather-routing — Specification

## Confirmed Requirements

| # | Requirement | Status |
|---|---|---|
| REQ-1 | SignalK Node.js plugin, TypeScript | done |
| REQ-2 | GRIB2 wind data from OpenSkiron — ICON-EU model, 7 km grid, hourly to 78 h then 3-hourly to 120 h | done |
| REQ-3 | Routing algorithm is modular — a common interface allows multiple algorithm implementations; isochrone is the first | done |
| REQ-4 | Polar diagram: ORC/OpenCPN semicolon-delimited CSV, same format as signalk-polar-performance-plugin (read file directly — that plugin has no query API yet) | done |
| REQ-5 | Land avoidance: GSHHG high-resolution (h) shapefile (https://www.soest.hawaii.edu/pwessel/gshhg/) | done |
| REQ-6 | GSHHG downloaded and land mask built automatically on first plugin start if not already present | done |
| REQ-7 | Routes saved to SignalK `resources/routes` as GeoJSON — visible in freeboard-sk natively | done |
| REQ-8 | Separate Leaflet-based UI served from plugin `public/` — not embedded in freeboard-sk | done |
| REQ-9 | No turf.js — pure math for all geographic calculations | done |
| REQ-10 | No runtime npm dependencies beyond explicitly approved packages | done |
| REQ-11 | The webapp is registered as a SignalK webapp (`signalk-webapp` keyword) so it appears in the app dock | done |
| REQ-12 | Map chart tiles are sourced via the SignalK resources charts API (`GET /signalk/v1/api/resources/charts`) — no hardcoded external tile URL | done |
| REQ-13 | The loaded GRIB file's geographic coverage is shown on the map as a dashed rectangle | open |
| REQ-14 | The weather routing webapp displays the calculated route on the map, with wind conditions at each waypoint interpolated to the time the vessel is estimated to be at that location | open |
| REQ-15 | Wind barbs on the route map are larger | open |
| REQ-16 | Expected time of arrival (ETA) is shown at each waypoint on the route map | open |
| REQ-17 | The webapp has a button to toggle a land mask overlay on the map. The overlay must be faithful to the land mask used during routing: it must show exactly the same polygons at exactly the same boundaries, with no filtering, simplification, or sampling applied. | done |
| REQ-18 | The webapp shows calculation progress — either a progress bar or progressive isochrone rendering on the map | done |
| REQ-19 | Isochrones are drawn as lines (connecting the frontier points of each time step), not as individual dots | done |
| REQ-20 | Estimated travel time between consecutive waypoints is shown on the map | done |
| REQ-21 | Calculation time for each leg is shown on the map in red | done |
| REQ-22 | On the centre of each leg, the average wind direction and speed used to calculate the leg is shown as a wind arrow with barbs | open |
| REQ-23 | A checkbox (enabled by default) controls whether coast avoidance is applied during routing; when unchecked, the algorithm runs without land avoidance | open |
| REQ-24 | When the polar diagram gives zero speed for a heading, the boat may motor at a configurable engine speed instead of treating that heading as unreachable | open |
| REQ-25 | Isochrone lines cycle through alternating colours (black, blue, purple) so successive isochrones are visually distinguishable on the map | open |
| REQ-26 | Isochrone expansion uses a coarse-to-fine heading step: first pass at a wide step (e.g. 20°) to identify promising bearing bands, second pass at full resolution (5°) only within those bands | done |
| REQ-27 | Frontier expansion is parallelised across Node.js Worker threads (one per CPU core); workers are pooled and reused across isochrone steps to amortise creation overhead | open |
| REQ-28 | Wind and polar lookups are cached within each isochrone step so adjacent frontier points sharing a GRIB grid cell avoid redundant bilinear interpolation | open |
| REQ-29 | GSHHG polygons are simplified at load time using the Douglas-Peucker algorithm with a tolerance matched to routing resolution, reducing per-polygon edge count before the spatial index is built | open |
| REQ-30 | Land segment checks are cached in a bounded LRU cache keyed on quantised endpoint coordinates; cache persists across isochrone steps (coastlines do not change) | open |
| REQ-31 | The spatial index uses a two-level grid (coarse ~10° cells containing fine 1° cells); the coarse level provides fast rejection before the fine level is consulted | open |
| REQ-32 | Weather data can be loaded from multiple GRIB files, merged into a single forecast covering a larger time range or geographic area | open |
| REQ-33 | Analyse realistic input uncertainty (polar inaccuracy, GRIB forecast error, local wind variations) to determine the minimum meaningful search resolution; use the result to justify and document the default values for headingStep, coarseHeadingStep, and sectorSize | open |

## Design Decisions

| # | Decision |
|---|---|
| D1 | All code must be SignalK-native — TypeScript/Node.js only. No external scripts, no other languages. Python scripts are not acceptable. |
| D2 | GRIB2 parsing: **gdal-async** npm package (bundles GDAL with GRIB driver + OpenJPEG for JPEG2000 compression used by OpenSkiron files) |
| D3 | Land avoidance: **gdal-async** loads GSHHG L1 high-res polygons into memory at startup; 1°×1° spatial grid index gives O(local polygons) exact segment-intersection tests — no rasterisation, no resolution floor |
| D4 | The `scripts/` directory and all `.py` files must be removed |
| D5 | ZIP extraction: **adm-zip** npm package (pure JS, no system binary dependency) |
| D6 | GRIB2 band identification scoped to OpenSkiron/ICON-EU: `GRIB_ELEMENT` = UGRD/VGRD, `GRIB_SHORT_NAME` = `10-HTGL`; clear error if not found |
| D8 | Routing algorithm interface includes an optional `options` bag for per-algorithm tuning (headingStep, sectorSize, arrivalRadiusNm, minBoatSpeed) |
| D9 | GRIB2 file is provided by the user on the filesystem; no download component |
| D10 | Calculation progress uses Server-Sent Events (`GET /calculation-stream`, `text/event-stream`): each `onProgress` call pushes a `progress` event immediately; `done`/`error` events close the stream. The webapp opens the SSE connection and awaits `onopen` before sending `POST /calculate`, guaranteeing the client is registered before the first frontier update fires. |

## Algorithm Research Notes

Research conducted 2026-05-25 covering the isochrone method, alternatives, and known limitations.

### Isochrone loop — handled by current design
Non-convex polar diagrams cause the frontier to fold back on itself. The `pruneToFrontier` bearing-sector approach (keeping the farthest point per 1° sector from the start) resolves this correctly. Note: sectors are relative to the fixed start point — on very long passages (>200 NM) two diverging points can share a sector and one is discarded. Bearing sectors relative to the destination (advancing direction) would be more accurate for long-range routes.

### VMG optimisation within sectors
The 5° heading step quantises the optimal VMG angle. A refinement: analytically find the true VMG maximum within each sector rather than snapping to the nearest grid heading. Low implementation cost; meaningful on polar-sensitive close-hauled and reaching angles.

### Convergence near destination
Standard isochrones can produce abrupt course changes as the frontier approaches the destination. An "Isochrone-A*" variant (Chen 2024) applies an A* homing bias in the second half of the voyage and reports ~3.8% improvement. Not a priority for short Baltic passages; relevant for offshore routes.

### Land avoidance: waypoint insertion is not sufficient for this use case
Offshore racing practitioners (altendorff series, 2010) dismiss automated land avoidance and rely on manually inserted exclusion waypoints instead, citing imprecise bathymetric data. This conclusion does not transfer to Baltic archipelago routing. Before GSHHG polygon avoidance was implemented, routes consistently passed through Sweden and the Åland mainland — narrow passages such as the Åland Sea make waypoint insertion impractical. Automated exact-polygon land avoidance is non-negotiable for this use case.

### Tidal currents and leeway
Tidal streams in the Baltic are minor (<0.5 kts) except near Öresund. Leeway (lateral drift at close-hauled angles) is not currently modelled. Both can be incorporated as a vector offset per candidate point per step without changing the algorithm structure. No current data is present in ICON-EU GRIB files; a separate dataset would be required.

### Alternative algorithms
Dynamic programming, genetic algorithms, A*, calculus of variations, and particle swarm optimisation have all been studied. None consistently outperform a well-implemented isochrone method for time-optimal routing within a GRIB forecast horizon. The isochrone method is O(steps × points × headings), globally optimal within its discretisation, and well-suited to the hot-path performance constraints of this project (Raspberry Pi 3–5).

### What does not affect the algorithm
Wave state (requires separate wave GRIB), multi-sail polar switching, and forecast re-running (re-calculate as new GRIB arrives every 6–12 h) are operational practices, not algorithm changes.

### Isochrone generation speed — research findings

Current worst-case: 360 frontier points × 72 headings × 93 time steps ≈ 2.4 M candidate evaluations. Practical frontiers are typically 100–200 points, giving ~1–1.4 M evaluations.

**Coarse-to-fine heading step (REQ-26):** A first pass at 20° (18 headings) identifies the bearing bands worth exploring; a second pass at 5° only within those bands reduces total heading evaluations by 3–5×. Literature supports 10–20° as sufficient for initial screening. Moderate complexity — requires two-pass expansion per step.

**Worker thread parallelisation (REQ-27):** Candidate evaluations are independent per frontier point; partitioning across N worker threads gives near-linear speedup up to core count. Estimated 2.5–3× on Raspberry Pi 3 (4 cores @ 1.2 GHz), 3–3.5× on Pi 5. Workers must be pooled (created once, reused) to avoid per-step creation overhead.

**Wind/polar caching (REQ-28):** Adjacent frontier points often share GRIB grid cells. A small per-step cache (50–100 entries) yields 30–50% hit rate on typical frontiers. Low complexity; 1.3–1.8× speedup.

**Combined estimate:** REQ-26 + REQ-27 + REQ-28 together: 8–15× speedup on Raspberry Pi hardware.

### Land avoidance speed — research findings

**Douglas-Peucker simplification (REQ-29):** GSHHG L1 polygons can have 100k+ vertices per coastline. DP simplification at load time with tolerance = routing resolution (≈0.01°) reduces edge count 2–5× with negligible routing accuracy loss at the 1 NM resolution of the isochrone grid. One-time cost at startup. R-trees are considered higher-risk than grid approaches for GSHHG because large overlapping MBRs reduce their advantage.

**Persistent segment cache (REQ-30):** Coastlines are static; the same segment can be checked at multiple time steps. A bounded LRU cache (10k–100k entries) keyed on quantised endpoints avoids redundant polygon intersection tests. Estimated 10–30% speedup on multi-day routes.

**Two-level spatial grid (REQ-31):** A coarse 10°×10° first level rapidly eliminates cells before the 1°×1° fine level is consulted. Deterministic performance; 1.2–2× speedup without R-tree complexity. Preferable to R-tree for GSHHG data due to large polygon MBRs.

**Combined estimate:** REQ-29 + REQ-30 + REQ-31 together: 3–8× speedup on land avoidance overhead.

### Practitioner conclusion (altendorff series)
Algorithm quality is not the primary bottleneck. Polar accuracy, wind sensor quality, and the sailor's ability to execute course changes matter more in practice than algorithmic refinements.

## Design Decisions

| # | Decision |
|---|---|
| D1 | All code must be SignalK-native — TypeScript/Node.js only. No external scripts, no other languages. Python scripts are not acceptable. |
| D2 | GRIB2 parsing: **gdal-async** npm package (bundles GDAL with GRIB driver + OpenJPEG for JPEG2000 compression used by OpenSkiron files) |
| D3 | Land avoidance: **gdal-async** loads GSHHG L1 high-res polygons into memory at startup; 1°×1° spatial grid index gives O(local polygons) exact segment-intersection tests — no rasterisation, no resolution floor |
| D4 | The `scripts/` directory and all `.py` files must be removed |
| D5 | ZIP extraction: **adm-zip** npm package (pure JS, no system binary dependency) |
| D6 | GRIB2 band identification scoped to OpenSkiron/ICON-EU: `GRIB_ELEMENT` = UGRD/VGRD, `GRIB_SHORT_NAME` = `10-HTGL`; clear error if not found |
| D7 | Waypoint insertion rejected as the land avoidance strategy — the Baltic archipelago and Åland Sea contain too many narrow passages to guard with manually placed waypoints; exact GSHHG polygon intersection is required |
| D8 | Routing algorithm interface includes an optional `options` bag for per-algorithm tuning (headingStep, sectorSize, arrivalRadiusNm, minBoatSpeed) |
| D9 | GRIB2 file is provided by the user on the filesystem; no download component |
| D10 | Calculation progress uses Server-Sent Events (`GET /calculation-stream`, `text/event-stream`): each `onProgress` call pushes a `progress` event immediately; `done`/`error` events close the stream. The webapp opens the SSE connection and awaits `onopen` before sending `POST /calculate`, guaranteeing the client is registered before the first frontier update fires. |

## Process Rules

- Requirements and design decisions are captured here before any code is written.
- No code without an explicit plan approved by the user.

## References

| URL | Description |
|-----|-------------|
| https://www.altendorff.co.uk/archives/1151 | "Routing 5 of 7: Algorithms" — overview of isochrone vs local-knowledge routing methods, critical input variables (polar, weather, tidal stream, AIS), and limitations of automated obstacle avoidance |
| https://www.altendorff.co.uk/archives/1187 | "Routing 7 of 7: Conclusion" — practitioner assessment that polar accuracy and execution matter more than algorithm quality |
| https://research.chalmers.se/publication/540537/file/540537_Fulltext.pdf | Chen (2024), Chalmers — "Strategies to improve the isochrone algorithm for ship voyage optimisation"; introduces Isochrone-A* with ~3.8% improvement |
| https://www.sciencedirect.com/science/article/pii/S2405535216300043 | Vettor & Guedes Soares (2016) — "Modeling and Optimization Algorithms in Ship Weather Routing", survey of approaches |
| https://onepetro.org/JST/article-pdf/10/01/74/4994773/sname-jst-2025-04.pdf | SNAME Journal of Sailing Technology (2025) — minimum-time sailing boat path with currents and leeway |
| https://routing.luckgrib.com/intro/isochrones/index.html | LuckGrib routing documentation — practical notes on isochrone method, frontier sizes (100–200 points typical), and coarse-to-fine heading strategies |
| https://www.researchgate.net/publication/261431212_An_improved_Douglas_Peucker_algorithm_aimed_at_simplifying_natural_shoreline_into_direction_line | Douglas-Peucker applied to shoreline simplification — accuracy vs. complexity trade-offs for routing resolution |
| https://www.researchgate.net/publication/294621713_An_Effective_Algorithm_for_Lines_and_Polygons_Overlay_Analysis_Using_Uniform_Spatial_Grid_Indexing | Uniform spatial grid indexing for line-polygon overlay — supports two-level grid approach over R-tree for irregular polygon distributions |
