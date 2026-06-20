// Phase 2 tests: current adapter + multi-file current via the generic engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiFileGribProvider } from '../multiFileGribProvider';
import { CurrentField } from '../fields';
import { currentGribDataToLoadedFile } from '../gribAdapter';
import { CurrentGribData, GribFileMeta } from '../../types';

const T0 = new Date('2024-01-01T00:00:00Z').getTime();
const T1 = T0 + 3600000;

function makeCurrentData(opts: { u?: number; v?: number; latMin?: number; lonMin?: number }): CurrentGribData {
  const latMin = opts.latMin ?? 40;
  const lonMin = opts.lonMin ?? 10;
  const nLat = 3;
  const nLon = 3;
  const u = opts.u ?? 0;
  const v = opts.v ?? 2;
  const times = [new Date(T0), new Date(T1)];
  return {
    latMin,
    latStep: 1,
    lonMin,
    lonStep: 1,
    nLat,
    nLon,
    times,
    u: times.map(() => new Float32Array(nLat * nLon).fill(u)),
    v: times.map(() => new Float32Array(nLat * nLon).fill(v)),
  };
}

function makeCurrentMeta(opts: {
  path: string;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
  refMs?: number;
}): GribFileMeta {
  return {
    path: opts.path,
    mtime: 1000,
    type: 'current',
    latMin: opts.latMin ?? 40,
    latMax: opts.latMax ?? 42,
    lonMin: opts.lonMin ?? 10,
    lonMax: opts.lonMax ?? 12,
    latStep: 1,
    lonStep: 1,
    timeStart: new Date(T0),
    timeEnd: new Date(T1),
    nTimes: 2,
    referenceTime: new Date(opts.refMs ?? T0),
  };
}

test('currentGribDataToLoadedFile: produces currentU/currentV channels', () => {
  const data = makeCurrentData({ u: 0.5, v: -0.3 });
  const meta = makeCurrentMeta({ path: '/test.grb2' });
  const file = currentGribDataToLoadedFile(meta, data);
  assert.ok(file.channels.has('currentU'));
  assert.ok(file.channels.has('currentV'));
  assert.strictEqual(file.channels.size, 2);
});

test('CurrentField: getCurrent returns the vector from the covering file', () => {
  const data = makeCurrentData({ u: 5, v: -3 });
  const meta = makeCurrentMeta({ path: '/cur.grb2' });
  const file = currentGribDataToLoadedFile(meta, data);
  const field = new CurrentField(new MultiFileGribProvider([file]));
  const r = field.getCurrent(41, 11, new Date(T0));
  assert.strictEqual(r.u, 5);
  assert.strictEqual(r.v, -3);
});

test('CurrentField: multi-current regional stitch — two non-overlapping regions', () => {
  const northFile = currentGribDataToLoadedFile(
    makeCurrentMeta({ path: '/north.grb2', latMin: 50, latMax: 52 }),
    makeCurrentData({ u: 1, v: 2, latMin: 50 }),
  );
  const southFile = currentGribDataToLoadedFile(
    makeCurrentMeta({ path: '/south.grb2', latMin: 40, latMax: 42 }),
    makeCurrentData({ u: 3, v: 4, latMin: 40 }),
  );
  const field = new CurrentField(new MultiFileGribProvider([northFile, southFile]));
  // North region
  const n = field.getCurrent(51, 11, new Date(T0));
  assert.strictEqual(n.u, 1);
  assert.strictEqual(n.v, 2);
  // South region
  const s = field.getCurrent(41, 11, new Date(T0));
  assert.strictEqual(s.u, 3);
  assert.strictEqual(s.v, 4);
  // Gap — no coverage
  const g = field.getCurrent(45, 11, new Date(T0));
  assert.strictEqual(g.u, 0);
  assert.strictEqual(g.v, 0);
});

test('CurrentField: temporal gate — wrong-period file is not sampled', () => {
  const fA = currentGribDataToLoadedFile(makeCurrentMeta({ path: '/a.grb2' }), makeCurrentData({ u: 1, v: 0 }));
  const fB = currentGribDataToLoadedFile(
    makeCurrentMeta({ path: '/b.grb2', refMs: T0 + 48 * 3600000 }),
    makeCurrentData({ u: 9, v: 0 }),
  );
  // Shift fB to a later period
  const off = 48 * 3600000;
  fB.meta.timeStart = new Date(T0 + off);
  fB.meta.timeEnd = new Date(T1 + off);
  for (const ch of fB.channels.values()) {
    const shifted = new Map<number, Float32Array>();
    for (const [ms, g] of ch.byTime) shifted.set(ms + off, g);
    ch.byTime = shifted;
  }
  const field = new CurrentField(new MultiFileGribProvider([fA, fB]));
  // At T0: fA covers, fB doesn't temporally → fA wins (u=1, not u=9)
  assert.strictEqual(field.getCurrent(41, 11, new Date(T0)).u, 1);
});
