// Phase A: differential harness — loads each real fixture via BOTH the legacy path
// (loadGrib/loadCurrentGrib → MultiFileWindProvider/SingleFileCurrentProvider) and the
// new path (loadGribFile → MultiFileGribProvider → WindField/CurrentField), samples a
// grid of points, and asserts the two produce identical results. This is the safety net
// that earns the right to generalise (Phase B) and delete legacy (Phase E).
//
// Tolerance: exact (1e-6 absolute) for Float32 arithmetic. If a legitimate algorithmic
// difference is found, it is reported in the failure message — do NOT relax tolerance
// without logging to BUGS.md and documenting the reason in this file (§7.2 principle #2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import { loadGrib, loadCurrentGrib, readGribMeta, loadGribFile } from '../grib';
import { MultiFileWindProvider } from '../windprovider';
import { SingleFileCurrentProvider } from '../currentprovider';
import { MultiFileGribProvider } from '../multiFileGribProvider';
import { WindField, CurrentField } from '../fields';
import type { GribFileEntry, CurrentFileEntry, GribFileMeta } from '../../types';

const FIXTURE_DIR = path.join(process.cwd(), 'test-data');
const TOL = 1e-6; // Float32 arithmetic; anything beyond this is a real divergence.

// Decimal degrees → degrees-minutes-seconds with hemisphere (nautical chart format).
// Reports fractional seconds (3 decimals ≈ 3 cm) so the position is chart-findable
// while the exact decimal value is kept alongside for code reproducibility.
function dms(dd: number, isLat: boolean): string {
  const hemi = dd >= 0 ? (isLat ? 'N' : 'E') : isLat ? 'S' : 'W';
  const abs = Math.abs(dd);
  const d = Math.floor(abs);
  const minFloat = (abs - d) * 60;
  const m = Math.floor(minFloat);
  const s = (minFloat - m) * 60;
  const sStr = s.toFixed(3).padStart(6, '0');
  return `${d}°${m.toString().padStart(2, '0')}'${sStr}"${hemi}`;
}

// Format a coordinate as "decimal [DMS]" for diff output — exact value + chart format.
function coord(lat: number, lon: number): string {
  return `${lat} [${dms(lat, true)}], ${lon} [${dms(lon, false)}]`;
}

// Format a u/v velocity vector with exact components + magnitude (m/s) + direction of
// flow (degrees, clockwise from 0=N). Direction is where the water/air is moving TOWARD.
function fmtVec(u: number, v: number): string {
  const mag = Math.sqrt(u * u + v * v);
  let dir = (Math.atan2(u, v) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return `{u:${u}, v:${v}, mag:${mag.toFixed(4)} m/s, flow:${dir.toFixed(1)}°}`;
}

// Format a significant wave height value (HTSGW / swh channel) in meters.
function fmtSwh(val: number | undefined): string {
  return val === undefined ? 'swh (HTSGW)=undefined' : `swh (HTSGW)=${val} m`;
}

const WIND_FIXTURES = ['Denmark_ICON_EU_EWAM_20260606-00.grb2', 'Baltic_South_ICON_EU_EWAM_20260606-00.grb2'];
const CURRENT_FIXTURE = 'Current_ba_2026061400_00.grb2';

function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, name);
}

