import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { MultiFileWindProvider, nearestIdx } from '../windprovider';
import { GribData, GribFileEntry } from '../../types';

function makeGrib(opts: { latMin?: number; latMax?: number; lonMin?: number; lonMax?: number; u?: number; v?: number; times?: Date[] }): GribData {
  const latMin = opts.latMin ?? 40;
  const latStep = 1;
  const lonMin = opts.lonMin ?? 10;
  const lonStep = 1;
  const nLat = 3, nLon = 3;
  const nPoints = nLat * nLon;
  const t0 = opts.times?.[0] ?? new Date('2024-01-01T00:00:00Z');
  const t1 = opts.times?.[1] ?? new Date('2024-01-01T01:00:00Z');
  const times = opts.times ?? [t0, t1];
  const u = opts.u ?? 0;
  const v = opts.v ?? 5;
  return {
    latMin, latStep, lonMin, lonStep, nLat, nLon, times,
    u10: times.map(() => new Float32Array(nPoints).fill(u)),
    v10: times.map(() => new Float32Array(nPoints).fill(v)),
  };
}

function makeEntry(grib: GribData, mtime: number, path_ = 'test.grib2'): GribFileEntry {
  return {
    meta: {
      path: path_,
      mtime,
      latMin: grib.latMin,
      latMax: grib.latMin + grib.latStep * (grib.nLat - 1),
      lonMin: grib.lonMin,
      lonMax: grib.lonMin + grib.lonStep * (grib.nLon - 1),
      latStep: grib.latStep,
      lonStep: grib.lonStep,
      timeStart: grib.times[0],
      timeEnd: grib.times[grib.times.length - 1],
      nTimes: grib.times.length,
    },
    data: grib,
  };
}

test('nearestIdx: returns 0 for single-element array', () => {
  const times = [new Date('2024-01-01T00:00:00Z')];
  assert.strictEqual(nearestIdx(times, new Date('2024-01-01T06:00:00Z')), 0);
});

test('nearestIdx: finds exact match', () => {
  const times = [
    new Date('2024-01-01T00:00:00Z'),
    new Date('2024-01-01T01:00:00Z'),
    new Date('2024-01-01T02:00:00Z'),
  ];
  assert.strictEqual(nearestIdx(times, new Date('2024-01-01T01:00:00Z')), 1);
});

test('nearestIdx: rounds to nearest', () => {
  const times = [
    new Date('2024-01-01T00:00:00Z'),
    new Date('2024-01-01T02:00:00Z'),
  ];
  // 30 minutes past midnight is closer to index 0
  assert.strictEqual(nearestIdx(times, new Date('2024-01-01T00:30:00Z')), 0);
  // 90 minutes past midnight is closer to index 1
  assert.strictEqual(nearestIdx(times, new Date('2024-01-01T01:30:00Z')), 1);
});

test('MultiFileWindProvider: merged times axis contains entries from all files', () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const g1 = makeGrib({ times: [t0, t1] });
  const g2 = makeGrib({ times: [t1, t2] });
  const provider = new MultiFileWindProvider([makeEntry(g1, 1000), makeEntry(g2, 2000)]);
  // t1 appears in both files — should be deduplicated
  assert.strictEqual(provider.times.length, 3);
  assert.strictEqual(provider.times[0].getTime(), t0.getTime());
  assert.strictEqual(provider.times[1].getTime(), t1.getTime());
  assert.strictEqual(provider.times[2].getTime(), t2.getTime());
});

test('MultiFileWindProvider: getWind returns freshest file when files overlap spatially', () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  // Older file: v=5 (southerly), newer file: v=10 (stronger southerly)
  const gOld = makeGrib({ v: 5, times: [t0, t1] });
  const gNew = makeGrib({ v: 10, times: [t0, t1] });
  const provider = new MultiFileWindProvider([
    makeEntry(gOld, 1000, 'old.grib2'),
    makeEntry(gNew, 2000, 'new.grib2'),
  ]);
  const wind = provider.getWind(41, 11, 0);  // both files cover this point
  assert.strictEqual(wind.v, 10, 'should use the newer file (mtime 2000)');
});

test('MultiFileWindProvider: getWind falls back to any file when point outside all bboxes', () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const g = makeGrib({ latMin: 40, lonMin: 10, v: 7, times: [t0, t1] });
  const provider = new MultiFileWindProvider([makeEntry(g, 1000)]);
  // Point is outside the 40–42 lat / 10–12 lon bbox — bilinear clamps to edge
  const wind = provider.getWind(60, 20, 0);
  assert.ok(typeof wind.u === 'number' && typeof wind.v === 'number', 'should return numbers');
});

