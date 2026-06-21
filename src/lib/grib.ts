// GRIB2 loading and interpolation for wind/wave (OpenSkiron/ICON-EU) and ocean current (RTOFS/CMEMS) files.

import * as fs from 'node:fs/promises';
import * as nodepath from 'node:path';
import * as gdal from 'gdal-async';
import { CurrentGribData, GribData, GribFileMeta, WindVector, LoadedGribFile, ChannelKey, ChannelGrid } from '../types';

export const GRIB_EXTENSIONS = new Set(['.grib2', '.grib', '.grb2', '.grb']);

// Sanitize an uploaded/external filename: basename only (no path traversal) with a GRIB
// extension. Returns null for anything that could escape the target directory or isn't a GRIB.
export function sanitizeGribName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = nodepath.basename(raw);
  if (!base || base === '.' || base === '..') return null;
  if (!GRIB_EXTENSIONS.has(nodepath.extname(base).toLowerCase())) return null;
  return base;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- gdal-async typings incomplete (BUG-106) */
// Typed wrappers for gdal-async APIs that have incomplete TypeScript definitions (BUG-106).
// The `as any` escapes are centralised here so the rest of the file is type-checked normally.
type GdalBand = gdal.RasterBand;

async function readBandPixels(band: GdalBand, nLon: number, nLat: number): Promise<Float32Array> {
  const buf = new Float32Array(nLon * nLat);
  await (band.pixels as any).readAsync(0, 0, nLon, nLat, buf);
  return buf;
}

function vsimemCopy(data: Buffer, path: string): void {
  (gdal.vsimem as any).copy(data, path);
}

function vsimemRelease(path: string): void {
  (gdal.vsimem as any).release(path);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function scanGribDir(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && GRIB_EXTENSIONS.has(nodepath.extname(e.name).toLowerCase()))
    .map((e) => nodepath.join(dir, e.name))
    .sort();
}

export async function readGribMeta(filePath: string): Promise<GribFileMeta> {
  const stat = await fs.stat(filePath);
  const ds = await gdal.openAsync(filePath);
  try {
    const gt = ds.geoTransform;
    if (!gt) throw new Error('GRIB2 file has no geotransform');

    const lonMin = gt[0];
    const lonStep = gt[1];
    const latMax = gt[3];
    const latStep = -gt[5];
    const nLon = ds.rasterSize.x;
    const nLat = ds.rasterSize.y;
    const latMin = latMax - latStep * (nLat - 1);
    const lonMax = lonMin + lonStep * (nLon - 1);

    const bandCount = ds.bands.count();
    const windTimeMs = new Set<number>();
    const currentTimeMs = new Set<number>();
    let referenceTimeMs: number | undefined;
    let hasWave = false;

    for (let i = 1; i <= bandCount; i++) {
      const band = ds.bands.get(i);
      const md = band.getMetadata() as Record<string, string>;
      const element = md['GRIB_ELEMENT'] ?? '';
      const vtStr = md['GRIB_VALID_TIME'];
      if (!vtStr) continue;
      const ms = parseInt(vtStr, 10) * 1000;

      if (element === GRIB_U_ELEMENT && md['GRIB_SHORT_NAME'] === GRIB_HEIGHT_LEVEL) {
        windTimeMs.add(ms);
        if (referenceTimeMs === undefined) {
          const refStr = md['GRIB_REF_TIME'];
          if (refStr) referenceTimeMs = parseInt(refStr, 10) * 1000;
        }
      } else if (element === GRIB_CURRENT_U_ELEMENT) {
        currentTimeMs.add(ms);
        if (referenceTimeMs === undefined) {
          const refStr = md['GRIB_REF_TIME'];
          if (refStr) referenceTimeMs = parseInt(refStr, 10) * 1000;
        }
      } else if (element === GRIB_SWH_ELEMENT) {
        hasWave = true;
      }
    }

    if (windTimeMs.size === 0 && currentTimeMs.size === 0 && !hasWave) {
      throw new Error(
        `GRIB2 file contains neither wind bands (${GRIB_U_ELEMENT}/${GRIB_HEIGHT_LEVEL}), ` +
          `ocean current bands (${GRIB_CURRENT_U_ELEMENT}), nor wave bands (${GRIB_SWH_ELEMENT}). ` +
          `Supported: OpenSkiron/ICON-EU (wind/wave), RTOFS/CMEMS (current), WaveWatch III (wave).`,
      );
    }

    const type: 'wind' | 'current' | 'wave' =
      windTimeMs.size > 0 ? 'wind' : currentTimeMs.size > 0 ? 'current' : 'wave';
    const timeMs = type === 'wind' ? windTimeMs : currentTimeMs;
    const sortedMs = Array.from(timeMs).sort((a, b) => a - b);

    return {
      path: filePath,
      mtime: stat.mtimeMs,
      type,
      latMin,
      latMax,
      lonMin,
      lonMax,
      latStep,
      lonStep,
      timeStart: new Date(sortedMs[0]),
      timeEnd: new Date(sortedMs[sortedMs.length - 1]),
      nTimes: sortedMs.length,
      referenceTime: new Date(referenceTimeMs ?? sortedMs[0]),
      hasWave,
    };
  } finally {
    ds.close();
  }
}

