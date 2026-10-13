# Changelog

## Upcoming

- **Grib Manager** (REQ-131): the sidebar GRIB file list is replaced by a "Grib Manager" modal — each loaded file shown on a coverage timeline (to scale), with staleness/wave badges, a now line, a low-confidence band past the forecast skill horizon, and granularity-change markers. Includes an optimised-combination proposal (departure-aware) and Accept proposed / Enable all controls.
- Wind GRIB selection now ranks by model run (`referenceTime`) → finest granularity → finest spatial resolution → file mtime, in a single pass — a re-downloaded old forecast no longer overrides a newer model run (resolves BUG-129).
- New `/grib-times` (per-file actual timestep axes) and `/grib-combination` (departure-aware geographic stitch) endpoints.
- Route coverage bar colours each leg by the GRIB file that supplied it (REQ-129); conditions graph shows a low-confidence band past the configurable `forecastSkillHorizonHours` (default 96) (REQ-132).
- "Ocean current" label used consistently (sidebar + manager) to avoid confusion with the now-grib.
- **Upload GRIB** (REQ-139): an "Upload GRIB…" button in the Grib Manager uploads one or more GRIB files directly into `gribDir` (no external copy + reload needed). On a name collision the user chooses to archive the existing file or skip; uploaded files are validated and invalid ones are rejected with a clear reason.
- Plugin test suite now passes when installed with `--ignore-scripts` (as the Signal K plugin registry does): the gdal-async native binary is put in place before any GRIB code loads, not only at plugin start (BUG-138).

## 0.8.0

