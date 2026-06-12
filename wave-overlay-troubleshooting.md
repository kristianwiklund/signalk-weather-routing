# Wave overlay troubleshooting

## Symptom

The wave height colour raster overlay shows a coastline-shaped boundary between open-water wave heights and the 9999 fill value (land). This boundary is recognisable as the coastline but appears at the wrong position relative to the GSHHG coastline drawn by Leaflet's base map tiles.

## Attempted fixes and investigations

### 1. Half-cell offset in bilinear interpolation

**Hypothesis:** GDAL's GRIB driver uses PixelIsPoint (pixel centre at grid point), but our `(lat - latMin) / latStep` formula assumes pixel corner alignment. A 0.5-cell shift might be needed.

**Applied:** Subtracted 0.5 from `latF` and `lonF` in `src/lib/grib.ts` bilinear function, also patched `dist/lib/grib.js`.

**Result:** Made the overlay worse — shifted further. Reverted immediately.

**Conclusion:** GDAL's GRIB driver IS PixelIsPoint. The original formula `latF = (lat - latMin) / latStep` is correct. Verified by comparing dataset-level geoTransform metadata across all five GRIB files.

---

### 2. Custom L.Layer rendering (replacing L.ImageOverlay)

**Hypothesis:** `L.ImageOverlay` maps pixel corners to lat/lng bounds, but the pixel centres (where our data lives) might not align with these corners, causing a systematic offset.

**Applied:** Replaced `L.ImageOverlay(canvas.toDataURL(), gridBounds)` with a custom `L.Layer` that renders each grid row individually using `ctx.drawImage` and `map.latLngToLayerPoint`. Each row is placed at pixel coordinates calculated from `lat ± latStep/2`, so pixel centres map exactly to data points.

**Result:** Produced identical overlay to the L.ImageOverlay approach. No visible difference in coastline position.

**Conclusion:** L.ImageOverlay already maps pixel centres correctly when the canvas has `(nLat+1) × (nLon+1)` pixels and bounds are expanded by `± latStep/2`. The rendering code is not the cause of the skew.

Reverted to committed L.ImageOverlay approach for simplicity. Added click-to-inspect feature (shows nearest data point lat/lon on map click) to aid future debugging.

---

### 3. Frontend position verification (click-to-inspect)

**Method:** Click on the map at a coastline location. Popup shows the nearest data point's lat/lon and the clicked lat/lon. If the data point position differs from the clicked position, the rendering is offset.

**Result:** At (59.658, 17.976), the nearest data point was at (59.656, 17.969) — a difference of 0.002° lat and 0.007° lon (~500 m), well within the 0.0625° (~7 km) grid resolution.

**Conclusion:** The data values are correctly geolocated by the rendering pipeline. The perceived coastline mismatch is not a rendering offset.

---

### 4. Backend data flow verification

Verified each step in the data pipeline:

| Step | File | Lines | Finding |
|------|------|-------|---------|
| GRIB file open | `dist/lib/grib.js` | 63-68 | `latMin = latMax - latStep * (nLat - 1)` — correct for GDAL north-up convention |
| Row flip | `dist/lib/grib.js` | 201-207 | `flipRows` swaps GDAL row order so index 0 = southmost lat (latMin) |
| Bilinear | `dist/lib/grib.js` | 231-246 | `latF = (lat - grib.latMin) / grib.latStep` — no offset, correct |
| getWaveAt | `dist/lib/grib.js` | 201-225 | Calls bilinear with `swhByTime` data, returns `undefined` for values ≥ 100 |
| MultiFileWindProvider | `dist/lib/windprovider.js` | — | Delegates to `getWaveAt` on the per-file grib object |
| wave-grid endpoint | `src/index.ts` | 520-555 | Union of all loaded files' extents, iteration by `lat = latMin + i * latStep`, filters by spatial/temporal coverage AND `swhByTime` availability |

All steps produce consistent coordinates. The bilinear function correctly maps the flipped array (south-to-north) to the lat/lon range.

---

### 5. GRIB file consistency check

Checked all five `.grb2` files for:
- Same grid dimensions (113 × 84)
- Same resolution (0.0625°)
- Same geoTransform (15.96875, 0.0625, 0, 63.21875, 0, -0.0625)
- Same band georeferencing (no per-band geoTransform override)
- Same noData value (9999)

