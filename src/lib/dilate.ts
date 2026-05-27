import { Worker } from 'worker_threads';
import * as path from 'path';
import { LandPolygon } from '../types';

const NM_TO_DEG = 1 / 60;

// jsts is ESM-only; use Function to bypass TypeScript's CJS transform of import()
const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<{ default: unknown }>;

async function loadJsts(): Promise<{
  GeometryFactory: new () => any;
  Coordinate: new (x: number, y: number) => any;
  BufferOp: { bufferOp: (geom: any, distance: number) => any };
  CascadedPolygonUnion: { union: (geoms: any) => any };
  ArrayList: new () => any;
}> {
  const [gf, coord, buf, cpu, al] = await Promise.all([
    esmImport('jsts/org/locationtech/jts/geom/GeometryFactory.js'),
    esmImport('jsts/org/locationtech/jts/geom/Coordinate.js'),
    esmImport('jsts/org/locationtech/jts/operation/buffer/BufferOp.js'),
    esmImport('jsts/org/locationtech/jts/operation/union/CascadedPolygonUnion.js'),
    esmImport('jsts/java/util/ArrayList.js'),
  ]);
  return {
    GeometryFactory: gf.default as any,
    Coordinate: coord.default as any,
    BufferOp: buf.default as any,
    CascadedPolygonUnion: cpu.default as any,
    ArrayList: al.default as any,
  };
}

function jstsPolygonToLandPolygon(poly: any): LandPolygon | null {
  const ring = poly.getExteriorRing();
  const coords = ring.getCoordinates();
  if (coords.length < 4) return null;
  const exterior = new Float64Array(coords.length * 2);
  let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;
  for (let i = 0; i < coords.length; i++) {
    exterior[i * 2]     = coords[i].x;
    exterior[i * 2 + 1] = coords[i].y;
    if (coords[i].y < latMin) latMin = coords[i].y;
    if (coords[i].y > latMax) latMax = coords[i].y;
    if (coords[i].x < lonMin) lonMin = coords[i].x;
    if (coords[i].x > lonMax) lonMax = coords[i].x;
  }
  return { bboxLatMin: latMin, bboxLatMax: latMax, bboxLonMin: lonMin, bboxLonMax: lonMax, exterior };
}

function collectPolygons(geom: any, out: LandPolygon[]): void {
  const n = geom.getNumGeometries();
  for (let i = 0; i < n; i++) {
    const g = geom.getGeometryN(i);
    if (g.getGeometryType() === 'Polygon') {
      const lp = jstsPolygonToLandPolygon(g);
      if (lp) out.push(lp);
    }
  }
}

export function runDilateInWorker(shpPath: string, radiusNm: number): Promise<LandPolygon[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'dilate-worker.js'), {
      workerData: { shpPath, radiusNm },
    });
    worker.on('message', (msg: { ok: true; polygons: LandPolygon[] } | { ok: false; error: string }) => {
      if (msg.ok) resolve(msg.polygons);
      else reject(new Error(msg.error));
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Dilate worker exited with code ${code}`));
    });
  });
}

export async function dilateAndMergePolygons(
  polygons: LandPolygon[],
  radiusNm: number,
): Promise<LandPolygon[]> {
  const { GeometryFactory, Coordinate, BufferOp, CascadedPolygonUnion, ArrayList } = await loadJsts();
  const factory = new GeometryFactory();
  const radiusDeg = radiusNm * NM_TO_DEG;

  const buffered = new ArrayList();
  for (const poly of polygons) {
    const n = poly.exterior.length >> 1;
    if (n < 3) continue;
    try {
      const coords = [];
      for (let i = 0; i < n; i++) {
        coords.push(new Coordinate(poly.exterior[i * 2], poly.exterior[i * 2 + 1]));
      }
      if (coords[0].x !== coords[n - 1].x || coords[0].y !== coords[n - 1].y) {
        coords.push(new Coordinate(coords[0].x, coords[0].y));
      }
      const jstsPoly = factory.createPolygon(factory.createLinearRing(coords));
      const b = BufferOp.bufferOp(jstsPoly, radiusDeg);
      if (!b.isEmpty()) buffered.add(b);
    } catch {
      // skip invalid polygons
    }
  }

  if (buffered.isEmpty()) return [];

  const union = CascadedPolygonUnion.union(buffered);
  const result: LandPolygon[] = [];
  collectPolygons(union, result);
  return result;
}
