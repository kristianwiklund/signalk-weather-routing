import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLandIndex, segmentCrossesLand, polygonsInBbox } from '../landmask';
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

test('polygonsInBbox: returns polygon when bbox overlaps its grid cell', () => {
  const result = polygonsInBbox(index, 1, 1, 3, 3);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], poly);
});

test('polygonsInBbox: deduplicates polygon spanning multiple cells', () => {
  // poly spans cells (1,1),(1,2),(2,1),(2,2) — querying a bbox covering all four must return it once
  const result = polygonsInBbox(index, 0, 0, 4, 4);
  assert.strictEqual(result.length, 1);
});

test('polygonsInBbox: returns empty array for bbox with no land', () => {
  const result = polygonsInBbox(index, -10, -10, -8, -8);
  assert.strictEqual(result.length, 0);
});

test('land-polygons serialization: exterior Float64Array converts to closed [lon,lat] GeoJSON ring', () => {
  // makeSquarePoly exterior: [1,1, 3,1, 3,3, 1,3, 1,1] interleaved as [lon,lat,...]
  const p = makeSquarePoly();
  const coords: [number, number][] = [];
  for (let j = 0; j < p.exterior.length; j += 2) coords.push([p.exterior[j], p.exterior[j + 1]]);
  if (coords.length > 0) coords.push(coords[0]);
  const feature = JSON.parse(JSON.stringify({
    type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: null,
  }));
  assert.strictEqual(feature.type, 'Feature');
  assert.strictEqual(feature.geometry.type, 'Polygon');
  const ring: [number, number][] = feature.geometry.coordinates[0];
  assert.deepStrictEqual(ring[0], ring[ring.length - 1]); // ring is closed
  assert.strictEqual(ring[0][0], 1); // lon
  assert.strictEqual(ring[0][1], 1); // lat
});
