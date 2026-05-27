import { workerData, parentPort } from 'worker_threads';
import { loadLandPolygons } from './setup';
import { dilateAndMergePolygons } from './dilate';
import { LandPolygon } from '../types';

const { shpPath, radiusNm } = workerData as { shpPath: string; radiusNm: number };

async function run(): Promise<void> {
  const polygons: LandPolygon[] = await loadLandPolygons(shpPath);
  const dilated: LandPolygon[] = await dilateAndMergePolygons(polygons, radiusNm, (pct) => {
    parentPort!.postMessage({ type: 'progress', pct });
  });
  parentPort!.postMessage({ ok: true, polygons: dilated });
}

run().catch((e: Error) => {
  parentPort!.postMessage({ ok: false, error: e.message });
});
