# signalk-weather-routing — Specification

## Open Requirements

| # | Requirement | Status |
|---|---|---|
| [REQ-85](https://github.com/kristianwiklund/signalk-weather-routing/issues/157) | A script (any language) that downloads the OpenCPN weather-routing example archive from https://opencpn-manuals.github.io/main/weather_routing/_attachments/weather-routing-setup.zip, extracts the relevant files (GRIB and polar), and runs the plugin's routing algorithm against the Hurricane Irma test case included in that archive. The script is not run as part of the normal test suite — it is an optional download-and-run script for manual validation against a known reference scenario. The downloaded files are not committed to the repository. | open |
| [REQ-58](https://github.com/kristianwiklund/signalk-weather-routing/issues/58) | The plugin is published to the SignalK App Store. The repository and package must satisfy all requirements listed at https://demo.signalk.org/documentation/Developing/Plugins/Publishing_to_The_AppStore.html, including but not limited to: correct `package.json` metadata, a compliant README, a screenshot, and the npm package published under the correct name. | open |
| [REQ-59](https://github.com/kristianwiklund/signalk-weather-routing/issues/59) | Traffic separation zone handling. | open |
| [REQ-60](https://github.com/kristianwiklund/signalk-weather-routing/issues/91) | Among otherwise equal routes, prefer candidates that are further from land — a soft reward in the frontier pruning, not a hard distance constraint. Postponed — future sprint. | open |

## Closed Requirements

| # | Requirement | Status |
|---|---|---|
| [REQ-87](https://github.com/kristianwiklund/signalk-weather-routing/issues/161) | A checkbox in the GUI to turn the GRIB wind overlay on and off. | done |
| [REQ-86](https://github.com/kristianwiklund/signalk-weather-routing/issues/158) | Wind data from the loaded GRIB files is rendered as an overlay on the map. A time scrubber (scrollbar) at the bottom of the map controls which forecast timestep is displayed. Before a route is calculated the scrubber spans the full GRIB time range. After a route is calculated the scrubber range corresponds to the routed time (matching the conditions graph widget), allowing the user to see the forecast conditions at each point along the route. | done |
| [REQ-84](https://github.com/kristianwiklund/signalk-weather-routing/issues/154) | The motoring UI on the routing page is replaced with a two-field group: "Motor below _ kn" (computed boat speed threshold that triggers motoring) and "Motor speed _ kn" (the speed used when motoring). When the polar-computed boat speed falls below the threshold, the motor speed is used instead of discarding the candidate. The trigger is boat speed, not wind speed. The two fields are presented together as a coherent motor configuration. Supersedes REQ-81. | done |
| [REQ-83](https://github.com/kristianwiklund/signalk-weather-routing/issues/153) | A "Wait for wind" checkbox on the routing page. When enabled, frontier points with zero boat speed (after polar and motor evaluation) are kept in place rather than discarded, allowing the router to wait in calm patches until wind returns. | done |
| [REQ-82](https://github.com/kristianwiklund/signalk-weather-routing/issues/152) | When polar-computed boat speed is below the `minBoatSpeed` threshold, the effective speed for that heading is set to zero rather than the heading being immediately discarded. Subsequent logic then determines the outcome: REQ-84 (motor) or REQ-83 (wait for wind) may act on the zero-speed candidate; if neither applies, the candidate is discarded. | done |
| [REQ-81](https://github.com/kristianwiklund/signalk-weather-routing/issues/151) | Motor fallback triggers whenever computed boat speed is below the `minBoatSpeed` threshold, not only when the polar returns exactly zero. | superseded |
| [REQ-80](https://github.com/kristianwiklund/signalk-weather-routing/issues/150) | Hardcoded routing and algorithm tuneables are exposed as plugin settings with sensible defaults, so they can be adjusted without code changes. | done |
| [REQ-77](https://github.com/kristianwiklund/signalk-weather-routing/issues/137) | The plugin config (SignalK plugin settings) includes a boolean option to enable or disable the test buttons (Run test, Helsinki test, Gothenburg test) in the webapp. When disabled, the buttons are hidden. | done |
| [REQ-79](https://github.com/kristianwiklund/signalk-weather-routing/issues/141) | Clicking the conditions graph panel expands it to fill the entire screen; clicking again (or pressing Escape) collapses it back to its normal position. | done |
| [REQ-64](https://github.com/kristianwiklund/signalk-weather-routing/issues/101) | Each GRIB file in the sidebar list has a checkbox. When a file is unchecked it is excluded from route calculations and its bounding box rectangle is removed from the map. When checked it is re-included. | done |
| [REQ-62](https://github.com/kristianwiklund/signalk-weather-routing/issues/96) | The user can select an existing SignalK route or waypoint from `resources/routes` or `resources/waypoints` as the departure point for a new route calculation. | done |
| [REQ-63](https://github.com/kristianwiklund/signalk-weather-routing/issues/100) | The conditions graph below the map shows which GRIB file supplied the weather data for each waypoint. A colored line is drawn below the graph, segmented by GRIB file, using the same C64 palette color assigned to that file's bounding box rectangle on the map. | done |
| [REQ-24](https://github.com/kristianwiklund/signalk-weather-routing/issues/24) | When the polar diagram gives zero speed for a heading, the boat may motor at a configurable engine speed instead of treating that heading as unreachable | done |
| [REQ-23](https://github.com/kristianwiklund/signalk-weather-routing/issues/23) | A checkbox (enabled by default) controls whether coast avoidance is applied during routing; when unchecked, the algorithm runs without land avoidance | done |
| [REQ-78](https://github.com/kristianwiklund/signalk-weather-routing/issues/139) | Wind arrow tooltips on the calculated route (both waypoint barbs and leg-midpoint barbs) show the calculated boat speed (knots) alongside wind speed and direction. | done |
| [REQ-75](https://github.com/kristianwiklund/signalk-weather-routing/issues/128) | The conditions graph at the bottom of the webapp shows the calculated boat speed (knots) as an additional line, plotted alongside wind speed and wave height, so the user can see how the router's speed predictions vary along the route over time. | done |
| [REQ-74](https://github.com/kristianwiklund/signalk-weather-routing/issues/127) | Route calculation failures (errors) and partial-route warnings are shown as dismissible popup notifications overlaid on the map, so the user sees them without scrolling. Progress messages and successful completion continue to appear in the existing status box below the map. The popup must not open a new browser window or tab. | done |
| [REQ-69](https://github.com/kristianwiklund/signalk-weather-routing/issues/120) | Remove the coarse pass (`runCoarsePass`) and T_bound pruning from the isochrone algorithm. | done |
| [REQ-76](https://github.com/kristianwiklund/signalk-weather-routing/issues/132) | Three labelled test buttons: Öregrund (existing, corrected coords), Helsinki, Gothenburg — each pre-fills start, destination, and departure time. | done |
| [REQ-61](https://github.com/kristianwiklund/signalk-weather-routing/issues/95) | GitHub link (Octocat + "source & issues") displayed below the sidebar title. | done |
| [REQ-68](https://github.com/kristianwiklund/signalk-weather-routing/issues/119) | The 'No reachable positions' and 'Destination not reached within forecast period' error messages include the number of completed isochrone steps at the time of failure. | done |
| [REQ-73](https://github.com/kristianwiklund/signalk-weather-routing/issues/126) | The fine-pass directional cone is applied conditionally per frontier point: if the straight-line segment from the frontier point to the destination crosses land, the cone is disabled for that point (all 360° of headings are tried); if the segment is clear, the normal cone applies. This allows the frontier to escape start positions where land lies on the direct bearing to the destination, while still preventing backward routing once the boat is in open water with a clear path. | done |
| [REQ-72](https://github.com/kristianwiklund/signalk-weather-routing/issues/125) | When route calculation fails because the frontier collapses ("no reachable positions"), show a best-effort partial route backtracked from the last non-empty frontier, so the user can see how far the route progressed before it became impossible. | done |
| [REQ-71](https://github.com/kristianwiklund/signalk-weather-routing/issues/124) | When route calculation fails, the error message and UI must clearly indicate the reason — specifically whether failure was due to adverse wind (boat cannot make progress toward the destination under sail), GRIB coverage running out, or land blocking all paths. | done |
| [REQ-70](https://github.com/kristianwiklund/signalk-weather-routing/issues/122) | When a route calculation fails, keep the last-computed isochrones visible on the map and show a diagnostic overlay indicating the GRIB coverage boundary, so the user can see whether the failure is due to the frontier leaving coverage, being blocked by land, or stalling in unfavourable wind. | done |
| [REQ-45](https://github.com/kristianwiklund/signalk-weather-routing/issues/45) | Route comfort constraints: the user can configure a maximum wind speed (knots) and/or a maximum wave height (metres) as routing constraints. During isochrone expansion, any candidate where the forecasted wind speed exceeds the wind limit is discarded. Wave height is read from the loaded GRIB file if wave parameters (significant wave height, `swh`) are present — the OpenSkiron ICON-EU EWAM files include both wind and wave bands in a single file. The wave height constraint is only applied when wave data is present in the loaded file. Both limits are optional and independent. | done |
| [REQ-67](https://github.com/kristianwiklund/signalk-weather-routing/issues/115) | Hovering over a wind arrow (barb) on the calculated route shows a tooltip with the wind speed (knots) and direction (degrees) at that waypoint. | done |
| [REQ-66](https://github.com/kristianwiklund/signalk-weather-routing/issues/114) | The isochrone lines drawn on the map during and after route calculation should be thinner. | done |
| [REQ-65](https://github.com/kristianwiklund/signalk-weather-routing/issues/113) | The "Run test" button pre-fills the start position as 60.4572°N 18.8141°E (Öregrund) and the departure time as 2026-05-24 08:00. | done |
| [REQ-32](https://github.com/kristianwiklund/signalk-weather-routing/issues/32) | The plugin config accepts a directory path (`gribDir`) instead of a single file path. At startup and on reload, the plugin scans the directory and indexes all GRIB files found. When a calculation is started, only the GRIB files relevant to the selected departure time are used. Each loaded file's bounding box is shown on the map as a separate dashed rectangle, rotating through a C64-inspired color palette. | done |
| [REQ-1](https://github.com/kristianwiklund/signalk-weather-routing/issues/1) | SignalK Node.js plugin, TypeScript | done |
| [REQ-2](https://github.com/kristianwiklund/signalk-weather-routing/issues/2) | GRIB2 wind data from OpenSkiron — ICON-EU model, 7 km grid, hourly to 78 h then 3-hourly to 120 h | done |
| [REQ-3](https://github.com/kristianwiklund/signalk-weather-routing/issues/3) | Routing algorithm is modular — a common interface allows multiple algorithm implementations; isochrone is the first | done |
| [REQ-4](https://github.com/kristianwiklund/signalk-weather-routing/issues/4) | Polar diagram: ORC/OpenCPN semicolon-delimited CSV, same format as signalk-polar-performance-plugin (read file directly — that plugin has no query API yet) | done |
| [REQ-5](https://github.com/kristianwiklund/signalk-weather-routing/issues/5) | Land avoidance: GSHHG high-resolution (h) shapefile (https://www.soest.hawaii.edu/pwessel/gshhg/) | done |
| [REQ-6](https://github.com/kristianwiklund/signalk-weather-routing/issues/6) | GSHHG downloaded and land mask built automatically on first plugin start if not already present | done |
| [REQ-7](https://github.com/kristianwiklund/signalk-weather-routing/issues/7) | Routes saved to SignalK `resources/routes` as GeoJSON — visible in freeboard-sk natively | done |
| [REQ-8](https://github.com/kristianwiklund/signalk-weather-routing/issues/8) | Separate Leaflet-based UI served from plugin `public/` — not embedded in freeboard-sk | done |
| [REQ-9](https://github.com/kristianwiklund/signalk-weather-routing/issues/9) | No turf.js — pure math for all geographic calculations | done |
| [REQ-10](https://github.com/kristianwiklund/signalk-weather-routing/issues/10) | No runtime npm dependencies beyond explicitly approved packages | done |
| [REQ-11](https://github.com/kristianwiklund/signalk-weather-routing/issues/11) | The webapp is registered as a SignalK webapp (`signalk-webapp` keyword) so it appears in the app dock | done |
| [REQ-12](https://github.com/kristianwiklund/signalk-weather-routing/issues/12) | Map chart tiles are sourced via the SignalK resources charts API (`GET /signalk/v1/api/resources/charts`) — no hardcoded external tile URL | done |
| [REQ-13](https://github.com/kristianwiklund/signalk-weather-routing/issues/13) | The loaded GRIB file's geographic coverage is shown on the map as a dashed rectangle | done |
| [REQ-14](https://github.com/kristianwiklund/signalk-weather-routing/issues/14) | The weather routing webapp displays the calculated route on the map, with wind conditions at each waypoint interpolated to the time the vessel is estimated to be at that location | done |
| [REQ-15](https://github.com/kristianwiklund/signalk-weather-routing/issues/15) | Wind barbs on the route map are larger | done |
| [REQ-16](https://github.com/kristianwiklund/signalk-weather-routing/issues/16) | Expected time of arrival (ETA) is shown at each waypoint on the route map | done |
| [REQ-17](https://github.com/kristianwiklund/signalk-weather-routing/issues/17) | The webapp has a button to toggle a land mask overlay on the map. The overlay must be faithful to the land mask used during routing: it must show exactly the same polygons at exactly the same boundaries, with no filtering, simplification, or sampling applied. | done |
| [REQ-18](https://github.com/kristianwiklund/signalk-weather-routing/issues/18) | The webapp shows calculation progress — either a progress bar or progressive isochrone rendering on the map | done |
| [REQ-19](https://github.com/kristianwiklund/signalk-weather-routing/issues/19) | Isochrones are drawn as lines (connecting the frontier points of each time step), not as individual dots | done |
| [REQ-20](https://github.com/kristianwiklund/signalk-weather-routing/issues/20) | Estimated travel time between consecutive waypoints is shown on the map | done |
| [REQ-21](https://github.com/kristianwiklund/signalk-weather-routing/issues/21) | Calculation time for each leg is shown on the map in red | done |
| [REQ-22](https://github.com/kristianwiklund/signalk-weather-routing/issues/22) | On the centre of each leg, the average wind direction and speed used to calculate the leg is shown as a wind arrow with barbs | done |
| [REQ-25](https://github.com/kristianwiklund/signalk-weather-routing/issues/25) | Isochrone lines cycle through alternating colours (black, blue, purple, red) so successive isochrones are visually distinguishable on the map | done |
| [REQ-26](https://github.com/kristianwiklund/signalk-weather-routing/issues/26) | ~~Isochrone expansion uses a coarse-to-fine heading step: first pass at a wide step (e.g. 20°) to identify promising bearing bands, second pass at full resolution (5°) only within those bands~~ **Superseded by REQ-43** (measured 0% heading skip rate — coarse pass was pure overhead). | superseded |
| [REQ-27](https://github.com/kristianwiklund/signalk-weather-routing/issues/27) | Frontier expansion is parallelised across Node.js Worker threads (one per CPU core); workers are pooled and reused across isochrone steps to amortise creation overhead | not needed |
| [REQ-28](https://github.com/kristianwiklund/signalk-weather-routing/issues/28) | Wind and polar lookups are cached within each isochrone step so adjacent frontier points sharing a GRIB grid cell avoid redundant bilinear interpolation | not needed |
| [REQ-29](https://github.com/kristianwiklund/signalk-weather-routing/issues/29) | ~~At load time, build two GSHHG polygon sets: a simplified set (Douglas-Peucker, tolerance ≈ 0.01°) used for the coarse pre-pass spatial index, and the original full-resolution set used for the fine isochrone pass and the land overlay.~~ **Superseded by REQ-41** (edge-tile index makes DP simplification unnecessary). | superseded |
| [REQ-30](https://github.com/kristianwiklund/signalk-weather-routing/issues/30) | Land segment checks are cached in a bounded LRU cache keyed on quantised endpoint coordinates; cache persists across isochrone steps (coastlines do not change) | not needed |
| [REQ-31](https://github.com/kristianwiklund/signalk-weather-routing/issues/31) | ~~The spatial index uses a two-level grid (coarse ~10° cells containing fine 1° cells); the coarse level provides fast rejection before the fine level is consulted~~ **Superseded by REQ-41** (edge-tile index at 0.1° makes two-level grid unnecessary). | superseded |
| [REQ-33](https://github.com/kristianwiklund/signalk-weather-routing/issues/33) | Analyse realistic input uncertainty (polar inaccuracy, GRIB forecast error, local wind variations) to determine the minimum meaningful search resolution; use the result to justify and document the default values for headingStep, coarseHeadingStep, and sectorSize | not needed |
| [REQ-34](https://github.com/kristianwiklund/signalk-weather-routing/issues/34) | Before the fine isochrone pass, run a preliminary full-route coarse isochrone (coarseStep headings, with land checks) to establish an upper-bound arrival time T_bound. After each fine-pass frontier pruning step, discard frontier points from which the destination cannot be reached before T_bound, using the polar's maximum boat speed as an admissible lower bound on remaining travel time. This eliminates wasteful exploration of frontier points that are provably unable to improve on the already-known coarse solution. | done |
| [REQ-35](https://github.com/kristianwiklund/signalk-weather-routing/issues/35) | During the coarse pre-pass, each candidate is checked before being added to the frontier: discard any candidate whose bearing from the start deviates by more than 90° from the direct start→destination bearing. This cone-prunes the pre-pass at generation time so that candidates heading away from the destination are rejected immediately, producing visually meaningful cone-shaped isochrones rather than full rings. The 90° half-angle allows full tacking coverage while eliminating candidates in the opposite hemisphere from the destination. | superseded |
| [REQ-36](https://github.com/kristianwiklund/signalk-weather-routing/issues/36) | The map only draws frontier points that have passed all pruning steps. Points that survive sector pruning but are subsequently eliminated by T_bound or cone pruning must not appear in the drawn isochrone lines. | done |
| [REQ-37](https://github.com/kristianwiklund/signalk-weather-routing/issues/37) | The webapp has a "Run test" button that pre-fills start (60.3996°N 18.3403°E), finish (58.5052°N 17.3474°E), and departure time (2026-05-24 10:30 CEST = 08:30 UTC) and immediately starts a routing run. A command-line script invokes the same test run with the same fixed parameters. | done |
| [REQ-38](https://github.com/kristianwiklund/signalk-weather-routing/issues/38) | Each isochrone calculation step emits a structured timing breakdown: number of frontier points, number of candidates evaluated, number of land checks performed, time spent in wind lookups, polar lookups, land checks, and frontier pruning. The breakdown is logged per step and summarised (min/max/total) at the end of the calculation. | done |
| [REQ-39](https://github.com/kristianwiklund/signalk-weather-routing/issues/39) | At load time, GSHHG land polygons are pre-processed by dilated union: each polygon is expanded outward by 0.5 NM, and any polygons whose expanded regions overlap (i.e. whose boundaries are within 1 NM of each other) are merged into a single no-go polygon. This is a **routing safety** feature, not a performance optimisation: it closes narrow passages (such as the archipelago between Inre Hamnskär, Långskär, and Söderarm) that lie below the algorithm's lateral resolution and would otherwise produce routes that appear to thread the passage but cannot safely be sailed. The merged polygon set is used for routing land checks only when the feature is enabled; the original full-resolution polygons are always used for the land overlay (REQ-17). A checkbox in the webapp UI (disabled by default) controls whether dilated-union merging is applied. If higher-resolution coastline data becomes available in the future, this option may no longer be necessary. | done |
| [REQ-40](https://github.com/kristianwiklund/signalk-weather-routing/issues/40) | In a future iteration, the island-cluster merging distance threshold (currently fixed at 1 NM) is derived from the boat's polar: specifically, the minimum passage width that the routing algorithm can reliably thread given the polar's minimum viable TWA and the isochrone leg length. | not needed |
| [REQ-41](https://github.com/kristianwiklund/signalk-weather-routing/issues/41) | Replace the polygon-index spatial grid with an edge-tile index: at load time, insert each GSHHG polygon edge into all 0.1° grid cells it crosses; save the index to a binary file invalidated by GSHHG mtime. Segment checks DDA-walk the cells the path crosses and test only the edges in those cells. The existing `polygonsInBbox` function (used by the land overlay) is unchanged. | done |
| [REQ-42](https://github.com/kristianwiklund/signalk-weather-routing/issues/42) | When the safety margin option (REQ-39) is enabled, the land overlay shows two layers: the dilated-union polygons as the bottom layer in light gray, and the original full-resolution GSHHG polygons as the top layer in dark gray. When the safety margin is disabled, only the original full-resolution polygons are shown (as per REQ-17). | done |
| [REQ-43](https://github.com/kristianwiklund/signalk-weather-routing/issues/43) | Remove the coarse-to-fine two-pass heading expansion (REQ-26). Measurement shows 0% of fine headings are skipped by the coarse band filter for this polar — every band survives, so the coarse pass adds ~18 polar lookups per frontier point per step and eliminates nothing. Replace with a single full-resolution pass at `headingStep` (5°). | done |
| [REQ-44](https://github.com/kristianwiklund/signalk-weather-routing/issues/44) | When a new calculation is started, the currently displayed route (route line, waypoint labels, wind barbs, isochrone lines) and the conditions graph are cleared from the map automatically. | done |
| [REQ-46](https://github.com/kristianwiklund/signalk-weather-routing/issues/46) | The webapp shows a graph of forecasted conditions along the calculated route over time: wind speed, wind direction, and wave height (if wave data is available) at each waypoint's estimated arrival time. | done |
| [REQ-47](https://github.com/kristianwiklund/signalk-weather-routing/issues/47) | Routes are not saved to SignalK automatically. Instead, the webapp has a "Save" button that opens a dialog prompting for a route name, with "Save" and "Cancel" buttons. Clicking Save stores the route to SignalK `resources/routes` under the given name. Clicking Cancel dismisses the dialog without saving. | done |
| [REQ-48](https://github.com/kristianwiklund/signalk-weather-routing/issues/48) | When the safety margin dataset is still being built (i.e. the dilated index has not yet finished computing), the safety margin checkbox is replaced by a text placeholder that says the dataset is being created, including the percentage of completion. Once the dataset is ready, the placeholder is replaced by the checkbox. | done |
| [REQ-49](https://github.com/kristianwiklund/signalk-weather-routing/issues/49) | Hovering over the conditions graph (wind speed / wave height) shows a tooltip with the exact values at that point. | done |
| [REQ-50](https://github.com/kristianwiklund/signalk-weather-routing/issues/50) | The README documents the GSHHG dataset: what it is, its license (LGPL), and a link to the download page (https://www.soest.hawaii.edu/pwessel/gshhg/). The GSHHG shapefile is bundled directly in the npm package (no runtime download). If the zip format used by the upstream source cannot be unpacked on install without external tools, it is recompressed to a format that can. The runtime download-on-first-start code is removed. | done |
| [REQ-51](https://github.com/kristianwiklund/signalk-weather-routing/issues/51) | The edge index and dilated edge index are pre-computed from the GSHHG shapefile as part of the build process (offline, not at runtime). The pre-built index files are bundled in the npm package. The runtime index-building and shapefile-download code is removed. If the index files are large, they are compressed with a format that can be decompressed during install without external tools. | done |
| [REQ-52](https://github.com/kristianwiklund/signalk-weather-routing/issues/52) | The GSHHG resolution tier used to build the land indices is configurable via a constant or parameter in the build script, with a comment listing the available tiers (f = full, h = high, i = intermediate, l = low, c = crude) and the default set to high (h). | done |
| [REQ-53](https://github.com/kristianwiklund/signalk-weather-routing/issues/53) | The prepare-land-data build script prints clear progress feedback to stdout throughout its run: download progress, polygon count after loading, per-polygon buffering progress (e.g. "Buffering polygon N/144749"), union step start and completion, and index write confirmation. The output must make it obvious the process is running and not locked at any stage. | done |
| [REQ-54](https://github.com/kristianwiklund/signalk-weather-routing/issues/54) | The prepare-land-data build script is written in Python 3, using Shapely (backed by native GEOS) for polygon buffering and union, and Fiona for shapefile reading. The TypeScript version of the script is removed. | done |
| [REQ-55](https://github.com/kristianwiklund/signalk-weather-routing/issues/55) | The per-step calculation time (currently shown in red on each waypoint label) is removed from the route display. | done |
| [REQ-56](https://github.com/kristianwiklund/signalk-weather-routing/issues/56) | The timestamp shown on each waypoint label displays both the date and the time (ETA), not time only. | done |
| [REQ-57](https://github.com/kristianwiklund/signalk-weather-routing/issues/57) | The leg duration label shown on each route leg is removed from the route display. | done |

## Algorithm

The isochrone algorithm runs in two sequential phases: a coarse pre-pass that establishes an upper-bound arrival time, followed by a fine isochrone expansion that uses that bound to prune wasteful exploration.

### Parameters

| Parameter | Default | Configurable | Description |
|---|---|---|---|
| `headingStep` | 5° | yes | Heading resolution for the fine isochrone pass |
| `coarseHeadingStep` | 20° | yes | Heading resolution for the coarse pre-pass |
| `sectorSize` | 1° | yes | Bearing-sector width for fine-pass frontier pruning |
| `minBoatSpeed` | 0.3 kt | yes | Headings producing less than this are discarded |
| `arrivalRadiusNm` | 2 NM | yes | Distance to destination that counts as arrival |
| coarse sector size | 1° | no | Bearing-sector width for pre-pass frontier pruning (reduced from 5° to preserve narrow-passage candidates — see BUG-34) |
| cone half-angle | 90° | no | Maximum deviation from start→destination bearing allowed in the pre-pass |
| fine-pass cone half-angle | 100° | no | Maximum heading deviation from the direct start→destination bearing allowed in the fine pass; referenced per OpenCPN MaxDivertedCourse convention (BUG-43) |
| max heading change per step | 120° | no | Maximum per-step heading change from a frontier point's incoming heading; not applied from the seed point (BUG-44) |

### Phase 1 — Coarse pre-pass

Runs a full-route isochrone at `coarseHeadingStep` (20°) resolution to produce an upper-bound arrival time T_bound.

For each time step, for each frontier point:
1. Try all headings at 20° resolution.
2. Discard if boatSpeed < minBoatSpeed.
3. Discard if the candidate's bearing from the start deviates more than 90° from the direct start→destination bearing (cone pruning).
4. Discard if the path segment crosses land.
5. If within `arrivalRadiusNm` of the destination, record the current time as T_bound and stop.

After each step, prune candidates to a frontier using 1° bearing sectors (one point per sector, keeping the farthest from start). Emits progress events from 0% to 50%.

Returns T_bound (a Date) if the destination was reached, or null if the GRIB period was exhausted without arrival.

### Phase 2 — Fine isochrone pass

Runs the full isochrone expansion at `headingStep` (5°) resolution, using T_bound to discard provably suboptimal frontier points.

For each time step, for each frontier point:
1. Skip if the point is on land.
2. Look up wind at the point's position and time step.
3. For each heading at `headingStep` (5°) resolution:
   - Discard if heading deviates more than 100° from the direct start→destination bearing (BUG-43).
   - Discard if heading change from parent's incoming heading exceeds 120°; constraint not applied from the seed point (BUG-44).
   - Discard if boatSpeed < minBoatSpeed.
   - Discard if the path segment crosses land.
   - Add to candidates. If within `arrivalRadiusNm` of destination, record as `arrived`.

If `arrived` is set, the loop terminates.

After collecting candidates, prune to a frontier using 1° bearing sectors from the start (up to two points per sector, keeping the two farthest). If T_bound is known, apply the bounding filter: discard any frontier point from which the destination cannot be reached before T_bound at the polar's maximum speed (`distToEnd / maxPolarSpeed + point.time > T_bound`). If the filtered frontier is empty, the destination is unreachable before T_bound and the pass terminates early. Emits progress events from 50% to 100% with the T_bound-filtered frontier.

### Frontier pruning — pruneToFrontier

Groups candidates by their bearing from the fixed start point, divided into sectors of width `sectorSize`. Within each occupied sector, keeps up to the two candidates farthest from the start (by Euclidean distance approximation with cosine-corrected longitude). Returns at most two points per occupied sector (BUG-45). See D16 for the rationale for top-2 rather than OpenCPN's closed-contour merging.

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
| D13 | `pruneToFrontier` uses **farthest-from-start** (distSq, cosine-corrected) as the dominance criterion in both passes. A* `g+h` was implemented and then reverted: in the isochrone algorithm all step-N candidates share the same `g` value (`wind.times[N]`), so `g+h` reduces to `constant + h = min-haversine-to-destination` per sector. For routes requiring a southward detour (e.g. Gothenburg→Stockholm via Öresund), min-h strongly prefers near-start points (smaller haversine to the NE destination) over correctly south-advancing points, pinning the frontier near the start for the entire forecast window. Farthest-from-start is correct provided (a) frontier escape is prevented by the GRIB domain boundary check (Fix B) and (b) T_bound is correctly established by the coarse pass (Fix A — cone removal), since T_bound pruning in the fine pass then eliminates escaped points. |
| D14 | `interpolateBoatSpeed` returns 0 for any TWA strictly below `polar.twa[0]` (the polar's minimum close-hauled angle). This is a hard physical constraint: the boat cannot sail at a wind angle tighter than its tacking angle. The existing `bracketIndex` clamping (index 0 returned for below-minimum values) followed by bilinear extrapolation gives non-zero speeds for TWA below the minimum — for sunwind33.pol (min TWA 52°), TWA=0° yields ~4–5 kts instead of 0, allowing the router to send the boat directly into the wind. The fix is a single early-return guard added to `interpolateBoatSpeed` before `bracketIndex` is called, applied to both the coarse and fine passes. The TWS light-air extrapolation (same `bracketIndex` behaviour but for TWS below minimum) is a separate issue (BUG-36) and is not changed by this decision. |
| [D15](https://github.com/kristianwiklund/signalk-weather-routing/issues/112) | Reduce `TBOUND_HEADING_STEP` from 20° to 10°. The coarse pre-pass must be able to land within the `arrivalRadiusNm` (2 nm) circle of destinations approached via narrow waterways. At 20° heading steps and ~24 nm per time step, the probability of a coarse candidate landing within 2 nm of Gothenburg's approach corridor is too low; the coarse pass consistently returns T_bound=null, leaving the fine pass unconstrained. At 10° steps the coarse pass tries 36 headings per frontier point (vs. 18 at 20°) — sufficient resolution to cover the approach heading. This makes the coarse pass ~2× more expensive in polar and land-check calls, but without a valid T_bound the fine pass wastes all of its compute expanding unconstrained across the full GRIB domain. Not yet implemented. May be superseded if BUG-43/BUG-44/BUG-45 drive a broader rethink of the frontier expansion strategy. |
| D16 | `pruneToFrontier` keeps the **top-2** candidates per sector (instead of top-1) to prevent a farther open-water escape from silently discarding a closer channel-threading candidate in the same 1° bearing sector (BUG-45). OpenCPN uses topologically correct closed-contour merging instead, which provably preserves all structurally distinct paths at the cost of a significant refactor. Top-2 was chosen as a deliberate simplification that fixes the immediate failure mode without changing the pruning algorithm's structure. The full closed-contour merge remains a candidate for a future sprint if top-2 proves insufficient. |

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

**Coarse-to-fine pass measurement (2026-05-26) — REQ-43:**

After REQ-41 (edge-tile index) reduced land checks from 3.4 ms/call to 0.002 ms/call, polar lookups became the dominant cost (85% of total runtime). The coarse pre-pass was re-evaluated: does it still reduce the number of polar lookups in the fine pass?

Instrumentation added: `coarsePolarLookups` (polar checks in Pass 1) and `fineHeadingsTested` (headings entering Pass 2 after band filtering). For each step, the input frontier size = `coarsePolarLookups / 18`; total possible fine headings = input × 72. Results from the REQ-37 test route (18 fine-pass steps, 168,425 candidates):

| Step | Input frontier | coarseLookups | fineHeadingsTested | % of headings skipped |
|---|---|---|---|---|
| 29 | 37 | 666 | 2,664 | **0%** |
| 30 | 287 | 5,166 | 20,664 | **0%** |
| 31 | 246 | 4,428 | 17,712 | **0%** |
| 32 | 238 | 4,284 | 17,136 | **0%** |

Every step: **0% of fine headings skipped**. Every band survives the coarse filter for this polar. The coarse pass adds ~18 polar lookups per frontier point per step and eliminates nothing.

**Conclusion:** The coarse-to-fine pass provides no benefit with this polar. The no-go zone is too small for any 20° band to be fully dead — at least one fine heading in every band passes the polar check. The coarse pass is pure overhead. REQ-43 removes it.

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