// Scoped to OpenSkiron/ICON-EU GRIB2 format
const GRIB_U_ELEMENT = 'UGRD';
const GRIB_V_ELEMENT = 'VGRD';
const GRIB_HEIGHT_LEVEL = '10-HTGL';
const GRIB_SWH_ELEMENT = 'HTSGW'; // significant height of combined wind waves and swell
const GRIB_SWH_SHORT_NAME = '0-SFC';

// Ocean current GRIB element names (discipline=10, cat=1, parm=2/3), consistent across RTOFS and CMEMS.
const GRIB_CURRENT_U_ELEMENT = 'UOGRD';
const GRIB_CURRENT_V_ELEMENT = 'VOGRD';

interface BandEntry {
  band: gdal.RasterBand;
  element: string;
  validTimeMs: number;
}

// Generic GRIB loader: opens any GRIB2 file, detects which channels are present
// (windU/windV/currentU/currentV/swh), reads them all, and returns a LoadedGribFile.
// Replaces the type-specific loadGrib/loadCurrentGrib + the adapter pattern (REQ-141).
export async function loadGribFile(meta: GribFileMeta): Promise<LoadedGribFile> {
  const ds = await gdal.openAsync(meta.path);
  try {
    const bandCount = ds.bands.count();
    if (bandCount === 0) throw new Error('GRIB2 file contains no bands');

    const gt = ds.geoTransform;
    if (!gt) throw new Error('GRIB2 file has no geotransform');

    const lonMin = gt[0];
    const lonStep = gt[1];
    const latMax = gt[3];
    const latStep = -gt[5];
    const nLon = ds.rasterSize.x;
    const nLat = ds.rasterSize.y;
    const latMin = latMax - latStep * (nLat - 1);
    const grid = { latMin, latStep, lonMin, lonStep, nLat, nLon };

    // Scan all bands; classify each into a channel key by element/shortName.
    const channelBands = new Map<string, Map<number, gdal.RasterBand>>();
    const swhBands = new Map<number, gdal.RasterBand>();

    for (let i = 1; i <= bandCount; i++) {
      const band = ds.bands.get(i);
      const md = band.getMetadata() as Record<string, string>;
      const element = md['GRIB_ELEMENT'] ?? '';
      const shortName = md['GRIB_SHORT_NAME'] ?? '';
      const vtStr = md['GRIB_VALID_TIME'] ?? '';
      if (!vtStr) continue;
      const ms = parseInt(vtStr, 10) * 1000;

      if (element === GRIB_U_ELEMENT && shortName === GRIB_HEIGHT_LEVEL) {
        if (!channelBands.has('windU')) channelBands.set('windU', new Map());
        channelBands.get('windU')!.set(ms, band);
      } else if (element === GRIB_V_ELEMENT && shortName === GRIB_HEIGHT_LEVEL) {
        if (!channelBands.has('windV')) channelBands.set('windV', new Map());
        channelBands.get('windV')!.set(ms, band);
      } else if (element === GRIB_CURRENT_U_ELEMENT) {
        if (!channelBands.has('currentU')) channelBands.set('currentU', new Map());
        channelBands.get('currentU')!.set(ms, band);
      } else if (element === GRIB_CURRENT_V_ELEMENT) {
        if (!channelBands.has('currentV')) channelBands.set('currentV', new Map());
        channelBands.get('currentV')!.set(ms, band);
      } else if (element === GRIB_SWH_ELEMENT && shortName === GRIB_SWH_SHORT_NAME) {
        swhBands.set(ms, band);
      }
    }

    // Read each vector channel's grids (readBandPixels + flipRows — same as readGrib).
    const channels = new Map<ChannelKey, ChannelGrid>();
    for (const [key, bandsByTime] of channelBands) {
      const byTime = new Map<number, Float32Array>();
      for (const [ms, band] of bandsByTime) {
        const raw = await readBandPixels(band, nLon, nLat);
        byTime.set(ms, flipRows(raw, nLon, nLat));
      }
      if (byTime.size > 0) channels.set(key, { ...grid, byTime });
    }

    // swh (wave height): read inline from the main grid, then override with the
    // discipline=10 extraction if available (mixed-grid correction, BUG-65).
    if (swhBands.size > 0) {
      const swhByTime = new Map<number, Float32Array>();
      for (const [ms, band] of swhBands) {
        const raw = await readBandPixels(band, nLon, nLat);
        swhByTime.set(ms, flipRows(raw, nLon, nLat));
      }
      let finalSwh = swhByTime;
      let finalGrid = grid;
      try {
        const oceanSwh = await readSwhFromOceanMessages(meta.path);
        if (oceanSwh) {
          finalSwh = oceanSwh.swhByTime;
          finalGrid = oceanSwh.swhGrid;
        }
      } catch {
        /* keep inline swh if ocean extraction fails */
      }
      if (finalSwh.size > 0) channels.set('swh', { ...finalGrid, byTime: finalSwh });
    }

    if (channels.size === 0) {
      throw new Error('GRIB2 file contains no recognised channels (wind, current, or wave)');
    }

    return { meta, channels };
  } finally {
    ds.close();
  }
}

