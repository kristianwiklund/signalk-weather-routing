# Known Bugs

| # | Description |
|---|---|
| ~~BUG-1~~ | ~~`saveRoute` fails with "Invalid resource id provided (urn:mrn:signalk:uuid:…)" — `setResource` expects a plain UUID, not the full URN~~ — **fixed** |
| ~~BUG-2~~ | ~~OSM tiles blocked — webapp violates OSM tile usage policy~~ — **fixed** (tile `<img>` elements patched with `referrerpolicy` attribute to override SignalK's `Referrer-Policy: no-referrer`) |
| ~~BUG-3~~ | ~~`saveRoute` rejected by resources provider — `feature.properties.coordinatesMeta` items fail schema validation: each item must have `name` or `href` property~~ — **fixed** |
| ~~BUG-4~~ | ~~Route fetch returns 404 — webapp was using `/signalk/v1/api/resources/routes/` but resources API is only mounted at v2~~ — **fixed** |
| ~~BUG-5~~ | ~~Route passes through islands — land avoidance never worked: raster mask was all-zero (GDAL type name case mismatch); raster approach replaced with exact segment-polygon intersection against GSHHG high-res vector data~~ — **fixed** |
| ~~BUG-6~~ | ~~Progressive frontier dots invisible — `L.circleMarker` with `fill: false` produced SVG rings not visible at map scale; replaced with `L.divIcon` dot markers (DOM layer, same rendering path as wind barbs)~~ — **fixed** |
| ~~BUG-7~~ | ~~Polling misses intermediate frontier states — isochrone steps complete in < 500 ms between polls so only 1–2 of 5+ `onProgress` calls were ever sampled; switched to Server-Sent Events so each call pushes immediately~~ — **fixed** |
| ~~BUG-8~~ | ~~SSE client registers after calculation completes — `EventSource` was opened after the POST `/calculate` response, so all `onProgress` events fired before the client was in `sseClients`; fixed by awaiting `EventSource.onopen` before sending the POST~~ — **fixed** |
| ~~BUG-9~~ | ~~Stale 'done' event replayed to new SSE connections — `calcStatus` retains the previous calculation's `done` state; SSE endpoint's initial-state sync sent it to every fresh connection, immediately showing 100% and triggering `fetchAndDrawRoute` for an old route before the new calculation starts; fixed by only syncing `calculating` state on connect~~ — **fixed** |
| ~~BUG-12~~ | ~~Land overlay does not faithfully represent the routing land mask — two filters applied for display performance cause the overlay to hide land that the router still avoids: (1) polygons whose bounding box is smaller than 0.05° in both dimensions are dropped entirely (`LAND_DISPLAY_MIN_BBOX_DEG`), silently omitting islands, reefs, and coastal features up to ~4 km across; (2) stride-10 vertex sampling shifts coastline boundaries, so a click that appears to be in open water on the rendered overlay may lie inside the full-resolution polygon. A user guided by the overlay can place a start point in what looks like open water and still trigger the "No reachable positions" failure from BUG-10.~~ — **fixed** (size filter and stride sampling removed; endpoint now serves all polygons at full resolution) |
| BUG-10 | Start point on land causes immediate "No reachable positions" — the isochrone algorithm fails on the very first step when the start point is inside a GSHHG land polygon: `segmentHitsPoly` calls `pointInRing(startLat, startLon, …)` and returns `true` for all 72 headings, leaving `candidates` empty → throws "No reachable positions — check GRIB coverage and polar data" (misleading: the real cause is the start point being on land, not missing GRIB/polar data). Confirmed by OGR lookup: `59.3°N, 18.1°E` is inside GSHHG L1 polygon FID 0 (Swedish mainland). |
| ~~BUG-11~~ | ~~Status shows "Connecting…" then nothing — `openCalcStream()` awaits `onopen` which never fires.~~ — **fixed** (confirmed resolved by user) |
| ~~BUG-13~~ | ~~Isochrone frontier dots move instead of accumulate — each new frontier replaces the previous one on the map, so only the latest frontier is visible at any time. All historical frontiers should remain visible as the calculation progresses.~~ — **fixed** |
| ~~BUG-14~~ | ~~Gotland, Öland, and the Danish islands are missing from the land overlay — they do not appear when the land overlay is enabled.~~ — **fixed** (`renderLandOverlay` was querying `/land-polygons` with the GRIB file's bbox instead of the map viewport; polygons outside the GRIB footprint were never requested. Fixed by using `map.getBounds()` as the query bbox and re-fetching on `map.moveend` so the overlay tracks the visible area.) |
| ~~BUG-15~~ | ~~Large number of overlapping isochrone lines near the start point when departing close to Åland. User hypothesis: points getting beached, then moving back to approximately the same position as the first isochrone, causing many near-identical frontier lines to accumulate.~~ — **fixed** (cone pruning in coarse pre-pass and T_bound filtering in fine pass eliminate the backtracking frontier points that caused accumulation) |
| ~~BUG-20~~ | ~~"Run test" button (REQ-37) is not visible in the webapp UI.~~ — **fixed** |
| ~~BUG-21~~ | ~~The coarse pre-pass continues at least two hours past the destination arrival time — it appears to have no termination criterion based on reaching the goal.~~ — **fixed** (observed on the pre-REQ-34/35/36 deployment; current coarse pre-pass terminates immediately on arrival within `arrivalRadiusNm`) |
| BUG-22 | Activating the land overlay checkbox during a routing calculation does not show the land overlay. |
| BUG-26 | The right-hand y-axis (wave height in metres) in the conditions graph is rendered as a large green blob with no numbers visible. |
| ~~BUG-27~~ | ~~The Routing Options section shows nothing — neither the safety margin build progress placeholder nor the checkbox.~~ — **fixed** (`style.display = ''` on `#safety-margin-building` was overridden by the CSS `display:none` rule; fixed by using `'block'` instead) |
| BUG-28 | Tooltip wave height values for the first few waypoints from the left are wildly wrong (e.g. 158 m, 307.2 m, 7031 m). |
| BUG-29 | The safety margin dataset builder never runs. The dilate worker fails immediately with "Module did not self-register: .../gdal-async/.../gdal.node" — the gdal-async native binary cannot load inside a worker_threads Worker. The buildDilated promise rejects, app.setPluginError() is called silently (not visible in Docker logs), and dilatedIndexReady stays false. |
| ~~BUG-25~~ | ~~After the BUG-24 fix (gdal-async bundled), installing the plugin causes the SignalK main process to consume >>100% CPU, making the SignalK GUI inaccessible. Same symptom as before the plugin was uninstalled.~~ — **fixed** (two root causes: alignment bug in `loadDilatedIndex` caused `Float64Array` to throw at offset 68 on every load, so the union always rebuilt; `CascadedPolygonUnion.union()` ran synchronously on the main thread, blocking the event loop. Fixed by: padding bbox header to 40 bytes + bumping index version to 2; moving the union into a `worker_threads` Worker so the main thread stays responsive) |
| ~~BUG-24~~ | ~~After clean install of latest `main` (db36fd6), the plugin config entry does not appear in the SignalK Plugin Config UI. The webapp's "Reload GRIB file" action returns "Could not reach plugin API" and throws an "unexpected token … is not valid JSON" error. SignalK itself starts and runs without hanging.~~ — **fixed** (SignalK hardcodes `--ignore-scripts` for all plugin installs, suppressing `gdal-async`'s postinstall hook; fixed by adding `gdal-async` to `bundledDependencies` so the prebuilt native binary is included in the tarball and requires no postinstall) |
| ~~BUG-23~~ | ~~When an isochrone frontier is not a full circle, drawing it as a single polyline produces visual artifacts: straight lines connecting the two arc endpoints, and lines bridging large angular gaps within the arc.~~ — **fixed** (frontier sorted by bearing from start is split at angular gaps > 10° into separate polylines; wrap-around gap also checked so near-complete rings still draw as one closed line) |
| ~~BUG-16~~ | ~~REQ-26 (coarse-to-fine heading step) appears to have made routing calculation slower rather than faster.~~ — **fixed** (`new Set<number>()` was allocated inside the frontier loop (~14 000 allocs/calculation); hoisted to outer scope and reset with `.clear()` per point) |
| ~~BUG-17~~ | ~~Post REQ-26, isochrones appear far to the north when routing from Åland to Gotska Sandön. This is new behaviour not present before REQ-26.~~ — **fixed** (band-boundary misclassification: coarse representative heading failing does not mean all fine headings in that band fail; Pass 1 now marks a band surviving if ANY fine heading within it gives speed ≥ minBoatSpeed) |
| ~~BUG-18~~ | ~~Isochrone lines produce spiderweb visuals — frontier points are not sorted to minimise distance between consecutive points before the polyline is drawn.~~ — **fixed** (nearest-neighbour sort applied to frontier points before polyline is drawn) |
| ~~BUG-19~~ | ~~Isochrone lines still contain jumps after BUG-18 fix. Observed pattern: outer ring drawn ~360°, then line jumps from the top to a small ~10° sector at 90° from the top, draws a segment inside the already-drawn area, then jumps back to the top.~~ — **fixed** (replaced nearest-neighbour sort with bearing-from-start sort) |

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
