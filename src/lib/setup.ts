import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as gdal from 'gdal-async';
import { LandPolygon, LandEdgeIndex } from '../types';

const EDGE_INDEX_MAGIC = 0x4C4E4458; // 'LNDX'
const EDGE_INDEX_VERSION = 1;

const GSHHG_VERSION = '2.3.7';
const GSHHG_ZIP_URL = `https://www.soest.hawaii.edu/pwessel/gshhg/gshhg-shp-${GSHHG_VERSION}.zip`;
// High-resolution, ocean-level-1 (land)
const GSHHG_ENTRY_PREFIX = 'GSHHS_shp/h/GSHHS_h_L1';

export function pluginDataDir(app: any): string {
  const configPath: string = app.config?.configPath ?? path.join(os.homedir(), '.signalk');
  return path.join(configPath, 'plugin-config-data', 'signalk-weather-routing');
}

export function gshhgShpPath(dataDir: string): string {
  return path.join(dataDir, `gshhg-${GSHHG_VERSION}`, GSHHG_ENTRY_PREFIX + '.shp');
}

export function edgeIndexPath(dataDir: string): string {
  return path.join(dataDir, `gshhg-${GSHHG_VERSION}`, 'edge-index-v1.bin');
}

// Saves the edge-tile index grid to a binary file.
// Format: header (32 bytes) → edgeGrid cells → polyGrid cells.
export function saveEdgeIndex(index: LandEdgeIndex, filePath: string, shpMtime: number): void {
  const tmp = filePath + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    const header = Buffer.alloc(32);
    header.writeUInt32LE(EDGE_INDEX_MAGIC, 0);
    header.writeUInt32LE(EDGE_INDEX_VERSION, 4);
    header.writeBigInt64LE(BigInt(Math.round(shpMtime)), 8);
    header.writeUInt32LE(index.edgeGrid.size, 16);
    header.writeUInt32LE(index.polyGrid.size, 20);
    fs.writeSync(fd, header);

    const cellHdr = Buffer.alloc(8);
    for (const [key, entries] of index.edgeGrid) {
      cellHdr.writeUInt32LE(key, 0);
      cellHdr.writeUInt32LE(entries.length, 4);
      fs.writeSync(fd, cellHdr);
      fs.writeSync(fd, Buffer.from(entries.buffer, entries.byteOffset, entries.byteLength));
    }

    for (const [key, polys] of index.polyGrid) {
      cellHdr.writeUInt32LE(key, 0);
      cellHdr.writeUInt32LE(polys.length, 4);
      fs.writeSync(fd, cellHdr);
      fs.writeSync(fd, Buffer.from(new Uint32Array(polys).buffer));
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

// Loads a previously saved edge-tile index. Returns null if the file is missing,
// corrupt, or stale (shpMtime does not match).
export function loadEdgeIndex(
  filePath: string,
  polygons: LandPolygon[],
  shpMtime: number,
): LandEdgeIndex | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 32) return null;
    if (buf.readUInt32LE(0) !== EDGE_INDEX_MAGIC) return null;
    if (buf.readUInt32LE(4) !== EDGE_INDEX_VERSION) return null;
    if (Number(buf.readBigInt64LE(8)) !== Math.round(shpMtime)) return null;

    const nEdgeCells = buf.readUInt32LE(16);
    const nPolyCells = buf.readUInt32LE(20);
    let off = 32;

    const edgeGrid = new Map<number, Uint32Array>();
    for (let i = 0; i < nEdgeCells; i++) {
      const key = buf.readUInt32LE(off); off += 4;
      const n = buf.readUInt32LE(off); off += 4;
      edgeGrid.set(key, new Uint32Array(buf.buffer, buf.byteOffset + off, n));
      off += n * 4;
    }

    const polyGrid = new Map<number, number[]>();
    for (let i = 0; i < nPolyCells; i++) {
      const key = buf.readUInt32LE(off); off += 4;
      const n = buf.readUInt32LE(off); off += 4;
      const polys: number[] = [];
      for (let j = 0; j < n; j++) { polys.push(buf.readUInt32LE(off)); off += 4; }
      polyGrid.set(key, polys);
    }

    return { polygons, edgeGrid, polyGrid };
  } catch {
    return null;
  }
}

// Ensures the GSHHG shapefile is downloaded and extracted. Returns the .shp path.
export async function ensureGshhgShapefile(
  dataDir: string,
  onStatus: (msg: string) => void,
): Promise<string> {
  fs.mkdirSync(dataDir, { recursive: true });

  const zipPath = path.join(dataDir, `gshhg-shp-${GSHHG_VERSION}.zip`);
  if (!fs.existsSync(zipPath)) {
    onStatus('Downloading GSHHG coastline data (~170 MB)...');
    await downloadFile(GSHHG_ZIP_URL, zipPath);
    onStatus('GSHHG download complete');
  }

  const shpPath = gshhgShpPath(dataDir);
  if (!fs.existsSync(shpPath)) {
    onStatus('Extracting GSHHG shapefile...');
    extractShapefile(zipPath, path.join(dataDir, `gshhg-${GSHHG_VERSION}`));
  }

  return shpPath;
}

export async function loadLandPolygons(shpPath: string): Promise<LandPolygon[]> {
  const ds = await gdal.openAsync(shpPath);
  const layer = ds.layers.get(0);
  const polygons: LandPolygon[] = [];

  layer.features.forEach((feature: any) => {
    const geom = feature.getGeometry();
    if (!geom) return;
    const typeName = (geom.name ?? '').toUpperCase().replace(/\s+/g, '');
    if (typeName === 'POLYGON') {
      const poly = geomToLandPolygon(geom);
      if (poly) polygons.push(poly);
    } else if (typeName === 'MULTIPOLYGON') {
      const count: number = geom.children.count();
      for (let i = 0; i < count; i++) {
        const poly = geomToLandPolygon(geom.children.get(i));
        if (poly) polygons.push(poly);
      }
    }
  });

  ds.close();
  return polygons;
}

function geomToLandPolygon(geom: any): LandPolygon | null {
  if (!geom.rings || geom.rings.count() === 0) return null;

  const ring = geom.rings.get(0);
  const pts: gdal.Point[] = [];
  ring.points.forEach((pt: any) => pts.push(pt));

  if (pts.length < 3) return null;

  const exterior = new Float64Array(pts.length * 2);
  let latMin = 90, latMax = -90, lonMin = 180, lonMax = -180;

  for (let i = 0; i < pts.length; i++) {
    const lon = pts[i].x;
    const lat = pts[i].y;
    exterior[i * 2] = lon;
    exterior[i * 2 + 1] = lat;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
  }

  return { bboxLatMin: latMin, bboxLatMax: latMax, bboxLonMin: lonMin, bboxLonMax: lonMax, exterior };
}

function downloadFile(url: string, dest: string): Promise<void> {
  const tmp = dest + '.tmp';
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmp);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    }).on('error', (e: Error) => {
      file.close();
      try { fs.unlinkSync(tmp); } catch {}
      reject(e);
    });
  });
}

function extractShapefile(zipPath: string, extractDir: string): void {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(
    (e: { entryName: string; isDirectory: boolean }) => e.entryName.startsWith(GSHHG_ENTRY_PREFIX) && !e.isDirectory
  );
  if (entries.length === 0) {
    throw new Error(`No files matching ${GSHHG_ENTRY_PREFIX}.* found in ZIP`);
  }
  for (const entry of entries) {
    const outPath = path.join(extractDir, entry.entryName);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
  }
}
