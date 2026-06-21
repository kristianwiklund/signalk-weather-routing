// Generic multi-file GRIB provider: combines multiple GRIB files per channel,
// resolving per-point to the highest-priority covering file.
// Ranking (file-level, applies uniformly to all channels):
// referenceTime → temporal granularity → spatial resolution → mtime.

import { LoadedGribFile, ChannelKey, ChannelGrid, GribFileMeta } from '../types';

// File-level mean timestep (ms) from metadata — mathematically identical to the mean
// of the actual times[], consistent with MultiFileWindProvider and gribCombination.
function fileMeanStepMs(meta: GribFileMeta): number {
  if (meta.nTimes < 2) return Number.MAX_SAFE_INTEGER;
  return (meta.timeEnd.getTime() - meta.timeStart.getTime()) / (meta.nTimes - 1);
}

function coversPoint(file: LoadedGribFile, lat: number, lon: number): boolean {
  const m = file.meta;
  return lat >= m.latMin && lat <= m.latMax && lon >= m.lonMin && lon <= m.lonMax;
}

// Bilinear interpolation over a ChannelGrid at (lat, lon, timeMs).
// Returns undefined for out-of-grid, fill-value (≥9999), or no-data cells.
function sampleGrid(ch: ChannelGrid, lat: number, lon: number, tMs: number): number | undefined {
  // Nearest available timestep.
  let bestMs = -1;
  let bestDiff = Infinity;
  for (const ms of ch.byTime.keys()) {
    const d = Math.abs(ms - tMs);
    if (d < bestDiff) {
      bestDiff = d;
      bestMs = ms;
    }
  }
  if (bestMs < 0) return undefined;
  const grid = ch.byTime.get(bestMs);
  if (!grid) return undefined;

  const { latMin, latStep, lonMin, lonStep, nLat, nLon } = ch;
  // Coordinate-based bounds check: reject points beyond the last pixel center.
  // The index-based check below (i0 >= nLat) is insufficient because it accepts
  // latF in [nLat-1, nLat) — points beyond the last pixel center that degenerate
  // to single-row extrapolation. This matches the legacy getWaveAt/getCurrentAt
  // coordinate check and prevents silent edge extrapolation (BUG-136, nautical safety).
  const latMax = latMin + latStep * (nLat - 1);
  const lonMax = lonMin + lonStep * (nLon - 1);
  if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return undefined;
  const latF = (lat - latMin) / latStep;
  const lonF = (lon - lonMin) / lonStep;
  const i0 = Math.floor(latF);
  const j0 = Math.floor(lonF);
  if (i0 < 0 || j0 < 0 || i0 >= nLat || j0 >= nLon) return undefined;
  const i1 = Math.min(i0 + 1, nLat - 1);
  const j1 = Math.min(j0 + 1, nLon - 1);
  const frL = latF - i0;
  const frLo = lonF - j0;
  const idx = (i: number, j: number) => i * nLon + j;
  const v00 = grid[idx(i0, j0)];
  const v01 = grid[idx(i0, j1)];
  const v10 = grid[idx(i1, j0)];
  const v11 = grid[idx(i1, j1)];
  // Skip fill values (GRIB convention: 9999+ for missing/land).
  if (v00 >= 9999 || v01 >= 9999 || v10 >= 9999 || v11 >= 9999) return undefined;
  return v00 * (1 - frL) * (1 - frLo) + v01 * (1 - frL) * frLo + v10 * frL * (1 - frLo) + v11 * frL * frLo;
}

export class MultiFileGribProvider {
  // Files ranked once by selection priority (see file header).
  readonly rankedFiles: LoadedGribFile[];

  constructor(files: LoadedGribFile[]) {
    this.rankedFiles = [...files].sort((a, b) => {
      const ref = b.meta.referenceTime.getTime() - a.meta.referenceTime.getTime();
      if (ref !== 0) return ref;
      const gran = fileMeanStepMs(a.meta) - fileMeanStepMs(b.meta);
      if (gran !== 0) return gran;
      const lat = a.meta.latStep - b.meta.latStep;
      if (lat !== 0) return lat;
      return b.meta.mtime - a.meta.mtime;
    });
  }

  /** Sample a scalar channel at (lat, lon, t). Returns undefined if no covering file. */
  sample(channel: ChannelKey, lat: number, lon: number, t: Date): number | undefined {
    const tMs = t.getTime();
    for (const f of this.rankedFiles) {
      const ch = f.channels.get(channel);
      if (!ch) continue;
      if (!coversPoint(f, lat, lon)) continue;
      if (tMs < f.meta.timeStart.getTime() || tMs > f.meta.timeEnd.getTime()) continue; // temporal gate
      const val = sampleGrid(ch, lat, lon, tMs);
      if (val !== undefined) return val;
    }
    return undefined;
  }

  /**
   * Sample two paired scalar channels (e.g. windU + windV) from the SAME file — ensures
   * both components come from the same source (consistent vector). Returns undefined if no
   * single covering file has both channels.
   */
  samplePaired(
    channelA: ChannelKey,
    channelB: ChannelKey,
    lat: number,
    lon: number,
    t: Date,
  ): { a: number; b: number } | undefined {
    const tMs = t.getTime();
    for (const f of this.rankedFiles) {
      const chA = f.channels.get(channelA);
      const chB = f.channels.get(channelB);
      if (!chA || !chB) continue;
      if (!coversPoint(f, lat, lon)) continue;
      if (tMs < f.meta.timeStart.getTime() || tMs > f.meta.timeEnd.getTime()) continue; // temporal gate
      const va = sampleGrid(chA, lat, lon, tMs);
      if (va === undefined) continue;
      const vb = sampleGrid(chB, lat, lon, tMs);
      if (vb === undefined) continue;
      return { a: va, b: vb };
    }
    return undefined;
  }

  /** Does any file carry this channel and cover (lat, lon) spatially? */
  coversSpatial(channel: ChannelKey, lat: number, lon: number): boolean {
    for (const f of this.rankedFiles) {
      if (!f.channels.has(channel)) continue;
      if (coversPoint(f, lat, lon)) return true;
    }
    return false;
  }

  /** Does any file carry this channel and cover (lat, lon, t)? */
  covers(channel: ChannelKey, lat: number, lon: number, t: Date): boolean {
    return this.sample(channel, lat, lon, t) !== undefined;
  }

  /** Path of the file that supplies this channel at (lat, lon, t), or undefined. */
  filePathFor(channel: ChannelKey, lat: number, lon: number, t: Date): string | undefined {
    const tMs = t.getTime();
    for (const f of this.rankedFiles) {
      const ch = f.channels.get(channel);
      if (!ch) continue;
      if (!coversPoint(f, lat, lon)) continue;
      if (tMs < f.meta.timeStart.getTime() || tMs > f.meta.timeEnd.getTime()) continue; // temporal gate
      if (sampleGrid(ch, lat, lon, tMs) !== undefined) return f.meta.path;
    }
    return undefined;
  }

  /** Merged time axis for this channel across all files (sorted, deduped). */
  times(channel: ChannelKey): Date[] {
    const msSet = new Set<number>();
    for (const f of this.rankedFiles) {
      const ch = f.channels.get(channel);
      if (!ch) continue;
      for (const ms of ch.byTime.keys()) msSet.add(ms);
    }
    return Array.from(msSet)
      .sort((a, b) => a - b)
      .map((ms) => new Date(ms));
  }
}
