// Phase A: asserts MultiFileGribProvider.rankedFiles order matches MultiFileWindProvider's
// sort across all four ranking keys (referenceTime → granularity → spatial → mtime) including
// ties. Constructs equivalent synthetic files for both paths and verifies the same file wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiFileWindProvider } from '../windprovider';
import { MultiFileGribProvider } from '../multiFileGribProvider';
import type { GribData, GribFileEntry, LoadedGribFile, ChannelGrid, ChannelKey } from '../../types';

const T0 = new Date('2024-01-01T00:00:00Z').getTime();
const GRID_NLAT = 21; // large enough that latStep ∈ [0.1, 1] keeps the bbox covering (41, 11)
const GRID_NLON = 3;

// Build a legacy GribFileEntry. All files share the same valid-time axis (starting at T0)
// and the same bbox so both files cover the query point — the ranking alone decides.
function legacyEntry(opts: {
  path: string;
  refMs: number;
  mtime: number;
  latStep?: number;
  stepMs?: number;
  nTimes?: number;
  fillU: number;
}): GribFileEntry {
  const latStep = opts.latStep ?? 1;
  const nTimes = opts.nTimes ?? 2;
  const stepMs = opts.stepMs ?? 3600000;
  const times = Array.from({ length: nTimes }, (_, i) => new Date(T0 + i * stepMs));
  const latMin = 40;
  const nPts = GRID_NLAT * GRID_NLON;
  const data: GribData = {
    times,
    latMin,
    latStep,
    lonMin: 10,
    lonStep: 1,
    nLat: GRID_NLAT,
    nLon: GRID_NLON,
    u10: times.map(() => new Float32Array(nPts).fill(opts.fillU)),
    v10: times.map(() => new Float32Array(nPts).fill(0)),
  };
  return {
    meta: {
      path: opts.path,
      mtime: opts.mtime,
      type: 'wind',
      latMin,
      latMax: latMin + latStep * (GRID_NLAT - 1),
      lonMin: 10,
      lonMax: 12,
      latStep,
      lonStep: 1,
      timeStart: times[0],
      timeEnd: times[times.length - 1],
      nTimes,
      referenceTime: new Date(opts.refMs),
    },
    data,
  };
}

// Build the equivalent LoadedGribFile (new path) with matching metadata + a windU channel.
function loadedFile(opts: {
  path: string;
  refMs: number;
  mtime: number;
  latStep?: number;
  stepMs?: number;
  nTimes?: number;
  fillU: number;
}): LoadedGribFile {
  const latStep = opts.latStep ?? 1;
  const nTimes = opts.nTimes ?? 2;
  const stepMs = opts.stepMs ?? 3600000;
  const times = Array.from({ length: nTimes }, (_, i) => T0 + i * stepMs);
  const latMin = 40;
  const grid = { latMin, latStep, lonMin: 10, lonStep: 1, nLat: GRID_NLAT, nLon: GRID_NLON };
  const byTime = new Map<number, Float32Array>();
  for (const t of times) byTime.set(t, new Float32Array(GRID_NLAT * GRID_NLON).fill(opts.fillU));
  const channels = new Map<ChannelKey, ChannelGrid>([['windU', { ...grid, byTime }]]);
  return {
    meta: {
      path: opts.path,
      mtime: opts.mtime,
      type: 'wind',
      latMin,
      latMax: latMin + latStep * (GRID_NLAT - 1),
      lonMin: 10,
      lonMax: 12,
      latStep,
      lonStep: 1,
      timeStart: new Date(times[0]),
      timeEnd: new Date(times[times.length - 1]),
      nTimes,
      referenceTime: new Date(opts.refMs),
    },
    channels,
  };
}

// Compare rankings: legacy's behavioural winner (getWind returns the top file's fill)
// vs. new's rankedFiles[0]. Tests below verify both pick the same file inline.

test('ranking equivalence: newer referenceTime wins over newer mtime (both paths agree)', () => {
  const a = { path: '/a', refMs: T0, mtime: 2000, fillU: 10 };
  const b = { path: '/b', refMs: T0 + 3600000, mtime: 1000, fillU: 20 }; // newer ref, older mtime
  const legacy = new MultiFileWindProvider([legacyEntry(a), legacyEntry(b)]);
  const modern = new MultiFileGribProvider([loadedFile(a), loadedFile(b)]);
  // /b should win (newer referenceTime) despite older mtime.
  assert.strictEqual(modern.rankedFiles[0].meta.path, '/b');
  assert.strictEqual(legacy.getWind(41, 11, 0).u, 20);
  assert.strictEqual(modern.sample('windU', 41, 11, new Date(T0)), 20);
});

