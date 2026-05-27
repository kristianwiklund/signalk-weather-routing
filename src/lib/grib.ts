import * as gdal from 'gdal-async';
import { GribData, WindVector } from '../types';

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
    return await readGrib(ds);
  } finally {
    ds.close();
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
  return bilinear(grib.swhByTime.get(bestMs)!, grib, lat, lon);
}

export function getWindAt(grib: GribData, lat: number, lon: number, timeIdx: number): WindVector {
  const u = bilinear(grib.u10[timeIdx], grib, lat, lon);
  const v = bilinear(grib.v10[timeIdx], grib, lat, lon);
  return { u, v };
}

function bilinear(grid: Float32Array, grib: GribData, lat: number, lon: number): number {
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
