// Phase A: enforces §7.2.1 invariants #1–#3 mechanically. The engine contract is
// testable now (the engine is channel-agnostic by construction); the loader contract
// is skipped until Phase B introduces the ChannelSpec registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiFileGribProvider } from '../multiFileGribProvider';
import type { LoadedGribFile, ChannelGrid, ChannelKey } from '../../types';

const T0 = new Date('2024-01-01T00:00:00Z').getTime();
const GRID = { latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3 };

function mkChannel(val: number, times: number[]): ChannelGrid {
  const byTime = new Map<number, Float32Array>();
  for (const t of times) byTime.set(t, new Float32Array(GRID.nLat * GRID.nLon).fill(val));
  return { ...GRID, byTime };
}

function mkFile(path: string, channels: Record<string, { val: number; nTimes?: number }>): LoadedGribFile {
  const nT = 2;
  const times = Array.from({ length: nT }, (_, i) => T0 + i * 3600000);
  const chMap = new Map<ChannelKey, ChannelGrid>();
  for (const [key, spec] of Object.entries(channels)) {
    const t = Array.from({ length: spec.nTimes ?? nT }, (_, i) => T0 + i * 3600000);
    chMap.set(key, mkChannel(spec.val, t));
  }
  return {
    meta: {
      path,
      mtime: 1000,
      type: 'wind',
      latMin: GRID.latMin,
      latMax: 42,
      lonMin: GRID.lonMin,
      lonMax: 12,
      latStep: GRID.latStep,
      lonStep: GRID.lonStep,
      timeStart: new Date(times[0]),
      timeEnd: new Date(times[times.length - 1]),
      nTimes: nT,
      referenceTime: new Date(T0),
    },
    channels: chMap,
  };
}

// --- Engine contract (green now): MultiFileGribProvider is channel-agnostic. ---
// A channel key is an opaque string to the engine; it never inspects or restricts it.
// This is half of the mechanical enforcement of §7.2.1 invariants #1–#3.

test('engine contract: sample works for an arbitrary channel key (not just windU/windV/swh)', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { testScalar: { val: 42 } })]);
  assert.strictEqual(p.sample('testScalar', 41, 11, new Date(T0)), 42);
  // Channels absent from the file return undefined — the engine does not fabricate.
  assert.strictEqual(p.sample('nonexistent', 41, 11, new Date(T0)), undefined);
});

test('engine contract: coversSpatial works for an arbitrary channel key', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { testScalar: { val: 42 } })]);
  assert.ok(p.coversSpatial('testScalar', 41, 11));
  assert.strictEqual(p.coversSpatial('nonexistent', 41, 11), false);
});

test('engine contract: covers works for an arbitrary channel key', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { testScalar: { val: 42 } })]);
  assert.ok(p.covers('testScalar', 41, 11, new Date(T0)));
  assert.strictEqual(p.covers('testScalar', 99, 99, new Date(T0)), false);
});

test('engine contract: filePathFor works for an arbitrary channel key', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { testScalar: { val: 42 } })]);
  assert.strictEqual(p.filePathFor('testScalar', 41, 11, new Date(T0)), '/t');
  assert.strictEqual(p.filePathFor('nonexistent', 41, 11, new Date(T0)), undefined);
});

test('engine contract: times merges axis for an arbitrary channel key', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { testScalar: { val: 42, nTimes: 3 } })]);
  assert.strictEqual(p.times('testScalar').length, 3);
  // Channels no file carries return an empty axis, not a fabricated one.
  assert.strictEqual(p.times('nonexistent').length, 0);
});

test('engine contract: samplePaired works for arbitrary paired channel keys', () => {
  const p = new MultiFileGribProvider([mkFile('/t', { fooA: { val: 7 }, fooB: { val: 11 } })]);
  const r = p.samplePaired('fooA', 'fooB', 41, 11, new Date(T0));
  assert.ok(r);
  assert.strictEqual(r!.a, 7);
  assert.strictEqual(r!.b, 11);
  // Only one of the pair present → undefined (pairing requires both from the same file).
  const p2 = new MultiFileGribProvider([mkFile('/t2', { fooA: { val: 7 } })]);
  assert.strictEqual(p2.samplePaired('fooA', 'fooB', 41, 11, new Date(T0)), undefined);
});

// --- Loader contract (skipped, Phase B): loadGribFile must classify via the registry. ---
// Until channels.ts exists, loadGribFile uses a hardcoded if/else chain. This test
// flips from skip to assert in Phase B alongside audit items #3/#4 (subissues #376/#377).

test(
  'loader contract: loadGribFile classifies a runtime-registered channel spec (Phase B)',
  {
    skip: 'Phase B — ChannelSpec registry does not exist yet; loadGribFile uses a hardcoded if/else chain',
  },
  () => {
    // Phase B implementation:
    //   registerChannel({ key: 'testScalar', match: (el) => el === '__TEST_SCALAR__' });
    //   const meta = await readGribMeta(<fixture with __TEST_SCALAR__ band>);
    //   const loaded = await loadGribFile(meta);
    //   assert.ok(loaded.channels.has('testScalar'));
  },
);
