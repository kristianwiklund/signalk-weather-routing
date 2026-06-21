// Optimized-combination proposal: picks an enabled set of GRIB files by selection priority
// (referenceTime → temporal granularity → spatial resolution → mtime) plus a conservative
// geographic stitch that keeps files contributing unique coverage and marks fully-subsumed
// files as redundant. Departure-aware: scoped to files covering the set departure time, or
// now-forward when no departure is set.

import { GribFileMeta } from '../types';

export interface CombinationFile {
  path: string;
  type: 'wind' | 'current' | 'wave';
  referenceTime: Date;
  timeStart: Date;
  timeEnd: Date;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  latStep: number;
  meanStepMs: number;
  mtime: number;
}

export interface CombinationFileResult {
  path: string;
  recommended: boolean;
  reason: string;
}

export interface CombinationResult {
  scope: { mode: 'departure' | 'now'; departureTime?: string; now: string };
  proposed: string[];
  files: CombinationFileResult[];
}

// Mean timestep from metadata. Mathematically identical to the mean of the actual times[]
// (mean of steps = (last - first)/(n-1)), so ranking stays consistent with MultiFileWindProvider.
export function meanStepFromMeta(timeStart: Date, timeEnd: Date, nTimes: number): number {
  if (nTimes < 2) return Number.MAX_SAFE_INTEGER;
  return (timeEnd.getTime() - timeStart.getTime()) / (nTimes - 1);
}

export function combinationFileFromMeta(meta: GribFileMeta): CombinationFile {
  return {
    path: meta.path,
    type: meta.type,
    referenceTime: meta.referenceTime,
    timeStart: meta.timeStart,
    timeEnd: meta.timeEnd,
    latMin: meta.latMin,
    latMax: meta.latMax,
    lonMin: meta.lonMin,
    lonMax: meta.lonMax,
    latStep: meta.latStep,
    meanStepMs: meanStepFromMeta(meta.timeStart, meta.timeEnd, meta.nTimes),
    mtime: meta.mtime,
  };
}

// Priority comparator: newest referenceTime, then finest granularity, then finest spatial, then mtime.
// Negative when a ranks before b (a is higher priority). Must match MultiFileWindProvider's sort.
function priorityCompare(a: CombinationFile, b: CombinationFile): number {
  const ref = b.referenceTime.getTime() - a.referenceTime.getTime();
  if (ref !== 0) return ref;
  const gran = a.meanStepMs - b.meanStepMs;
  if (gran !== 0) return gran;
  const lat = a.latStep - b.latStep;
  if (lat !== 0) return lat;
  return b.mtime - a.mtime;
}

// True when outer's bbox AND timerange fully contain inner's. Conservative redundancy test:
// a file is only redundant if a single higher-priority file covers everything it does.
function contains(outer: CombinationFile, inner: CombinationFile): boolean {
  return (
    outer.timeStart.getTime() <= inner.timeStart.getTime() &&
    outer.timeEnd.getTime() >= inner.timeEnd.getTime() &&
    outer.latMin <= inner.latMin &&
    outer.latMax >= inner.latMax &&
    outer.lonMin <= inner.lonMin &&
    outer.lonMax >= inner.lonMax
  );
}

export function proposeCombination(
  files: CombinationFile[],
  opts: { departureTime?: Date; now?: Date } = {},
): CombinationResult {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const depMs = opts.departureTime ? opts.departureTime.getTime() : undefined;
  const mode: 'departure' | 'now' = depMs !== undefined ? 'departure' : 'now';

  const results: CombinationFileResult[] = [];
  const candidates: CombinationFile[] = [];

  for (const f of files) {
    let candidate: boolean;
    let reason: string;
    if (depMs !== undefined) {
      candidate = f.timeStart.getTime() <= depMs && f.timeEnd.getTime() >= depMs;
      reason = candidate ? '' : 'does not cover the set departure time';
    } else {
      candidate = f.timeEnd.getTime() >= nowMs;
      reason = candidate
        ? ''
        : `past: forecast period ended ${Math.round((nowMs - f.timeEnd.getTime()) / 3600000)}h ago`;
    }
    if (candidate) candidates.push(f);
    else results.push({ path: f.path, recommended: false, reason });
  }

  candidates.sort(priorityCompare);

  const recommended: CombinationFile[] = [];
  for (const f of candidates) {
    const subsumer = recommended.find((r) => contains(r, f));
    if (subsumer) {
      results.push({
        path: f.path,
        recommended: false,
        reason: `redundant: fully covered by ${subsumer.path}`,
      });
    } else {
      recommended.push(f);
      results.push({ path: f.path, recommended: true, reason: '' });
    }
  }

  // Deterministic output order (by path) for a stable UI.
  results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    scope: {
      mode,
      ...(depMs !== undefined ? { departureTime: opts.departureTime!.toISOString() } : {}),
      now: now.toISOString(),
    },
    proposed: recommended.map((f) => f.path).sort(),
    files: results,
  };
}
