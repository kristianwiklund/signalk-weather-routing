import { GribData, LandIndex, PolarData, CalculationRequest, IsochronePoint, RoutePoint } from '../../types';
import { RoutingAlgorithm } from './algorithm';
import { getWindAt, nearestTimeIndex } from '../grib';
import { interpolateBoatSpeed } from '../polar';
import { segmentCrossesLand } from '../landmask';
import { haversineNM, bearingTo, destinationPoint, windSpeedKnots, windDirection } from '../geo';

const DEFAULT_HEADING_STEP = 5;
const DEFAULT_SECTOR_SIZE = 1;
const DEFAULT_MIN_BOAT_SPEED = 0.3;
const DEFAULT_ARRIVAL_RADIUS_NM = 2;

export class IsochroneAlgorithm implements RoutingAlgorithm {
  readonly id = 'isochrone';
  readonly name = 'Isochrone';

  async calculate(
    grib: GribData,
    polar: PolarData,
    landIndex: LandIndex | null,
    request: CalculationRequest,
    onProgress: (pct: number) => void,
    options?: Record<string, unknown>,
  ): Promise<RoutePoint[]> {
    const headingStep = Number(options?.headingStep ?? DEFAULT_HEADING_STEP);
    const sectorSize = Number(options?.sectorSize ?? DEFAULT_SECTOR_SIZE);
    const minBoatSpeed = Number(options?.minBoatSpeed ?? DEFAULT_MIN_BOAT_SPEED);
    const arrivalRadiusNm = Number(options?.arrivalRadiusNm ?? DEFAULT_ARRIVAL_RADIUS_NM);

    const { start, end } = request;
    const departureTime = new Date(request.departureTime);
    const startTimeIdx = nearestTimeIndex(grib, departureTime);
    const nSteps = grib.times.length - startTimeIdx - 1;

    if (nSteps <= 0) throw new Error('Departure time is at or after the end of the GRIB forecast period');

    let isochrone: IsochronePoint[] = [{
      lat: start.lat, lon: start.lon,
      time: grib.times[startTimeIdx],
      heading: 0, twa: 0, tws: 0, boatSpeed: 0, windDir: 0,
      parent: undefined,
    }];

    let arrived: IsochronePoint | null = null;

    for (let step = startTimeIdx; step < grib.times.length - 1; step++) {
      const nextTime = grib.times[step + 1];
      const dtHours = (nextTime.getTime() - grib.times[step].getTime()) / 3_600_000;
      const candidates: IsochronePoint[] = [];

      for (const point of isochrone) {
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

          if (landIndex && segmentCrossesLand(landIndex, point.lat, point.lon, newLat, newLon)) continue;

          const newPoint: IsochronePoint = {
            lat: newLat, lon: newLon,
            time: nextTime,
            heading: hdg, twa, tws, boatSpeed, windDir: wdir,
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

      if (arrived) break;

      isochrone = pruneToFrontier(candidates, start.lat, start.lon, sectorSize);
      if (isochrone.length === 0) throw new Error('No reachable positions — check GRIB coverage and polar data');

      onProgress(Math.round(((step - startTimeIdx + 1) / nSteps) * 100));
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

function pruneToFrontier(
  candidates: IsochronePoint[],
  startLat: number,
  startLon: number,
  sectorSize: number,
): IsochronePoint[] {
  type Entry = { point: IsochronePoint; distSq: number };
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
  });

  let cur: IsochronePoint | undefined = arrived;
  while (cur) {
    route.unshift({
      lat: cur.lat, lon: cur.lon,
      time: cur.time,
      heading: cur.heading,
      twa: cur.twa, tws: cur.tws, boatSpeed: cur.boatSpeed, windDir: cur.windDir,
    });
    cur = cur.parent;
  }

  return route;
}
