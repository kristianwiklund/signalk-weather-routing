import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IsochroneAlgorithm, RoutingError } from '../routing/isochrone';
import { GribData, GribFileEntry, PolarData, CalculationRequest, LandPolygon } from '../../types';
import { MultiFileWindProvider } from '../windprovider';
import { buildLandEdgeIndex } from '../landmask';

// Build a tiny synthetic GRIB: 3×3 grid, 2 time steps, constant 5 m/s southerly wind
function makeGrib(times?: Date[]): GribData {
  const nLat = 3, nLon = 3;
  const nPoints = nLat * nLon;

  // 5 m/s southerly: u=0 (no eastward), v=5 (northward) → wind FROM south
  const uFrame = new Float32Array(nPoints).fill(0);
  const vFrame = new Float32Array(nPoints).fill(5);

  const t0 = times?.[0] ?? new Date('2024-01-01T00:00:00Z');
  const t1 = times?.[1] ?? new Date('2024-01-01T01:00:00Z');
  const allTimes = times ?? [t0, t1];

  return {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1,
    nLat, nLon,
    times: allTimes,
    u10: allTimes.map(() => new Float32Array(uFrame)),
    v10: allTimes.map(() => new Float32Array(vFrame)),
  };
}

function makeEntry(grib: GribData): GribFileEntry {
  return {
    meta: {
      path: 'test.grib2',
      mtime: 0,
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

function makeWind(grib: GribData): MultiFileWindProvider {
  return new MultiFileWindProvider([makeEntry(grib)]);
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
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.1, lon: 11.1 },
    departureTime: '2025-01-01T00:00:00Z',  // far outside GRIB
  };
  await assert.rejects(
    () => algo.calculate(wind, polar, null, req, () => {}),
    /departure time/i,
  );
});

test('calculate: arrives when destination is within arrival radius', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();

  // Very close destination — should arrive in one step
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },  // ~3 nm north — reachable in 1h at 5 kt
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },  // generous radius
  };

  const { route } = await algo.calculate(wind, polar, null, req, () => {});
  assert.ok(route.length >= 2, 'route should have at least start and end waypoints');
  assert.strictEqual(route[0].lat, 41);
  assert.strictEqual(route[0].lon, 11);
  // Last point is the destination
  assert.ok(Math.abs(route[route.length - 1].lat - 41.05) < 0.5);
});

test('calculate: every RoutePoint has a non-negative legCalcMs; start point is 0', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };

  const { route } = await algo.calculate(wind, polar, null, req, () => {});
  for (const p of route) {
    assert.ok(typeof p.legCalcMs === 'number' && p.legCalcMs >= 0,
      `legCalcMs must be a non-negative number, got ${p.legCalcMs}`);
  }
  assert.strictEqual(route[0].legCalcMs, 0, 'start point legCalcMs must be 0');
});

test('calculate: returns partial route with warning when destination unreachable in forecast period', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();

  // Far destination — can't reach in 1 time step; expect partial route + warning
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };

  const { route, warning } = await algo.calculate(wind, polar, null, req, () => {});
  assert.ok(route.length >= 1, 'partial route should have at least one waypoint');
  assert.ok(typeof warning === 'string' && warning.length > 0, 'warning should be set');
  assert.match(warning!, /forecast coverage/i);
});

test('calculate: calls onProgress at least once', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();

  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },  // unreachable — will still progress
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };

  let progressCalled = false;
  await algo.calculate(wind, polar, null, req, () => { progressCalled = true; });
  assert.ok(progressCalled, 'onProgress should have been called');
});


test('calculate: route found in 2 steps when destination only reachable at step 2', async () => {
  // 3-step GRIB → 2 isochrone steps. Destination ~9 NM north — reachable in step 2 only.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end:   { lat: 41.15, lon: 11 }, // ~9 NM north: unreachable in 1 step (5 NM), reachable in 2
    departureTime: t0.toISOString(),
    options: { arrivalRadiusNm: 2 },
  };
  const { route } = await algo.calculate(wind, polar, null, req, () => {});
  assert.ok(route.length >= 2, 'route must be found in 2 steps');
  assert.ok(Math.abs(route[route.length - 1].lat - 41.15) < 0.1, 'last waypoint must be near destination');
});

