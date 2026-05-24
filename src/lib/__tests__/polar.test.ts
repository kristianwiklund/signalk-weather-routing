import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parsePolar, interpolateBoatSpeed } from '../polar';
import { PolarData } from '../../types';

// Minimal inline polar for testing:
// TWS: 10, 20
// TWA:  0 →  0,  0
//       90 →  5, 10
//      180 →  3,  6
const POLAR_CSV = [
  'twa/tws;10;20',
  '0;0;0',
  '90;5;10',
  '180;3;6',
].join('\n');

function writeTmpPolar(): string {
  const tmpFile = path.join(os.tmpdir(), `polar-test-${process.pid}.csv`);
  fs.writeFileSync(tmpFile, POLAR_CSV);
  return tmpFile;
}

let tmpFile: string;
let polar: PolarData;

test('parsePolar: parses header TWS values', () => {
  tmpFile = writeTmpPolar();
  polar = parsePolar(tmpFile);
  assert.deepStrictEqual(polar.tws, [10, 20]);
});

test('parsePolar: parses TWA rows', () => {
  assert.deepStrictEqual(polar.twa, [0, 90, 180]);
});

test('parsePolar: speeds array shape', () => {
  assert.strictEqual(polar.speeds.length, 3);
  assert.deepStrictEqual(polar.speeds[1], [5, 10]);
});

test('interpolateBoatSpeed: exact grid point TWA=90 TWS=10 → 5 kt', () => {
  const spd = interpolateBoatSpeed(polar, 90, 10);
  assert.ok(Math.abs(spd - 5) < 0.001, `expected 5, got ${spd}`);
});

test('interpolateBoatSpeed: exact grid point TWA=90 TWS=20 → 10 kt', () => {
  const spd = interpolateBoatSpeed(polar, 90, 20);
  assert.ok(Math.abs(spd - 10) < 0.001, `expected 10, got ${spd}`);
});

test('interpolateBoatSpeed: midpoint TWS=15 at TWA=90 → 7.5 kt', () => {
  const spd = interpolateBoatSpeed(polar, 90, 15);
  assert.ok(Math.abs(spd - 7.5) < 0.001, `expected 7.5, got ${spd}`);
});

test('interpolateBoatSpeed: midpoint TWA=135 at TWS=10 → midpoint 5 and 3 = 4 kt', () => {
  // TWA=135 is midpoint between 90 and 180; TWS=10 gives (5+3)/2 = 4
  const spd = interpolateBoatSpeed(polar, 135, 10);
  assert.ok(Math.abs(spd - 4) < 0.001, `expected 4, got ${spd}`);
});

test('interpolateBoatSpeed: bilinear centre TWA=135 TWS=15 → (5+10+3+6)/4 = 6', () => {
  const spd = interpolateBoatSpeed(polar, 135, 15);
  assert.ok(Math.abs(spd - 6) < 0.001, `expected 6, got ${spd}`);
});

test('interpolateBoatSpeed: polar is symmetric — negative TWA same as positive', () => {
  const pos = interpolateBoatSpeed(polar, 90, 10);
  const neg = interpolateBoatSpeed(polar, -90, 10);
  assert.strictEqual(pos, neg);
});

test('interpolateBoatSpeed: zero boat speed for TWA=0 (head-to-wind)', () => {
  const spd = interpolateBoatSpeed(polar, 0, 15);
  assert.strictEqual(spd, 0);
});

test('interpolateBoatSpeed: clamps TWS below minimum', () => {
  // TWS below the grid minimum should return speed at grid minimum
  const atMin = interpolateBoatSpeed(polar, 90, 10);
  const below = interpolateBoatSpeed(polar, 90, 5);
  assert.strictEqual(below, atMin);
});

test('cleanup temp file', () => {
  if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
  assert.ok(true);
});
