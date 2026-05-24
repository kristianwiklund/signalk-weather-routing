import { LandPolygon, LandIndex } from '../types';

export function buildLandIndex(polygons: LandPolygon[]): LandIndex {
  const grid = new Map<number, number[]>();

  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    const latLo = Math.floor(p.bboxLatMin);
    const latHi = Math.floor(p.bboxLatMax);
    const lonLo = Math.floor(p.bboxLonMin);
    const lonHi = Math.floor(p.bboxLonMax);

    for (let la = latLo; la <= latHi; la++) {
      for (let lo = lonLo; lo <= lonHi; lo++) {
        const key = (la + 90) * 360 + (lo + 180);
        let cell = grid.get(key);
        if (!cell) { cell = []; grid.set(key, cell); }
        cell.push(i);
      }
    }
  }

  return { polygons, grid };
}

export function segmentCrossesLand(
  index: LandIndex,
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): boolean {
  const latLo = Math.floor(Math.min(lat1, lat2));
  const latHi = Math.floor(Math.max(lat1, lat2));
  const lonLo = Math.floor(Math.min(lon1, lon2));
  const lonHi = Math.floor(Math.max(lon1, lon2));

  const seen = new Set<number>();
  for (let la = latLo; la <= latHi; la++) {
    for (let lo = lonLo; lo <= lonHi; lo++) {
      const cell = index.grid.get((la + 90) * 360 + (lo + 180));
      if (!cell) continue;
      for (const idx of cell) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        if (segmentHitsPoly(index.polygons[idx], lat1, lon1, lat2, lon2)) return true;
      }
    }
  }
  return false;
}

function segmentHitsPoly(
  poly: LandPolygon,
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): boolean {
  // bbox quick-reject for the segment
  if (Math.max(lat1, lat2) < poly.bboxLatMin) return false;
  if (Math.min(lat1, lat2) > poly.bboxLatMax) return false;
  if (Math.max(lon1, lon2) < poly.bboxLonMin) return false;
  if (Math.min(lon1, lon2) > poly.bboxLonMax) return false;

  if (pointInRing(lat1, lon1, poly.exterior)) return true;
  if (pointInRing(lat2, lon2, poly.exterior)) return true;
  return segmentCrossesRing(lat1, lon1, lat2, lon2, poly.exterior);
}

// Ray-cast point-in-polygon. Ring coords are interleaved [lon0,lat0, lon1,lat1, ...].
function pointInRing(lat: number, lon: number, ring: Float64Array): boolean {
  const n = ring.length >> 1;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];      // lon
    const yi = ring[i * 2 + 1]; // lat
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Returns true if segment (lat1,lon1)→(lat2,lon2) crosses any edge of the ring.
function segmentCrossesRing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  ring: Float64Array,
): boolean {
  const n = ring.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (segmentsIntersect(
      lon1, lat1, lon2, lat2,
      ring[j * 2], ring[j * 2 + 1], ring[i * 2], ring[i * 2 + 1],
    )) return true;
  }
  return false;
}

// Parametric segment-segment intersection (cross-product test). Coords are (x=lon, y=lat).
function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): boolean {
  const d1x = x2 - x1, d1y = y2 - y1;
  const d2x = x4 - x3, d2y = y4 - y3;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-12) return false; // parallel
  const dx = x3 - x1, dy = y3 - y1;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  return t > 0 && t < 1 && u > 0 && u < 1;
}