export async function loadGrib(gribPath: string): Promise<GribData> {
  const ds = await gdal.openAsync(gribPath);
  try {
    const gribData = await readGrib(ds);
    // Combined ICON-EU + EWAM files contain two grids: atmospheric (0.0625°) for wind and ocean
    // (0.1°×0.05°) for waves. GDAL takes its geoTransform from the first band (atmospheric), so
    // readGrib reads HTSGW through the wrong grid. Extract ocean messages separately and reread.
    const oceanSwh = await readSwhFromOceanMessages(gribPath);
    if (oceanSwh) {
      gribData.swhByTime = oceanSwh.swhByTime;
      gribData.swhGrid = oceanSwh.swhGrid;
    }
    return gribData;
  } finally {
    ds.close();
  }
}

type SwhGrid = { latMin: number; latStep: number; lonMin: number; lonStep: number; nLat: number; nLon: number };
type SwhResult = { swhByTime: Map<number, Float32Array>; swhGrid: SwhGrid };

// Scans a GRIB2 file buffer and returns all messages with the given discipline number.
// Each GRIB2 message starts with the 4-byte "GRIB" marker; discipline is at byte offset 6,
// edition at offset 7, and total message length (uint64 big-endian) at offset 8.
function extractDisciplineMessages(fileData: Buffer, discipline: number): Buffer[] {
  const GRIB_MARKER = Buffer.from([0x47, 0x52, 0x49, 0x42]);
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < fileData.length - 16) {
    const idx = fileData.indexOf(GRIB_MARKER, offset);
    if (idx === -1) break;
    if (fileData[idx + 7] !== 2) {
      offset = idx + 4;
      continue;
    } // edition must be 2
    const msgLen = Number(fileData.readBigUInt64BE(idx + 8));
    if (msgLen < 16 || msgLen > fileData.length) {
      offset = idx + 4;
      continue;
    }
    if (fileData[idx + 6] === discipline) chunks.push(fileData.subarray(idx, idx + msgLen));
    offset = idx + msgLen;
  }
  return chunks;
}

