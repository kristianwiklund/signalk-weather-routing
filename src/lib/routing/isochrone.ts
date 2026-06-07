// Isochrone routing: two-phase time-optimal route search (coarse T_bound pre-pass then fine expansion).

import { WindProvider, LandEdgeIndex, PolarData, CalculationRequest, IsochronePoint, RoutePoint } from '../../types';
import { RoutingAlgorithm } from './algorithm';
import { nearestIdx } from '../windprovider';
import { interpolateBoatSpeed } from '../polar';
import { segmentCrossesLandFast, isPointOnLand } from '../landmask';
import { haversineNM, bearingTo, destinationPoint, windSpeedKnots, windDirection } from '../geo';

const DEFAULT_HEADING_STEP = 5;
const DEFAULT_SECTOR_SIZE = 1;
const DEFAULT_MIN_BOAT_SPEED = 0.3;
const DEFAULT_ARRIVAL_RADIUS_NM = 2;
const TBOUND_HEADING_STEP = 20;
// Same granularity as the fine pass: prevents adjacent bearing sectors (e.g. Öresund at
// 213° vs overshot-south at 211° from Åland) from competing in the same 5° bucket,
// which caused the coarse pass to discard the Öresund candidate and return T_bound=null.
const TBOUND_SECTOR_SIZE = 1;
// Per-position cone: at each frontier point, headings more than this many degrees off the
// bearing from that point to the destination are skipped. Using the current-position bearing
// (not the fixed start→end bearing) allows routes that need to transit passages at angles
// oblique to the overall course — e.g. northward through Öresund when the full route runs SW.
// Set to 180 (disabled) pending REQ-73: cone should be conditional — disabled when land
// blocks the direct segment from the frontier point to the destination, applied when clear.
// 100° was too tight to allow the eastward escape from the Roslagen archipelago (BUG-51).
const FINE_PASS_CONE_HALF_ANGLE = 180;
const MAX_HEADING_CHANGE = 120;

interface StepTiming {
  step: number;
  frontierSize: number;
  candidatesEvaluated: number;
  landChecksPerformed: number;
  windLookupMs: number;
  polarMs: number;
  landCheckMs: number;
  pruningMs: number;
  totalMs: number;
}

function logStepTiming(t: StepTiming): void {
  console.log(
    `[isochrone] step=${t.step} frontier=${t.frontierSize} candidates=${t.candidatesEvaluated}` +
    ` landChecks=${t.landChecksPerformed}` +
    ` wind=${t.windLookupMs.toFixed(1)}ms polar=${t.polarMs.toFixed(1)}ms` +
    ` land=${t.landCheckMs.toFixed(1)}ms prune=${t.pruningMs.toFixed(1)}ms` +
    ` total=${t.totalMs.toFixed(1)}ms`,
  );
}

function logTimingSummary(timings: StepTiming[]): void {
  if (timings.length === 0) return;
  const fields: (keyof StepTiming)[] = [
    'frontierSize', 'candidatesEvaluated', 'landChecksPerformed',
    'windLookupMs', 'polarMs', 'landCheckMs', 'pruningMs', 'totalMs',
  ];
  const lines = fields.map((f) => {
    const vals = timings.map((t) => t[f] as number);
    const total = vals.reduce((a, b) => a + b, 0);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return `  ${f}: min=${min.toFixed(1)} max=${max.toFixed(1)} total=${total.toFixed(1)}`;
  });
  console.log(`[isochrone] summary over ${timings.length} steps:\n${lines.join('\n')}`);
}

type FailureReason = 'land' | 'wind' | 'grib_exhausted';

// Structured routing failure — carries a machine-readable reason so the frontend
// can show the sailor a specific diagnostic rather than a generic error string.
export class RoutingError extends Error {
  constructor(message: string, public readonly reason: FailureReason) {
    super(message);
    this.name = 'RoutingError';
  }
}

export class IsochroneAlgorithm implements RoutingAlgorithm {
  readonly id = 'isochrone';
  readonly name = 'Isochrone';

