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
| REQ-13 | The loaded GRIB file's geographic coverage is shown on the map as a dashed rectangle | done |
| REQ-14 | The weather routing webapp displays the calculated route on the map, with wind conditions at each waypoint interpolated to the time the vessel is estimated to be at that location | done |
| REQ-15 | Wind barbs on the route map are larger | done |
| REQ-16 | Expected time of arrival (ETA) is shown at each waypoint on the route map | done |
| REQ-17 | The webapp has a button to toggle a land mask overlay on the map. The overlay must be faithful to the land mask used during routing: it must show exactly the same polygons at exactly the same boundaries, with no filtering, simplification, or sampling applied. | done |
| REQ-18 | The webapp shows calculation progress — either a progress bar or progressive isochrone rendering on the map | done |
| REQ-19 | Isochrones are drawn as lines (connecting the frontier points of each time step), not as individual dots | done |
| REQ-20 | Estimated travel time between consecutive waypoints is shown on the map | done |
| REQ-21 | Calculation time for each leg is shown on the map in red | done |
| REQ-22 | On the centre of each leg, the average wind direction and speed used to calculate the leg is shown as a wind arrow with barbs | open |
| REQ-23 | A checkbox (enabled by default) controls whether coast avoidance is applied during routing; when unchecked, the algorithm runs without land avoidance | open |
| REQ-24 | When the polar diagram gives zero speed for a heading, the boat may motor at a configurable engine speed instead of treating that heading as unreachable | open |
| REQ-25 | Isochrone lines cycle through alternating colours (black, blue, purple, red) so successive isochrones are visually distinguishable on the map | done |
| REQ-26 | Isochrone expansion uses a coarse-to-fine heading step: first pass at a wide step (e.g. 20°) to identify promising bearing bands, second pass at full resolution (5°) only within those bands | done |
| REQ-27 | Frontier expansion is parallelised across Node.js Worker threads (one per CPU core); workers are pooled and reused across isochrone steps to amortise creation overhead | open |
| REQ-28 | Wind and polar lookups are cached within each isochrone step so adjacent frontier points sharing a GRIB grid cell avoid redundant bilinear interpolation | open |
| REQ-29 | ~~At load time, build two GSHHG polygon sets: a simplified set (Douglas-Peucker, tolerance ≈ 0.01°) used for the coarse pre-pass spatial index, and the original full-resolution set used for the fine isochrone pass and the land overlay.~~ **Superseded by REQ-41** (edge-tile index makes DP simplification unnecessary). | superseded |
| REQ-30 | Land segment checks are cached in a bounded LRU cache keyed on quantised endpoint coordinates; cache persists across isochrone steps (coastlines do not change) | open |
| REQ-31 | ~~The spatial index uses a two-level grid (coarse ~10° cells containing fine 1° cells); the coarse level provides fast rejection before the fine level is consulted~~ **Superseded by REQ-41** (edge-tile index at 0.1° makes two-level grid unnecessary). | superseded |
| REQ-41 | Replace the polygon-index spatial grid with an edge-tile index: at load time, insert each GSHHG polygon edge into all 0.1° grid cells it crosses; save the index to a binary file invalidated by GSHHG mtime. Segment checks DDA-walk the cells the path crosses and test only the edges in those cells. The existing `polygonsInBbox` function (used by the land overlay) is unchanged. | done |
| REQ-32 | Weather data can be loaded from multiple GRIB files, merged into a single forecast covering a larger time range or geographic area | open |
| REQ-33 | Analyse realistic input uncertainty (polar inaccuracy, GRIB forecast error, local wind variations) to determine the minimum meaningful search resolution; use the result to justify and document the default values for headingStep, coarseHeadingStep, and sectorSize | open |
| REQ-38 | Each isochrone calculation step emits a structured timing breakdown: number of frontier points, number of candidates evaluated, number of land checks performed, time spent in wind lookups, polar lookups, land checks, and frontier pruning. The breakdown is logged per step and summarised (min/max/total) at the end of the calculation. | done |
| REQ-34 | Before the fine isochrone pass, run a preliminary full-route coarse isochrone (coarseStep headings, with land checks) to establish an upper-bound arrival time T_bound. After each fine-pass frontier pruning step, discard frontier points from which the destination cannot be reached before T_bound, using the polar's maximum boat speed as an admissible lower bound on remaining travel time. This eliminates wasteful exploration of frontier points that are provably unable to improve on the already-known coarse solution. | done |
| REQ-35 | During the coarse pre-pass, each candidate is checked before being added to the frontier: discard any candidate whose bearing from the start deviates by more than 90° from the direct start→destination bearing. This cone-prunes the pre-pass at generation time so that candidates heading away from the destination are rejected immediately, producing visually meaningful cone-shaped isochrones rather than full rings. The 90° half-angle allows full tacking coverage while eliminating candidates in the opposite hemisphere from the destination. | done |
| REQ-36 | The map only draws frontier points that have passed all pruning steps. Points that survive sector pruning but are subsequently eliminated by T_bound or cone pruning must not appear in the drawn isochrone lines. | done |
| REQ-37 | The webapp has a "Run test" button that pre-fills start (60°01'37.5"N 19°51'26.9"E), finish (58°24'36.8"N 19°06'20.9"E), and departure time (May 25 06:00 CET = 04:00 UTC) and immediately starts a routing run. A command-line script invokes the same test run with the same fixed parameters. | done |
| REQ-39 | At load time, GSHHG land polygons are pre-processed by dilated union: each polygon is expanded outward by 0.5 NM, and any polygons whose expanded regions overlap (i.e. whose boundaries are within 1 NM of each other) are merged into a single no-go polygon. The merged polygon set is used for all routing land checks; the original full-resolution polygons are retained for the land overlay (REQ-17). | open |
| REQ-40 | In a future iteration, the island-cluster merging distance threshold (currently fixed at 1 NM) is derived from the boat's polar: specifically, the minimum passage width that the routing algorithm can reliably thread given the polar's minimum viable TWA and the isochrone leg length. | open |

## Algorithm

The isochrone algorithm runs in two sequential phases: a coarse pre-pass that establishes an upper-bound arrival time, followed by a fine isochrone expansion that uses that bound to prune wasteful exploration.

### Parameters

| Parameter | Default | Configurable | Description |
|---|---|---|---|
| `headingStep` | 5° | yes | Heading resolution for the fine isochrone pass |
| `coarseHeadingStep` | 20° | yes | Heading resolution for the coarse pre-pass and coarse band scan |
| `sectorSize` | 1° | yes | Bearing-sector width for fine-pass frontier pruning |
| `minBoatSpeed` | 0.3 kt | yes | Headings producing less than this are discarded |
| `arrivalRadiusNm` | 2 NM | yes | Distance to destination that counts as arrival |
| coarse sector size | 5° | no | Bearing-sector width for pre-pass frontier pruning |
| cone half-angle | 90° | no | Maximum deviation from start→destination bearing allowed in the pre-pass |

### Phase 1 — Coarse pre-pass

Runs a full-route isochrone at `coarseHeadingStep` (20°) resolution to produce an upper-bound arrival time T_bound.

For each time step, for each frontier point:
1. Try all headings at 20° resolution.
2. Discard if boatSpeed < minBoatSpeed.
3. Discard if the candidate's bearing from the start deviates more than 90° from the direct start→destination bearing (cone pruning).
4. Discard if the path segment crosses land.
5. If within `arrivalRadiusNm` of the destination, record the current time as T_bound and stop.

After each step, prune candidates to a frontier using 5° bearing sectors (one point per sector, keeping the farthest from start). Emits progress events from 0% to 50%.

Returns T_bound (a Date) if the destination was reached, or null if the GRIB period was exhausted without arrival.

### Phase 2 — Fine isochrone pass

Runs the full isochrone expansion at `headingStep` (5°) resolution, using T_bound to discard provably suboptimal frontier points.

For each time step, for each frontier point, two inner passes are performed:

**Pass 1 — coarse polar band scan (no land check):** Tests all 5° headings grouped into 20° bands. A band is marked "surviving" if any heading within it yields boatSpeed ≥ minBoatSpeed. This identifies polar-dead zones without land checks (a coarse heading blocked by land does not mean adjacent fine headings are also blocked).

**Pass 2 — fine evaluation (land check applied):** For each 5° heading in a surviving band:
1. Discard if boatSpeed < minBoatSpeed.
2. Discard if the path segment crosses land.
3. Add to candidates. If within `arrivalRadiusNm` of destination, record as `arrived`.

If `arrived` is set, the loop terminates.

After collecting candidates, prune to a frontier using 1° bearing sectors from the start (one point per sector, keeping the farthest). If T_bound is known, apply the bounding filter: discard any frontier point from which the destination cannot be reached before T_bound at the polar's maximum speed (`distToEnd / maxPolarSpeed + point.time > T_bound`). If the filtered frontier is empty, the destination is unreachable before T_bound and the pass terminates early. Emits progress events from 50% to 100% with the T_bound-filtered frontier.

### Frontier pruning — pruneToFrontier

Groups candidates by their bearing from the fixed start point, divided into sectors of width `sectorSize`. Within each occupied sector, keeps only the candidate farthest from the start (by Euclidean distance approximation with cosine-corrected longitude). Returns one point per occupied sector.

### Route extraction — backtracking

Each `IsochronePoint` carries a `parent` pointer set at generation time. Once `arrived` is recorded, the algorithm follows parent pointers back to the start, building the route as an ordered list of `RoutePoint` objects with position, time, heading, TWA, TWS, boatSpeed, and per-leg calculation time.

### Progress reporting

Phase 1 emits `onProgress(pct, frontier)` after each step, with `pct` in 0–50 and `frontier` as the coarse pruned points. Phase 2 emits `onProgress(pct, frontier)` after each step, with `pct` in 50–100 and `frontier` as the T_bound-filtered fine frontier. Each call is followed by `setImmediate` to yield the Node.js event loop.

### Performance profile (measured 2026-05-26, test route Åland→Gotska Sandön)

REQ-38 instrumentation run on the test route (18 fine-pass steps, 168 425 total candidates evaluated):

| Phase | Total time | Share |
|---|---|---|
| Land checks (`segmentCrossesLand`) | 554 189 ms | 99.9% |
| Polar lookups (`interpolateBoatSpeed`) | 761 ms | 0.14% |
| Wind lookups (`getWindAt`) | 12 ms | 0.002% |
| Frontier pruning (`pruneToFrontier`) | 41 ms | 0.007% |

Key observations:
- **Every** candidate that passes the polar filter is immediately submitted to a land check — `landChecksPerformed == candidatesEvaluated` on every step. The polar filter does not reduce land check volume at all for this route.
- Peak step (step 30): 246 frontier points × ~84 headings = 20 664 land checks in 70 s. Average land check cost at peak: **3.4 ms per call**.
- Wind lookups, polar lookups, and pruning together account for 0.15% of total time. Optimising them (REQ-28, REQ-31 coarse grid benefit) would have negligible effect.

**Conclusion:** The only optimisations worth implementing are those that reduce either the number of land checks or the cost per land check:
- **REQ-29** (DP polygon simplification) — reduces vertices per polygon → lower cost per call. Highest priority.
- **REQ-30** (cross-step LRU cache) — eliminates repeated checks for the same segment across time steps. Secondary priority once REQ-29 is measured.
- **REQ-28** (wind/polar cache) — deprioritised; targets 0.15% of runtime.
- **REQ-31** (two-level spatial grid) — deprioritised; targets the grid lookup overhead within `segmentCrossesLand`, which is dwarfed by the polygon intersection cost itself.

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
| D11 | ~~Two GSHHG land indices are built at startup: a simplified index (DP-reduced polygons, used by the coarse pre-pass) and a full-resolution index.~~ Superseded by REQ-41: a single edge-tile index is used for all routing land checks; original polygon data is retained in memory solely for the land overlay (REQ-17). |
| D12 | Island cluster merging (REQ-39) uses dilated union: each polygon is expanded outward by 0.5 NM (D/2), then overlapping expanded polygons are merged into a single no-go area. This simultaneously clusters islands within 1 NM and adds a 0.5 NM safety margin off all shores. Convex hull and bounding box were considered and rejected: convex hull fills in navigable concave areas; bounding box is too conservative for scattered archipelagos. |
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

**Coarse-to-fine heading step (REQ-26):** A first pass at 20° (18 headings) identifies the bearing bands worth exploring; a second pass at 5° only within those bands reduces total heading evaluations. Literature supports 10–20° as sufficient for initial screening. Moderate complexity — requires two-pass expansion per step. Measured speedup on typical sailing polars (minimum TWA ≈ 52°, ~5 of 18 bands filtered): ~1.2–1.3×. The theoretical 3–5× estimate assumes a larger dead zone; for polars with smaller no-go arcs the benefit is proportionally lower.

**Worker thread parallelisation (REQ-27):** Candidate evaluations are independent per frontier point; partitioning across N worker threads gives near-linear speedup up to core count. Estimated 2.5–3× on Raspberry Pi 3 (4 cores @ 1.2 GHz), 3–3.5× on Pi 5. Workers must be pooled (created once, reused) to avoid per-step creation overhead.

**Wind/polar caching (REQ-28):** Adjacent frontier points often share GRIB grid cells. A small per-step cache (50–100 entries) yields 30–50% hit rate on typical frontiers. Low complexity; 1.3–1.8× speedup.

**Combined estimate:** REQ-26 + REQ-27 + REQ-28 together: 8–15× speedup on Raspberry Pi hardware.

### Land avoidance speed — research findings

**Douglas-Peucker simplification (REQ-29):** GSHHG L1 polygons can have 100k+ vertices per coastline. DP simplification at load time with tolerance = routing resolution (≈0.01°) reduces edge count 2–5× with negligible routing accuracy loss at the 1 NM resolution of the isochrone grid. One-time cost at startup. R-trees are considered higher-risk than grid approaches for GSHHG because large overlapping MBRs reduce their advantage.

**Persistent segment cache (REQ-30):** Coastlines are static; the same segment can be checked at multiple time steps. A bounded LRU cache (10k–100k entries) keyed on quantised endpoints avoids redundant polygon intersection tests. Estimated 10–30% speedup on multi-day routes.

**Two-level spatial grid (REQ-31):** A coarse 10°×10° first level rapidly eliminates cells before the 1°×1° fine level is consulted. Deterministic performance; 1.2–2× speedup without R-tree complexity. Preferable to R-tree for GSHHG data due to large polygon MBRs.

**Combined estimate:** REQ-29 + REQ-30 + REQ-31 together: 3–8× speedup on land avoidance overhead.

**Edge-tile spatial index (REQ-41) — analysis (2026-05-26):**

The root cause of the 3.4 ms/call cost is that the current design indexes *polygon indices* per cell, not *edges*. A cell touching the Scandinavian mainland sends all 100k+ edges of that polygon into the intersection loop. This is not a spatial index in any meaningful sense for large polygons.

Fix: index individual edges. Each edge (v_i, v_{i+1}) is inserted into all 0.1° grid cells its segment crosses. Segment check DDA-walks the cells the query path crosses and tests only the edges in those cells — O(k) where k is local edge density (~50–150 in coastal areas vs. 100k+ today).

Complexity: preprocessing O(E) — one linear pass over all edges, each edge inserted into O(1/r) cells where r = 0.1° (at most ~10 cells per 1° edge). Query O(k), k tiny. Estimated speedup: 500–2000×, possibly more on open-water segments. No approximation error; exact correctness preserved.

Implementation note (Knuth): DDA walk must handle the antimeridian (180°/−180° wrap) correctly. Memory cost proportional to total-edges × average-cells-per-edge — modest for GSHHG H globally at 0.1° resolution.

Supersedes REQ-29 (DP simplification) and REQ-31 (two-level grid) as the primary land-check performance fix. REQ-30 (LRU cache) remains open but lower priority; after the edge-tile fix, re-measure before deciding.

**REQ-39 (dilated union) — re-framing after edge-tile analysis:**

After the edge-tile index reduces per-call cost by 2–3 orders of magnitude, REQ-39 is primarily a *routing correctness and safety* feature, not a performance one: it provides a 0.5 NM safety margin off all shores and honestly reflects the algorithm's ~1 NM lateral resolution limit. Implementation complexity is high (geodetic offset curves, self-intersection removal at reflex vertices, robust polygon union) and should not block REQ-41. Sequence: REQ-41 first, then REQ-39 separately.

**Island cluster merging — threshold analysis (2026-05-26):**

Pre-processing step: merge nearby islands into larger conservative no-go polygons. Islands within distance D of each other are combined. The routing algorithm cannot reliably thread passages narrower than the angular resolution of a full isochrone leg allows.

Scenario: 6 kt boat speed, 8 m/s wind, 6 NM leg length. At the far end of the leg a passage of width W must be threaded. The angular window of courses that successfully thread it is:

    angle = 2 × arctan(W/2 ÷ legLength)

| Passage width | Course window | Fine-pass heading steps (5°) that fit |
|---|---|---|
| 0.5 NM | 4.8° | < 1 — not reliably threadable |
| 1.0 NM | 9.5° | ~2 — reliably threadable |
| 1.5 NM | 14.3° | ~3 — easily threadable |
| 2.0 NM | 18.9° | ~4 — trivially threadable |

**Conclusion:** Passages narrower than ~1 NM are at or below the routing algorithm's resolution limit. Merging islands within 0.5–1 NM of each other closes passages the algorithm cannot reliably navigate anyway — no routing quality is lost. This establishes the candidate range for the clustering distance threshold D.

**Decision (2026-05-26):** D = 1 NM. Any two land polygons whose boundaries come within 1 NM of each other are merged into a single no-go area.

### Practitioner conclusion (altendorff series)
Algorithm quality is not the primary bottleneck. Polar accuracy, wind sensor quality, and the sailor's ability to execute course changes matter more in practice than algorithmic refinements.

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