// Reads significant wave height (HTSGW) from a GRIB2 file by extracting only the
// oceanographic (discipline=10) messages and opening them as a separate GDAL dataset.
// This is necessary for combined ICON-EU + EWAM files where wind and wave data live on
// different grids; GDAL's dataset-level geoTransform covers only the atmospheric grid.
async function readSwhFromOceanMessages(gribPath: string): Promise<SwhResult | null> {
  const fileData = await fs.readFile(gribPath);
  const oceanChunks = extractDisciplineMessages(fileData, 10);
  if (oceanChunks.length === 0) return null;

  const vsimemPath = `/vsimem/wave_${Date.now()}_${Math.trunc(Math.random() * 1e9)}.grb2`;
  vsimemCopy(Buffer.concat(oceanChunks), vsimemPath);
  const wds = await gdal.openAsync(vsimemPath);
  try {
    const gt = wds.geoTransform;
    if (!gt) return null;
    const nLon = wds.rasterSize.x;
    const nLat = wds.rasterSize.y;
    const lonStep = gt[1];
    const latStep = -gt[5];
    // GDAL geoTransform is pixel-corner convention; GRIB data points are pixel centers.
    // Add half a step to recover the actual data-point coordinates (= La1, Lo1 from GRIB metadata).
    const latMax = gt[3] - latStep / 2;
    const lonMin = gt[0] + lonStep / 2;
    const latMin = latMax - latStep * (nLat - 1);
    const swhGrid: SwhGrid = { latMin, latStep, lonMin, lonStep, nLat, nLon };

    const swhByTime = new Map<number, Float32Array>();
    const bandCount = wds.bands.count();
    for (let i = 1; i <= bandCount; i++) {
      const band = wds.bands.get(i);
      const md = band.getMetadata() as Record<string, string>;
      if (md['GRIB_ELEMENT'] !== GRIB_SWH_ELEMENT) continue;
      const vtStr = md['GRIB_VALID_TIME'];
      if (!vtStr) continue;
      const ms = parseInt(vtStr, 10) * 1000;
      const raw = await readBandPixels(band, nLon, nLat);
      swhByTime.set(ms, flipRows(raw, nLon, nLat));
    }

    if (swhByTime.size === 0) return null;
    return { swhByTime, swhGrid };
  } finally {
    wds.close();
    vsimemRelease(vsimemPath);
  }
}