test('calculate: fine-pass cone keeps frontier north of start when destination is due north', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const progressPayloads: Array<[number, number][]> = [];
  const { route } = await algo.calculate(wind, polar, null, req, (_pct, frontier) => {
    progressPayloads.push(frontier);
  });
  assert.ok(route.length >= 2, 'route should be found');
  for (const frontier of progressPayloads) {
    for (const [lat] of frontier) {
      assert.ok(lat >= 41 - 0.01, `frontier point lat ${lat} is south of start — cone failed`);
    }
  }
});

test('calculate: onProgress frontier argument is always an array', async () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end:   { lat: 41.15, lon: 11 },
    departureTime: t0.toISOString(),
    options: { arrivalRadiusNm: 2 },
  };
  const allFrontiers: Array<[number, number][]> = [];
  await algo.calculate(wind, polar, null, req, (_pct, frontier) => {
    allFrontiers.push(frontier);
  });
  for (const f of allFrontiers) {
    assert.ok(Array.isArray(f), 'every onProgress frontier must be an array');
  }
});

function makeGribWithWave(waveHeight: number): GribData {
  const grib = makeGrib();
  const nPoints = grib.nLat * grib.nLon;
  const waveFrame = new Float32Array(nPoints).fill(waveHeight);
  const swhByTime = new Map<number, Float32Array>();
  for (const t of grib.times) swhByTime.set(t.getTime(), new Float32Array(waveFrame));
  return { ...grib, swhByTime };
}

test('calculate: maxWindKn discards all candidates when wind exceeds limit', async () => {
  // makeGrib gives 5 m/s wind ≈ 9.7 kn; maxWindKn=5 must discard every frontier point
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  await assert.rejects(
    () => algo.calculate(wind, polar, null, req, () => {}, { maxWindKn: 5 }),
    /no reachable positions/i,
  );
});

test('calculate: maxWindKn=0 imposes no wind constraint', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  const { route } = await algo.calculate(wind, polar, null, req, () => {}, { maxWindKn: 0, arrivalRadiusNm: 5 });
  assert.ok(route.length >= 2, 'route should be found with no wind constraint');
});

test('calculate: maxWaveM discards all candidates when wave exceeds limit', async () => {
  const wind = makeWind(makeGribWithWave(3.0));  // 3 m waves everywhere
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  await assert.rejects(
    () => algo.calculate(wind, polar, null, req, () => {}, { maxWaveM: 1.0 }),
    /no reachable positions/i,
  );
});

test('calculate: maxWaveM=0 imposes no wave constraint', async () => {
  const wind = makeWind(makeGribWithWave(3.0));
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  const { route } = await algo.calculate(wind, polar, null, req, () => {}, { maxWaveM: 0, arrivalRadiusNm: 5 });
  assert.ok(route.length >= 2, 'route should be found with no wave constraint');
});

test('calculate: BUG-44 seed point (parent=undefined) ignores heading-change constraint', async () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  // Destination east (bearing ≈ 90°), T_bound=null. The seed has heading:0 (initialised
  // to north). Without the seed exemption, BUG-44 would block headings more than 120°
  // from heading:0, cutting ~12 in-cone headings (125°–185°) and yielding ~29 frontier
  // points instead of ~39. With the exemption all 41 cone-valid headings are tried.
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41, lon: 12 },
    departureTime: t0.toISOString(),
  };
  let step1FrontierSize = 0;
  await algo.calculate(wind, polar, null, req, (pct, frontier) => {
    if (pct === 50) step1FrontierSize = frontier.length;  // fine-pass step 0: 1/2 steps = 50%
  });
  assert.ok(
    step1FrontierSize >= 35,
    `step-1 frontier has ${step1FrontierSize} points — expected ≥ 35; seed exemption may be missing (BUG-44)`,
  );
});

