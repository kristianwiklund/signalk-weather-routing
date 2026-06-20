// Generic engine tests — channel-agnostic, synthetic LoadedGribFiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiFileGribProvider } from '../multiFileGribProvider';
import { LoadedGribFile, ChannelGrid, ChannelKey } from '../../types';

const T0 = new Date('2024-01-01T00:00:00Z').getTime();
const T1 = T0 + 3600000;
const TIMES = [T0, T1];

function mkChannel(
  val: number,
  times: number[],
  grid: { latMin: number; latStep: number; lonMin: number; lonStep: number; nLat: number; nLon: number },
): ChannelGrid {
  const byTime = new Map<number, Float32Array>();
  for (const t of times) byTime.set(t, new Float32Array(grid.nLat * grid.nLon).fill(val));
  return { ...grid, byTime };
}

function mkFile(opts: {
  path: string;
  refMs?: number;
  mtime?: number;
  nTimes?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  latStep?: number;
  channels: Record<string, number>; // channelKey → fill value
}): LoadedGribFile {
  const nT = opts.nTimes ?? 2;
  const startMs = T0;
  const step = 3600000;
  const times = Array.from({ length: nT }, (_, i) => startMs + i * step);
  const grid = {
    latMin: opts.latMin ?? 40,
    latStep: opts.latStep ?? 1,
    lonMin: opts.lonMin ?? 10,
    lonStep: 1,
    nLat: 3,
    nLon: 3,
  };
  const chMap = new Map<ChannelKey, ChannelGrid>();
  for (const [key, val] of Object.entries(opts.channels)) {
    chMap.set(key, mkChannel(val, times, grid));
  }
  return {
    meta: {
      path: opts.path,
      mtime: opts.mtime ?? 1000,
      type: 'wind',
      latMin: opts.latMin ?? 40,
      latMax: opts.latMax ?? 42,
      lonMin: opts.lonMin ?? 10,
      lonMax: opts.lonMax ?? 12,
      latStep: opts.latStep ?? 1,
      lonStep: 1,
      timeStart: new Date(times[0]),
      timeEnd: new Date(times[times.length - 1]),
      nTimes: nT,
      referenceTime: new Date(opts.refMs ?? T0),
    },
    channels: chMap,
  };
}

test('engine: sample returns value from the highest-priority covering file', () => {
  const fA = mkFile({ path: '/a', channels: { windU: 3 }, refMs: T0 });
  const fB = mkFile({ path: '/b', channels: { windU: 7 }, refMs: T0 + 3600000 }); // newer referenceTime
  const p = new MultiFileGribProvider([fA, fB]);
  // Both cover (41,11) at T0; fB has newer refTime → wins.
  assert.strictEqual(p.sample('windU', 41, 11, new Date(T0)), 7);
  assert.strictEqual(p.filePathFor('windU', 41, 11, new Date(T0)), '/b');
});

test('engine: regional stitch — two non-overlapping files each serve their region', () => {
  const fA = mkFile({ path: '/north', channels: { windU: 5 }, latMin: 50, latMax: 52, lonMin: 10, lonMax: 12 });
  const fB = mkFile({ path: '/south', channels: { windU: 9 }, latMin: 40, latMax: 42, lonMin: 10, lonMax: 12 });
  const p = new MultiFileGribProvider([fA, fB]);
  assert.strictEqual(p.sample('windU', 51, 11, new Date(T0)), 5);
  assert.strictEqual(p.sample('windU', 41, 11, new Date(T0)), 9);
  assert.strictEqual(p.sample('windU', 45, 11, new Date(T0)), undefined); // gap — no coverage
});

test('engine: samplePaired returns both channels from the same file', () => {
  const f = mkFile({ path: '/pair', channels: { windU: 2, windV: 5 } });
  const p = new MultiFileGribProvider([f]);
  const r = p.samplePaired('windU', 'windV', 41, 11, new Date(T0));
  assert.ok(r);
  assert.strictEqual(r!.a, 2);
  assert.strictEqual(r!.b, 5);
  // No file has both → undefined
  const f2 = mkFile({ path: '/single', channels: { windU: 8 } });
  const p2 = new MultiFileGribProvider([f2]);
  assert.strictEqual(p2.samplePaired('windU', 'windV', 41, 11, new Date(T0)), undefined);
});

test('engine: covers and filePathFor', () => {
  const f = mkFile({ path: '/cov', channels: { swh: 1.5 } });
  const p = new MultiFileGribProvider([f]);
  assert.ok(p.covers('swh', 41, 11, new Date(T0)));
  assert.strictEqual(p.covers('swh', 60, 20, new Date(T0)), false); // outside bbox
  assert.strictEqual(p.filePathFor('swh', 41, 11, new Date(T0)), '/cov');
});

test('engine: merged times axis for a channel', () => {
  const fA = mkFile({ path: '/a', channels: { windU: 1 }, nTimes: 2 }); // T0, T1
  const fB = mkFile({ path: '/b', channels: { windU: 2 }, nTimes: 3 }); // T0, T1, T2
  const p = new MultiFileGribProvider([fA, fB]);
  const times = p.times('windU');
  assert.strictEqual(times.length, 3); // deduped union
  assert.strictEqual(times[0].getTime(), T0);
  assert.strictEqual(times[2].getTime(), T0 + 2 * 3600000);
});

test('engine: temporal-out-of-range point returns undefined', () => {
  const f = mkFile({ path: '/t', channels: { windU: 5 }, nTimes: 2 }); // T0, T1
  const p = new MultiFileGribProvider([f]);
  // T0+10h is beyond the file's times — the nearest-time will extrapolate (nearest is T1).
  // This is consistent with MultiFileWindProvider's nearestTimeIndex behavior.
  // A point completely outside the bbox returns undefined.
  assert.strictEqual(p.sample('windU', 99, 99, new Date(T0)), undefined);
});

test('engine: temporal gate — file outside the requested time range is not sampled', () => {
  // fA covers [T0, T0+1h]; fB covers a 48h-later period.
  const fA = mkFile({ path: '/a', channels: { windU: 5 } });
  const fB = mkFile({ path: '/b', channels: { windU: 9 }, refMs: T0 + 48 * 3600000 });
  // Shift fB entirely to a later period
  const off = 48 * 3600000;
  fB.meta.timeStart = new Date(T0 + off);
  fB.meta.timeEnd = new Date(T0 + off + 3600000);
  const ch = fB.channels.get('windU')!;
  const shifted = new Map<number, Float32Array>();
  for (const [ms, g] of ch.byTime) shifted.set(ms + off, g);
  ch.byTime = shifted;

  // fB ranks first (newer referenceTime) but doesn't cover T0 temporally → fA wins.
  const p = new MultiFileGribProvider([fA, fB]);
  assert.strictEqual(p.sample('windU', 41, 11, new Date(T0)), 5);
  assert.strictEqual(p.filePathFor('windU', 41, 11, new Date(T0)), '/a');
  // fB's data is available at its own time period
  assert.strictEqual(p.sample('windU', 41, 11, new Date(T0 + off)), 9);
});