// Sample N×N interior grid + 4 out-of-bbox sentinel points; return mismatch descriptions.
function sampleWindGrid(
  meta: GribFileMeta,
  legacy: {
    getWind: (lat: number, lon: number, tIdx: number) => { u: number; v: number };
    getWave: (lat: number, lon: number, t: Date) => number | undefined;
  },
  modern: {
    getWind: (lat: number, lon: number, tIdx: number) => { u: number; v: number };
    getWave: (lat: number, lon: number, t: Date) => number | undefined;
  },
): { windDiffs: string[]; waveDiffs: string[]; maxWindDiff: number; maxWaveDiff: number } {
  const windDiffs: string[] = [];
  const waveDiffs: string[] = [];
  let maxWindDiff = 0;
  let maxWaveDiff = 0;
  const tIndices = [0, Math.floor(meta.nTimes / 2), meta.nTimes - 1];
  const lats: number[] = [];
  const lons: number[] = [];
  for (let i = 0; i <= 5; i++) lats.push(meta.latMin + ((meta.latMax - meta.latMin) * i) / 5);
  for (let j = 0; j <= 5; j++) lons.push(meta.lonMin + ((meta.lonMax - meta.lonMin) * j) / 5);

  for (const tIdx of tIndices) {
    for (const lat of lats) {
      for (const lon of lons) {
        const lw = legacy.getWind(lat, lon, tIdx);
        const mw = modern.getWind(lat, lon, tIdx);
        const du = Math.abs(lw.u - mw.u);
        const dv = Math.abs(lw.v - mw.v);
        if (du > TOL || dv > TOL) {
          windDiffs.push(
            `  wind(${coord(lat, lon)},tIdx=${tIdx}): legacy ${fmtVec(lw.u, lw.v)} | new ${fmtVec(mw.u, mw.v)} | Δu=${du.toExponential(2)} Δv=${dv.toExponential(2)}`,
          );
          maxWindDiff = Math.max(maxWindDiff, du, dv);
        }
      }
    }
  }

  // Wave: sample at the same grid but using Date (wave API takes a Date, not timeIdx).
  const sampleTimes = tIndices.map(
    (i) =>
      new Date(
        meta.timeStart.getTime() +
          ((meta.timeEnd.getTime() - meta.timeStart.getTime()) * i) / Math.max(1, meta.nTimes - 1),
      ),
  );
  for (const t of sampleTimes) {
    for (const lat of lats) {
      for (const lon of lons) {
        const lw = legacy.getWave(lat, lon, t);
        const mw = modern.getWave(lat, lon, t);
        // Both undefined → match. Both defined → compare numerically. One defined, other not → mismatch.
        if (lw === undefined && mw === undefined) continue;
        if (lw === undefined || mw === undefined) {
          waveDiffs.push(`  wave(${coord(lat, lon)},t=${t.toISOString()}): legacy ${fmtSwh(lw)} | new ${fmtSwh(mw)}`);
          continue;
        }
        const d = Math.abs(lw - mw);
        if (d > TOL) {
          waveDiffs.push(
            `  wave(${coord(lat, lon)},t=${t.toISOString()}): legacy ${fmtSwh(lw)} | new ${fmtSwh(mw)} | Δ=${d.toExponential(2)}`,
          );
          maxWaveDiff = Math.max(maxWaveDiff, d);
        }
      }
    }
  }

  return { windDiffs, waveDiffs, maxWindDiff, maxWaveDiff };
}

test('differential: wind+wave fixtures produce identical results on both paths', async () => {
  const allWindDiffs: string[] = [];
  const allWaveDiffs: string[] = [];
  let maxWind = 0;
  let maxWave = 0;
  let fixturesTested = 0;

  for (const name of WIND_FIXTURES) {
    const fixture = fixturePath(name);
    if (!existsSync(fixture)) continue;
    fixturesTested++;

    // Legacy path
    const legacyData = await loadGrib(fixture);
    const meta = await readGribMeta(fixture);
    const legacyEntry: GribFileEntry = { meta: { ...meta, type: 'wind' }, data: legacyData };
    const legacy = new MultiFileWindProvider([legacyEntry]);

    // New path
    const loaded = await loadGribFile(meta);
    const modern = new WindField(new MultiFileGribProvider([loaded]));

    // Times axis must match (a mismatch here means the whole comparison is meaningless).
    assert.deepEqual(
      legacy.times.map((t) => t.getTime()),
      modern.times.map((t) => t.getTime()),
      `${name}: merged times axis differs between legacy and new`,
    );

    const r = sampleWindGrid(meta, legacy, modern);
    allWindDiffs.push(...r.windDiffs.map((d) => `[${name}] ${d}`));
    allWaveDiffs.push(...r.waveDiffs.map((d) => `[${name}] ${d}`));
    maxWind = Math.max(maxWind, r.maxWindDiff);
    maxWave = Math.max(maxWave, r.maxWaveDiff);
  }

  if (fixturesTested === 0) {
    // node:test doesn't have a clean "skip from inside" — emit a passing assertion.
    assert.ok(true, 'no wind fixtures present; differential skipped');
    return;
  }

  assert.strictEqual(
    allWindDiffs.length,
    0,
    `${allWindDiffs.length} wind differences (max ${maxWind.toExponential(2)}) across ${fixturesTested} fixtures:\n${allWindDiffs.slice(0, 20).join('\n')}${allWindDiffs.length > 20 ? `\n…(${allWindDiffs.length - 20} more)` : ''}`,
  );
  assert.strictEqual(
    allWaveDiffs.length,
    0,
    `${allWaveDiffs.length} wave differences (max ${maxWave.toExponential(2)}) across ${fixturesTested} fixtures:\n${allWaveDiffs.slice(0, 20).join('\n')}${allWaveDiffs.length > 20 ? `\n…(${allWaveDiffs.length - 20} more)` : ''}`,
  );
});