async function readGrib(ds: gdal.Dataset): Promise<GribData> {
  const bandCount = ds.bands.count();
  if (bandCount === 0) throw new Error('GRIB2 file contains no bands');

  const gt = ds.geoTransform;
  if (!gt) throw new Error('GRIB2 file has no geotransform');

  // gt = [lonMin, lonStep, 0, latMax, 0, -latStep]
  const lonMin = gt[0];
  const lonStep = gt[1];
  const latMax = gt[3];
  const latStep = -gt[5]; // gt[5] is negative in a north-up grid
  const nLon = ds.rasterSize.x;
  const nLat = ds.rasterSize.y;
  const latMin = latMax - latStep * (nLat - 1);

  const entries: BandEntry[] = [];

  for (let i = 1; i <= bandCount; i++) {
    const band = ds.bands.get(i);
    const md = band.getMetadata();
    const element: string = (md as Record<string, string>)['GRIB_ELEMENT'] ?? '';
    const shortName: string = (md as Record<string, string>)['GRIB_SHORT_NAME'] ?? '';
    const validTimeStr: string = (md as Record<string, string>)['GRIB_VALID_TIME'] ?? '';

    if (shortName !== GRIB_HEIGHT_LEVEL) continue;
    if (element !== GRIB_U_ELEMENT && element !== GRIB_V_ELEMENT) continue;
    if (!validTimeStr) continue;

    entries.push({ band, element, validTimeMs: parseInt(validTimeStr, 10) * 1000 });
  }

  if (entries.length === 0) {
    throw new Error(
      `No U10/V10 bands found in GRIB2 file. ` +
        `Expected GRIB_ELEMENT=UGRD/VGRD and GRIB_SHORT_NAME=${GRIB_HEIGHT_LEVEL}. ` +
        `This loader is scoped to OpenSkiron/ICON-EU format.`,
    );
  }

  // Group U and V bands by valid time
  const timeMap = new Map<number, { u?: gdal.RasterBand; v?: gdal.RasterBand }>();
  for (const e of entries) {
    if (!timeMap.has(e.validTimeMs)) timeMap.set(e.validTimeMs, {});
    const slot = timeMap.get(e.validTimeMs)!;
    if (e.element === GRIB_U_ELEMENT) slot.u = e.band;
    else slot.v = e.band;
  }

  const sortedMs = Array.from(timeMap.keys()).sort((a, b) => a - b);
  const u10: Float32Array[] = [];
  const v10: Float32Array[] = [];
  const times: Date[] = [];

  for (const ms of sortedMs) {
    const slot = timeMap.get(ms)!;
    if (!slot.u || !slot.v) continue; // skip incomplete U/V pairs

    const rawU = await readBandPixels(slot.u, nLon, nLat);
    const rawV = await readBandPixels(slot.v, nLon, nLat);

    // GDAL row 0 = latMax (top); flip so index 0 = latMin (bottom), consistent with bilinear
    u10.push(flipRows(rawU, nLon, nLat));
    v10.push(flipRows(rawV, nLon, nLat));
    times.push(new Date(ms));
  }

  if (times.length === 0) throw new Error('No complete U10/V10 time steps found in GRIB2 file');

  // Load significant wave height (swh) bands — optional, present in EWAM files
  const swhByTime = new Map<number, Float32Array>();
  for (let i = 1; i <= bandCount; i++) {
    const band = ds.bands.get(i);
    const md = band.getMetadata();
    if ((md as Record<string, string>)['GRIB_ELEMENT'] !== GRIB_SWH_ELEMENT) continue;
    if ((md as Record<string, string>)['GRIB_SHORT_NAME'] !== GRIB_SWH_SHORT_NAME) continue;
    const vtStr: string = (md as Record<string, string>)['GRIB_VALID_TIME'] ?? '';
    if (!vtStr) continue;
    const ms = parseInt(vtStr, 10) * 1000;
    const raw = await readBandPixels(band, nLon, nLat);
    swhByTime.set(ms, flipRows(raw, nLon, nLat));
  }

  return {
    times,
    latMin,
    latStep,
    lonMin,
    lonStep,
    nLat,
    nLon,
    u10,
    v10,
    ...(swhByTime.size > 0 ? { swhByTime } : {}),
  };
}

function flipRows(grid: Float32Array, nLon: number, nLat: number): Float32Array {
  const flipped = new Float32Array(nLon * nLat);
  for (let row = 0; row < nLat; row++) {
    const srcRow = nLat - 1 - row;
    flipped.set(grid.subarray(srcRow * nLon, (srcRow + 1) * nLon), row * nLon);
  }
  return flipped;
}

