import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dilateAndMergePolygons } from '../dilate';
import { LandPolygon } from '../../types';

function makeSquare(latMin: number, lonMin: number, size: number): LandPolygon {
  const exterior = new Float64Array([
    lonMin,        latMin,
    lonMin + size, latMin,
    lonMin + size, latMin + size,
    lonMin,        latMin + size,
    lonMin,        latMin,
  ]);
  return {
    bboxLatMin: latMin, bboxLatMax: latMin + size,
    bboxLonMin: lonMin, bboxLonMax: lonMin + size,
    exterior,
  };
}

test('dilate: buffered polygon bbox is strictly larger than input', async () => {
  const poly = makeSquare(58, 18, 0.1);
  const result = await dilateAndMergePolygons([poly], 0.5);
  assert.ok(result.length > 0, 'should produce at least one polygon');
  assert.ok(result[0].bboxLatMin < poly.bboxLatMin, 'should expand south');
  assert.ok(result[0].bboxLatMax > poly.bboxLatMax, 'should expand north');
  assert.ok(result[0].bboxLonMin < poly.bboxLonMin, 'should expand west');
  assert.ok(result[0].bboxLonMax > poly.bboxLonMax, 'should expand east');
});

test('dilate: two polygons within buffer distance merge into one', async () => {
  // ~0.3 NM apart — within 0.5 NM buffer
  const p1 = makeSquare(58.0, 18.0,   0.01);
  const p2 = makeSquare(58.0, 18.015, 0.01);
  const result = await dilateAndMergePolygons([p1, p2], 0.5);
  assert.strictEqual(result.length, 1, 'nearby polygons should merge into one');
});

test('dilate: two polygons far apart remain separate', async () => {
  // ~1° longitude apart (~35 NM at 58°N) — well beyond 0.5 NM buffer
  const p1 = makeSquare(58.0, 18.0, 0.01);
  const p2 = makeSquare(58.0, 19.0, 0.01);
  const result = await dilateAndMergePolygons([p1, p2], 0.5);
  assert.strictEqual(result.length, 2, 'distant polygons should remain separate');
});