test('calculate: BUG-44 non-seed heading constraint does not crash or empty the frontier', async () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  // Destination north (bearing=0°), T_bound=null.
  // Verifies that the ±120° heading-change constraint from non-seed frontier points
  // does not crash the algorithm and still produces a live frontier at step 2.
  // (BUG-44's directional restriction is verified end-to-end via the BUG-34 acceptance test.)
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 43, lon: 11 },
    departureTime: t0.toISOString(),
  };
  const finePayloads: Array<[number, number][]> = [];
  await algo.calculate(wind, polar, null, req, (pct, frontier) => {
    if (pct >= 50) finePayloads.push(frontier);
  });
  assert.ok(finePayloads.length >= 2, 'fine pass should emit at least 2 frontier updates');
  assert.ok(finePayloads[1].length > 0, 'step-2 frontier must be non-empty with BUG-44 active');
});

test('calculate: BUG-45 pruneToFrontier keeps top-2 survivors per sector', async () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  // Destination east (bearing ≈ 90°), T_bound=null.
  // Step 0 (from seed): 39 candidates land in 39 distinct sectors → frontier=39 with both
  // top-1 and top-2. Step 1 (from 39 frontier points, each trying ~33 headings = ~1300
  // candidates): many candidates share sectors. With top-1: 145 survivors. With top-2:
  // sector collisions retain two survivors → significantly more frontier points (≥ 200).
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41, lon: 12 },
    departureTime: t0.toISOString(),
  };
  let step2FrontierSize = 0;
  await algo.calculate(wind, polar, null, req, (pct, frontier) => {
    if (pct === 100) step2FrontierSize = frontier.length;
  });
  assert.ok(
    step2FrontierSize >= 200,
    `BUG-45: step-2 frontier has ${step2FrontierSize} points — expected ≥ 200 (top-2 per sector not active?)`,
  );
});

test('calculate: fine pass cone excludes candidates >100° from per-position bearing to dest (BUG-43)', async () => {
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const wind = makeWind(makeGrib([t0, t1, t2]));
  const polar = makePolar();
  // Destination due east (bearing ≈ 90° from any near-start point); T_bound = null.
  // Per-position cone ±100° around ~90°: excludes headings ~191°–349°.
  // Without cone, heading 260° (west, TWA=80°=5kt) produces lon≈10.89 — below 10.9.
  // With cone, the westernmost allowed heading is ~350°, giving lon≥10.98 per step.
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41, lon: 12 },
    departureTime: t0.toISOString(),
  };
  const finePayloads: Array<[number, number][]> = [];
  await algo.calculate(wind, polar, null, req, (pct, frontier) => {
    if (pct >= 50) finePayloads.push(frontier);
  });
  assert.ok(finePayloads.length > 0, 'fine pass should emit at least one frontier');
  for (const frontier of finePayloads) {
    for (const [, lon] of frontier) {
      assert.ok(lon >= 10.9, `fine-pass frontier point at lon=${lon} is too far west — cone not applied (BUG-43)`);
    }
  }
});

test('calculate: land index blocks land points', async () => {
  const wind = makeWind(makeGrib());
  const polar = makePolar();

  // A polygon covering the entire GRIB area blocks all candidates
  const exterior = new Float64Array([9,39, 12,39, 12,42, 9,42, 9,39]);
  const poly: LandPolygon = {
    bboxLatMin: 39, bboxLatMax: 42, bboxLonMin: 9, bboxLonMax: 12, exterior,
  };
  const allLand = buildLandEdgeIndex([poly]);

  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };

  await assert.rejects(
    () => algo.calculate(wind, polar, allLand, req, () => {}),
    /no reachable positions/i,
  );
});

test('calculate: REQ-71 first-step frontier collapse throws RoutingError with reason=wind', async () => {
  // minBoatSpeed=100 kt is impossible — all candidates rejected by polar filter.
  // With lastFrontier=null (no prior successful step) the algorithm throws RoutingError.
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  let caughtError: unknown;
  try {
    await algo.calculate(wind, polar, null, req, () => {}, { minBoatSpeed: 100 });
  } catch (e) {
    caughtError = e;
  }
  assert.ok(caughtError instanceof RoutingError, `expected RoutingError, got ${(caughtError as any)?.constructor?.name ?? 'nothing thrown'}`);
  assert.strictEqual((caughtError as RoutingError).reason, 'wind');
});

