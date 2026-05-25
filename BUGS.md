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
| BUG-11 | Status shows "Connecting…" then nothing — `openCalcStream()` awaits `onopen` which never fires. Root cause not yet confirmed: the event-loop blocking theory (concurrent `/land-polygons` serialization) has been ruled out — user reports the land overlay was fully loaded before Calculate was pressed, so the event loop was not blocked at the time of the SSE connection. The streaming fix to `/land-polygons` was applied but does not address this scenario. Further investigation required. See investigation notes below. |
| ~~BUG-13~~ | ~~Isochrone frontier dots move instead of accumulate — each new frontier replaces the previous one on the map, so only the latest frontier is visible at any time. All historical frontiers should remain visible as the calculation progresses.~~ — **fixed** |
| BUG-14 | Gotland, Öland, and the Danish islands are missing from the land overlay — they do not appear when the land overlay is enabled. |
| BUG-15 | Large number of overlapping isochrone lines near the start point when departing close to Åland. User hypothesis: points getting beached, then moving back to approximately the same position as the first isochrone, causing many near-identical frontier lines to accumulate. Root cause not confirmed. |
| BUG-16 | REQ-26 (coarse-to-fine heading step) appears to have made routing calculation slower rather than faster. |
| BUG-17 | Post REQ-26, isochrones appear far to the north when routing from Åland to Gotska Sandön. This is new behaviour not present before REQ-26. |
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
