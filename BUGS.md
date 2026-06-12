# Known Bugs

## Open Bugs

| # | Description |
|---|---|
| [BUG-57](https://github.com/kristianwiklund/signalk-weather-routing/issues/184) | Saved route "wr intermediate wp result", departure 2026-05-24 08:00, source route "weather routing test": the calculated route shows the boat travelling at ~6 kn directly into the wind, which should be physically impossible given the polar's minimum TWA constraint. |
| [BUG-22](https://github.com/kristianwiklund/signalk-weather-routing/issues/81) | Activating the land overlay checkbox during a routing calculation does not show the land overlay. |
| [BUG-55](https://github.com/kristianwiklund/signalk-weather-routing/issues/174) | The README has not been updated to reflect recently implemented features (at minimum REQ-86 GRIB wind overlay and REQ-87 wind overlay checkbox are missing). |

## Fixed Bugs

| # | Description |
|---|---|
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