test('ranking equivalence: finer temporal granularity wins on equal referenceTime', () => {
  const a = { path: '/a', refMs: T0, mtime: 1000, stepMs: 3600000, nTimes: 3, fillU: 10 }; // 1-hourly
  const b = { path: '/b', refMs: T0, mtime: 1000, stepMs: 10800000, nTimes: 3, fillU: 20 }; // 3-hourly
  const legacy = new MultiFileWindProvider([legacyEntry(a), legacyEntry(b)]);
  const modern = new MultiFileGribProvider([loadedFile(a), loadedFile(b)]);
  assert.strictEqual(modern.rankedFiles[0].meta.path, '/a');
  assert.strictEqual(legacy.getWind(41, 11, 0).u, 10);
  assert.strictEqual(modern.sample('windU', 41, 11, new Date(T0)), 10);
});

test('ranking equivalence: finer spatial resolution wins on equal ref + granularity', () => {
  const a = { path: '/a', refMs: T0, mtime: 1000, latStep: 0.1, fillU: 10 };
  const b = { path: '/b', refMs: T0, mtime: 1000, latStep: 0.25, fillU: 20 };
  const legacy = new MultiFileWindProvider([legacyEntry(a), legacyEntry(b)]);
  const modern = new MultiFileGribProvider([loadedFile(a), loadedFile(b)]);
  assert.strictEqual(modern.rankedFiles[0].meta.path, '/a');
  assert.strictEqual(legacy.getWind(41, 11, 0).u, 10);
  assert.strictEqual(modern.sample('windU', 41, 11, new Date(T0)), 10);
});

test('ranking equivalence: newer mtime wins on full tie (ref + gran + spatial equal)', () => {
  const a = { path: '/a', refMs: T0, mtime: 1000, fillU: 10 };
  const b = { path: '/b', refMs: T0, mtime: 2000, fillU: 20 };
  const legacy = new MultiFileWindProvider([legacyEntry(a), legacyEntry(b)]);
  const modern = new MultiFileGribProvider([loadedFile(a), loadedFile(b)]);
  assert.strictEqual(modern.rankedFiles[0].meta.path, '/b');
  assert.strictEqual(legacy.getWind(41, 11, 0).u, 20);
  assert.strictEqual(modern.sample('windU', 41, 11, new Date(T0)), 20);
});

test('ranking equivalence: four files exercising all four keys agree on full order', () => {
  // Four files; the expected order exercises every ranking key:
  //   1. /newest-ref      — newest referenceTime (key 1)
  //   2. /finest-gran      — same ref as 3,4; finest granularity (key 2)
  //   3. /finest-spatial    — same ref+gran as 4; finest spatial (key 3)
  //   4. /newest-mtime     — same ref+gran+spatial as 3; newest mtime (key 4)
  const files = [
    loadedFile({ path: '/newest-mtime', refMs: T0, mtime: 1000, stepMs: 10800000, latStep: 0.5, fillU: 40 }),
    loadedFile({ path: '/finest-spatial', refMs: T0, mtime: 1000, stepMs: 10800000, latStep: 0.25, fillU: 30 }),
    loadedFile({ path: '/newest-ref', refMs: T0 + 86400000, mtime: 1000, latStep: 1, fillU: 10 }),
    loadedFile({ path: '/finest-gran', refMs: T0, mtime: 1000, stepMs: 3600000, nTimes: 3, latStep: 0.5, fillU: 20 }),
  ];
  const modern = new MultiFileGribProvider(files);
  assert.strictEqual(modern.rankedFiles[0].meta.path, '/newest-ref');
  assert.strictEqual(modern.rankedFiles[1].meta.path, '/finest-gran');
  assert.strictEqual(modern.rankedFiles[2].meta.path, '/finest-spatial');
  assert.strictEqual(modern.rankedFiles[3].meta.path, '/newest-mtime');

  // Behavioural cross-check: legacy provider given the equivalent entries picks the same top file.
  const legacyFiles = [
    legacyEntry({ path: '/newest-mtime', refMs: T0, mtime: 1000, stepMs: 10800000, latStep: 0.5, fillU: 40 }),
    legacyEntry({ path: '/finest-spatial', refMs: T0, mtime: 1000, stepMs: 10800000, latStep: 0.25, fillU: 30 }),
    legacyEntry({ path: '/newest-ref', refMs: T0 + 86400000, mtime: 1000, latStep: 1, fillU: 10 }),
    legacyEntry({ path: '/finest-gran', refMs: T0, mtime: 1000, stepMs: 3600000, nTimes: 3, latStep: 0.5, fillU: 20 }),
  ];
  const legacy = new MultiFileWindProvider(legacyFiles);
  assert.strictEqual(legacy.getWind(41, 11, 0).u, 10); // /newest-ref wins
});
