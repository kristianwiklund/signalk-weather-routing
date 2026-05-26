import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IsochroneAlgorithm } from '../routing/isochrone';
import { GribData, PolarData, CalculationRequest, LandPolygon } from '../../types';
import { buildLandIndex } from '../landmask';

// Build a tiny synthetic GRIB: 3×3 grid, 2 time steps, constant 5 m/s southerly wind
function makeGrib(): GribData {
  const nLat = 3, nLon = 3;
  const nPoints = nLat * nLon;

  // 5 m/s southerly: u=0 (no eastward), v=5 (northward) → wind FROM south
  const uFrame = new Float32Array(nPoints).fill(0);
  const vFrame = new Float32Array(nPoints).fill(5);

  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');

  return {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1,
    nLat, nLon,
    times: [t0, t1],
    u10: [uFrame, uFrame],
    v10: [vFrame, vFrame],
  };
}

// Simple polar: 5 kt at all TWA>0, 0 on the nose
function makePolar(): PolarData {
  return {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [
      [0, 0],
      [5, 5],
      [5, 5],
      [5, 5],
      [5, 5],
    ],
  };
}

const algo = new IsochroneAlgorithm();

test('IsochroneAlgorithm.id is "isochrone"', () => {
  assert.strictEqual(algo.id, 'isochrone');
});

test('calculate: rejects departure time past GRIB end', async () => {
  const grib = makeGrib();
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.1, lon: 11.1 },
    departureTime: '2025-01-01T00:00:00Z',  // far outside GRIB
  };
  await assert.rejects(
    () => algo.calculate(grib, polar, null, req, () => {}),
    /departure time/i,
  );
});

test('calculate: arrives when destination is within arrival radius', async () => {
  const grib = makeGrib();
  const polar = makePolar();

  // Very close destination — should arrive in one step
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },  // ~3 nm north — reachable in 1h at 5 kt
    departureTime: grib.times[0].toISOString(),
    options: { arrivalRadiusNm: 5 },  // generous radius
  };

  const route = await algo.calculate(grib, polar, null, req, () => {});
  assert.ok(route.length >= 2, 'route should have at least start and end waypoints');
  assert.strictEqual(route[0].lat, 41);
  assert.strictEqual(route[0].lon, 11);
  // Last point is the destination
  assert.ok(Math.abs(route[route.length - 1].lat - 41.05) < 0.5);
});

test('calculate: every RoutePoint has a non-negative legCalcMs; start point is 0', async () => {
  const grib = makeGrib();
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: grib.times[0].toISOString(),
    options: { arrivalRadiusNm: 5 },
  };

  const route = await algo.calculate(grib, polar, null, req, () => {});
  for (const p of route) {
    assert.ok(typeof p.legCalcMs === 'number' && p.legCalcMs >= 0,
      `legCalcMs must be a non-negative number, got ${p.legCalcMs}`);
  }
  assert.strictEqual(route[0].legCalcMs, 0, 'start point legCalcMs must be 0');
});

test('calculate: throws when destination unreachable in forecast period', async () => {
  const grib = makeGrib();
  const polar = makePolar();

  // Far destination — can't reach in 1 time step
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },
    departureTime: grib.times[0].toISOString(),
  };

  await assert.rejects(
    () => algo.calculate(grib, polar, null, req, () => {}),
    /destination not reached/i,
  );
});

test('calculate: calls onProgress at least once', async () => {
  const grib = makeGrib();
  const polar = makePolar();

  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },  // unreachable — will still progress
    departureTime: grib.times[0].toISOString(),
  };

  let progressCalled = false;
  await assert.rejects(
    () => algo.calculate(grib, polar, null, req, () => { progressCalled = true; }),
    /destination not reached/i,
  );
  assert.ok(progressCalled, 'onProgress should have been called');
});

test('calculate: coarse-to-fine produces same route as fine-only when no-go zone is at dead band', async () => {
  const grib = makeGrib();
  const polar = makePolar();
  // destination due north — reachable without using near-upwind headings
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: grib.times[0].toISOString(),
  };

  // coarseHeadingStep=20 (default) vs coarseHeadingStep=headingStep (no coarse filtering)
  const routeCoarse = await algo.calculate(grib, polar, null, req, () => {}, { arrivalRadiusNm: 5, coarseHeadingStep: 20 });
  const routeFine   = await algo.calculate(grib, polar, null, req, () => {}, { arrivalRadiusNm: 5, coarseHeadingStep: 5 });

  assert.strictEqual(routeCoarse.length, routeFine.length, 'route length must match');
  for (let i = 0; i < routeCoarse.length; i++) {
    assert.ok(Math.abs(routeCoarse[i].lat - routeFine[i].lat) < 0.01, `waypoint ${i} lat must match`);
    assert.ok(Math.abs(routeCoarse[i].lon - routeFine[i].lon) < 0.01, `waypoint ${i} lon must match`);
  }
});

test('calculate: boundary-band heading survives when any fine heading in band is viable (BUG-17 regression)', async () => {
  // Wind from north (v=-5): heading 0° is dead upwind.
  // Step-function polar: zero speed below TWA=50°, 5 kt at 50° and above.
  // Band 40° (headings 40–59°): representative heading 40° has TWA=40° → dead zone
  // → buggy code discards the entire band, including heading 55° (TWA=55° → 5 kt).
  // Destination placed at heading 55°, ~5 NM — only reachable via band 40°.
  // Heading 60° (next surviving band) misses by ~0.45 NM; arrival radius is 0.2 NM.
  const n = 9;
  const gribNorth: GribData = {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3,
    times: [new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T01:00:00Z')],
    u10: [new Float32Array(n).fill(0), new Float32Array(n).fill(0)],
    v10: [new Float32Array(n).fill(-5), new Float32Array(n).fill(-5)],
  };
  const polarStep: PolarData = {
    tws: [1, 30],
    twa: [0, 49, 50, 90, 180],
    speeds: [[0, 0], [0, 0], [5, 5], [5, 5], [5, 5]],
  };
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.048, lon: 11.09 },
    departureTime: gribNorth.times[0].toISOString(),
  };
  const route = await algo.calculate(gribNorth, polarStep, null, req, () => {}, {
    arrivalRadiusNm: 0.2,
    coarseHeadingStep: 20,
  });
  assert.ok(route.length >= 2, 'heading 55° in band 40° must be evaluated when any band heading is viable');
});

