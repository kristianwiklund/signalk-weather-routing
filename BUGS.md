# Known Bugs

## Open Bugs

| # | Description |
|---|---|
| [BUG-64](https://github.com/kristianwiklund/signalk-weather-routing/issues/NEW) | Check and act on GitHub security scans (dependabot, code scanning alerts). |
| [BUG-63](https://github.com/kristianwiklund/signalk-weather-routing/issues/NEW) | The wave overlay does not disappear when the corresponding GRIB file is unticked. |
| [BUG-58](https://github.com/kristianwiklund/signalk-weather-routing/issues/188) | `interpolateBoatSpeed` clamps wind speed to the polar's minimum TWS column when TWS is below that column, so e.g. 3 kn of wind returns the same boat speed as 6 kn of wind. This is physically wrong — the boat cannot sail at 5+ kn in 3 kn of wind. |
| [BUG-22](https://github.com/kristianwiklund/signalk-weather-routing/issues/81) | Activating the land overlay checkbox during a routing calculation does not show the land overlay. |

## Fixed Bugs

| # | Description |
|---|---|
| [~~BUG-66~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/198) | ~~Check that the same coordinate mistakes as BUG-65 are not present in the wind overlay / weather data.~~ — **not needed** (wave troubleshooting findings confirmed the BUG-65 issues were specific to the wave canvas raster: mixed-grid only affects discipline=10 HTSGW, and Mercator-Y row spacing only applies to the canvas image overlay; wind arrows are plotted as individual markers at explicit lat/lon points and are unaffected by both issues; confirmed 2026-06-12) |
| [~~BUG-61~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/193) | ~~Standard test (Öregrund → Gotska Sandön, departure 2026-05-24T08:00 CEST) shows no wave height between May 24 1800 CET and May 25 0100 CET — xygrib confirms wave data exists in that period in the same GRIB file.~~ — **fixed** (root cause: mixed-grid GRIB files — GDAL read HTSGW through the atmospheric grid, producing incorrect data; fixed by BUG-65 fix: extracting discipline=10 messages via vsimem into a separate `swhGrid`; confirmed 2026-06-12) |
| [~~BUG-65~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/197) | ~~The wave overlay is skewed approximately 30 km in the westerly direction relative to the basemap coastline. The N-S skew is unclear.~~ — **fixed** (two bugs: (1) mixed-grid GRIB files — GDAL reads HTSGW through the atmospheric grid; fixed by extracting discipline=10 messages via vsimem and storing a separate `swhGrid`; (2) canvas built with linear-latitude rows but stretched in Web Mercator Y by Leaflet — with all GRIB files loaded the error reached 85 km northward; fixed by mapping canvas rows through `mercToLat`/`mercY` instead of `(lat - latMin) / latStep`; confirmed 2026-06-12) |
| [~~BUG-62~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/196) | ~~Looking at the wave overlay, the coast as well as the Åland islands are completely misplaced. This is true for gotland and denmark as well in the 6/6 gribs.~~ — **fixed** (canvas row flip: `canvasRow = nLat - i` so top of canvas carries northernmost data, matching `L.ImageOverlay`'s top→north mapping; confirmed 2026-06-12; residual ~30 km westward skew tracked in BUG-65 #197) |
| [~~BUG-60~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/191) | ~~The conditions graph y-axis zero labels are positioned above the actual zero-data line — the axis scale is offset, so zero on the axis does not align with the bottom of the chart area.~~ — **fixed** (y-axis labels moved from DOM `<div>` into SVG `<text>` elements sharing the same `viewBox` as grid lines and data lines, so all chart elements scale together at any container size; confirmed 2026-06-12) |
| [~~BUG-59~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/190) | ~~When no wave data is available, the conditions graph draws zero for wave height instead of leaving the line absent. The tooltip also shows no wave height value. A user reading the graph may interpret zero as "flat calm sea" rather than "no data", which is a safety hazard.~~ — **fixed** (wave polyline broken into per-segment `<path>` elements at missing-data gaps; dots only drawn where `waveHeight != null`; confirmed 2026-06-12) |
| [~~BUG-50~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/118) | ~~The conditions graph at the bottom of the screen shows wave height values that appear much higher than the values shown in the hover tooltips for the same points.~~ — **fixed** (tooltip replaced `Math.round` nearest-waypoint snapping with linear interpolation between adjacent waypoints, matching the visual line position at the mouse x-coordinate; confirmed 2026-06-12) |
| [~~BUG-57~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/184) | ~~Saved route "wr intermediate wp result", departure 2026-05-24 08:00: calculated route appeared to show the boat travelling at ~6 kn directly into the wind.~~ — **fixed** (investigation showed routing algorithm is correct; root cause was the wind barb ring being misread as an anchor point, making downwind sailing look like upwind travel; resolved by REQ-100 — arrowhead pointing TOWARD direction, no ring on non-calm barbs) |
| [~~BUG-55~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/174) | ~~README did not document wind arrow hover tooltip content (boat speed) or the test buttons.~~ — **fixed** (documented wind tooltip with boat speed and test button behaviour in README; confirmed 2026-06-12) |
| [~~BUG-54~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/160) | ~~Wind overlay arrow density is too low — the ~40 km crossing from Grisslehamn to Åland (Eckerö) yields barely two arrows instead of the expected five or more.~~ — **fixed** (sample at GRIB native resolution 0.0625°, cache all points in frontend, thin by 40px pixel distance on zoom/pan; confirmed 2026-06-08) |
| [~~BUG-30~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/89) | ~~The codebase contains no explanatory comments.~~ — **fixed** (file headers and "why" comments added across all backend files and key frontend sections; confirmed 2026-06-08) |
| [~~BUG-38~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/102) | ~~Unticking the land overlay checkbox does not remove the overlay when toggled while an async render is in-flight.~~ — **fixed** (cancellation token in `renderLandOverlay`; confirmed 2026-06-07) |
| [~~BUG-36~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/98) | ~~`interpolateBoatSpeed` underestimated boat speed when TWS was below the polar's minimum TWS column — extrapolated linearly toward zero instead of clamping to minimum-TWS column.~~ — **fixed** (clamp `tTws`/`tTwa` to `[0,1]`; confirmed 2026-06-07 by 86/86 tests) |
| [~~BUG-53~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/131) | ~~Öregrund→Helsinki route wandered excessively outside Estonia after REQ-73 — full frontier→destination land check (up to 250 nm) disabled the cone for 76–99% of Baltic frontier points.~~ — **fixed** (cap cone-disable check at 100 nm lookahead; confirmed 2026-06-07) |
| [~~BUG-49~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/117) | ~~When wind speed is below 5 kn, no wind arrow is drawn — only a circle (the calm indicator).~~ — **fixed** (always draw staff so calm winds show direction; confirmed 2026-06-07) |
| [~~BUG-48~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/116) | ~~The REQ-67 tooltip was not added to leg midpoint wind arrows — only waypoint barbs had tooltips.~~ — **fixed** (leg markers made interactive with bindTooltip; confirmed 2026-06-07) |
| [~~BUG-35~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/97) | ~~`haversineNM` test bound wrong — test expected `< 185 nm` but implementation correctly returns 185.3 nm (reference: 185.5 nm).~~ — **fixed** (corrected test range to `> 183 && < 187`; confirmed 2026-06-07 by 86/86 tests) |
| [~~BUG-51~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/121) | ~~When the coarse pass is disabled, the fine pass gets stuck — per-position cone at 100° blocked the eastward escape from the Roslagen/Stockholm archipelago.~~ — **fixed** (REQ-73: cone disabled per frontier point when direct path to destination crosses land, confirmed 2026-06-07) |
| [~~BUG-34~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/94) | ~~Route from Öregrund (60.3996°N 18.3403°E) to Gothenburg (57.6219°N 11.4313°E) never leaves the start area.~~ — **fixed** (BUG-43 per-position cone, BUG-44 heading-change limit, BUG-45 top-2 per sector, REQ-73 conditional cone, REQ-69 coarse pass removal; confirmed 2026-06-07) |
| [~~BUG-45~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/109) | ~~`pruneToFrontier` keeps only the single farthest-from-start point in each 1° bearing sector, silently discarding channel-threading paths when a farther open-water candidate shares the same sector.~~ — **fixed** (top-2 per sector, D16; commit 58fb62c, confirmed 2026-06-07) |
| [~~BUG-44~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/108) | ~~No per-step course change limit — single-step 180° reversals allowed.~~ — **fixed** (120° heading-change limit per step; commit 33154a1, confirmed 2026-06-07) |
| [~~BUG-43~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/107) | ~~Fine pass has no directional cone — expands omnidirectionally including backward toward origin.~~ — **fixed** (100° per-position cone with conditional land-block disable, REQ-73; commit 4c4cef4, confirmed 2026-06-07) |
| [~~BUG-47~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/111) | ~~The isochrone seed point was initialised with `tws:0, windDir:0`, causing the conditions graph to display zero wind at the departure point.~~ — **fixed** (seed point now calls `wind.getWind()` at departure position/time and populates `tws` and `windDir` from the actual GRIB wind vector) |
| [~~BUG-46~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/110) | ~~If departure is outside the GRIB domain, `wind.getWind()` silently clamps to the nearest grid edge and routing proceeds on extrapolated wind data.~~ — **fixed** (pre-flight bbox check in `/calculate` handler returns HTTP 400 before the response is committed if the start point falls outside all loaded GRIB files' coverage) |
| [~~BUG-52~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/123) | ~~When the departure time is set to a date outside the loaded GRIB forecast period, the route silently started at the nearest available GRIB time with no warning.~~ — **fixed** (hard HTTP 400 error returned when departure is before the forecast period start) |
| [~~BUG-42~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/106) | ~~`interpolateBoatSpeed` extrapolated without bound when TWS exceeded the polar's highest TWS column, inflating predicted boat speed 2–3× and biasing the router toward high-wind cells.~~ — **fixed** (clamp `tTws`/`tTwa` to ≤1; confirmed by unit test) |
| [~~BUG-39~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/103) | ~~`MultiFileWindProvider` selects the GRIB file with the highest mtime that covers a point spatially, without checking whether that file's time range covers the requested route time.~~ — **fixed** (file selection now filters to files whose forecast time range covers the requested route time before applying spatial and recency criteria) |
| [~~BUG-37~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/99) | ~~Start 57.5512°N 11.6235°E → Stockholm, departure 2026-06-06 16:00: terminated with "partial route shown (8958 nm from destination)" due to frontier escaping the Baltic.~~ — **fixed** (three defects: 90° coarse-pass cone prevented southward travel blocking T_bound; no GRIB domain boundary check let frontier propagate indefinitely; T_bound null disabled fine-pass pruning. Fixed by removing cone, adding domain check, skipping empty coarse steps.) |
| [~~BUG-10~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/69) | ~~Start point on land causes immediate "No reachable positions" with a misleading error message.~~ — **fixed** (pre-flight `isPointOnLand` check in `/calculate` now returns HTTP 400 "Start point is on land — move it to open water") |
| [~~BUG-31~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/90) | ~~No button or other UI element to save the route is visible in the webapp (REQ-47).~~ — **fixed** (`style.display = ''` fell back to CSS `display:none` rule; changed to `'block'`) |
| [~~BUG-32~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/92) | ~~When the destination is set to 62.3980°N 17.4875°E (Alnön, Sundsvall), the final leg of the calculated route crosses land.~~ — **fixed** (same pre-flight `isPointOnLand` check applied to the end point; returns HTTP 400 "Destination is on land — move it to open water") |
| [~~BUG-1~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/60) | ~~`saveRoute` fails with "Invalid resource id provided (urn:mrn:signalk:uuid:…)" — `setResource` expects a plain UUID, not the full URN~~ — **fixed** |
| [~~BUG-2~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/61) | ~~OSM tiles blocked — webapp violates OSM tile usage policy~~ — **fixed** (tile `<img>` elements patched with `referrerpolicy` attribute to override SignalK's `Referrer-Policy: no-referrer`) |
| [~~BUG-3~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/62) | ~~`saveRoute` rejected by resources provider — `feature.properties.coordinatesMeta` items fail schema validation: each item must have `name` or `href` property~~ — **fixed** |
| [~~BUG-4~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/63) | ~~Route fetch returns 404 — webapp was using `/signalk/v1/api/resources/routes/` but resources API is only mounted at v2~~ — **fixed** |
| [~~BUG-5~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/64) | ~~Route passes through islands — land avoidance never worked: raster mask was all-zero (GDAL type name case mismatch); raster approach replaced with exact segment-polygon intersection against GSHHG high-res vector data~~ — **fixed** |
| [~~BUG-6~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/65) | ~~Progressive frontier dots invisible — `L.circleMarker` with `fill: false` produced SVG rings not visible at map scale; replaced with `L.divIcon` dot markers (DOM layer, same rendering path as wind barbs)~~ — **fixed** |
| [~~BUG-7~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/66) | ~~Polling misses intermediate frontier states — isochrone steps complete in < 500 ms between polls so only 1–2 of 5+ `onProgress` calls were ever sampled; switched to Server-Sent Events so each call pushes immediately~~ — **fixed** |
| [~~BUG-8~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/67) | ~~SSE client registers after calculation completes — `EventSource` was opened after the POST `/calculate` response, so all `onProgress` events fired before the client was in `sseClients`; fixed by awaiting `EventSource.onopen` before sending the POST~~ — **fixed** |
| [~~BUG-9~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/68) | ~~Stale 'done' event replayed to new SSE connections — `calcStatus` retains the previous calculation's `done` state; SSE endpoint's initial-state sync sent it to every fresh connection, immediately showing 100% and triggering `fetchAndDrawRoute` for an old route before the new calculation starts; fixed by only syncing `calculating` state on connect~~ — **fixed** |
| [~~BUG-11~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/70) | ~~Status shows "Connecting…" then nothing — `openCalcStream()` awaits `onopen` which never fires.~~ — **fixed** (confirmed resolved by user) |
| [~~BUG-12~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/71) | ~~Land overlay does not faithfully represent the routing land mask — two filters applied for display performance cause the overlay to hide land that the router still avoids: (1) polygons whose bounding box is smaller than 0.05° in both dimensions are dropped entirely (`LAND_DISPLAY_MIN_BBOX_DEG`), silently omitting islands, reefs, and coastal features up to ~4 km across; (2) stride-10 vertex sampling shifts coastline boundaries, so a click that appears to be in open water on the rendered overlay may lie inside the full-resolution polygon. A user guided by the overlay can place a start point in what looks like open water and still trigger the "No reachable positions" failure from BUG-10.~~ — **fixed** (size filter and stride sampling removed; endpoint now serves all polygons at full resolution) |
| [~~BUG-13~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/72) | ~~Isochrone frontier dots move instead of accumulate — each new frontier replaces the previous one on the map, so only the latest frontier is visible at any time. All historical frontiers should remain visible as the calculation progresses.~~ — **fixed** |
| [~~BUG-14~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/73) | ~~Gotland, Öland, and the Danish islands are missing from the land overlay — they do not appear when the land overlay is enabled.~~ — **fixed** (`renderLandOverlay` was querying `/land-polygons` with the GRIB file's bbox instead of the map viewport; polygons outside the GRIB footprint were never requested. Fixed by using `map.getBounds()` as the query bbox and re-fetching on `map.moveend` so the overlay tracks the visible area.) |
| [~~BUG-15~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/74) | ~~Large number of overlapping isochrone lines near the start point when departing close to Åland. User hypothesis: points getting beached, then moving back to approximately the same position as the first isochrone, causing many near-identical frontier lines to accumulate.~~ — **fixed** (cone pruning in coarse pre-pass and T_bound filtering in fine pass eliminate the backtracking frontier points that caused accumulation) |
| [~~BUG-16~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/75) | ~~REQ-26 (coarse-to-fine heading step) appears to have made routing calculation slower rather than faster.~~ — **fixed** (`new Set<number>()` was allocated inside the frontier loop (~14 000 allocs/calculation); hoisted to outer scope and reset with `.clear()` per point) |
| [~~BUG-17~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/76) | ~~Post REQ-26, isochrones appear far to the north when routing from Åland to Gotska Sandön. This is new behaviour not present before REQ-26.~~ — **fixed** (band-boundary misclassification: coarse representative heading failing does not mean all fine headings in that band fail; Pass 1 now marks a band surviving if ANY fine heading within it gives speed ≥ minBoatSpeed) |
| [~~BUG-18~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/77) | ~~Isochrone lines produce spiderweb visuals — frontier points are not sorted to minimise distance between consecutive points before the polyline is drawn.~~ — **fixed** (nearest-neighbour sort applied to frontier points before polyline is drawn) |
| [~~BUG-19~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/78) | ~~Isochrone lines still contain jumps after BUG-18 fix. Observed pattern: outer ring drawn ~360°, then line jumps from the top to a small ~10° sector at 90° from the top, draws a segment inside the already-drawn area, then jumps back to the top.~~ — **fixed** (replaced nearest-neighbour sort with bearing-from-start sort) |
| [~~BUG-20~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/79) | ~~"Run test" button (REQ-37) is not visible in the webapp UI.~~ — **fixed** |
| [~~BUG-21~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/80) | ~~The coarse pre-pass continues at least two hours past the destination arrival time — it appears to have no termination criterion based on reaching the goal.~~ — **fixed** (observed on the pre-REQ-34/35/36 deployment; current coarse pre-pass terminates immediately on arrival within `arrivalRadiusNm`) |
| [~~BUG-23~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/82) | ~~When an isochrone frontier is not a full circle, drawing it as a single polyline produces visual artifacts: straight lines connecting the two arc endpoints, and lines bridging large angular gaps within the arc.~~ — **fixed** (frontier sorted by bearing from start is split at angular gaps > 10° into separate polylines; wrap-around gap also checked so near-complete rings still draw as one closed line) |
| [~~BUG-24~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/83) | ~~After clean install of latest `main` (db36fd6), the plugin config entry does not appear in the SignalK Plugin Config UI. The webapp's "Reload GRIB file" action returns "Could not reach plugin API" and throws an "unexpected token … is not valid JSON" error. SignalK itself starts and runs without hanging.~~ — **fixed** (SignalK hardcodes `--ignore-scripts` for all plugin installs, suppressing `gdal-async`'s postinstall hook; fixed by adding `gdal-async` to `bundledDependencies` so the prebuilt native binary is included in the tarball and requires no postinstall) |
| [~~BUG-25~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/84) | ~~After the BUG-24 fix (gdal-async bundled), installing the plugin causes the SignalK main process to consume >>100% CPU, making the SignalK GUI inaccessible. Same symptom as before the plugin was uninstalled.~~ — **fixed** (two root causes: alignment bug in `loadDilatedIndex` caused `Float64Array` to throw at offset 68 on every load, so the union always rebuilt; `CascadedPolygonUnion.union()` ran synchronously on the main thread, blocking the event loop. Fixed by: padding bbox header to 40 bytes + bumping index version to 2; moving the union into a `worker_threads` Worker so the main thread stays responsive) |
| [~~BUG-26~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/85) | ~~The right-hand y-axis (wave height in metres) in the conditions graph is rendered as a large green blob with no numbers visible. On closer inspection it appears to be a dense stack of numbers from 0 to ~9999, all rendered on top of each other.~~ — **fixed** (root cause shared with BUG-28: GRIB wave bands use `9999.0` as the fill value for land cells and out-of-domain areas; bilinear interpolation near land boundaries produced intermediate bogus values in the tens-to-thousands-of-metres range, driving the y-axis max to ~9999. Fixed in `getWaveAt`: any interpolated value ≥ 100 m is returned as `undefined`, suppressing fill-value contamination.) |
| [~~BUG-27~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/86) | ~~The Routing Options section shows nothing — neither the safety margin build progress placeholder nor the checkbox.~~ — **fixed** (`style.display = ''` on `#safety-margin-building` was overridden by the CSS `display:none` rule; fixed by using `'block'` instead) |
| [~~BUG-28~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/87) | ~~Tooltip wave height values for the first few waypoints from the left are wildly wrong (e.g. 158 m, 307.2 m, 7031 m).~~ — **fixed** (same root cause and fix as BUG-26.) |
| [~~BUG-29~~](https://github.com/kristianwiklund/signalk-weather-routing/issues/88) | ~~The safety margin dataset builder never runs. The dilate worker fails immediately with "Module did not self-register: .../gdal-async/.../gdal.node" — the gdal-async native binary cannot load inside a worker_threads Worker. The buildDilated promise rejects, app.setPluginError() is called silently (not visible in Docker logs), and dilatedIndexReady stays false.~~ — **fixed** (root cause: native addon cannot self-register in a worker_threads secondary V8 isolate. Fixed by moving all GSHHG processing offline — REQ-51: dilated index is now pre-built by the Python build script and bundled in the package. Runtime worker removed entirely.) |

---

## BUG-51 — Investigation Notes

### Root cause
The per-position cone (BUG-43 fix) at 100° half-angle blocks the initial eastward escape from the Roslagen/Stockholm archipelago. From frontier points near the Swedish east coast (~60.1°N), the bearing to the destination (58.5°N, 17.35°E) is ~204°. Heading due east (090°) deviates 114° from this bearing — outside the 100° cone. The boat must go east to reach open water, but the cone blocks all eastward headings. Step-by-step log shows the frontier shrinks progressively: 153 points at step 6 → 11 at step 17 → 0 at step 18 ("No reachable positions at fine-pass step 19"). All 221 candidates generated from the step-17 frontier fail the land check after being forced south into the dense archipelago with no eastward escape.

### Diagnostic test (360° cone, 2026-06-07)
Setting `FINE_PASS_CONE_HALF_ANGLE = 180` (no cone) confirmed the destination is reachable. The route succeeded but showed backward loops in the June 6 forecast: wind shifts from westerly to SSW, making the destination bearing adverse. Without a cone, the algorithm routed backward (NNE, running before the SSW wind) to maintain speed before correcting south. This is correct algorithmic behaviour in the absence of motor capability — the boat optimally exploits the following wind even at the cost of temporary backward motion. Correct real-world response: motor through the adverse section (REQ-24) or do not depart at that time.

### Connection to original coarse pass
The coarse pass solved this problem implicitly: it ran without a directional cone, exploring all bearings to find T_bound, and its omnidirectional expansion could escape any land-blocked start geometry. Without the coarse pass (REQ-69), the fine pass has no mechanism for the initial escape unless REQ-73 is implemented.

### Fix identified
REQ-73: apply the cone conditionally per frontier point. If the direct segment from the frontier point to the destination crosses land, disable the cone (360° search); if the segment is clear, apply the normal cone. This allows escape from land-blocked starting positions while preventing backward routing once the boat is in open water with a clear bearing.

### Current state (2026-06-07)
`FINE_PASS_CONE_HALF_ANGLE = 180` deployed — route reaches destination but with backward loops under adverse wind. Awaiting REQ-73 implementation.

---

## BUG-19 — Investigation Notes

### Root cause

The nearest-neighbour sort (BUG-18 fix) is a greedy algorithm — it always advances to the closest remaining unvisited point. For frontier points that form a roughly circular ring, this works well along the main arc. But when a small cluster of points is geographically isolated from the rest (e.g. points that have passed through a narrow passage, or survived land avoidance on one side), the algorithm defers them until the main arc is nearly complete, then jumps to the cluster, draws it, and the closing `pts.push(pts[0])` jumps back. This matches the reported symptom exactly.

### Fix

`startLatLon` is already in scope in the frontend JS. Frontier points form a ring around the start — they are correctly ordered by sorting on bearing from the start point (`Math.atan2`). This is O(n log n), always produces a topologically correct angular traversal, and correctly places isolated clusters at their angular position in the ring rather than deferring them to the end. The `nearestNeighbourSort` function should be replaced with a bearing-from-start sort.

---

## BUG-11 — Investigation Notes

*Investigated 2026-05-25. Environment: SignalK server 2.27.0, Docker container `signalk-server`, host networking port 3000. Plugin v0.1.0. GRIB: Baltic Centre ICON-EU 2026-05-24T00Z, 93 steps. Polar: `sunwind33.pol`. GSHHG h-res shapefile present at plugin data dir.*

### Client flow (code review)

`startCalculation()` in `public/index.html`:
1. Sets status "Connecting…", opens `EventSource` to `/calculation-stream`
2. Awaits `EventSource.onopen` before sending `POST /calculate`
3. On `onopen`: sends POST; on POST success sets status "Calculating…"
4. SSE `progress`/`done`/`error` events drive UI from there

Server (`src/index.ts`) confirmed correct: `res.flushHeaders()` on SSE connect, `pushSse()` per event, `closeSseClients()` after done/error.

### SSE delivery confirmed working in isolation

End-to-end test (SSE stream opened 2 s before POST, open-water start point `58.5°N 18.5°E`):
- SSE connected, `onopen` fired, progress events received, route completed.
- Confirmed: SSE infrastructure is not inherently broken.

### BUG-10 interaction

With start point `59.3°N 18.1°E` (Swedish mainland — confirmed inside GSHHG L1 FID 0 by OGR lookup):
- POST returns in **< 1.5 ms** (step-0 failure)
- SSE `error` event fires almost simultaneously with POST response

This led to the initial race-condition hypothesis (see below).

### Race condition — diagnosed and partially fixed

With a step-0 failure (BUG-10), the calculation fails before any `await setImmediate`. Server sequence:
1. `res.json({ status: 'calculating' })` — POST response sent
2. `.catch()` microtask: `pushSse({ type: 'error', … })` + `closeSseClients()`

Browser may receive the SSE `error` event **before** the POST response body:
1. SSE `onmessage`: `stream.close(); calcStream = null; setStatus('error', …)`
2. POST `apiFetch` resolves: falls through to `setStatus('', 'Calculating…')` — **overwrites the error**
3. Status stuck at "Calculating…"; no further SSE events; `calcStream` is null

**Fix applied:** `if (!calcStream) return;` guard before `setStatus('', 'Calculating…')` in `startCalculation` — now present in working tree. This correctly handles the race.

### Event-loop blocking — actual root cause of "Connecting…" hang

Diff of working tree vs last committed state (`1c6190d`) shows the land overlay toggle and `/land-polygons` endpoint were introduced in the same uncommitted changeset as the SSE infrastructure.

The `/land-polygons` handler calls `res.json(featureCollection)`, which runs `JSON.stringify()` synchronously. The developer's own instrumentation confirms this was known:

```
console.log(`[land-polygons] res.json() returned: ${Date.now()-t2}ms (event loop was blocked for this duration)`);
```

For a full-resolution GSHHG response over the ICON-EU domain (many thousands of polygon vertices), this serialization blocks the Node.js event loop for tens to hundreds of milliseconds. During that window, `res.flushHeaders()` on the SSE endpoint cannot execute, so the browser never receives the HTTP 200, and `onopen` never fires.

**Trigger condition:** user enables the land overlay checkbox → browser GETs `/land-polygons` → while Node.js is mid-`JSON.stringify`, user clicks Calculate → `openCalcStream()` opens `EventSource` → hung.

The `if (!calcStream) return` race-condition guard does not help here: `onopen` never fires, so `calcStream` is never set, and `startCalculation` never reaches the guard.

### Access log evidence (step-0 failure scenario)

```
POST /plugins/signalk-weather-routing/calculate   200   0.783 ms
GET  /plugins/signalk-weather-routing/calculation-stream   200   0.884 ms
GET  /plugins/signalk-weather-routing/status   200   1.071 ms
```

SSE connection closes in < 1 ms (Morgan logs on `res.end()`). Consistent with step-0 failure and immediate close.

### Fix applied to `/land-polygons` (2026-05-25)

`/land-polygons` handler in `src/index.ts` converted to `async`. Replaced `res.json(featureCollection)` with manual streaming: writes the GeoJSON FeatureCollection incrementally using `res.write()`, yielding to the event loop via `await new Promise<void>(r => setImmediate(r))` after each feature. Addresses the concurrent-loading scenario. Investigative `console.log` timing statements removed. Test added: `land-polygons serialization: exterior Float64Array converts to closed [lon,lat] GeoJSON ring`.

### Root cause re-opened (2026-05-25)

User confirmed the land overlay was fully loaded before pressing Calculate — the event loop was therefore not blocked at the time the SSE connection was opened. The concurrent-loading theory is **ruled out** for the reported scenario. The actual root cause of `onopen` never firing is not yet identified. The `/land-polygons` streaming fix is correct but does not address the bug as reported.

### Current state

- Race condition: **fixed** (`if (!calcStream) return` guard applied).
- Event-loop blocking from concurrent `/land-polygons`: **fixed** (streaming `setImmediate` yield per feature) — but this is not the trigger condition the user reproduces.
- `onopen` never fires (actual user-reported bug): **open**, likely resolved (2026-05-25) — not yet confirmed.
- BUG-10 (start on land): **open**.

---

## BUG-24 — Investigation Notes

*Investigated 2026-05-27. Environment: Node.js v24.15.0 (ABI 137), Docker container `signalk-server`. Plugin v0.1.0 at commit db36fd6.*

### Symptom in logs

All plugin API routes (`/plugins/signalk-weather-routing/*`) return 404. The webapp static files are served correctly (`/signalk-weather-routing/` → 200). The plugin does not appear in the SignalK Plugin Config UI. No error is logged for `signalk-weather-routing` at startup.

### Finding 1: plugin entry point fails to load

Requiring the plugin entry point directly inside the container:

```
node -e "require('/home/node/.signalk/node_modules/signalk-weather-routing/dist/index.js')"
```

→ `Error: Cannot find module '.../gdal-async/lib/binding/node-v137-linux-x64/gdal.node'`

The `gdal-async` native binary is entirely absent — the binding directory does not exist. This causes the plugin to throw at load time, so SignalK never registers it, which explains the 404s and the missing plugin config entry.

### Finding 2: cause of missing binary

The DEVELOPMENT.md clean install procedure uses `npm install --ignore-scripts` for the tarball installation step (step 3). This suppresses `gdal-async`'s `postinstall` hook, which is responsible for downloading or building the prebuilt native binary for the current Node.js ABI.

Previous installs worked because `gdal-async` was already present in `node_modules` with its binary intact, so npm only updated the plugin itself. After the full `npm uninstall` (which removed `gdal-async` as well), the fresh install with `--ignore-scripts` left the binding directory absent.

### Root cause

DEVELOPMENT.md step 3 (`npm install --ignore-scripts`) strips the `gdal-async` postinstall hook needed to install the native binary. The `--ignore-scripts` flag was intended to suppress the plugin's own `prepare` script, but it also suppresses dependency lifecycle scripts.

### Fix direction

Step 3 of the install procedure must allow `gdal-async`'s postinstall to run. Options:
1. Drop `--ignore-scripts` from step 3 and rely on the tarball not having a `prepare` script that causes problems.
2. Keep `--ignore-scripts` and add an explicit `npm rebuild gdal-async` step after the tarball install.

---

## BUG-25 — Investigation Notes

*Investigated 2026-05-27. Environment: Node.js v24.15.0, Docker container `signalk-server`. Plugin v0.1.0 at commit db36fd6 (after BUG-24 fix).*

### Symptom

Node process at >>100% CPU from startup. SignalK GUI unreachable. Identical symptom was present before the plugin was uninstalled (i.e. introduced by db36fd6, masked by BUG-24).

### Finding 1: union is blocking the main thread

Inspector stack trace captured while CPU was at 107%:

```
union → union → unionFull → computeOverlay → getResultGeometry → overlayOp → ...
```

This is `CascadedPolygonUnion.union()` from JSTS, running synchronously on the main thread. Thread 33 (main) shows `wchan=0` (running in user space, not blocked in a syscall). The process had accumulated >10 minutes of CPU time with no sign of completion.

### Finding 2: cache loading always fails due to alignment bug

The dilated edge index cache (`dilated-edge-index-v1.bin`, 73 MB, last written 2026-05-27 08:23) exists, and its header (magic, version, mtime) all match. However, `loadDilatedIndex` always throws:

```
Float64Array error: start offset of Float64Array should be a multiple of 8
```

The binary format writes a 36-byte bbox header per polygon (4 × f64 bbox + 1 × u32 nFloats), placing the exterior `Float64Array` at file offset 68 (32 header + 36 bbox). 68 is not a multiple of 8 → `new Float64Array(buf.buffer, 68, nFloats)` always throws a `RangeError`. The `catch {}` silently swallows it and returns `null`, so `buildDilated` falls through to the rebuild path on every startup.

The same bug is present in fa72712 (identical code in `setup.ts`). The cache is never successfully loaded.

### Finding 3: why SignalK is unreachable

`dilateAndMergePolygons` is declared `async`, but after the initial `await loadJsts()`, all work is synchronous: buffering 17,092+ GSHHG polygons and then calling `CascadedPolygonUnion.union()`. There is no event-loop yield during the union. The main thread is blocked for the duration, so Node.js cannot serve any HTTP requests → SignalK GUI is unreachable.

### Root causes

1. **Alignment bug in `saveDilatedIndex`/`loadDilatedIndex`** — the 36-byte per-polygon bbox header makes the exterior `Float64Array` unaligned. Cache is never loaded; union always reruns.
2. **Synchronous union on main thread** — `CascadedPolygonUnion.union()` for ~17,000 polygons blocks the event loop for >10 minutes with no yield points.

### Fix options

- **Fix the alignment only**: pad the bbox header to 40 bytes (or use a copy instead of a typed-array view for loading), bump the index version to invalidate old caches. The union still blocks on the very first run after a clean install, but subsequent startups load from cache and are fast. Acceptable if "first-run pause" is documented.
- **Fix alignment + move union to a worker thread**: also move `CascadedPolygonUnion.union()` into a `worker_threads` Worker so the main thread stays responsive even on first run. More complex but eliminates the blocking behaviour entirely.

---

## BUG-30 — Investigation Notes

### Audit of backend source files (2026-06-06)

Reviewed all 10 TypeScript source files. The following was addressed in commit 42688a1:

**File headers added** — all 10 files now open with a single-line role description: `src/types.ts`, `src/index.ts`, `src/lib/geo.ts`, `src/lib/grib.ts`, `src/lib/polar.ts`, `src/lib/landmask.ts`, `src/lib/resources.ts`, `src/lib/setup.ts`, `src/lib/routing/algorithm.ts`, `src/lib/routing/isochrone.ts`.

**"Why" comments added** at 9 locations across 5 files:
- `isochrone.ts`: `COARSE_CONE_HALF_ANGLE_DEG = 90` rationale; `setImmediate` event-loop yield (×3); cosine correction in `pruneToFrontier`; T_bound admissibility of `maxBoatSpeed`
- `landmask.ts`: `edgeCellKey` formula constants; DDA `maxSteps` Manhattan-distance bound; strict-interior `t > 0 && t < 1` in `segmentsIntersect`
- `geo.ts`: `+540` longitude wrap in `destinationPoint`; m/s→knots conversion factor
- `polar.ts`: `bracketIndex` low-end clamp rationale
- `setup.ts`: cache magic+version validation rationale

**SPEC.md corrected** — Phase 2 algorithm description and `coarseHeadingStep` parameter description updated to match current code (the inner two-pass band scan was removed by REQ-43 but the spec was not updated at the time).

### Remaining scope

The frontend (`public/index.html`) has not been audited for missing "why" comments. The backend audit may also have missed non-obvious invariants introduced in future changes.

---

## BUG-31 — Investigation Notes

### Root cause

`public/index.html` line 522, in the SSE `done` handler:

```js
document.getElementById('save-route-btn').style.display = '';
```

Setting `style.display = ''` removes any inline style override, causing the element to fall back to its CSS rule — which is `#save-route-btn { display: none }` (line 120 of the same file). The button is therefore still hidden after the calculation completes.

### Same root cause as BUG-27

BUG-27 had the identical pattern: `style.display = ''` on `#safety-margin-building`, which also had a CSS `display: none` rule. Fixed there by using `'block'` instead.

Note: `style.display = ''` works correctly for elements whose `display: none` is set as an inline `style` attribute in the HTML (e.g. `#safety-margin-wrap` at line 897) — removing the inline override restores the browser default. It only fails when the `none` is declared in a stylesheet rule.

### Fix

Change line 522 from:
```js
document.getElementById('save-route-btn').style.display = '';
```
to:
```js
document.getElementById('save-route-btn').style.display = 'block';
```

### Confirmed

Fix confirmed working by user (2026-06-06). REQ-47 (save route with name dialog) also confirmed working in the same session.

---

## BUG-10 — Investigation Notes

### Root cause

No validation of the start point before the calculation begins. When the start is inside a GSHHG land polygon, `isPointOnLand` (called at the top of each frontier loop iteration) immediately skips it, leaving `candidates` empty after the first step. The algorithm then throws "No reachable positions — check GRIB coverage and polar data", which is misleading: the real cause is the start point being on land.

### Fix

Added an explicit `isPointOnLand` check for the start point in the `/calculate` handler (`src/index.ts`) before the calculation starts. Returns HTTP 400 with the message "Start point is on land — move it to open water". Applied to `activeIndex` (respects safety margin setting). Same check added for the end point (see BUG-32).

---

## BUG-32 — Investigation Notes

### Root cause

`backtrack()` in `isochrone.ts` appends the destination coordinates directly as the first route waypoint without checking the final segment for land crossing. The `arrived` frontier point is within `arrivalRadiusNm` (2 NM) of the destination and in open water, but the straight line from there to a destination on land crosses through it.

Root cause is the same family as BUG-10: no validation that the destination is in open water before routing begins.

### Fix

Same fix as BUG-10 — `isPointOnLand` check for the end point added alongside the start check in the `/calculate` handler. Returns HTTP 400 with "Destination is on land — move it to open water".

### Regression during deployment

First deploy used `npm install --ignore-scripts` in the source build step, which skipped `gdal-async`'s postinstall hook. The bundled `gdal-async` in the tarball then had no native binary, causing the plugin to fail to load entirely. Fixed by following DEVELOPMENT.md correctly: `npm install` (no flags) in step 2 so the binary is downloaded, `--ignore-scripts` only in step 3 (tarball install).

---

## BUG-59 — Investigation Notes

### Root cause

`public/index.html:1298` used `m.waveHeight ?? 0` for the wave height polyline. When wave data was absent at a waypoint (`waveHeight: undefined`), the line plotted that point at 0 m, creating a false "flat calm" reading. The tooltip (`:1623`) correctly omitted the wave line when `m.waveHeight == null`, producing an inconsistency: the graph showed 0 m while the tooltip showed nothing.

Two separate issues were conflated: the graph drew a continuous line through missing-data points, and the tooltip hid its wave line. A user glancing at the graph sees zero wave height (interpreted as safe conditions) while the tooltip correctly indicates no data — a safety hazard.

### Fix

The single continuous `<path>` was replaced with per-segment `<path>` elements — one for each contiguous block of waypoints where `waveHeight != null`. Missing-data waypoints produce clean gaps in the green line. Dots are only drawn where `waveHeight != null` (removed the dark-gray `#313244` fallback dot).

### Scope note

This fix also addressed the primary driver of BUG-50 — the `?? 0` substitution created steep slopes between valid wave values and zero, which amplified the tooltip-vs-line discrepancy.

---

## BUG-50 — Investigation Notes

### Root cause

The conditions graph tooltip (`public/index.html:1616`) used `Math.round(frac * (meta.length - 1))` to snap to the nearest whole waypoint index, but the wave height polyline (`:1298`) drew straight-line segments between adjacent waypoints. At x-positions between waypoints, the tooltip showed one waypoint's raw value while the graph line showed a linear interpolation of two adjacent values.

When wave data was missing at some waypoints (the BUG-59 `?? 0` substitution), the line dropped sharply to zero and climbed back, creating steep slopes. The tooltip near these dips snapped to a nearby valid waypoint with a real value (e.g. 1.5 m), while the graph line at the hover x-position was at an intermediate interpolated value (e.g. 0.7 m). The user saw two different numbers for the same x-position.

### Fix

Replaced `Math.round` nearest-waypoint snapping with fractional index interpolation: `idx0 = Math.floor(exactIdx)`, `idx1 = idx0 + 1`, `t = exactIdx - idx0`. Numerical fields (`tws`, `boatSpeed`, `waveHeight`) are linearly interpolated between `m0` and `m1` using `lerp(a, b) = a + (b - a) * t`. The tooltip value now matches the visual line position at every x-coordinate.

For `waveHeight`, interpolation is only shown when **both** adjacent waypoints have data — consistent with the gap in the broken-line rendering from the BUG-59 fix.

---

## BUG-61 — Investigation Notes

### Symptom

Standard test (Öregrund → Gotska Sandön) — conditions graph shows no wave height (gap in the green line) between May 24 1800 CEST and May 25 0100 CEST. User reports xygrib shows ~0.5 m waves at those coordinates in the same GRIB file.

### GRIB file structure

`Baltic_Centre_ICON_EU_EWAM_20260524-00.grb2` — 1389 bands, 113×84 grid (0.0625°), covering lat [58.03, 63.22], lon [15.97, 23.03].

**All 7 wave parameters** have 79 hourly time steps (May 24 00:00Z – May 27 06:00Z):

| GRIB_ELEMENT | Description | Bands |
|---|---|---|
| HTSGW | Sig. height of combined wind waves + swell | 79 |
| WVHGT | Sig. height of wind waves | 79 |
| SWELL | Sig. height of swell | 79 |
| WVDIR | Wind wave direction | 79 |
| SWDIR | Swell direction | 79 |
| WVPER | Wind wave period | 79 |
| SWPER | Swell period | 79 |

### Fill pattern

**All 7 wave parameters have identical fill values (9999.0) at the same grid cells** — a unified land mask. The Swedish mainland creates a band of 9999 cells that bisects the Öregrund→Gotska Sandön route. The band's latitudinal extent varies by longitude:

| Longitude | Fill band (lat range) | Width |
|-----------|----------------------|-------|
| 17.35°E (Gotska Sandön) | 58.09°N – 59.66°N | 1.56° (~94 nm) |
| 17.5°E | 58.03°N – 59.84°N | 1.81° (~109 nm) |
| 17.7°E | 58.22°N – 59.47°N (multiple bands) | ~1.25° |
| 17.9°E | 58.84°N – 59.09°N | 0.25° (~15 nm) |
| 18.1°E | **no fill — all valid** | 0 |
| 18.3°E (Öregrund) | 59.41°N – 59.66°N | 0.25° |

Valid data exists north of the band (~59.7°N+) and south of it (~58.8°N– at favourable longitudes). The fill pattern is static across all 79 time steps — same cells, same 9999 value, at every forecast hour.

### Root cause: two issues

**Issue 1 — Single-file selection in `getWave()` (`windprovider.ts:60–73`):**

```javascript
getWave(lat, lon, t) {
    const waveFiles = this.sortedFiles.filter(e => e.data?.swhByTime?.size);
    // ...
    const f =
      waveFiles.find(e => coversPoint(e, lat, lon) &&
        e.meta.timeStart <= tMs && e.meta.timeEnd >= tMs) ??
      waveFiles.find(e => coversPoint(e, lat, lon)) ??
      waveFiles[0];
    return getWaveAt(f.data!, lat, lon, tMs);  // ← returns undefined, no fallback
  }
```

The method selects **one** file (Baltic Centre) via a priority chain and returns its result immediately. Even if that file has fill values at the requested position, no other file is tried.

The `Baltic_South_ICON_EU_EWAM_20260606-00.grb2` file has valid HTSGW data at the gap coordinates (0.285 m at Gotska Sandön, 0.355 m at the fill zone midpoint), but it is never consulted because the temporal check excludes it (June 6 > May 24). This is correct per the **Nautical Safety Rule** — using a different forecast as silent fallback is not allowed.

The fix is to iterate through all temporal-matching files and return the first valid result, instead of selecting a single file:

```
for each temporal-matching file:
    v = getWaveAt(file, ...)
    if v !== undefined: return v
→ return undefined
```

This would use a Baltic_South file for May 24 if one existed, but would NOT fall back to a different forecast date.

**Issue 2 — Post-hoc fill-value check in `getWaveAt()` (`grib.ts:187–199`):**

```javascript
const v = bilinear(grid, grib, lat, lon);
return v >= 100 ? undefined : v;
```

The `bilinear` function mixes 9999-fill cells with valid cells, then the code checks if the blended result exceeds 100. This works when 9999 values dominate but is fragile — if a fill cell has small bilinear weight, the blended result could slip under 100 and produce a bogus wave height.

Fix: check each of the four interpolation cells individually before computing the weighted result:

```
grid[i00], grid[i01], grid[i10], grid[i11]
if any >= 100: return undefined
→ compute and return bilinear result
```

### Fix options

| Option | Approach | Effect |
|--------|----------|--------|
| A | Per-cell fill check in `getWaveAt` + multi-file iteration in `getWave` | Robust fill detection + fallback to other same-date files |
| B | Per-cell fill check only | Robust fill detection alone; gap persists without additional GRIB files |
| C | Multi-file iteration only | Fallback works if same-date subregion files exist |
| D | Neither — document as data coverage limitation | Close bug; requires provisioning additional GRIB files |

The visible gap on the standard test requires a `Baltic_South_ICON_EU_EWAM_20260524-00.grb2` (or similar) file to provide coverage. The code fix (option A) makes the fallback work when such files exist, but the test-data only has the Centre file for May 24 — so the gap would persist in the test without adding data files.

### Regarding xygrib

The user reports xygrib shows ~0.5 m waves at the gap coordinates. Since all 7 wave parameters have 9999 at those grid cells, this is unexpected. Possible explanations:
1. xygrib may interpolate across land-masked cells differently (e.g. nearest-neighbour gap-filling)
2. The user may have checked a nearby coordinate within the valid domain
3. The user may have checked a different GRIB file

---

## BUG-60 — Investigation Notes

### Root cause

Y-axis labels were rendered as DOM `<span>` elements inside `#conditions-y-left` / `#conditions-y-right` `<div>`s, positioned using `top: y/VH*100%`. Grid lines and data lines were SVG elements inside an adjacent `<svg>` with `viewBox="0 0 800 184"` and `preserveAspectRatio="none"`.

While both systems should in theory produce the same pixel positions (`y/VH * H_actual`), the DOM labels and SVG content existed in separate coordinate systems that could diverge — especially when the container height differed significantly from VH=184. In fullscreen mode the offset grew proportionally, reaching ~20px at 1080p.

Additionally, a `+3.5` fudge factor in the label `topPct` formula `(y + 3.5) / VH * 100` introduced a small but systematic offset that scaled with container height.

### Fix

Removed the DOM-based label approach entirely. All y-axis labels are now rendered as SVG `<text>` elements pushed into the same `el` array as grid lines and data lines, sharing the same `viewBox` coordinate system:

- Left axis: `<text x="2" y="{y}">` with `fill="#89b4fa"` (blue, matching wind/boat speed)
- Right axis: `<text x="{VW-2}" y="{y}" text-anchor="end">` with `fill="#a6e3a1"` (green, matching wave height)

With `preserveAspectRatio="none"`, all SVG elements scale together linearly. Labels, grid lines, and data now use a single coordinate system and cannot decouple.

### Confirmed

Fix confirmed working by user on 2026-06-12 — graph renders correctly at both default panel height and fullscreen.

---

## BUG-62 — Investigation Notes

### Symptom

Looking at the wave overlay, the coast as well as the Åland islands are completely misplaced. This is true for Gotland and Denmark as well in the 6/6 GRIB files. User later clarified: "It looks like the wave overlay is rendered upside down, that is, the south part is drawn to the north."

### Root cause

The wave overlay (`renderWaveOverlay` in `public/index.html`) builds a canvas where row index `i=0` corresponds to the southernmost latitude (`latMin`), and row `i=nLat` corresponds to the northernmost latitude (`latMax`). The canvas is then passed to `L.imageOverlay(image, gridBounds)` where `gridBounds` is `L.latLngBounds(southWest, northEast)`.

`L.imageOverlay` maps the top edge of the image to the **northern** bound of the rectangle and the bottom edge to the **southern** bound. Since the canvas has south data at row 0 (the top of the image), the overlay appears vertically flipped — south data rendered at the north edge, north data at the south edge.

Compare with the wind overlay (`renderWindOverlay`), which uses `L.marker([lat, lon])` directly — Leaflet's native lat/lng→screen projection correctly maps north to top, south to bottom, with no flip.

### Fix

Invert the row mapping when populating `imageData`: write grid row `i` to canvas row `nLat - i`, so that the top row of the canvas receives the northernmost data and the bottom row receives the southernmost data.

---

## BUG-65 — Investigation Notes

### Symptom

After the BUG-62 row-flip fix, the wave overlay's coastline boundary is still visually offset ~30 km westward relative to the GSHHG basemap coastline.

### Methodology flaw in prior troubleshooting

The `wave-overlay-troubleshooting.md` click-to-inspect test (Step 3) declared the rendering correct, but it only verified that `allWavePoints` contains a coordinate near the clicked position — it cannot detect whether the canvas pixel at that screen location is rendered at the right geographic position. The conclusion was therefore unreliable.

### Diagnostic

A console diagnostic was added to `renderWaveOverlay` comparing, for each sampled latitude row, the geographic longitude implied by the canvas pixel position against the data longitude from the GRIB grid. The diagnostic also logged where the GRIB model's land-sea boundary falls at several reference latitudes.

**Group 1 — pixel-lon vs data-lon (Δ ≈ 0 means rendering is correct):**

```
lat=58.219 j=188  dataLon=17.5313  pixelLon=17.5313  Δ=0.00 km
lat=61.094 j=175  dataLon=16.7188  pixelLon=16.7188  Δ=0.00 km
```

(Two latitude rows returned all-NaN in the grid and were skipped.)

**Group 2 — GRIB land-sea mask boundary (westernmost water point in GRIB data):**

```
lat≈58.5:  westernmost water = 17.5313°E
lat≈59.3:  westernmost water = 17.7813°E
lat≈60.0:  westernmost water = 16.8438°E
```

### Root cause

The rendering math is correct — Δ = 0.00 km at every sampled point. The overlay pixels are placed at exactly the geographic positions the GRIB data says they are.

The visual skew is a data artefact. The ICON-EU/EWAM wave model operates on a 7 km bathymetric grid whose land-sea mask differs from the GSHHG high-resolution shoreline used by Leaflet's basemap tiles. At the Swedish east coast the model boundary is displaced roughly 14–65 km westward:

- lat≈59.3°N: GRIB water starts at 17.78°E vs GSHHG mainland at ~18.0–18.2°E → ~14–25 km offset
- lat≈60.0°N: GRIB water starts at 16.84°E vs GSHHG coast at ~17.5–18°E → ~37–65 km offset

The larger offset at 60°N reflects the Swedish coast being more indented (Gulf of Gävle) at that latitude; the coarse wave model "fills in" the bay and shifts the modelled water boundary far westward.

### Revised finding (2026-06-12) — coordinate error, not data artefact

Comparison with XyGrib using the Denmark GRIB (June 6) proved the previous conclusion wrong. XyGrib shows 0.64 m significant wave height at N56 55.63, E11 18.74 (Kattegat). Our overlay shows nothing at that position — the same gradient is visible in our overlay but displaced onto Denmark's land mass.

XyGrib does not clip or mask the GRIB overlay. It renders at the correct geographic coordinates from the GRIB file. Our overlay renders at wrong coordinates. The diagnostic (Δ = 0.00 km pixel-lon vs data-lon) only proved the canvas pixels match the coordinates returned by `/wave-grid` — it did not prove those coordinates are correct. The coordinate error is upstream, in the GRIB metadata reading or the `/wave-grid` grid construction.

The "30 km skew" attributed to a data artefact for hours was this same coordinate bug, less obviously visible in the Baltic because land is nearby.

### Root cause confirmed (2026-06-12) — mixed-grid GRIB files

The OpenSkiron ICON-EU EWAM files are combined files containing two model grids:

| Grid | Step | Size (Denmark) |
|------|------|----------------|
| Atmospheric (ICON-EU wind) | 0.0625°×0.0625° | 132×113 |
| Ocean wave (EWAM HTSGW) | 0.1°×0.05° | 83×141 |

GDAL derives `ds.geoTransform` from the **first band** (CAPE, atmospheric grid). All 1389 bands — including 553 oceanographic HTSGW bands — are presented through the 132×113 atmospheric grid. `readGrib` reads HTSGW through the wrong grid, producing values at wrong coordinates.

**Verification:** Extracting discipline=10 (oceanographic) messages by scanning the raw GRIB2 binary for the "GRIB" marker (discipline at offset+6, total length at offset+8 as uint64 big-endian), writing them to a GDAL `/vsimem/` virtual file, and opening that file gives the correct 83×141 grid at 0.1°×0.05°. Reading HTSGW at 2026-06-06T01:00Z for N56.93°, E11.31° returns **0.655 m** — matching XyGrib's 0.64 m.

### Fix implemented

- `GribData.swhGrid` added to `types.ts` to carry the wave grid parameters independently
- `extractDisciplineMessages` in `grib.ts` extracts GRIB2 messages by discipline byte
- `readSwhFromOceanMessages` in `grib.ts` opens the extracted messages via vsimem and reads HTSGW with `flipRows`
- `loadGrib` calls `readSwhFromOceanMessages` and overrides `swhByTime`/`swhGrid`
- `getWaveAt` uses `swhGrid` for bilinear interpolation when present
- Integration test added: `getWaveAt` at Kattegat from Denmark GRIB asserts 0.55–0.75 m

### Continued N-S displacement (2026-06-12) — Mercator projection mismatch

After deploying the mixed-grid fix, user reported the wave overlay for the entire Gulf of Finland still appears north of Vantaa (~60.3°N). Pixel-center correction (commit e99c6e6, 0.025° = ~2.8 km) had no visible effect.

**Tooltip evidence:** clicking near Tallinn (59.4°N) in the UI produces a wave-height tooltip with data at the correct position (e.g. `59.45°N, 24.6°E`). This proves the data lookup (`getWaveAt`) and the point coordinates in `allWavePoints` are correct. The mismatch is between the tooltip coordinates and the visual canvas overlay — a rendering placement bug.

**Root cause: linear-latitude canvas stretched in Web Mercator space.**

`renderWaveOverlay` in `public/index.html` builds a canvas where each pixel row corresponds to an equal step in *latitude* (`latStep` degrees per row). Leaflet's `L.imageOverlay` stretches the canvas uniformly in *Web Mercator Y* space (equal Mercator units per screen pixel). These two spacings diverge at higher latitudes.

When multiple GRIB files are loaded, the canvas spans the union of all files' `f.meta` bounds. With all test-data files loaded:
- Canvas bounds: 52.5313°N to 66.7813°N (14.25° range)
- Data at 60.0°N occupies the linear-lat canvas position corresponding to 60.0°N
- After Mercator stretching that pixel appears at **60.77°N** — 85 km too far north

With only Baltic_East loaded (56.47°N–61.72°N, 5.25° range) the error is only 10 km.

**Quantitative verification (node):**

```
All files loaded — canvas 52.5313 to 66.7813
60.0N appears at: 60.767N  shift: 0.767deg = 85 km north
59.7N appears at: 60.470N

Baltic_East only — canvas 56.4688 to 61.7188
60.0N appears at: 60.088N  shift: 0.088deg = 10 km north
```

This is consistent with the user's observation: "the entire wave data for the entire Gulf of Finland is drawn north of Vantaa." At 60.5°N+, the visible first-data row (59.7–60°N) has been pushed to 60.47–60.77°N by Mercator stretching.

**Why the pixel-center fix had no effect:** the Mercator error (~85 km) completely dominates the pixel-center correction (~2.8 km). The pixel-center fix is correct but immaterial compared to this bug.

**Fix required:** build the canvas in Mercator-projected coordinates. Each canvas row must correspond to an equal increment of Mercator Y, not an equal increment of latitude. Then when Leaflet stretches it linearly in Mercator space the data appears at correct positions. The canvas bounds must be expressed in lat (SW/NE corners) as before, but the per-pixel lat→row mapping must use `mercY(lat)` instead of `(lat - latMin) / latStep`.