  async calculate(
    wind: WindProvider,
    polar: PolarData,
    edgeIndex: LandEdgeIndex | null,
    request: CalculationRequest,
    onProgress: (pct: number, frontier: Array<[number, number]>) => void,
    options?: Record<string, unknown>,
  ): Promise<{ route: RoutePoint[]; warning?: string }> {
    const headingStep = Number(options?.headingStep ?? DEFAULT_HEADING_STEP);
    const sectorSize = Number(options?.sectorSize ?? DEFAULT_SECTOR_SIZE);
    const minBoatSpeed = Number(options?.minBoatSpeed ?? DEFAULT_MIN_BOAT_SPEED);
    const arrivalRadiusNm = Number(options?.arrivalRadiusNm ?? DEFAULT_ARRIVAL_RADIUS_NM);
    const maxWindKn = Number(options?.maxWindKn ?? 0);  // 0 = no limit
    const maxWaveM  = Number(options?.maxWaveM  ?? 0);  // 0 = no limit

    const { start, end } = request;
    const departureTime = new Date(request.departureTime);
    const startTimeIdx = nearestIdx(wind.times, departureTime);
    const nSteps = wind.times.length - startTimeIdx - 1;

    if (nSteps <= 0) throw new Error('Departure time is at or after the end of the forecast data');

    const seedVec = wind.getWind(start.lat, start.lon, startTimeIdx);
    let isochrone: IsochronePoint[] = [{
      lat: start.lat, lon: start.lon,
      time: wind.times[startTimeIdx],
      heading: 0, twa: 0,
      tws: windSpeedKnots(seedVec.u, seedVec.v),
      boatSpeed: 0,
      windDir: windDirection(seedVec.u, seedVec.v),
      stepCalcMs: 0,
      parent: undefined,
    }];

    let arrived: IsochronePoint | null = null;

    const maxBoatSpeed = getMaxPolarSpeed(polar);
    // Coarse pass commented out for testing — see BUG-34 investigation.
    // const tBound = await runCoarsePass(wind, polar, edgeIndex, start, end, minBoatSpeed, arrivalRadiusNm, maxWindKn, maxWaveM, startTimeIdx, nSteps, onProgress);
    // const tBoundMs = tBound !== null ? tBound.getTime() : null;
    const tBoundMs = null;

    const stepTimings: StepTiming[] = [];
    let stepsCompleted = 0;
    let lastFrontier: IsochronePoint[] | null = null;
    let lastRejectedByLand = 0;
    let lastRejectedByPolar = 0;

    for (let step = startTimeIdx; step < wind.times.length - 1; step++) {
      const stepStart = performance.now();
      const nextTime = wind.times[step + 1];
      const dtHours = (nextTime.getTime() - wind.times[step].getTime()) / 3_600_000;
      const candidates: IsochronePoint[] = [];

      let windLookupMs = 0;
      let landCheckMs = 0;
      let candidatesEvaluated = 0;
      let landChecksPerformed = 0;
      let rejectedByPolar = 0;
      let rejectedByLand = 0;

      const t0frontier = performance.now();

      for (const point of isochrone) {
        if (edgeIndex && isPointOnLand(edgeIndex, point.lat, point.lon)) continue;

        // Per-position bearing: cone axis points from this frontier point toward the destination,
        // not from the original start. A fixed start→end axis blocked Öresund transit headings
        // that were within 100° of the current-position bearing but >100° off the initial bearing.
        const pointToDestBearing = bearingTo(point.lat, point.lon, end.lat, end.lon);

        const t0wind = performance.now();
        const windVec = wind.getWind(point.lat, point.lon, step);
        windLookupMs += performance.now() - t0wind;

        const tws = windSpeedKnots(windVec.u, windVec.v);
        const wdir = windDirection(windVec.u, windVec.v);

        if (maxWindKn > 0 && tws > maxWindKn) { rejectedByPolar++; continue; }
        if (maxWaveM > 0) {
          const wh = wind.getWave(point.lat, point.lon, wind.times[step]);
          if (wh != null && wh > maxWaveM) continue;
        }

        for (let hdg = 0; hdg < 360; hdg += headingStep) {
          const deviation = Math.abs(((hdg - pointToDestBearing + 180 + 360) % 360) - 180);
          if (deviation > FINE_PASS_CONE_HALF_ANGLE) continue;

          // Seed point (parent===undefined) has no meaningful prior heading — allow all cone-valid
          // headings unconditionally on step 1 (BUG-44).
          if (point.parent !== undefined) {
            const delta = Math.abs(((hdg - point.heading + 180 + 360) % 360) - 180);
            if (delta > MAX_HEADING_CHANGE) continue;
          }

          let twa = ((hdg - wdir) + 360) % 360;
          if (twa > 180) twa = 360 - twa;

          const boatSpeed = interpolateBoatSpeed(polar, twa, tws);
          if (boatSpeed < minBoatSpeed) { rejectedByPolar++; continue; }

          candidatesEvaluated++;
          const distNM = boatSpeed * dtHours;
          const { lat: newLat, lon: newLon } = destinationPoint(point.lat, point.lon, distNM, hdg);

          if (!wind.coversPoint(newLat, newLon)) continue; // discard candidates outside GRIB domain (BUG-37)

          if (edgeIndex) {
            landChecksPerformed++;
            const t0land = performance.now();
            const blocked = segmentCrossesLandFast(edgeIndex, point.lat, point.lon, newLat, newLon);
            landCheckMs += performance.now() - t0land;
            if (blocked) { rejectedByLand++; continue; }
          }

          const newPoint: IsochronePoint = {
            lat: newLat, lon: newLon,
            time: nextTime,
            heading: hdg, twa, tws, boatSpeed, windDir: wdir,
            stepCalcMs: 0,
            parent: point,
          };
          candidates.push(newPoint);

          const distToEnd = haversineNM(newLat, newLon, end.lat, end.lon);
          if (distToEnd <= arrivalRadiusNm) {
            if (!arrived || distToEnd < haversineNM(arrived.lat, arrived.lon, end.lat, end.lon)) {
              arrived = newPoint;
            }
          }
        }
      }

      const frontierLoopMs = performance.now() - t0frontier;
      const polarMs = Math.max(0, frontierLoopMs - windLookupMs - landCheckMs);

      const stepCalcMs = performance.now() - stepStart;
      for (const c of candidates) c.stepCalcMs = Math.round(stepCalcMs);

      if (arrived) break;

      lastRejectedByLand = rejectedByLand;
      lastRejectedByPolar = rejectedByPolar;

      const t0prune = performance.now();
      isochrone = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
      const pruningMs = performance.now() - t0prune;

      if (isochrone.length > 0) lastFrontier = isochrone;

      if (isochrone.length === 0) {
        const reason: FailureReason = lastRejectedByLand >= lastRejectedByPolar ? 'land' : 'wind';
        if (lastFrontier !== null) {
          const closest = lastFrontier.reduce((best, p) =>
            haversineNM(p.lat, p.lon, end.lat, end.lon) < haversineNM(best.lat, best.lon, end.lat, end.lon) ? p : best
          );
          const dist = Math.round(haversineNM(closest.lat, closest.lon, end.lat, end.lon));
          return {
            route: backtrack(closest, wind, false),
            warning: `No reachable positions at fine-pass step ${stepsCompleted + 1} (${reason === 'land' ? 'land blocks all paths' : 'wind too adverse or light'}) — partial route shown (${dist} nm from destination)`,
          };
        }
        throw new RoutingError(
          `No reachable positions at fine-pass step ${step - startTimeIdx + 1} — ${reason === 'land' ? 'land blocks all paths' : 'wind too adverse or light to make progress'}`,
          reason,
        );
      }

      let drawIsochrone = isochrone;
      if (tBoundMs !== null) {
        const bounded = isochrone.filter((p) => {
          const minRemainingH = haversineNM(p.lat, p.lon, end.lat, end.lon) / maxBoatSpeed; // admissible lower bound: even at max polar speed this point cannot beat T_bound
          return p.time.getTime() + minRemainingH * 3_600_000 <= tBoundMs;
        });
        drawIsochrone = bounded;
        if (bounded.length === 0) {
          onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 100), []);
          await new Promise<void>((resolve) => setImmediate(resolve)); // yield event loop so SSE progress events are flushed to the browser
          break;
        }
        isochrone = bounded;
      }