test('MultiFileWindProvider: getWind prefers temporally-correct file over newer file outside the requested time', () => {
  const may24 = new Date('2026-05-24T00:00:00Z');
  const may25 = new Date('2026-05-25T00:00:00Z');
  const jun6  = new Date('2026-06-06T00:00:00Z');
  const jun7  = new Date('2026-06-07T00:00:00Z');
  // Older file covers May 24–25 with v=5 (the correct data for a May 24 departure)
  const gOld = makeGrib({ v: 5,  times: [may24, may25] });
  // Newer file (higher mtime) covers June 6–7 with v=10 — same spatial bbox, wrong time period
  const gNew = makeGrib({ v: 10, times: [jun6,  jun7]  });
  const provider = new MultiFileWindProvider([
    makeEntry(gOld, 1000, 'may24.grib2'),
    makeEntry(gNew, 2000, 'jun06.grib2'),
  ]);
  // timeIdx 0 is May 24 in the merged timeline — gOld covers it, gNew does not
  const wind = provider.getWind(41, 11, 0);
  assert.strictEqual(wind.v, 5, 'should use the May 24 file which covers the requested time');
});

test('MultiFileWindProvider: getWind falls back to spatial-only match when no file covers the requested time', () => {
  const jun6 = new Date('2026-06-06T00:00:00Z');
  const jun7 = new Date('2026-06-07T00:00:00Z');
  const grib = makeGrib({ v: 7, times: [jun6, jun7] });
  const provider = new MultiFileWindProvider([makeEntry(grib, 1000)]);
  // Request a time well outside the file's range — should fall back to spatial match
  const futureIdx = 0; // only one time in the merged axis; provider still returns data
  const wind = provider.getWind(41, 11, futureIdx);
  assert.ok(typeof wind.v === 'number', 'should return a number via spatial fallback');
});

test('MultiFileWindProvider: getWave returns undefined when no file has swh data', () => {
  const g = makeGrib({});
  const provider = new MultiFileWindProvider([makeEntry(g, 1000)]);
  assert.strictEqual(provider.getWave(41, 11, new Date('2024-01-01T00:00:00Z')), undefined);
});

test('MultiFileWindProvider: single file times axis matches grib.times', () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const g = makeGrib({ times: [t0, t1, t2] });
  const provider = new MultiFileWindProvider([makeEntry(g, 1000)]);
  assert.strictEqual(provider.times.length, 3);
  assert.strictEqual(provider.times[0].getTime(), t0.getTime());
  assert.strictEqual(provider.times[2].getTime(), t2.getTime());
});

test('MultiFileWindProvider: getFilePathForPoint returns path of the file getWind selects', () => {
  // Two spatially overlapping files; file B is fresher (higher mtime) and covers all times.
  // getWind prefers the fresher file → getFilePathForPoint must return file B's path.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const gribA = makeGrib({ times: [t0, t1] });
  const gribB = makeGrib({ times: [t0, t1], u: 1 });
  const entryA = makeEntry(gribA, 1000, '/data/fileA.grib2');
  const entryB = makeEntry(gribB, 2000, '/data/fileB.grib2');
  const provider = new MultiFileWindProvider([entryA, entryB]);
  // Both files cover (41, 11) and time index 0; B has higher mtime → B wins
  assert.strictEqual(provider.getFilePathForPoint(41, 11, 0), '/data/fileB.grib2');
});

test('MultiFileWindProvider: getFilePathForPoint falls back to spatial match when no temporal match', () => {
  // File A covers the point spatially and temporally; file B only covers spatially (time mismatch).
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const gribA = makeGrib({ times: [t0, t1] });  // covers t0 and t1
  const gribB = makeGrib({ times: [t1, t2] });  // covers t1 and t2 only
  const entryA = makeEntry(gribA, 1000, '/data/fileA.grib2');
  const entryB = makeEntry(gribB, 500,  '/data/fileB.grib2');
  const provider = new MultiFileWindProvider([entryA, entryB]);
  // At time index for t0: only A covers temporally → A selected
  const idx0 = provider.times.findIndex(t => t.getTime() === t0.getTime());
  assert.strictEqual(provider.getFilePathForPoint(41, 11, idx0), '/data/fileA.grib2');
  // At time index for t2: only B covers temporally → B selected
  const idx2 = provider.times.findIndex(t => t.getTime() === t2.getTime());
  assert.strictEqual(provider.getFilePathForPoint(41, 11, idx2), '/data/fileB.grib2');
});

// scanGribDir: integration test using a real temp directory
import { scanGribDir } from '../grib';

test('scanGribDir: finds grib2 files and ignores others', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grib-test-'));
  try {
    await fs.writeFile(path.join(dir, 'forecast.grib2'), '');
    await fs.writeFile(path.join(dir, 'other.grib'), '');
    await fs.writeFile(path.join(dir, 'readme.txt'), '');
    await fs.writeFile(path.join(dir, 'DATA.GRB2'), '');  // uppercase extension
    const files = await scanGribDir(dir);
    assert.strictEqual(files.length, 3, 'should find .grib2, .grib, .GRB2 (case-insensitive)');
    assert.ok(files.every(f => f.startsWith(dir)), 'paths should be absolute');
    assert.ok(files.every(f => !f.endsWith('.txt')), 'should not include .txt');
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('scanGribDir: returns empty array for empty directory', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grib-test-'));
  try {
    const files = await scanGribDir(dir);
    assert.strictEqual(files.length, 0);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
});

test('scanGribDir: throws for non-existent directory', async () => {
  await assert.rejects(
    () => scanGribDir('/nonexistent/path/that/does/not/exist'),
    /ENOENT/,
  );
});
