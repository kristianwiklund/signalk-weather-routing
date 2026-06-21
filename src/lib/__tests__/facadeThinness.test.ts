// Phase A: enforces §7.2.1 invariant #4 — facades are thin channel-bindings, not
// implementations. Mocks the engine and asserts every facade method returns the
// engine's sentinel verbatim (no transformation, caching, or extra branching beyond
// the interface-mandated {u:0,v:0} default for undefined paired samples).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WindField, CurrentField } from '../fields';
import type { MultiFileGribProvider } from '../multiFileGribProvider';

const T0 = new Date('2024-01-01T00:00:00Z');

// Mock engine: each method returns a distinctive sentinel. If a facade transforms,
// caches, or substitutes, the assertion will catch it.
function mockEngine(overrides: {
  sample?: number | undefined;
  paired?: { a: number; b: number } | undefined;
  coversSpatial?: boolean;
  covers?: boolean;
  filePath?: string | undefined;
  times?: Date[];
}): MultiFileGribProvider {
  return {
    rankedFiles: [],
    sample: () => overrides.sample ?? undefined,
    samplePaired: () => overrides.paired ?? undefined,
    coversSpatial: () => overrides.coversSpatial ?? false,
    covers: () => overrides.covers ?? false,
    filePathFor: () => overrides.filePath ?? undefined,
    times: () => overrides.times ?? [T0],
  } as unknown as MultiFileGribProvider;
}

test('WindField: getWind returns the engine paired sentinel as {u,v} verbatim', () => {
  const wind = new WindField(mockEngine({ paired: { a: 3.14, b: -1.5 } }));
  assert.deepEqual(wind.getWind(41, 11, 0), { u: 3.14, v: -1.5 });
});

test('WindField: getWind returns {u:0,v:0} when engine returns undefined (interface default)', () => {
  const wind = new WindField(mockEngine({ paired: undefined }));
  assert.deepEqual(wind.getWind(41, 11, 0), { u: 0, v: 0 });
});

test('WindField: getWave returns the engine sample sentinel verbatim', () => {
  const wind = new WindField(mockEngine({ sample: 2.5 }));
  assert.strictEqual(wind.getWave(41, 11, T0), 2.5);
});

test('WindField: getWave returns undefined when engine returns undefined', () => {
  const wind = new WindField(mockEngine({ sample: undefined }));
  assert.strictEqual(wind.getWave(41, 11, T0), undefined);
});

test('WindField: coversPoint delegates to coversSpatial verbatim', () => {
  assert.strictEqual(new WindField(mockEngine({ coversSpatial: true })).coversPoint(41, 11), true);
  assert.strictEqual(new WindField(mockEngine({ coversSpatial: false })).coversPoint(41, 11), false);
});

test('WindField: coversPointAtTime delegates to covers verbatim', () => {
  assert.strictEqual(new WindField(mockEngine({ covers: true })).coversPointAtTime(41, 11, 0), true);
  assert.strictEqual(new WindField(mockEngine({ covers: false })).coversPointAtTime(41, 11, 0), false);
});

test('WindField: getFilePathForPoint delegates to filePathFor verbatim', () => {
  const wind = new WindField(mockEngine({ filePath: '/mock.grib2' }));
  assert.strictEqual(wind.getFilePathForPoint(41, 11, 0), '/mock.grib2');
});

test('WindField: getFilePathForPoint returns empty string when engine returns undefined', () => {
  const wind = new WindField(mockEngine({ filePath: undefined }));
  assert.strictEqual(wind.getFilePathForPoint(41, 11, 0), '');
});

test('WindField: times comes from provider.times("windU") verbatim', () => {
  const axis = [T0, new Date('2024-01-01T01:00:00Z')];
  const wind = new WindField(mockEngine({ times: axis }));
  assert.strictEqual(wind.times, axis);
});

test('CurrentField: getCurrent returns the engine paired sentinel as {u,v} verbatim', () => {
  const cur = new CurrentField(mockEngine({ paired: { a: 0.1, b: 0.2 } }));
  assert.deepEqual(cur.getCurrent(41, 11, T0), { u: 0.1, v: 0.2 });
});

test('CurrentField: getCurrent returns {u:0,v:0} when engine returns undefined', () => {
  const cur = new CurrentField(mockEngine({ paired: undefined }));
  assert.deepEqual(cur.getCurrent(41, 11, T0), { u: 0, v: 0 });
});

test('CurrentField: coversPoint delegates to coversSpatial verbatim', () => {
  assert.strictEqual(new CurrentField(mockEngine({ coversSpatial: true })).coversPoint(41, 11), true);
  assert.strictEqual(new CurrentField(mockEngine({ coversSpatial: false })).coversPoint(41, 11), false);
});

test('CurrentField: times comes from provider.times("currentU") verbatim', () => {
  const axis = [T0];
  const cur = new CurrentField(mockEngine({ times: axis }));
  assert.strictEqual(cur.times, axis);
});