export function getWaveAt(grib: GribData, lat: number, lon: number, timeMs: number): number | undefined {
  if (!grib.swhByTime || grib.swhByTime.size === 0) return undefined;
  let bestMs = -1,
    bestDiff = Infinity;
  for (const ms of grib.swhByTime.keys()) {
    const diff = Math.abs(ms - timeMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMs = ms;
    }
  }
  // Use swhGrid when present — wave data may be on a different grid than wind data.
  const gridParams = grib.swhGrid ?? grib;
  // Bounds check: bilinear() silently clamps out-of-domain coordinates to edge
  // values. Return undefined for points outside the wave grid so the router
  // doesn't act on clamped edge data (BUG-104).
  const latMax = gridParams.latMin + gridParams.latStep * (gridParams.nLat - 1);
  const lonMax = gridParams.lonMin + gridParams.lonStep * (gridParams.nLon - 1);
  if (lat < gridParams.latMin || lat > latMax || lon < gridParams.lonMin || lon > lonMax) return undefined;
  const v = bilinear(grib.swhByTime.get(bestMs)!, gridParams, lat, lon);
  // GRIB wave bands use 9999 as a fill value for land/out-of-domain cells.
  // Bilinear interpolation near land boundaries produces intermediate bogus values.
  // 100 m is safely above any real significant wave height (~30 m record).
  return v >= 100 ? undefined : v;
}

export function getWindAt(grib: GribData, lat: number, lon: number, timeIdx: number): WindVector {
  const u = bilinear(grib.u10[timeIdx], grib, lat, lon);
  const v = bilinear(grib.v10[timeIdx], grib, lat, lon);
  return { u, v };
}

type GridParams = Pick<GribData, 'latMin' | 'latStep' | 'lonMin' | 'lonStep' | 'nLat' | 'nLon'>;

function bilinear(grid: Float32Array, grib: GridParams, lat: number, lon: number): number {
  const latF = (lat - grib.latMin) / grib.latStep;
  const lonF = (lon - grib.lonMin) / grib.lonStep;

  const latI = Math.max(0, Math.min(grib.nLat - 2, Math.floor(latF)));
  const lonI = Math.max(0, Math.min(grib.nLon - 2, Math.floor(lonF)));

  const tLat = latF - latI;
  const tLon = lonF - lonI;

  const i00 = latI * grib.nLon + lonI;
  const i10 = (latI + 1) * grib.nLon + lonI;
  const i01 = latI * grib.nLon + (lonI + 1);
  const i11 = (latI + 1) * grib.nLon + (lonI + 1);

  return (
    (1 - tLat) * (1 - tLon) * grid[i00] +
    tLat * (1 - tLon) * grid[i10] +
    (1 - tLat) * tLon * grid[i01] +
    tLat * tLon * grid[i11]
  );
}