      const timing: StepTiming = {
        step,
        frontierSize: isochrone.length,
        candidatesEvaluated,
        landChecksPerformed,
        windLookupMs,
        polarMs: Math.max(0, polarMs),
        landCheckMs,
        pruningMs,
        totalMs: performance.now() - stepStart,
      };
      stepTimings.push(timing);
      logStepTiming(timing);

      const frontier: Array<[number, number]> = drawIsochrone.map((p) => [p.lat, p.lon]);
      stepsCompleted++;
      onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 100), frontier);
      await new Promise<void>((resolve) => setImmediate(resolve)); // yield event loop so SSE progress events are flushed to the browser
    }

    logTimingSummary(stepTimings);

    if (!arrived) {
      if (isochrone.length > 0) {
        // Time steps exhausted with a live frontier — route extends past forecast coverage.
        const closest = isochrone.reduce((best, p) =>
          haversineNM(p.lat, p.lon, end.lat, end.lon) < haversineNM(best.lat, best.lon, end.lat, end.lon) ? p : best
        );
        const dist = Math.round(haversineNM(closest.lat, closest.lon, end.lat, end.lon));
        return {
          route: backtrack(closest, wind, false),
          warning: `Route extends past forecast coverage after ${stepsCompleted} fine-pass steps — partial route shown (${dist} nm from destination)`,
        };
      }
      const closest = isochrone.reduce((best, p) =>
        haversineNM(p.lat, p.lon, end.lat, end.lon) < haversineNM(best.lat, best.lon, end.lat, end.lon) ? p : best,
        isochrone[0],
      );
      const dist = closest ? Math.round(haversineNM(closest.lat, closest.lon, end.lat, end.lon)) : 0;
      throw new RoutingError(`Destination not reached within forecast period after ${stepsCompleted} fine-pass steps (closest approach: ${dist} nm)`, 'grib_exhausted');
    }

    return { route: backtrack(arrived, wind, true, end) };
  }
}

