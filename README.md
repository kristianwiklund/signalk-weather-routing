# signalk-weather-routing

**Experimental.** This plugin has not been validated by sailing the calculated routes. Bug reports and improvement proposals are welcome.

A SignalK plugin that calculates time-optimal sailing routes using GRIB2 weather forecasts and the isochrone method.

## Features

- Isochrone routing optimised for time-to-destination
- Wind data from GRIB2 files (tested with [OpenSkiron](https://openskiron.org/en/icon-gribs) ICON-EU, 7 km grid)
- Polar diagrams in ORC/OpenCPN semicolon-delimited CSV format
- Automatic land avoidance using [GSHHG](https://www.soest.hawaii.edu/pwessel/gshhsg/) high-resolution coastlines
- Optional 0.5 NM safety margin that closes narrow passages below the algorithm's resolution
- Motor fallback: configurable boat-speed threshold and engine speed
- Wait-for-wind: frontier points survive calm patches rather than being discarded
- Max wind speed and max wave height routing constraints
- Routes saved to SignalK `resources/routes` — visible in freeboard-sk automatically
- GRIB wind overlay on the map with a time scrubber to step through forecast timesteps
- Routing through intermediate waypoints: select a saved SignalK route to constrain the path
- Leaflet-based webapp with live isochrone rendering during calculation
- Performance target: Raspberry Pi 3–5; tested on Intel NUC

![Weather routing webapp](screenshot2.jpg)

## Requirements

- SignalK server >= 2.0.0 (Node.js >= 18)
- A GRIB2 weather forecast file (e.g. from [OpenSkiron](https://openskiron.org/en/icon-gribs))
- A polar diagram file in ORC/OpenCPN CSV format

## Installation

See [DEVELOPMENT.md](DEVELOPMENT.md) for build and install instructions.

The land index is bundled with the package — no download is needed at install or runtime.

## Configuration

Open **Server → Plugin Config → Weather Routing** in the SignalK admin UI.

### Required settings

| Setting | Description |
|---|---|
| `gribDir` | Full path to the directory containing GRIB2 forecast files |
| `polarPath` | Full path to the polar diagram CSV file |

### Algorithm tuning

These settings control the isochrone algorithm. The defaults work well for most use cases.

| Setting | Default | Description |
|---|---|---|
| `headingStep` | 5° | Angular resolution when evaluating candidate headings. Lower values produce more accurate routes at the cost of longer calculation time. |
| `sectorSize` | 1° | Bearing sector width for frontier pruning. After each timestep the top 2 candidates per sector are kept. |
| `minBoatSpeed` | 0.3 kn | Headings producing less than this effective speed are discarded. Prevents near-stationary drift being treated as a viable route. |
| `arrivalRadiusNm` | 2 NM | Distance from the destination at which the route is considered complete. |
| `coneHalfAngle` | 100° | Half-angle of the directional cone applied when the straight-line path to the destination is clear of land. Headings outside this cone are not evaluated. Disabled automatically per frontier point when land blocks the direct path. |
| `coneDisableLookaheadNm` | 100 NM | How far ahead to check for land when deciding whether to disable the cone for a given frontier point. |
| `maxHeadingChange` | 120° | Maximum course change allowed between consecutive timesteps, preventing unrealistic zig-zagging. |

### UI settings

| Setting | Default | Description |
|---|---|---|
| `hideTestButtons` | true | When enabled, hides the Run test / Helsinki test / Gothenburg test buttons in the webapp. |

**Test buttons:** When `hideTestButtons` is set to `false`, three test buttons appear in the webapp: **Run test at Öregrund**, **Helsinki test**, and **Gothenburg test**. Each button pre-fills the routing form with a predefined start point, destination, and departure time and starts the calculation immediately. Intended for development and validation.

## Usage

Open the webapp at `http://<your-signalk-host>:3000/signalk-weather-routing/`.

### Basic workflow

1. Set a **departure point**: click **Set on map** and click the map, or pick an existing SignalK route or waypoint from the dropdown (for routes, the last waypoint is used as the start)
2. Set a **destination** the same way
3. Optionally select a **Route waypoints** source to route through intermediate waypoints (see below)
4. Set a **departure time**
5. Configure any routing options (see below)
6. Click **Calculate Route**

Isochrones are drawn live on the map as the calculation progresses. The finished route is displayed with wind barbs and ETA at each waypoint and saved automatically to SignalK `resources/routes`.

### Route waypoints

The **Route waypoints** dropdown (below the departure section) lists all routes saved in SignalK `resources/routes`. Selecting a route constrains the calculated route to pass through the route's waypoints in order:

- The route's **first waypoint** becomes the departure point
- The route's **last waypoint** becomes the destination
- Any **intermediate waypoints** are required passing points; they are shown as numbered markers on the map

The algorithm calculates each leg independently (start → wp1 → wp2 → … → destination) and concatenates the results into a single route.

Selecting a route in this dropdown overrides any manually placed start/end markers. Manually placing start or end on the map (or selecting a departure resource for REQ-62) resets this dropdown.

### GRIB files

The **GRIB Forecast** panel lists all `.grib2` files found in the configured `gribDir`. Each file has a checkbox — uncheck a file to exclude it from routing and remove its bounding box from the map. When multiple files are loaded they are combined automatically; the algorithm always picks the most recent file that covers each point in space and time.

Click **Reload GRIB directory** to pick up newly downloaded files without restarting SignalK.

### Routing options

#### Coast avoidance

Enabled by default. The router will not cross land. Uncheck to disable for open-ocean routes where land avoidance is unnecessary.

**Safety margin (0.5 NM):** Dilates the coastline outward by 0.5 NM, closing passages and anchorages narrower than that distance. Useful when the standard land mask leaves the route uncomfortably close to shore or through passages the algorithm cannot thread accurately.

#### Motor

Two fields must both be set to enable motoring:

- **Motor below _ kn**: The boat-speed threshold. When the polar-computed speed for a heading falls below this value, the motor kicks in instead.
- **Motor speed _ kn**: The speed used when motoring.

Leave either field empty to disable the motor entirely. Example: set "Motor below 3 kn, speed 5 kn" to motor at 5 kn whenever the polar predicts less than 3 kn of boat speed — covering light-wind patches and unfavourable angles.

#### Wait for wind

When checked, a frontier point that produces no usable speed for any heading (after motor evaluation) stays in place for one timestep instead of being discarded. This allows the router to "wait" through a calm patch and resume sailing when wind returns in a later forecast step.

Without this option, a frontier point with no viable headings is simply dropped from the frontier. With it, the point is kept at the same position — at the cost of time — and re-evaluated in the next step.

#### Max wind and max wave

- **Max wind (kn):** Candidate positions where the forecasted wind speed exceeds this value are discarded. The router will not route through that area regardless of time savings. Leave empty for no limit.
- **Max wave (m):** Candidate positions where the significant wave height exceeds this value are discarded. Only applied when wave data (SWH bands) is present in the loaded GRIB file — OpenSkiron ICON-EU EWAM files include both wind and wave bands. Leave empty for no limit.

### Wind overlay

The map displays a GRIB wind overlay showing wind speed and direction as arrows. Hovering over an arrow shows a tooltip with wind speed, direction, and the boat's predicted speed at that point from the polar diagram. A time scrubber below the map controls which forecast timestep is shown.

- Before a route is calculated the scrubber spans the full GRIB time range
- After a route is calculated the scrubber range matches the route (departure to estimated arrival), aligned with the conditions graph
- Dragging the scrubber highlights the route waypoint nearest in time and draws a pink overlay on the corresponding leg

Use the **Wind overlay** checkbox to toggle the overlay on or off without affecting the scrubber or route display.

### Conditions graph

A graph below the map shows wind speed, wave height, and boat speed along the calculated route over time. The graph and the time scrubber above it span the same horizontal extent — the left and right edges are aligned at any window width. Click the graph to expand it to fullscreen. Click again or press Escape to return to normal.

The colored bar beneath the graph shows which GRIB file provided the weather data for each leg of the route, using the same color assigned to that file's bounding box on the map.

When the route was calculated through intermediate waypoints (via the **Route waypoints** dropdown), thin dashed vertical lines mark each intermediate waypoint's position on the time axis, labelled WP1, WP2, etc.

## Polar diagram format

Standard ORC/OpenCPN semicolon-delimited CSV. The first row is a header with TWS values; subsequent rows start with a TWA value followed by boat speeds:

```
twa/tws;6;8;10;12;14;16;20
52;4.5;5.2;5.8;6.1;6.3;6.4;6.5
...
```

**Wind speed cap:** The polar's highest TWS column is a hard cap. Wind above that value is evaluated at the maximum column speed — the router does not extrapolate beyond measured data. This prevents the router from favouring high-wind areas due to artificially inflated speed predictions.

**Minimum TWA:** The polar's lowest TWA row is the close-hauled angle. The router returns zero speed for any heading tighter than this — the boat cannot sail into the wind. Combined with the motor option, the motor kicks in for those headings when configured.

## Land data (GSHHG)

Land avoidance uses the [GSHHG](https://www.soest.hawaii.edu/pwessel/gshhg/) (Global Self-consistent Hierarchical High-resolution Geography) dataset, version 2.3.7, published by NOAA and the University of Hawaii. GSHHG is distributed under the [GNU Lesser General Public License v3](https://www.gnu.org/licenses/lgpl-3.0.html).

The plugin bundles pre-built binary indices derived from the GSHHG `h` (high, ~7 km) resolution tier. If you need to regenerate the indices (e.g. to change resolution), see [DEVELOPMENT.md](DEVELOPMENT.md).

## Notes

- GRIB files are not downloaded automatically — obtain them from [OpenSkiron](https://openskiron.org/en/icon-gribs) or another provider and place them in the configured `gribDir`
- Routing accuracy depends on polar quality and forecast accuracy
- The algorithm cannot thread passages narrower than approximately 1 NM at typical leg lengths
- This plugin has not been used for actual navigation; treat calculated routes as planning aids only
