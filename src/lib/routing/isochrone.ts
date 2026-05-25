import { GribData, LandIndex, PolarData, CalculationRequest, IsochronePoint, RoutePoint } from '../../types';
import { RoutingAlgorithm } from './algorithm';
import { getWindAt, nearestTimeIndex } from '../grib';
import { interpolateBoatSpeed } from '../polar';
import { segmentCrossesLand } from '../landmask';
import { haversineNM, bearingTo, destinationPoint, windSpeedKnots, windDirection } from '../geo';

const DEFAULT_HEADING_STEP = 5;
const DEFAULT_COARSE_HEADING_STEP = 20;
const DEFAULT_SECTOR_SIZE = 1;
const DEFAULT_MIN_BOAT_SPEED = 0.3;
const DEFAULT_ARRIVAL_RADIUS_NM = 2;
const COARSE_PASS_SECTOR_SIZE = 5;

export class IsochroneAlgorithm implements RoutingAlgorithm {
  readonly id = 'isochrone';
  readonly name = 'Isochrone';

  async calculate(
    grib: GribData,
    polar: PolarData,
    landIndex: LandIndex | null,
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
    const tBound = await runCoarsePass(grib, polar, start, end, coarseStep, COARSE_PASS_SECTOR_SIZE, minBoatSpeed, arrivalRadiusNm, maxBoatSpeed, startTimeIdx, nSteps, onProgress);
    const tBoundMs = tBound !== null ? tBound.getTime() : null;

    for (let step = startTimeIdx; step < grib.times.length - 1; step++) {
      const nextTime = grib.times[step + 1];
      const dtHours = (nextTime.getTime() - grib.times[step].getTime()) / 3_600_000;
      const candidates: IsochronePoint[] = [];
      const t0 = Date.now();
      const survivingBands = new Set<number>();

      for (const point of isochrone) {
        const wind = getWindAt(grib, point.lat, point.lon, step);
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

          const distNM = boatSpeed * dtHours;
          const { lat: newLat, lon: newLon } = destinationPoint(point.lat, point.lon, distNM, hdg);

          if (landIndex && segmentCrossesLand(landIndex, point.lat, point.lon, newLat, newLon)) continue;

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

      const stepCalcMs = Date.now() - t0;
      for (const c of candidates) c.stepCalcMs = stepCalcMs;

      if (arrived) break;

      isochrone = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
      if (isochrone.length === 0) throw new Error('No reachable positions — check GRIB coverage and polar data');

      if (tBoundMs !== null) {
        const bounded = isochrone.filter((p) => {
          const minRemainingH = haversineNM(p.lat, p.lon, end.lat, end.lon) / maxBoatSpeed;
          return p.time.getTime() + minRemainingH * 3_600_000 <= tBoundMs;
        });
        if (bounded.length > 0) isochrone = bounded;
      }

      const frontier: Array<[number, number]> = isochrone.map((p) => [p.lat, p.lon]);
      onProgress(50 + Math.round(((step - startTimeIdx + 1) / nSteps) * 50), frontier);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

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
  start: CoarsePoint,
  end: CoarsePoint,
  headingStep: number,
  sectorSize: number,
  minBoatSpeed: number,
  arrivalRadiusNm: number,
  maxBoatSpeed: number,
  startTimeIdx: number,
  nSteps: number,
  onProgress: (pct: number, frontier: Array<[number, number]>) => void,
): Promise<Date | null> {
  let frontier: CoarsePoint[] = [{ lat: start.lat, lon: start.lon }];
  const gribEndMs = grib.times[grib.times.length - 1].getTime();

  for (let step = startTimeIdx; step < grib.times.length - 1; step++) {
    const nextTime = grib.times[step + 1];
    const dtHours = (nextTime.getTime() - grib.times[step].getTime()) / 3_600_000;
    const candidates: CoarsePoint[] = [];

    for (const point of frontier) {
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
        candidates.push({ lat: newLat, lon: newLon });

        if (haversineNM(newLat, newLon, end.lat, end.lon) <= arrivalRadiusNm) {
          return nextTime;
        }
      }
    }

    if (candidates.length === 0) return null;
    frontier = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
    if (frontier.length === 0) return null;

    const remainingHours = (gribEndMs - nextTime.getTime()) / 3_600_000;
    frontier = frontier.filter(p =>
      haversineNM(p.lat, p.lon, end.lat, end.lon) / maxBoatSpeed <= remainingHours
    );
    if (frontier.length === 0) return null;

    const coarseFrontier: Array<[number, number]> = frontier.map((p) => [p.lat, p.lon]);
    onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 50), coarseFrontier);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return null;
}