// Farthest-from-start dominance: within each bearing sector keep the two candidates
// that have travelled the greatest distance from the original start (BUG-45).
// Keeping two per sector instead of one allows a channel-threading path and an
// open-water escape in the same 1° sector to coexist — with single-survivor selection
// the farther (open-water) point always won, silently discarding the channel path.
// OpenCPN uses topologically correct closed-contour merging instead; top-2 is a
// deliberate simplification that fixes the immediate failure mode (D16). The full
// closed-contour merge remains a candidate for a future sprint if top-2 proves
// insufficient.
// g+h (A*) was attempted but fails here because all step-N candidates share the
// same g value (wind.times[N]), reducing g+h to min-h = min haversine-to-destination.
// For routes requiring a southward detour (e.g. Öresund), min-h prefers near-start
// points (smaller haversine) over correctly advancing south-going points, pinning
// the frontier near the start indefinitely (D13, BUG-37).
// Frontier escape (escaped points are farthest from start) is prevented by the GRIB
// domain boundary check applied before candidates enter this function.
function pruneToFrontier<T extends { lat: number; lon: number }>(
  candidates: T[],
  startLat: number,
  startLon: number,
  sectorSize: number,
): T[] {
  type Entry = { point: T; distSq: number };
  const sectors = new Map<number, Entry[]>();

  for (const p of candidates) {
    const brng = bearingTo(startLat, startLon, p.lat, p.lon);
    const sector = Math.floor(((brng % 360) + 360) % 360 / sectorSize);

    const dLat = p.lat - startLat;
    const dLon = (p.lon - startLon) * Math.cos(startLat * (Math.PI / 180)); // cosine correction: longitude degrees are shorter than latitude degrees away from the equator
    const distSq = dLat * dLat + dLon * dLon;

    const existing = sectors.get(sector) ?? [];
    if (existing.length < 2) {
      existing.push({ point: p, distSq });
      sectors.set(sector, existing);
    } else {
      // Replace the closer of the two survivors if the new candidate is farther.
      const minIdx = existing[0].distSq <= existing[1].distSq ? 0 : 1;
      if (distSq > existing[minIdx].distSq) existing[minIdx] = { point: p, distSq };
    }
  }

  return [...sectors.values()].flatMap((arr) => arr.map((e) => e.point));
}

