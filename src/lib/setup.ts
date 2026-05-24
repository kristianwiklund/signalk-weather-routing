import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import * as gdal from 'gdal-async';
import { LandPolygon } from '../types';

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