test('calculate: BUG-47 seed point carries actual GRIB wind speed and direction', async () => {
  // makeGrib gives a 5 m/s southerly (u=0, v=5): tws≈9.7 kn, windDir=180°.
  // The first waypoint in the route (the seed) must reflect these values, not zeros.
  const wind = makeWind(makeGrib());
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, polar, null, req, () => {});
  assert.ok(route.length >= 2, 'route should contain at least two waypoints');
  const seed = route[0];
  assert.ok(seed.tws > 0, `seed tws must be > 0 (BUG-47), got ${seed.tws}`);
  assert.ok(seed.tws > 9 && seed.tws < 11,
    `seed tws should be ≈9.7 kn (5 m/s southerly), got ${seed.tws}`);
  assert.ok(seed.windDir > 170 && seed.windDir < 190,
    `seed windDir should be ≈180° (southerly), got ${seed.windDir}`);
});

test('calculate: motorSpeedKn=0 rejects all candidates when polar gives only zero speeds', async () => {
  // A polar that returns 0 for every TWA/TWS — without motor, no candidate can pass.
  const zeroPolar: PolarData = {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  };
  const wind = makeWind(makeGrib());
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
  };
  await assert.rejects(
    () => algo.calculate(wind, zeroPolar, null, req, () => {}),
    /no reachable positions/i,
  );
});

test('calculate: motorBelowKn + motorSpeedKn allows routing when polar gives only zero speeds', async () => {
  // Zero polar — motor at 4 kn with threshold 1 kn replaces the zero speed and route succeeds.
  const zeroPolar: PolarData = {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  };
  const wind = makeWind(makeGrib());
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, zeroPolar, null, req, () => {}, { motorBelowKn: 1, motorSpeedKn: 4 });
  assert.ok(route.length >= 2, 'route should be found when motor speed replaces zero polar speed');
});

test('calculate: REQ-72 frontier collapse after step 1 returns partial route with warning', async () => {
  // Step 0 wind: v=1 m/s (≈1.94 kn) — passes maxWindKn=3 → step 1 produces a frontier.
  // Step 1 wind: v=5 m/s (≈9.72 kn) — blocked by maxWindKn=3 → step 2 collapses.
  // lastFrontier is non-null after step 1 → partial route returned (not thrown).
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const nPoints = 9;
  const grib: GribData = {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3,
    times: [t0, t1, t2],
    u10: [new Float32Array(nPoints).fill(0), new Float32Array(nPoints).fill(0), new Float32Array(nPoints).fill(0)],
    v10: [new Float32Array(nPoints).fill(1), new Float32Array(nPoints).fill(5), new Float32Array(nPoints).fill(5)],
  };
  const entry: GribFileEntry = {
    meta: { path: 'test.grib2', mtime: 0, latMin: 40, latMax: 42, lonMin: 10, lonMax: 12, latStep: 1, lonStep: 1, timeStart: t0, timeEnd: t2, nTimes: 3 },
    data: grib,
  };
  const wind = new MultiFileWindProvider([entry]);
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 50, lon: 20 },
    departureTime: t0.toISOString(),
  };
  const { route, warning } = await algo.calculate(wind, polar, null, req, () => {}, { maxWindKn: 3 });
  assert.ok(route.length >= 1, 'partial route should have at least one waypoint');
  assert.ok(typeof warning === 'string' && warning.length > 0, 'warning should be set');
  // frontier-collapse path (not GRIB-exhausted) — message contains "No reachable positions"
  assert.match(warning!, /no reachable positions/i);
});