export function nearestTimeIndex(grib: GribData, t: Date): number {
  const ms = t.getTime();
  let best = 0;
  let bestDiff = Math.abs(grib.times[0].getTime() - ms);
  for (let i = 1; i < grib.times.length; i++) {
    const diff = Math.abs(grib.times[i].getTime() - ms);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

export async function loadCurrentGrib(gribPath: string): Promise<CurrentGribData> {
  const ds = await gdal.openAsync(gribPath);
  try {
    return await readCurrentGrib(ds);
  } finally {
    ds.close();
  }
}

async function readCurrentGrib(ds: gdal.Dataset): Promise<CurrentGribData> {
  const bandCount = ds.bands.count();
  if (bandCount === 0) throw new Error('GRIB2 file contains no bands');

  const gt = ds.geoTransform;
  if (!gt) throw new Error('GRIB2 file has no geotransform');

  const lonMin = gt[0];
  const lonStep = gt[1];
  const latMax = gt[3];
  const latStep = -gt[5];
  const nLon = ds.rasterSize.x;
  const nLat = ds.rasterSize.y;
  const latMin = latMax - latStep * (nLat - 1);

  interface CurrentBandEntry {
    band: gdal.RasterBand;
    element: string;
    validTimeMs: number;
  }
  const entries: CurrentBandEntry[] = [];

  for (let i = 1; i <= bandCount; i++) {
    const band = ds.bands.get(i);
    const md = band.getMetadata() as Record<string, string>;
    const element = md['GRIB_ELEMENT'] ?? '';
    const validTimeStr = md['GRIB_VALID_TIME'] ?? '';
    if (element !== GRIB_CURRENT_U_ELEMENT && element !== GRIB_CURRENT_V_ELEMENT) continue;
    if (!validTimeStr) continue;
    entries.push({ band, element, validTimeMs: parseInt(validTimeStr, 10) * 1000 });
  }

  if (entries.length === 0) {
    throw new Error(
      `No ocean current bands (${GRIB_CURRENT_U_ELEMENT}/${GRIB_CURRENT_V_ELEMENT}) found. ` +
        `Supported formats: RTOFS, CMEMS. ` +
        `For wind data use OpenSkiron/ICON-EU format files.`,
    );
  }

  const timeMap = new Map<number, { u?: gdal.RasterBand; v?: gdal.RasterBand }>();
  for (const e of entries) {
    if (!timeMap.has(e.validTimeMs)) timeMap.set(e.validTimeMs, {});
    const slot = timeMap.get(e.validTimeMs)!;
    if (e.element === GRIB_CURRENT_U_ELEMENT) slot.u = e.band;
    else slot.v = e.band;
  }

  const sortedMs = Array.from(timeMap.keys()).sort((a, b) => a - b);
  const u: Float32Array[] = [];
  const v: Float32Array[] = [];
  const times: Date[] = [];

  for (const ms of sortedMs) {
    const slot = timeMap.get(ms)!;
    if (!slot.u || !slot.v) continue;

    const rawU = await readBandPixels(slot.u, nLon, nLat);
    const rawV = await readBandPixels(slot.v, nLon, nLat);
    // Zero fill values (noDataValue = 9999 in RTOFS/BSH GRIBs) so bilinear
    // interpolation near land boundaries does not produce bogus huge values.
    for (let i = 0; i < rawU.length; i++) {
      if (rawU[i] >= 9000) rawU[i] = 0;
      if (rawV[i] >= 9000) rawV[i] = 0;
    }

    u.push(flipRows(rawU, nLon, nLat));
    v.push(flipRows(rawV, nLon, nLat));
    times.push(new Date(ms));
  }

  if (times.length === 0) throw new Error('No complete UOGRD/VOGRD time step pairs found in GRIB2 file');

  return { times, latMin, latStep, lonMin, lonStep, nLat, nLon, u, v };
}

// Bilinear interpolation of ocean current at a point. Returns {u:0,v:0} when outside the
// current GRIB's spatial domain — explicit out-of-domain check prevents silently returning
// clamped edge values, which would be wrong for grid boundaries (nautical safety).
export function getCurrentAt(data: CurrentGribData, lat: number, lon: number, timeIdx: number): WindVector {
  const latMax = data.latMin + data.latStep * (data.nLat - 1);
  const lonMax = data.lonMin + data.lonStep * (data.nLon - 1);
  if (lat < data.latMin || lat > latMax || lon < data.lonMin || lon > lonMax) return { u: 0, v: 0 };
  return {
    u: bilinear(data.u[timeIdx], data, lat, lon),
    v: bilinear(data.v[timeIdx], data, lat, lon),
  };
}

export function nearestCurrentTimeIndex(data: CurrentGribData, t: Date): number {
  const ms = t.getTime();
  let best = 0;
  let bestDiff = Math.abs(data.times[0].getTime() - ms);
  for (let i = 1; i < data.times.length; i++) {
    const diff = Math.abs(data.times[i].getTime() - ms);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}
