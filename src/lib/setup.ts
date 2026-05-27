import * as zlib from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LandPolygon, LandEdgeIndex } from '../types';

export const EDGE_INDEX_MAGIC = 0x4C4E4458;   // 'LNDX'
export const EDGE_INDEX_VERSION = 2;           // v2: polygon data included

export const DILATED_INDEX_MAGIC = 0x444C4E44; // 'DLND'
export const DILATED_INDEX_VERSION = 2;

export function pluginDataDir(app: any): string {
  const configPath: string = app.config?.configPath ?? path.join(os.homedir(), '.signalk');
  return path.join(configPath, 'plugin-config-data', 'signalk-weather-routing');
}

function bundledDataDir(): string {
  // __dirname is dist/lib/ at runtime; data/ is two levels up at the package root
  return path.join(__dirname, '../../data');
}

// Both edge and dilated indices share this binary layout after the 32-byte header:
//   polygons: per poly → 4×f64BE bbox + u32LE nFloats + 4-byte pad + nFloats×f64 exterior
//   edge grid: per cell → u32LE key + u32LE n + n×u32LE entries
//   poly grid: per cell → u32LE key + u32LE n + n×u32LE indices
function parseIndexBuffer(buf: Buffer): LandEdgeIndex {
  const nPolygons  = buf.readUInt32LE(16);
  const nEdgeCells = buf.readUInt32LE(20);
  const nPolyCells = buf.readUInt32LE(24);
  let off = 32;

  const polygons: LandPolygon[] = [];
  for (let i = 0; i < nPolygons; i++) {
    const bboxLatMin = buf.readDoubleBE(off);
    const bboxLatMax = buf.readDoubleBE(off + 8);
    const bboxLonMin = buf.readDoubleBE(off + 16);
    const bboxLonMax = buf.readDoubleBE(off + 24);
    const nFloats = buf.readUInt32LE(off + 32);
    off += 40; // 4×f64 + u32 + 4 pad → exterior starts on 8-byte boundary
    const exterior = new Float64Array(buf.buffer, buf.byteOffset + off, nFloats);
    off += nFloats * 8;
    polygons.push({ bboxLatMin, bboxLatMax, bboxLonMin, bboxLonMax, exterior });
  }

  const edgeGrid = new Map<number, Uint32Array>();
  for (let i = 0; i < nEdgeCells; i++) {
    const key = buf.readUInt32LE(off); off += 4;
    const n   = buf.readUInt32LE(off); off += 4;
    edgeGrid.set(key, new Uint32Array(buf.buffer, buf.byteOffset + off, n));
    off += n * 4;
  }

  const polyGrid = new Map<number, number[]>();
  for (let i = 0; i < nPolyCells; i++) {
    const key = buf.readUInt32LE(off); off += 4;
    const n   = buf.readUInt32LE(off); off += 4;
    const polys: number[] = [];
    for (let j = 0; j < n; j++) { polys.push(buf.readUInt32LE(off)); off += 4; }
    polyGrid.set(key, polys);
  }

  return { polygons, edgeGrid, polyGrid };
}

function extractAndLoad(
  bundledGz: string,
  cachePath: string,
  magic: number,
  version: number,
): LandEdgeIndex {
  if (fs.existsSync(cachePath)) {
    try {
      const buf = fs.readFileSync(cachePath);
      if (buf.length >= 8 && buf.readUInt32LE(0) === magic && buf.readUInt32LE(4) === version) {
        return parseIndexBuffer(buf);
      }
    } catch { /* stale or corrupt — fall through to re-extract */ }
  }

  if (!fs.existsSync(bundledGz)) {
    throw new Error(
      `Bundled land data not found: ${bundledGz}. ` +
      'Run "npm run prepare-land-data" to generate it.'
    );
  }

  const gz  = fs.readFileSync(bundledGz);
  const buf = zlib.gunzipSync(gz);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, buf);
  return parseIndexBuffer(buf);
}

export function loadBundledEdgeIndex(dataDir: string): LandEdgeIndex {
  return extractAndLoad(
    path.join(bundledDataDir(), 'edge-index.bin.gz'),
    path.join(dataDir, 'edge-index.bin'),
    EDGE_INDEX_MAGIC,
    EDGE_INDEX_VERSION,
  );
}

export function loadBundledDilatedIndex(dataDir: string): LandEdgeIndex {
  return extractAndLoad(
    path.join(bundledDataDir(), 'dilated-edge-index.bin.gz'),
    path.join(dataDir, 'dilated-edge-index.bin'),
    DILATED_INDEX_MAGIC,
    DILATED_INDEX_VERSION,
  );
}
