import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLandIndex, segmentCrossesLand } from '../landmask';
import { LandPolygon } from '../../types';

// A 2°×2° square island: lon 1–3, lat 1–3 (counterclockwise exterior ring)
function makeSquarePoly(): LandPolygon {
  const coords = [1,1, 3,1, 3,3, 1,3, 1,1]; // [lon,lat, ...]
  const exterior = new Float64Array(coords.length);
  coords.forEach((v, i) => { exterior[i] = v; });
  return { bboxLatMin: 1, bboxLatMax: 3, bboxLonMin: 1, bboxLonMax: 3, exterior };
}

const poly = makeSquarePoly();
const index = buildLandIndex([poly]);

test('segmentCrossesLand: endpoint inside polygon → true', () => {
  assert.ok(segmentCrossesLand(index, 0, 0, 2, 2));
});

test('segmentCrossesLand: both endpoints outside but segment crosses polygon → true', () => {
  // horizontal segment from lon=-1 to lon=5, at lat=2 (bisects the square)
  assert.ok(segmentCrossesLand(index, 2, -1, 2, 5));
});

test('segmentCrossesLand: both endpoints outside, segment does not cross → false', () => {
  assert.ok(!segmentCrossesLand(index, 0, 0, 0, 5));
});

test('segmentCrossesLand: both endpoints inside → true', () => {
  assert.ok(segmentCrossesLand(index, 2, 1.5, 2, 2.5));
});

test('segmentCrossesLand: segment entirely in water, far from polygon → false', () => {
  assert.ok(!segmentCrossesLand(index, -10, -10, -9, -9));
});

test('buildLandIndex: grid has entries for cells the polygon occupies', () => {
  // polygon covers cells (lat=1,lon=1), (lat=1,lon=2), (lat=2,lon=1), (lat=2,lon=2)
  const key = (1 + 90) * 360 + (1 + 180);
  assert.ok(index.grid.has(key));
});
