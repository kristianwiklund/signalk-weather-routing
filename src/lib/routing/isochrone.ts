import { GribData, LandEdgeIndex, PolarData, CalculationRequest, IsochronePoint, RoutePoint } from '../../types';
import { RoutingAlgorithm } from './algorithm';
import { getWindAt, nearestTimeIndex } from '../grib';
import { interpolateBoatSpeed } from '../polar';
import { segmentCrossesLandFast, isPointOnLand } from '../landmask';
import { haversineNM, bearingTo, destinationPoint, windSpeedKnots, windDirection } from '../geo';

const DEFAULT_HEADING_STEP = 5;
const DEFAULT_COARSE_HEADING_STEP = 20;
const DEFAULT_SECTOR_SIZE = 1;
const DEFAULT_MIN_BOAT_SPEED = 0.3;
const DEFAULT_ARRIVAL_RADIUS_NM = 2;
const COARSE_PASS_SECTOR_SIZE = 5;
const COARSE_CONE_HALF_ANGLE_DEG = 90;

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

export class IsochroneAlgorithm implements RoutingAlgorithm {
  readonly id = 'isochrone';
  readonly name = 'Isochrone';

  async calculate(
    grib: GribData,
    polar: PolarData,
    edgeIndex: LandEdgeIndex | null,
    request: CalculationRequest,
    onProgress: (pct: number, frontier: Array<[number, number]>) => void,
    options?: Record<string, unknown>,
  ): Promise<RoutePoint[]> {
    const headingStep = Number(options?.headingStep ?? DEFAULT_HEADING_STEP);
    const coarseStep = Number(options?.coarseHeadingStep ?? DEFAULT_COARSE_HEADING_STEP);
    const sectorSize = Number(options?.sectorSize ?? DEFAULT_SECTOR_SIZE);
    const minBoatSpeed = Number(options?.minBoatSpeed ?? DEFAULT_MIN_BOAT_SPEED);
    const arrivalRadiusNm = Number(options?.arrivalRadiusNm ?? DEFAULT_ARRIVAL_RADIUS_NM);

    if (coarseStep % headingStep !== 0) {
      throw new Error('coarseHeadingStep must be a multiple of headingStep');
    }

    const { start, end } = request;
    const departureTime = new Date(request.departureTime);
    const startTimeIdx = nearestTimeIndex(grib, departureTime);
    const nSteps = grib.times.length - startTimeIdx - 1;

    if (nSteps <= 0) throw new Error('Departure time is at or after the end of the GRIB forecast period');

    let isochrone: IsochronePoint[] = [{
      lat: start.lat, lon: start.lon,
      time: grib.times[startTimeIdx],
      heading: 0, twa: 0, tws: 0, boatSpeed: 0, windDir: 0,
      stepCalcMs: 0,
      parent: undefined,
    }];

    let arrived: IsochronePoint | null = null;

    const maxBoatSpeed = getMaxPolarSpeed(polar);
    const tBound = await runCoarsePass(grib, polar, edgeIndex, start, end, coarseStep, COARSE_PASS_SECTOR_SIZE, minBoatSpeed, arrivalRadiusNm, startTimeIdx, nSteps, onProgress);
    const tBoundMs = tBound !== null ? tBound.getTime() : null;

    const stepTimings: StepTiming[] = [];

    for (let step = startTimeIdx; step < grib.times.length - 1; step++) {
      const stepStart = performance.now();
      const nextTime = grib.times[step + 1];
      const dtHours = (nextTime.getTime() - grib.times[step].getTime()) / 3_600_000;
      const candidates: IsochronePoint[] = [];
      const survivingBands = new Set<number>();

      let windLookupMs = 0;
      let landCheckMs = 0;
      let candidatesEvaluated = 0;
      let landChecksPerformed = 0;

      const t0frontier = performance.now();

      for (const point of isochrone) {
        if (edgeIndex && isPointOnLand(edgeIndex, point.lat, point.lon)) continue;

        const t0wind = performance.now();
        const wind = getWindAt(grib, point.lat, point.lon, step);
        windLookupMs += performance.now() - t0wind;

        const tws = windSpeedKnots(wind.u, wind.v);
        const wdir = windDirection(wind.u, wind.v);

        // Pass 1: coarse polar scan — no land check, identifies polar-dead bands.
        // A band survives if ANY fine heading within it gives viable speed, so that
        // boundary headings near the dead-zone edge are never incorrectly suppressed.
        // Never used to skip land checks: a coarse heading blocked by land does not
        // imply adjacent fine headings are also blocked (critical for narrow passages).
        survivingBands.clear();
        for (let band = 0; band < 360; band += coarseStep) {
          for (let hdg = band; hdg < band + coarseStep; hdg += headingStep) {
            let twa = ((hdg - wdir) + 360) % 360;
            if (twa > 180) twa = 360 - twa;
            if (interpolateBoatSpeed(polar, twa, tws) >= minBoatSpeed) {
              survivingBands.add(band);
              break;
            }
          }
        }

        // Pass 2: fine evaluation within surviving bands only (full polar + land check).
        for (let hdg = 0; hdg < 360; hdg += headingStep) {
          if (!survivingBands.has(Math.floor(hdg / coarseStep) * coarseStep)) continue;

          let twa = ((hdg - wdir) + 360) % 360;
          if (twa > 180) twa = 360 - twa;

          const boatSpeed = interpolateBoatSpeed(polar, twa, tws);
          if (boatSpeed < minBoatSpeed) continue;

          candidatesEvaluated++;
          const distNM = boatSpeed * dtHours;
          const { lat: newLat, lon: newLon } = destinationPoint(point.lat, point.lon, distNM, hdg);

          if (edgeIndex) {
            landChecksPerformed++;
            const t0land = performance.now();
            const blocked = segmentCrossesLandFast(edgeIndex, point.lat, point.lon, newLat, newLon);
            landCheckMs += performance.now() - t0land;
            if (blocked) continue;
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

      const t0prune = performance.now();
      isochrone = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
      const pruningMs = performance.now() - t0prune;

      if (isochrone.length === 0) throw new Error('No reachable positions — check GRIB coverage and polar data');

      let drawIsochrone = isochrone;
      if (tBoundMs !== null) {
        const bounded = isochrone.filter((p) => {
          const minRemainingH = haversineNM(p.lat, p.lon, end.lat, end.lon) / maxBoatSpeed;
          return p.time.getTime() + minRemainingH * 3_600_000 <= tBoundMs;
        });
        drawIsochrone = bounded;
        if (bounded.length === 0) {
          onProgress(50 + Math.round(((step - startTimeIdx + 1) / nSteps) * 50), []);
          await new Promise<void>((resolve) => setImmediate(resolve));
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
      onProgress(50 + Math.round(((step - startTimeIdx + 1) / nSteps) * 50), frontier);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    logTimingSummary(stepTimings);

    if (!arrived) {
      const closest = isochrone.reduce((best, p) =>
        haversineNM(p.lat, p.lon, end.lat, end.lon) < haversineNM(best.lat, best.lon, end.lat, end.lon) ? p : best
      );
      const dist = Math.round(haversineNM(closest.lat, closest.lon, end.lat, end.lon));
      throw new Error(`Destination not reached within forecast period (closest approach: ${dist} nm)`);
    }

    return backtrack(arrived, end);
  }
}

function pruneToFrontier<T extends { lat: number; lon: number }>(
  candidates: T[],
  startLat: number,
  startLon: number,
  sectorSize: number,
): T[] {
  type Entry = { point: T; distSq: number };
  const sectors = new Map<number, Entry>();

  for (const p of candidates) {
    const brng = bearingTo(startLat, startLon, p.lat, p.lon);
    const sector = Math.floor(((brng % 360) + 360) % 360 / sectorSize);

    const dLat = p.lat - startLat;
    const dLon = (p.lon - startLon) * Math.cos(startLat * (Math.PI / 180));
    const distSq = dLat * dLat + dLon * dLon;

    const existing = sectors.get(sector);
    if (!existing || distSq > existing.distSq) {
      sectors.set(sector, { point: p, distSq });
    }
  }

  return Array.from(sectors.values()).map((e) => e.point);
}

function backtrack(arrived: IsochronePoint, end: { lat: number; lon: number }): RoutePoint[] {
  const route: RoutePoint[] = [];

  route.unshift({
    lat: end.lat, lon: end.lon,
    time: arrived.time,
    heading: arrived.heading,
    twa: arrived.twa, tws: arrived.tws, boatSpeed: arrived.boatSpeed, windDir: arrived.windDir,
    legCalcMs: 0,
  });

  let cur: IsochronePoint | undefined = arrived;
  while (cur) {
    route.unshift({
      lat: cur.lat, lon: cur.lon,
      time: cur.time,
      heading: cur.heading,
      twa: cur.twa, tws: cur.tws, boatSpeed: cur.boatSpeed, windDir: cur.windDir,
      legCalcMs: cur.stepCalcMs,
    });
    cur = cur.parent;
  }

  return route;
}

function getMaxPolarSpeed(polar: PolarData): number {
  return Math.max(...polar.speeds.flat());
}

type CoarsePoint = { lat: number; lon: number };

async function runCoarsePass(
  grib: GribData,
  polar: PolarData,
  edgeIndex: LandEdgeIndex | null,
  start: CoarsePoint,
  end: CoarsePoint,
  headingStep: number,
  sectorSize: number,
  minBoatSpeed: number,
  arrivalRadiusNm: number,
  startTimeIdx: number,
  nSteps: number,
  onProgress: (pct: number, frontier: Array<[number, number]>) => void,
): Promise<Date | null> {
  let frontier: CoarsePoint[] = [{ lat: start.lat, lon: start.lon }];
  const bearingToEnd = bearingTo(start.lat, start.lon, end.lat, end.lon);

  for (let step = startTimeIdx; step < grib.times.length - 1; step++) {
    const nextTime = grib.times[step + 1];
    const dtHours = (nextTime.getTime() - grib.times[step].getTime()) / 3_600_000;
    const candidates: CoarsePoint[] = [];

    for (const point of frontier) {
      if (edgeIndex && isPointOnLand(edgeIndex, point.lat, point.lon)) continue;

      const wind = getWindAt(grib, point.lat, point.lon, step);
      const tws = windSpeedKnots(wind.u, wind.v);
      const wdir = windDirection(wind.u, wind.v);

      for (let hdg = 0; hdg < 360; hdg += headingStep) {
        let twa = ((hdg - wdir) + 360) % 360;
        if (twa > 180) twa = 360 - twa;

        const boatSpeed = interpolateBoatSpeed(polar, twa, tws);
        if (boatSpeed < minBoatSpeed) continue;

        const distNM = boatSpeed * dtHours;
        const { lat: newLat, lon: newLon } = destinationPoint(point.lat, point.lon, distNM, hdg);

        const brngFromStart = bearingTo(start.lat, start.lon, newLat, newLon);
        const angleDiff = Math.abs(((brngFromStart - bearingToEnd + 180 + 360) % 360) - 180);
        if (angleDiff > COARSE_CONE_HALF_ANGLE_DEG) continue;

        if (edgeIndex && segmentCrossesLandFast(edgeIndex, point.lat, point.lon, newLat, newLon)) continue;

        candidates.push({ lat: newLat, lon: newLon });

        if (haversineNM(newLat, newLon, end.lat, end.lon) <= arrivalRadiusNm) {
          return nextTime;
        }
      }
    }

    if (candidates.length === 0) return null;
    frontier = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
    if (frontier.length === 0) return null;

    const coarseFrontier: Array<[number, number]> = frontier.map((p) => [p.lat, p.lon]);
    onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 50), coarseFrontier);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return null;
}