All files are consistent. Wave bands (HTSGW) and wind bands (UGRD/VGRD) share the same grid definition.

---

### 6. Coordinate reference system check

Retrieved the GRIB file's SRS from GDAL:

```
GEOGCS["Coordinate System imported from GRIB file",
  DATUM["unnamed",
    SPHEROID["Sphere",6371229,0]],
  ...
```

Proj4: `+proj=longlat +R=6371229 +no_defs`

The DWD/ICON-EU model uses a sphere of radius 6371229 m. Leaflet uses WGS84 (EPSG:3857 Web Mercator, based on ellipsoid 6378137 m). At 60°N, the difference in ground distance per degree longitude is ~65 m — negligible relative to the 7 km grid cell size.

---

### 7. Raw GRIB coastline vs GSHHG coastline

Read the raw wave data from a GRIB file and printed the land/water boundary along the Stockholm archipelago latitude (~59.34°N). The GRIB data shows:

| Longitude | Value | Interpretation |
|-----------|-------|----------------|
| ≤ 17.71875 | LAND (9999) | Mainland Sweden |
| 17.78125 | 0.275 m | Water (archipelago) |
| 18.34375 | LAND | Island |
| 18.71875 | 0.015 m | Water |
| ... | ... | ... |
| 19.46875 | LAND | Island |
| 19.96875 | 0.015 m | Open Baltic |

At this latitude, the GSHHG coastline (used by Leaflet tiles) shows water starting around 18.0–18.2°E. The GRIB data shows water starting at 17.78°E — about **0.2° (~14 km) further west**.

### 8. Mixed-grid GRIB files — confirmed root cause (2026-06-12)

Loading the Denmark GRIB (`Denmark_ICON_EU_EWAM_20260606-00.grb2`) with XyGrib shows 0.64 m wave height at N56°55.6, E11°18.7 (Kattegat). Our overlay shows nothing there — the data is rendered over the Danish land mass instead.

**Finding**: The OpenSkiron ICON-EU EWAM files are combined files containing two model grids:

| Grid | Parameters | GDAL rasterSize |
|------|-----------|-----------------|
| Atmospheric (ICON-EU wind) | 0.0625° × 0.0625° | 132 × 113 |
| Ocean wave (EWAM) | 0.1° × 0.05° | 83 × 141 |

GDAL opens the file and takes its geoTransform from the **first band** (CAPE, atmospheric). All 1389 bands — including the 553 oceanographic (discipline=10) bands — are presented through the atmospheric 132×113 grid. When `readGrib` reads the HTSGW band at pixel (88, 50) corresponding to (11.28°E, 56.91°N), GDAL returns 0 because the HTSGW data is not at those indices in the atmospheric grid.

**Verification**: Extracting only the discipline=10 messages (Buffer scan for `"GRIB"` marker + discipline byte + message length) and writing them to a GDAL `/vsimem/` virtual file gives the correct native grid (83×141, 0.1°×0.05°) and reads 0.655 m at the Kattegat target — matching XyGrib's 0.64 m within grid-cell interpolation error.

**Scope**: All OpenSkiron ICON-EU EWAM files are combined atmospheric+ocean files. The Baltic Centre file uses the same format and has the same bug — the ~14–30 km position error visible there is the same root cause, just less obvious because adjacent land is nearby.

## Confirmed root cause

`readGrib` uses `ds.geoTransform` (the atmospheric grid) for all bands including HTSGW. The HTSGW bands live on the EWAM 0.1°×0.05° grid, not the ICON-EU atmospheric grid. Reading them through the atmospheric grid gives wrong coordinates and wrong values. The rendering code is correct — the bug is in GRIB loading.

## Fix

In `loadGrib`, after reading wind data from the main GDAL dataset, separately extract all discipline=10 (oceanographic) GRIB2 messages from the file binary, write them to a `/vsimem/` virtual GDAL dataset, and read HTSGW from that dataset with its correct native grid. Store the ocean grid parameters separately in `GribData.swhGrid` so `getWaveAt` uses the correct coordinate system for wave interpolation.

---

## Investigation status: fix ready for implementation (2026-06-12)