test('calculate: REQ-84 motor fires on threshold, not just exact zero', async () => {
  // Polar returns 0.5 kn for every heading — well above zero but below motorBelowKn=1.
  // Motor at 4 kn should replace the 0.5 kn polar speed and produce a route.
  const slowPolar: PolarData = {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]],
  };
  const wind = makeWind(makeGrib());
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, slowPolar, null, req, () => {}, { motorBelowKn: 1, motorSpeedKn: 4 });
  const boatSpeeds = route.map(p => p.boatSpeed);
  assert.ok(route.length >= 2, 'route should be found');
  // All moving legs should use motor speed (4 kn), not the slow polar speed (0.5 kn).
  assert.ok(boatSpeeds.slice(1).every(s => s === 4), `expected motor speed 4 on all legs, got ${JSON.stringify(boatSpeeds)}`);
});

test('calculate: REQ-84 motor does not fire when polarSpeed >= motorBelowKn', async () => {
  // Polar returns 0.5 kn — motorBelowKn=0.3 is below that, so motor does NOT trigger.
  // Route still found using the slow polar speed.
  const slowPolar: PolarData = {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]],
  };
  const wind = makeWind(makeGrib());
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, slowPolar, null, req, () => {}, { motorBelowKn: 0.3, motorSpeedKn: 4 });
  const boatSpeeds = route.map(p => p.boatSpeed);
  assert.ok(route.length >= 2, 'route should be found using polar speed');
  // Motor speed (4 kn) must NOT appear — polar speed (0.5 kn) is used.
  assert.ok(boatSpeeds.slice(1).every(s => s !== 4), `motor should not have fired, got ${JSON.stringify(boatSpeeds)}`);
});

test('calculate: REQ-83 wait-for-wind keeps frontier alive across calm step', async () => {
  // Step 0: no wind (u=v=0) → zero polar → all headings rejected.
  //   With waitForWind, frontier stays in place.
  // Step 1: wind returns (v=3 m/s ≈ 5.8 kn) → frontier can advance.
  // Expected: route found rather than "no reachable positions" error.
  const t0 = new Date('2024-01-01T00:00:00Z');
  const t1 = new Date('2024-01-01T01:00:00Z');
  const t2 = new Date('2024-01-01T02:00:00Z');
  const nPoints = 9;
  const grib: GribData = {
    latMin: 40, latStep: 1, lonMin: 10, lonStep: 1, nLat: 3, nLon: 3,
    times: [t0, t1, t2],
    u10: [new Float32Array(nPoints).fill(0), new Float32Array(nPoints).fill(0), new Float32Array(nPoints).fill(0)],
    v10: [new Float32Array(nPoints).fill(0), new Float32Array(nPoints).fill(3), new Float32Array(nPoints).fill(3)],
  };
  const entry: GribFileEntry = {
    meta: { path: 'test.grib2', mtime: 0, latMin: 40, latMax: 42, lonMin: 10, lonMax: 12, latStep: 1, lonStep: 1, timeStart: t0, timeEnd: t2, nTimes: 3 },
    data: grib,
  };
  const wind = new MultiFileWindProvider([entry]);
  const polar = makePolar();
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: t0.toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, polar, null, req, () => {}, { waitForWind: true });
  assert.ok(route.length >= 2, 'route should be found after frontier waited through calm step');
});

test('calculate: REQ-83 + REQ-84 — motor fires first, wait-for-wind not needed', async () => {
  // Zero polar, motor active: motor fires, wait-for-wind is irrelevant.
  const zeroPolar: PolarData = {
    tws: [1, 30],
    twa: [0, 45, 90, 135, 180],
    speeds: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  };
  const wind = makeWind(makeGrib());
  const req: CalculationRequest = {
    start: { lat: 41, lon: 11 },
    end: { lat: 41.05, lon: 11 },
    departureTime: new Date('2024-01-01T00:00:00Z').toISOString(),
    options: { arrivalRadiusNm: 5 },
  };
  const { route } = await algo.calculate(wind, zeroPolar, null, req, () => {}, { motorBelowKn: 1, motorSpeedKn: 4, waitForWind: true });
  const boatSpeeds = route.map(p => p.boatSpeed);
  assert.ok(route.length >= 2, 'route should be found via motor');
  assert.ok(boatSpeeds.slice(1).every(s => s === 4), `expected motor speed 4 on all legs, got ${JSON.stringify(boatSpeeds)}`);
});
