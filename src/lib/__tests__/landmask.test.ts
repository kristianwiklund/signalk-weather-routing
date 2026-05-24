import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLand, pathCrossesLand } from '../landmask';
import { LandMask } from '../../types';

// 4×4 grid, 1° step, origin at (0, 0)
// Land pattern (row=lat, col=lon):
//   row 0 (lat=0): 0 0 0 0
//   row 1 (lat=1): 0 1 1 0   ← land strip at lon=1,2
//   row 2 (lat=2): 0 1 1 0
//   row 3 (lat=3): 0 0 0 0
function makeMask(): LandMask {
  const nLat = 4, nLon = 4;
  const data = new Uint8Array(Math.ceil((nLat * nLon) / 8));
  const setLand = (latI: number, lonI: number) => {
    const bit = latI * nLon + lonI;
    data[bit >> 3] |= 1 << (bit & 7);
  };
  setLand(1, 1); setLand(1, 2);
  setLand(2, 1); setLand(2, 2);
  return { latMin: 0, latStep: 1, lonMin: 0, lonStep: 1, nLat, nLon, data };
}

const mask = makeMask();

test('isLand: land cell returns true', () => {
  assert.ok(isLand(mask, 1.5, 1.5));
});

test('isLand: water cell returns false', () => {
  assert.ok(!isLand(mask, 0.5, 0.5));
});

test('isLand: out of bounds returns false', () => {
  assert.ok(!isLand(mask, -1, 0));
  assert.ok(!isLand(mask, 0, -1));
  assert.ok(!isLand(mask, 5, 0));
});

test('pathCrossesLand: endpoint on land', () => {
  assert.ok(pathCrossesLand(mask, 0.5, 0.5, 1.5, 1.5));
});

test('pathCrossesLand: both endpoints water, path crosses land', () => {
  // vertical path at lon=1.5 from lat=0.5 (water row 0) to lat=3.5 (water row 3)
  // passes through land strip at latI=1,2 (lat 1.0–2.9)
  assert.ok(pathCrossesLand(mask, 0.5, 1.5, 3.5, 1.5));
});

test('pathCrossesLand: path entirely in water', () => {
  assert.ok(!pathCrossesLand(mask, 0.5, 0.5, 0.5, 0.9));
});

test('pathCrossesLand: very short segment (nSteps=1 degenerate case)', () => {
  // segment shorter than stepDeg — only endpoint check applies
  assert.ok(!pathCrossesLand(mask, 0.1, 0.1, 0.2, 0.2));
  assert.ok(pathCrossesLand(mask, 0.5, 0.5, 1.5, 1.5));
});