// includeEnd=true appends the destination as the final waypoint (normal arrival).
// includeEnd=false omits it (partial route — boat never reached destination).
function backtrack(
  arrived: IsochronePoint,
  wind: WindProvider,
  includeEnd: boolean,
  end?: { lat: number; lon: number },
): RoutePoint[] {
  const route: RoutePoint[] = [];

  if (includeEnd && end) {
    route.unshift({
      lat: end.lat, lon: end.lon,
      time: arrived.time,
      heading: arrived.heading,
      twa: arrived.twa, tws: arrived.tws, boatSpeed: arrived.boatSpeed, windDir: arrived.windDir,
      legCalcMs: 0,
      waveHeight: wind.getWave(end.lat, end.lon, arrived.time),
    });
  }

  let cur: IsochronePoint | undefined = arrived;
  while (cur) {
    route.unshift({
      lat: cur.lat, lon: cur.lon,
      time: cur.time,
      heading: cur.heading,
      twa: cur.twa, tws: cur.tws, boatSpeed: cur.boatSpeed, windDir: cur.windDir,
      legCalcMs: cur.stepCalcMs,
      waveHeight: wind.getWave(cur.lat, cur.lon, cur.time),
    });
    cur = cur.parent;
  }

  return route;
}

function getMaxPolarSpeed(polar: PolarData): number {
  return Math.max(...polar.speeds.flat());
}

type GeoPoint = { lat: number; lon: number };
type CoarsePoint = GeoPoint;

async function runCoarsePass(
  wind: WindProvider,
  polar: PolarData,
  edgeIndex: LandEdgeIndex | null,
  start: GeoPoint,
  end: GeoPoint,
  minBoatSpeed: number,
  arrivalRadiusNm: number,
  maxWindKn: number,
  maxWaveM: number,
  startTimeIdx: number,
  nSteps: number,
  onProgress: (pct: number, frontier: Array<[number, number]>) => void,
): Promise<Date | null> {
  let frontier: CoarsePoint[] = [{ lat: start.lat, lon: start.lon }];

  for (let step = startTimeIdx; step < wind.times.length - 1; step++) {
    const nextTime = wind.times[step + 1];
    const dtHours = (nextTime.getTime() - wind.times[step].getTime()) / 3_600_000;
    const candidates: CoarsePoint[] = [];

    for (const point of frontier) {
      if (edgeIndex && isPointOnLand(edgeIndex, point.lat, point.lon)) continue;

      const windVec = wind.getWind(point.lat, point.lon, step);
      const tws = windSpeedKnots(windVec.u, windVec.v);
      const wdir = windDirection(windVec.u, windVec.v);

      if (maxWindKn > 0 && tws > maxWindKn) continue;
      if (maxWaveM > 0) {
        const wh = wind.getWave(point.lat, point.lon, wind.times[step]);
        if (wh != null && wh > maxWaveM) continue;
      }

      for (let hdg = 0; hdg < 360; hdg += TBOUND_HEADING_STEP) {
        let twa = ((hdg - wdir) + 360) % 360;
        if (twa > 180) twa = 360 - twa;

        const boatSpeed = interpolateBoatSpeed(polar, twa, tws);
        if (boatSpeed < minBoatSpeed) continue;

        const distNM = boatSpeed * dtHours;
        const { lat: newLat, lon: newLon } = destinationPoint(point.lat, point.lon, distNM, hdg);

        if (!wind.coversPoint(newLat, newLon)) continue; // discard candidates outside GRIB domain (BUG-37)

        if (edgeIndex && segmentCrossesLandFast(edgeIndex, point.lat, point.lon, newLat, newLon)) continue;

        candidates.push({ lat: newLat, lon: newLon });

        if (haversineNM(newLat, newLon, end.lat, end.lon) <= arrivalRadiusNm) {
          return nextTime;
        }
      }
    }

    // A single empty step may be caused by land temporarily blocking all headings — skip rather than abort.
    if (candidates.length === 0) continue;
    frontier = pruneToFrontier(candidates, start.lat, start.lon, TBOUND_SECTOR_SIZE);
    if (frontier.length === 0) return null;

    const coarseFrontier: Array<[number, number]> = frontier.map((p) => [p.lat, p.lon]);
    onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 50), coarseFrontier);
    await new Promise<void>((resolve) => setImmediate(resolve)); // yield event loop so SSE progress events are flushed to the browser
  }

  return null;
}
