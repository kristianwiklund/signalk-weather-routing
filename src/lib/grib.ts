// GRIB2 loading and interpolation, scoped to OpenSkiron/ICON-EU wind and wave band layout.

import * as fs from 'node:fs/promises';
import * as nodepath from 'node:path';
import * as gdal from 'gdal-async';
import { GribData, GribFileMeta, WindVector } from '../types';

const GRIB_EXTENSIONS = new Set(['.grib2', '.grib', '.grb2', '.grb']);

export async function scanGribDir(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && GRIB_EXTENSIONS.has(nodepath.extname(e.name).toLowerCase()))
    .map(e => nodepath.join(dir, e.name))
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
    const timeMs = new Set<number>();

    for (let i = 1; i <= bandCount; i++) {
      const band = ds.bands.get(i);
      const md = band.getMetadata() as Record<string, string>;
      if (md['GRIB_SHORT_NAME'] !== GRIB_HEIGHT_LEVEL) continue;
      if (md['GRIB_ELEMENT'] !== GRIB_U_ELEMENT) continue;
      const vtStr = md['GRIB_VALID_TIME'];
      if (!vtStr) continue;
      timeMs.add(parseInt(vtStr, 10) * 1000);
    }

    const sortedMs = Array.from(timeMs).sort((a, b) => a - b);
    if (sortedMs.length === 0) throw new Error('No U10 time steps found — not an OpenSkiron/ICON-EU file');

    return {
      path: filePath,
      mtime: stat.mtimeMs,
      latMin, latMax, lonMin, lonMax, latStep, lonStep,
      timeStart: new Date(sortedMs[0]),
      timeEnd: new Date(sortedMs[sortedMs.length - 1]),
      nTimes: sortedMs.length,
    };
  } finally {
    ds.close();
  }
}

// Scoped to OpenSkiron/ICON-EU GRIB2 format
const GRIB_U_ELEMENT = 'UGRD';
const GRIB_V_ELEMENT = 'VGRD';
const GRIB_HEIGHT_LEVEL = '10-HTGL';
const GRIB_SWH_ELEMENT = 'HTSGW';   // significant height of combined wind waves and swell
const GRIB_SWH_SHORT_NAME = '0-SFC';

interface BandEntry {
  band: gdal.RasterBand;
  element: string;
  validTimeMs: number;
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
      gribData.swhGrid   = oceanSwh.swhGrid;
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
    if (fileData[idx + 7] !== 2) { offset = idx + 4; continue; }  // edition must be 2
    const msgLen = Number(fileData.readBigUInt64BE(idx + 8));
    if (msgLen < 16 || msgLen > fileData.length) { offset = idx + 4; continue; }
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
  (gdal.vsimem as any).copy(Buffer.concat(oceanChunks), vsimemPath);
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
      const raw = new Float32Array(nLon * nLat);
      await (band.pixels as any).readAsync(0, 0, nLon, nLat, raw);
      swhByTime.set(ms, flipRows(raw, nLon, nLat));
    }

    if (swhByTime.size === 0) return null;
    return { swhByTime, swhGrid };
  } finally {
    wds.close();
    (gdal.vsimem as any).release(vsimemPath);
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
  const latStep = -gt[5];  // gt[5] is negative in a north-up grid
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
      `This loader is scoped to OpenSkiron/ICON-EU format.`
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
    if (!slot.u || !slot.v) continue;  // skip incomplete U/V pairs

    const rawU = new Float32Array(nLon * nLat);
    const rawV = new Float32Array(nLon * nLat);

    await (slot.u.pixels as any).readAsync(0, 0, nLon, nLat, rawU);
    await (slot.v.pixels as any).readAsync(0, 0, nLon, nLat, rawV);

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
    const raw = new Float32Array(nLon * nLat);
    await (band.pixels as any).readAsync(0, 0, nLon, nLat, raw);
    swhByTime.set(ms, flipRows(raw, nLon, nLat));
  }

  return {
    times, latMin, latStep, lonMin, lonStep, nLat, nLon, u10, v10,
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
  let bestMs = -1, bestDiff = Infinity;
  for (const ms of grib.swhByTime.keys()) {
    const diff = Math.abs(ms - timeMs);
    if (diff < bestDiff) { bestDiff = diff; bestMs = ms; }
  }
  // Use swhGrid when present — wave data may be on a different grid than wind data.
  const gridParams = grib.swhGrid ?? grib;
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
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}