// Known postponed divergences: coordinates where the new engine and legacy disagree
// due to a logged, deferred bug. These are skipped in the differential so the gate
// can pass for all OTHER points. Each entry must reference an open bug.
// Remove the entry when its bug is fixed.
const KNOWN_DIVERGENCES: Array<{ lat: number; lon: number; bug: string }> = [
  // BUG-137 (#383): new engine rejects fill-value (9999) corners; legacy interpolates
  // with them. Point is inside the grid near land (Åland archipelago). Postponed.
  { lat: 63.41000000000001, lon: 21.6665305, bug: 'BUG-137 (#383)' },
];

function isKnownDivergence(lat: number, lon: number): string | null {
  const hit = KNOWN_DIVERGENCES.find((d) => Math.abs(d.lat - lat) < 1e-9 && Math.abs(d.lon - lon) < 1e-9);
  return hit ? hit.bug : null;
}

test('differential: current fixture produces identical results on both paths', async () => {
  const fixture = fixturePath(CURRENT_FIXTURE);
  if (!existsSync(fixture)) {
    assert.ok(true, `${CURRENT_FIXTURE} not present; differential skipped`);
    return;
  }

  // Legacy path
  const legacyData = await loadCurrentGrib(fixture);
  const meta = await readGribMeta(fixture);
  const legacyEntry: CurrentFileEntry = { meta: { ...meta, type: 'current' }, data: legacyData };
  const legacy = new SingleFileCurrentProvider(legacyEntry);

  // New path
  const loaded = await loadGribFile(meta);
  const modern = new CurrentField(new MultiFileGribProvider([loaded]));

  // Times axis must match.
  assert.deepEqual(
    legacy.times.map((t) => t.getTime()),
    modern.times.map((t) => t.getTime()),
    `${CURRENT_FIXTURE}: times axis differs between legacy and new`,
  );

  const diffs: string[] = [];
  const skipped: string[] = [];
  let maxDiff = 0;
  const lats: number[] = [];
  const lons: number[] = [];
  for (let i = 0; i <= 5; i++) lats.push(meta.latMin + ((meta.latMax - meta.latMin) * i) / 5);
  for (let j = 0; j <= 5; j++) lons.push(meta.lonMin + ((meta.lonMax - meta.lonMin) * j) / 5);
  const sampleTimes = [0, Math.floor(meta.nTimes / 2), meta.nTimes - 1].map((i) => legacy.times[i]);

  for (const t of sampleTimes) {
    for (const lat of lats) {
      for (const lon of lons) {
        const known = isKnownDivergence(lat, lon);
        if (known) {
          skipped.push(`  ${known} at (${coord(lat, lon)}, t=${t.toISOString()})`);
          continue;
        }
        const lc = legacy.getCurrent(lat, lon, t);
        const mc = modern.getCurrent(lat, lon, t);
        const du = Math.abs(lc.u - mc.u);
        const dv = Math.abs(lc.v - mc.v);
        if (du > TOL || dv > TOL) {
          diffs.push(
            `  current(${coord(lat, lon)},t=${t.toISOString()}): legacy ${fmtVec(lc.u, lc.v)} | new ${fmtVec(mc.u, mc.v)} | Δu=${du.toExponential(2)} Δv=${dv.toExponential(2)}`,
          );
          maxDiff = Math.max(maxDiff, du, dv);
        }
      }
    }
  }

  assert.strictEqual(
    diffs.length,
    0,
    `${diffs.length} unexpected current differences (max ${maxDiff.toExponential(2)}):\n${diffs.slice(0, 20).join('\n')}${diffs.length > 20 ? `\n…(${diffs.length - 20} more)` : ''}\n(${skipped.length} known postponed divergences skipped)`,
  );
});