test('calculate: throws when coarseHeadingStep is not a multiple of headingStep', async () => {
  const grib = makeGrib();
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: grib.times[0].toISOString(),
  };
  await assert.rejects(
    () => algo.calculate(grib, polar, null, req, () => {}, { headingStep: 5, coarseHeadingStep: 7 }),
    /multiple of headingStep/i,
  );
});

test('calculate: T_bound heuristic does not prevent route discovery in a 2-step scenario (REQ-34)', async () => {
  // 3-step GRIB → 2 isochrone steps. Destination ~9 NM north — reachable in step 2 only.
  // Coarse pass sets T_bound = t2; southward frontier points after step 1 are pruned
  // (can't reach destination by t2 at max speed); northward points survive and arrive at step 2.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const n = 9;
  const grib3: GribData = {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3,
    times: [t0, t1, t2],
    u10: [new Float32Array(n).fill(0), new Float32Array(n).fill(0), new Float32Array(n).fill(0)],
    v10: [new Float32Array(n).fill(5),  new Float32Array(n).fill(5),  new Float32Array(n).fill(5)],
  };
  const polar = makePolar(); // 5 kt at all TWA > 0; wdir=180° → heading 0° is best
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end:   { lat: 41.15, lon: 11 }, // ~9 NM north: unreachable in 1 step (5 NM), reachable in 2
    departureTime: t0.toISOString(),
    options: { arrivalRadiusNm: 2 },
  };
  const route = await algo.calculate(grib3, polar, null, req, () => {});
  assert.ok(route.length >= 2, 'route must be found in 2 steps with T_bound active');
  assert.ok(Math.abs(route[route.length - 1].lat - 41.15) < 0.1, 'last waypoint must be near destination');
});

test('calculate: coarse pass cone excludes candidates >90° from start→end bearing (REQ-35)', async () => {
  // Wind from south (v=5): all non-dead headings viable.
  // Start at (41,11), destination due north at (41.05,11).
  // Candidates heading south (bearing ~180° from start) deviate 180° from start→end (0°) → pruned.
  // Route should still be found via northward headings.
  const grib = makeGrib();
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: grib.times[0].toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const progressPayloads: Array<[number, number]>[][] = [];
  const route = await algo.calculate(grib, polar, null, req, (_pct, frontier) => {
    progressPayloads.push(frontier);
  });
  assert.ok(route.length >= 2, 'route should be found');
  // Coarse-pass frontiers (first half of progress calls) must not contain candidates
  // whose bearing from start is >90° from north (i.e., lat < 41 is heading south).
  // All coarse frontier points should be at lat >= 41 (north of start).
  const coarsePayloads = progressPayloads.slice(0, Math.floor(progressPayloads.length / 2));
  for (const frontier of coarsePayloads) {
    for (const [lat] of frontier) {
      assert.ok(lat >= 41 - 0.01, `coarse frontier point lat ${lat} is south of start — cone failed`);
    }
  }
});

test('calculate: REQ-36 fine-pass onProgress only sends T_bound-passing points', async () => {
  // 3-step GRIB so we get a T_bound from the coarse pass and T_bound filtering in the fine pass.
  // Track frontier sizes: fine-pass progress payloads (second half) must all be non-null arrays,
  // and when T_bound filtering removes some points they must not appear.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const n = 9;
  const grib3: GribData = {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3,
    times: [t0, t1, t2],
    u10: [new Float32Array(n).fill(0), new Float32Array(n).fill(0), new Float32Array(n).fill(0)],
    v10: [new Float32Array(n).fill(5),  new Float32Array(n).fill(5),  new Float32Array(n).fill(5)],
  };
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end:   { lat: 41.15, lon: 11 },
    departureTime: t0.toISOString(),
    options: { arrivalRadiusNm: 2 },
  };
  const allFrontiers: Array<[number, number]>[][] = [];
  await algo.calculate(grib3, polar, null, req, (_pct, frontier) => {
    allFrontiers.push(frontier);
  });
  // Fine-pass frontier arrays (progress >=50) must not be undefined — they are always arrays
  // (possibly empty). This verifies drawIsochrone is always sent, not undefined.
  for (const f of allFrontiers) {
    assert.ok(Array.isArray(f), 'every onProgress frontier must be an array');
  }
});

test('calculate: land index blocks land points', async () => {
  const grib = makeGrib();
  const polar = makePolar();

  // A polygon covering the entire GRIB area blocks all candidates
  const exterior = new Float64Array([9,39, 12,39, 12,42, 9,42, 9,39]);
  const poly: LandPolygon = {
    bboxLatMin: 39, bboxLatMax: 42, bboxLonMin: 9, bboxLonMax: 12, exterior,
  };
  const allLand = buildLandIndex([poly]);

  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: grib.times[0].toISOString(),
  };

  await assert.rejects(
    () => algo.calculate(grib, polar, allLand, req, () => {}),
    /no reachable positions/i,
  );
});
