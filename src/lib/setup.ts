import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as gdal from 'gdal-async';

const GSHHG_VERSION = '2.3.7';
const GSHHG_ZIP_URL = `https://www.soest.hawaii.edu/pwessel/gshhg/gshhg-shp-${GSHHG_VERSION}.zip`;
// Intermediate-resolution, ocean-level-1 (land)
const GSHHG_ENTRY_PREFIX = 'GSHHS_shp/i/GSHHS_i_L1';

const LANDMASK_VERSION = 1;
const LAT_STEP = 0.05;
const LON_STEP = 0.05;
const LAT_MIN = -90.0;
const LAT_MAX = 90.0;
const LON_MIN = -180.0;
const LON_MAX = 180.0;

export function pluginDataDir(app: any): string {
  const configPath: string = app.config?.configPath ?? path.join(os.homedir(), '.signalk');
  return path.join(configPath, 'plugin-config-data', 'signalk-weather-routing');
}

export function defaultLandMaskPath(app: any): string {
  return path.join(pluginDataDir(app), 'landmask.bin');
}

export async function downloadAndBuildLandMask(
  outputPath: string,
  onStatus: (msg: string) => void,
): Promise<void> {
  const dataDir = path.dirname(outputPath);
  fs.mkdirSync(dataDir, { recursive: true });

  const zipPath = path.join(dataDir, `gshhg-shp-${GSHHG_VERSION}.zip`);
  const extractDir = path.join(dataDir, `gshhg-${GSHHG_VERSION}`);

  if (!fs.existsSync(zipPath)) {
    onStatus('Downloading GSHHG coastline data (~170 MB)...');
    await downloadFile(GSHHG_ZIP_URL, zipPath);
    onStatus('GSHHG download complete');
  }

  onStatus('Extracting GSHHG shapefile...');
  extractShapefile(zipPath, extractDir);

  const shpPath = path.join(extractDir, GSHHG_ENTRY_PREFIX + '.shp');
  if (!fs.existsSync(shpPath)) {
    throw new Error(`Shapefile not found after extraction: ${shpPath}`);
  }

  onStatus('Building land mask — this takes several minutes on first run...');
  const tmpPath = outputPath + '.tmp';
  await rasterizeLandMask(shpPath, tmpPath, onStatus);
  fs.renameSync(tmpPath, outputPath);
  onStatus('Land mask ready');
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
    }).on('error', (e) => {
      file.close();
      try { fs.unlinkSync(tmp); } catch {}
      reject(e);
    });
  });
}

function extractShapefile(zipPath: string, extractDir: string): void {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter(
    (e) => e.entryName.startsWith(GSHHG_ENTRY_PREFIX) && !e.isDirectory
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

interface Polygon {
  bboxLatMin: number;
  bboxLatMax: number;
  bboxLonMin: number;
  bboxLonMax: number;
  rings: Array<Array<[number, number]>>;  // [lon, lat] pairs
}

async function rasterizeLandMask(
  shpPath: string,
  outputPath: string,
  onStatus: (msg: string) => void,
): Promise<void> {
  const polygons = await loadPolygons(shpPath);
  onStatus(`Loaded ${polygons.length} coastline polygons`);

  const nLat = Math.round((LAT_MAX - LAT_MIN) / LAT_STEP) + 1;
  const nLon = Math.round((LON_MAX - LON_MIN) / LON_STEP) + 1;
  const nBits = nLat * nLon;
  const nBytes = Math.ceil(nBits / 8);
  const bits = new Uint8Array(nBytes);

  let lastPctReported = -1;
  for (let latI = 0; latI < nLat; latI++) {
    const lat = LAT_MIN + latI * LAT_STEP;
    for (let lonI = 0; lonI < nLon; lonI++) {
      const lon = LON_MIN + lonI * LON_STEP;
      if (pointInAnyPolygon(lat, lon, polygons)) {
        const bit = latI * nLon + lonI;
        bits[bit >> 3] |= 1 << (bit & 7);
      }
    }
    const pct = Math.floor((latI / nLat) * 100);
    if (pct !== lastPctReported && pct % 10 === 0) {
      onStatus(`Rasterizing land mask: ${pct}%`);
      lastPctReported = pct;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  const header = Buffer.allocUnsafe(28);
  header.writeUInt32LE(LANDMASK_VERSION, 0);
  header.writeUInt32LE(nLat, 4);
  header.writeUInt32LE(nLon, 8);
  header.writeFloatLE(LAT_MIN, 12);
  header.writeFloatLE(LAT_STEP, 16);
  header.writeFloatLE(LON_MIN, 20);
  header.writeFloatLE(LON_STEP, 24);

  const fd = fs.openSync(outputPath, 'w');
  fs.writeSync(fd, header);
  fs.writeSync(fd, bits);
  fs.closeSync(fd);
}

async function loadPolygons(shpPath: string): Promise<Polygon[]> {
  const ds = await gdal.openAsync(shpPath);
  const layer = ds.layers.get(0);
  const polygons: Polygon[] = [];

  layer.features.forEach((feature: any) => {
    const geom = feature.getGeometry();
    if (geom) {
      polygons.push(...extractPolygons(geom));
    }
  });

  ds.close();
  return polygons;
}

function extractPolygons(geom: any): Polygon[] {
  const typeName: string = (geom.name ?? '').toUpperCase().replace(/\s+/g, '');
  if (typeName === 'POLYGON') {
    return [geometryToPolygon(geom)];
  } else if (typeName === 'MULTIPOLYGON') {
    const result: Polygon[] = [];
    const count: number = geom.children.count();
    for (let i = 0; i < count; i++) {
      result.push(...extractPolygons(geom.children.get(i)));
    }
    return result;
  }
  return [];
}

function geometryToPolygon(poly: any): Polygon {
  const rings: Array<Array<[number, number]>> = [];
  const ringCount: number = poly.rings.count();
  for (let ri = 0; ri < ringCount; ri++) {
    const ring = poly.rings.get(ri);
    const pts: Array<[number, number]> = [];
    ring.points.forEach((pt: any) => {
      pts.push([pt.x, pt.y]);  // [lon, lat]
    });
    rings.push(pts);
  }

  let bboxLatMin = 90, bboxLatMax = -90, bboxLonMin = 180, bboxLonMax = -180;
  for (const [lon, lat] of rings[0] ?? []) {
    if (lat < bboxLatMin) bboxLatMin = lat;
    if (lat > bboxLatMax) bboxLatMax = lat;
    if (lon < bboxLonMin) bboxLonMin = lon;
    if (lon > bboxLonMax) bboxLonMax = lon;
  }

  return { bboxLatMin, bboxLatMax, bboxLonMin, bboxLonMax, rings };
}

function pointInAnyPolygon(lat: number, lon: number, polygons: Polygon[]): boolean {
  for (const poly of polygons) {
    if (
      lat < poly.bboxLatMin || lat > poly.bboxLatMax ||
      lon < poly.bboxLonMin || lon > poly.bboxLonMax
    ) continue;
    if (pointInPolygon(lat, lon, poly.rings)) return true;
  }
  return false;
}

// Ray casting: exterior ring → inside if contained; holes → outside if contained
function pointInPolygon(lat: number, lon: number, rings: Array<Array<[number, number]>>): boolean {
  if (!rings[0] || !raycast(lat, lon, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (raycast(lat, lon, rings[i])) return false;
  }
  return true;
}

function raycast(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