- Error message clarifies "No wind GRIB files" when only current GRIB is loaded (BUG-83)
- Region avoidance checkbox label click no longer double-toggles (BUG-133)
- Isochrones not drawn during routing when checkbox unticked (BUG-128)
- Polar low-wind fix: boat speed linearly interpolates toward zero below polar minimum TWS instead of clamping to full speed (BUG-58)
- Fixed scrubber time axis: uses actual GRIB times instead of even-spacing reconstruction (BUG-134: variable ICON-EU spacing caused 12+ hour divergence at later forecast steps)
- Waypoint labels toggle with configurable interval (hours); Helsinki test destination updated (REQ-125, REQ-126)
- Scrubber coverage bar now updates when route locks the time range; added Full/Route range toggle button (BUG-132)
- Fixed config corruption: toggling region avoidance no longer drops gribDir and polarPath (BUG-131: `savePluginOptions` now passes full settings object)
- Code quality: all source files formatted with prettier; eslint passes with 0 errors and 0 warnings; accepted `any` usages documented with inline disables (BUG-130)
- Region avoidance selections now persist across SignalK restarts (BUG-125: fixed `savePluginConfig` → `savePluginOptions`)
- Land data distributed as separate npm package `@kristianwiklund/wr-land-data`; main package reduced from 93 MB to 85 kB (REQ-128)
- P3c code review fixes: extracted `computeGridBounds()` grid helper (BUG-115); separated config mutation from region loading (BUG-116); added `escapeHtml()` for XSS-safe innerHTML (BUG-117)
- P3b code review fixes: rejection counts in failure error messages (BUG-124); extracted `closestTo()` helper (BUG-121); crash-safe temp file cleanup in polar test (BUG-123)
- P3a code review fixes: standardised `node:` fs imports (BUG-119); deleted dead `dilate.ts` (BUG-118); removed dead reduce in failure path (BUG-113); merged redundant wave-grid coverage check (BUG-114)
- P2 code review fixes: removed SSE `console.log` debugging calls (BUG-111); deduplicated `DEG_TO_RAD` constant across codebase (BUG-110); fixed `buildRegionIndex` key generation (BUG-108); centralised gdal-async `as any` casts in typed wrappers (BUG-106); defined `SignalKApp` interface replacing `app: any` (BUG-107)
- P1 code review fixes: removed optional chaining overhead on polar hot path (BUG-97); isochrone timing logs guarded with `process.env.DEBUG` (BUG-96); current drift cosine uses correct latitude (BUG-94); `getWaveAt` validates bounds before bilinear (BUG-104); `savePluginConfig` awaited in loadRegions (BUG-103)
- P0 code review fixes: lat/lon validation accepts 0° coordinates (BUG-92); `selectFile` and `getWave` no longer silently fall back to wrong GRIB file (BUG-93, BUG-101); GRIB load failures surfaced to user (BUG-95); `/avoid-regions` rejects invalid input when no regions loaded (BUG-99); waypoint GRIB coverage always checked (BUG-100); invalid departure time rejected with clear error (BUG-102)
- Hires land data fix: `prepare-land-data.py` now accepts `-r f` to build genuine f-tier (full resolution) GSHHG indices; corrected binaries uploaded to the hires-land-data repo as release assets (BUG-98)
- "Use vessel position" button reads the vessel's current GPS position from the SignalK WebSocket stream and sets it as the departure point; disabled when no position is available (REQ-89)
- Per-file archive button (🗑) on each GRIB file row moves the file to an `archive/` subfolder after confirmation; "Remove old GRIBs (N)" button archives all files whose forecast has ended (REQ-120)
- Scrubber coverage bar now shows one coloured row per loaded GRIB file, stacked vertically, so overlapping files are all visible simultaneously (REQ-117)
- "Now" marker on the scrubber is a yellow downward-pointing triangle above the coverage rows, replacing the previous invisible white line (REQ-118)
- Scrubber time range now updates live when GRIB file checkboxes are toggled; unchecking all wind files clears the wind overlay immediately (BUG-84, BUG-85)
- "Use as departure" button next to the scrubber copies the displayed forecast time into the departure time field (REQ-111)
- ⏮ jump button on each GRIB file row jumps the scrubber to that file's start time (REQ-116)
- Ocean current GRIB support (REQ-91): drop RTOFS or CMEMS current GRIB files into the GRIB directory alongside wind files — the plugin auto-detects them by GRIB metadata (UOGRD/VOGRD bands) and applies ocean current U/V vectors to the routing algorithm, giving correct ground-track advancement. Includes a current vector overlay on the map (toggleable under Layers), sidebar staleness indicator, and tidal-stream disclaimer.
- Fix wind arrows showing as calm rings before polar data is received (BUG-81)
- Fix routing with multiple GRIB files: frontier now stops at the spatial boundary of the file that is temporally valid for the current step, instead of silently using wind data from a different file's time period (BUG-75)
- Optional high-resolution (GSHHG f-tier, ~100 m) land avoidance: copy the hires index files from [weather-routing-hires-land-data](https://github.com/kristianwiklund/weather-routing-hires-land-data) into the plugin's `data/` directory and the plugin switches automatically (REQ-113)
- "Land overlay" checkbox label shows "(hires)" when hires land data is active (REQ-114)

## 0.7.3

- Fix ARM64 startup: binary filename is `gdal.node`, not `gdal.mod.node`

## 0.7.2

- Fix ARM64 binary copy failure on startup: `ensure-gdal-binary` now uses the correct binding directory name (`node-v{abi}-{platform}-{arch}`) and destination path (removed spurious double `lib/` segment)

## 0.7.1

ARM64 (Raspberry Pi) support.

- Plugin now starts correctly on linux/arm64 (Raspberry Pi 3/4/5) — prebuilt gdal-async native binaries are distributed as optional npm packages `@kristianwiklund/wr-gdal-linux-x64` and `@kristianwiklund/wr-gdal-linux-arm64`, covering Node 22 and Node 24
- Binaries are sourced from `kristianwiklund/wr-gdal-async-prebuilt` and published alongside the main plugin on each release

## 0.7.0

Visual improvements and polish.

- GRIB model run timestamp shown per file in sidebar (amber > 12 h old, red > 24 h old)
- Map click shows wind speed/direction and wave height from active overlays
- Isochrones are now a toggleable layer (Layers section checkbox)
- Land overlay checkbox is disabled (greyed out) during active route calculation
- Conditions graph dual-axis layout fixed when wind speed m/s mode is enabled
- Conditions graph no longer shows a false zero boat speed at the departure point
- Wave overlay now clears immediately when its GRIB file is unticked
- Route failure popup shows the correct cause (wind / land / GRIB boundary)

## 0.6.0

Settings, diagnostics, unit preferences, and App Store preparation.

- Unit preferences: speed, distance, and depth follow the active SignalK unit preset throughout the UI; a per-plugin `windSpeedMs` option overrides wind speed display to m/s
- Git commit SHA displayed as small text at the bottom of the settings sidebar
- All isochrone algorithm parameters (heading step, sector size, arrival radius, cone angle, etc.) are now configurable as plugin settings with documented defaults
- GitHub Actions CI workflow: build and test on every push and pull request
- GitHub Actions publish workflow: publishes to npm on version tag push
- App Store metadata: icon, screenshots, category keyword

## 0.5.0

UI enrichment, overlays, and route management.

- Conditions graph below the map: wind speed, wave height, and boat speed along the route over time; click to fullscreen
- Wave height raster overlay (blue-to-red colour scale, configurable upper bound)
- GRIB wind overlay with time scrubber; wind barb redesign (arrowhead toward wind, calm symbol for light wind)
- Each GRIB file has a checkbox — uncheck to exclude from routing and remove its bounding box
- Time scrubber highlights the nearest route waypoint and leg
- Conditions graph aligned with scrubber; graph marks intermediate waypoints
- Departure from a saved SignalK route or waypoint via dropdown
- Route through intermediate waypoints: select a saved route to constrain the path
- Explicit route save dialog (name prompt before saving to `resources/routes`)
- Test buttons (Öregrund, Helsinki, Gothenburg) controllable via plugin setting

## 0.4.0

Routing quality and robustness.

- Per-position directional cone: cone is disabled for frontier points where the direct path to the destination crosses land, allowing escape from enclosed harbours and archipelagos
- Maximum heading change per step (120°) prevents single-step reversals
- Top-2 candidates per bearing sector preserves channel-threading paths alongside open-water candidates
- Motor fallback: configurable threshold and motor speed; triggers when polar speed falls below the threshold
- Wait-for-wind: frontier points with no viable headings stay in place for one step rather than being discarded
- Maximum wind speed and maximum wave height routing constraints
- Coarse pre-pass removed — measured 0% heading skip rate; pure overhead eliminated
- Partial route displayed when the frontier collapses, showing how far the algorithm got

## 0.3.0

Land avoidance overhaul and bundled coastline data.

- Safety margin (0.5 NM): dilated-union land index closes passages narrower than the algorithm's resolution; separate layer shown in the land overlay when active
- Pre-built GSHHG high-resolution coastline indices bundled in the package — no download at install or runtime
- Build script (`prepare-land-data.py`) for regenerating indices from GSHHG source

## 0.2.0

Algorithm improvements and performance.

- Edge-tile spatial index: O(k) segment land checks replacing O(n) full polygon scan — ~1000× faster land avoidance
- T_bound bounding heuristic: discards frontier points that cannot improve on the best known arrival time
- Per-step timing breakdown logged for profiling

## 0.1.0

Initial release.

- Isochrone routing optimised for time-to-destination
- GRIB2 wind data from OpenSkiron ICON-EU (7 km grid)
- GSHHG high-resolution coastline land avoidance
- ORC/OpenCPN polar diagram support
- Routes saved to SignalK `resources/routes`
- Leaflet webapp: map, live isochrone rendering, route with wind barbs and ETAs
- Server-sent events for live calculation progress
