import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineNM, bearingTo, destinationPoint, windSpeedKnots, windDirection } from '../geo';

const EPSILON = 0.01;  // 0.01 nm / 0.01 deg tolerance

test('haversineNM: same point is zero', () => {
  assert.strictEqual(haversineNM(51, 4, 51, 4), 0);
});

test('haversineNM: known distance — London to Paris ~180 nm', () => {
  const dist = haversineNM(51.5, -0.12, 48.85, 2.35);
  assert.ok(dist > 175 && dist < 185, `expected ~180 nm, got ${dist.toFixed(1)}`);
});

test('haversineNM: one degree latitude ≈ 60 nm', () => {
  const dist = haversineNM(50, 10, 51, 10);
  assert.ok(Math.abs(dist - 60) < 0.5, `expected ~60 nm, got ${dist.toFixed(2)}`);
});

test('bearingTo: due north', () => {
  const b = bearingTo(50, 10, 51, 10);
  assert.ok(Math.abs(b - 0) < EPSILON || Math.abs(b - 360) < EPSILON, `expected 0°, got ${b}`);
});

test('bearingTo: due east', () => {
  const b = bearingTo(50, 10, 50, 11);
  assert.ok(Math.abs(b - 90) < 1, `expected ~90°, got ${b}`);
});

test('bearingTo: due south', () => {
  const b = bearingTo(51, 10, 50, 10);
  assert.ok(Math.abs(b - 180) < EPSILON, `expected 180°, got ${b}`);
});

test('bearingTo: due west', () => {
  const b = bearingTo(50, 11, 50, 10);
  assert.ok(Math.abs(b - 270) < 1, `expected ~270°, got ${b}`);
});

test('destinationPoint: north 60 nm → ~1 degree latitude', () => {
  const { lat, lon } = destinationPoint(50, 10, 60, 0);
  assert.ok(Math.abs(lat - 51) < 0.01, `expected lat ~51, got ${lat}`);
  assert.ok(Math.abs(lon - 10) < 0.01, `expected lon ~10, got ${lon}`);
});

test('destinationPoint: round-trip — arrive back at start', () => {
  const { lat, lon } = destinationPoint(48, 2, 100, 45);
  const dist = haversineNM(48, 2, lat, lon);
  assert.ok(Math.abs(dist - 100) < 0.01, `round-trip distance off: ${dist}`);
});

test('windSpeedKnots: unit vector → 1.94384 kt', () => {
  const kt = windSpeedKnots(1, 0);
  assert.ok(Math.abs(kt - 1.94384) < 0.0001);
});

test('windSpeedKnots: pythagoras', () => {
  const kt = windSpeedKnots(3, 4);  // magnitude 5 m/s
  assert.ok(Math.abs(kt - 5 * 1.94384) < 0.001);
});

test('windDirection: northerly (blowing from north, u=0 v=-5)', () => {
  const dir = windDirection(0, -5);
  assert.ok(Math.abs(dir - 0) < EPSILON || Math.abs(dir - 360) < EPSILON, `expected 0°, got ${dir}`);
});

test('windDirection: southerly (blowing from south, u=0 v=5)', () => {
  const dir = windDirection(0, 5);
  assert.ok(Math.abs(dir - 180) < EPSILON, `expected 180°, got ${dir}`);
});

test('windDirection: westerly (blowing from west, u=5 v=0)', () => {
  const dir = windDirection(5, 0);
  assert.ok(Math.abs(dir - 270) < EPSILON, `expected 270°, got ${dir}`);
});
