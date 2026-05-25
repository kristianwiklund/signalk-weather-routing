import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { GribData, PolarData, LandIndex, CalculationStatus, GribInfo, PluginSettings } from './types';
import { loadGrib } from './lib/grib';
import { parsePolar } from './lib/polar';
import { buildLandIndex, segmentCrossesLand, polygonsInBbox } from './lib/landmask';
import { saveRoute } from './lib/resources';
import { pluginDataDir, gshhgShpPath, ensureGshhgShapefile, loadLandPolygons } from './lib/setup';
import { RoutingAlgorithm } from './lib/routing/algorithm';
import { IsochroneAlgorithm } from './lib/routing/isochrone';

const ALGORITHMS: Map<string, RoutingAlgorithm> = new Map([
  ['isochrone', new IsochroneAlgorithm()],
]);

const DEFAULT_ALGORITHM = 'isochrone';

module.exports = (app: any) => {
  let grib: GribData | null = null;
  let polar: PolarData | null = null;
  let landIndex: LandIndex | null = null;
  let settings: PluginSettings | null = null;
  let calcStatus: CalculationStatus = { status: 'idle', progress: 0 };
  const sseClients = new Set<Response>();

  function pushSse(data: object): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      client.write(payload);
      if (typeof (client as any).flush === 'function') (client as any).flush();
    }
  }

  function closeSseClients(): void {
    for (const client of sseClients) {
      if (typeof (client as any).flush === 'function') (client as any).flush();
      client.end();
    }
    sseClients.clear();
  }

  function setReady(): void {
    const parts: string[] = [];
    if (grib) parts.push(`GRIB: ${grib.times.length} steps`);
    if (polar) parts.push('polar loaded');
    parts.push(landIndex ? `land index: ${landIndex.polygons.length} polygons` : 'land index: loading...');
    app.setPluginStatus(parts.join(' · '));
  }

  function triggerLandIndexBuild(dataDir: string): void {
    const shpPath = gshhgShpPath(dataDir);

    const load = (p: string) =>
      loadLandPolygons(p)
        .then((polys) => {
          landIndex = buildLandIndex(polys);
          setReady();
        })
        .catch((e: Error) => app.setPluginError(`Land index load failed: ${e.message}`));

    if (fs.existsSync(shpPath)) {
      app.setPluginStatus('Loading land index...');
      load(shpPath);
      return;
    }

    ensureGshhgShapefile(dataDir, (msg) => app.setPluginStatus(msg))
      .then(load)
      .catch((e: Error) => app.setPluginError(`Land index build failed: ${e.message}`));
  }

  const plugin = {
    id: 'signalk-weather-routing',
    name: 'Weather Routing',

    start: async (cfg: PluginSettings) => {
      settings = cfg;
      app.setPluginStatus('Starting...');

      if (cfg.polarPath) {
        try {
          polar = parsePolar(cfg.polarPath);
        } catch (e: any) {
          app.setPluginError(`Failed to load polar file: ${e.message}`);
        }
      }

      triggerLandIndexBuild(pluginDataDir(app));

      if (!cfg.gribPath) {
        app.setPluginStatus('No GRIB file configured — set gribPath in plugin settings');
        return;
      }

      app.setPluginStatus('Loading GRIB2 file...');
      try {
        grib = await loadGrib(cfg.gribPath);
      } catch (e: any) {
        app.setPluginError(`Failed to load GRIB file: ${e.message}`);
        return;
      }

      setReady();
    },

    stop: () => {
      grib = null;
      polar = null;
      landIndex = null;
      calcStatus = { status: 'idle', progress: 0 };
      closeSseClients();
    },

    schema: () => ({
      type: 'object',
      required: ['gribPath', 'polarPath'],
      properties: {
        gribPath: {
          type: 'string',
          title: 'Path to GRIB2 file',
          description: 'Full filesystem path to GRIB2 weather forecast file (e.g. from OpenSkiron)',
        },
        polarPath: {
          type: 'string',
          title: 'Path to polar CSV file',
          description: 'Polar diagram in ORC/OpenCPN semicolon-delimited format (twa/tws;6;8;10...)',
        },
        algorithm: {
          type: 'string',
          title: 'Routing algorithm',
          description: `Algorithm to use for route calculation. Available: ${Array.from(ALGORITHMS.keys()).join(', ')}`,
          default: DEFAULT_ALGORITHM,
          enum: Array.from(ALGORITHMS.keys()),
        },
      },
    }),

    registerWithRouter: (router: Router) => {
      router.post('/calculate', async (req: Request, res: Response) => {
        if (!grib) return void res.status(503).json({ error: 'GRIB data not loaded' });
        if (!polar) return void res.status(503).json({ error: 'Polar data not loaded' });
        if (calcStatus.status === 'calculating') {
          return void res.status(409).json({ error: 'Calculation already in progress' });
        }

        const { start, end, departureTime, options } = req.body ?? {};
        if (!start?.lat || !start?.lon || !end?.lat || !end?.lon || !departureTime) {
          return void res.status(400).json({
            error: 'Required: start {lat,lon}, end {lat,lon}, departureTime (ISO 8601)',
          });
        }

        const algorithmId: string = settings?.algorithm ?? DEFAULT_ALGORITHM;
        const algorithm = ALGORITHMS.get(algorithmId);
        if (!algorithm) {
          return void res.status(400).json({ error: `Unknown algorithm: ${algorithmId}` });
        }

        calcStatus = { status: 'calculating', progress: 0 };
        res.json({ status: 'calculating' });

        algorithm
          .calculate(grib, polar, landIndex, req.body, (pct, frontier) => {
            calcStatus = { status: 'calculating', progress: pct, frontier };
            pushSse({ type: 'progress', progress: pct, frontier });
          }, options)
          .then(async (route) => {
            const routeId = await saveRoute(app, route);
            calcStatus = { status: 'done', progress: 100, routeId };
            app.setPluginStatus(`Route ready: ${route.length} waypoints`);
            pushSse({ type: 'done', routeId });
            closeSseClients();
          })
          .catch((e: Error) => {
            calcStatus = { status: 'error', progress: 0, error: e.message };
            app.setPluginError(`Route calculation failed: ${e.message}`);
            pushSse({ type: 'error', error: e.message });
            closeSseClients();
          });
      });

      router.get('/status', (_req: Request, res: Response) => {
        res.json(calcStatus);
      });

      router.get('/calculation-stream', (req: Request, res: Response) => {
        console.log(`[calculation-stream] connection received at ${Date.now()}`);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        if (typeof (res as any).flush === 'function') (res as any).flush();
        console.log(`[calculation-stream] headers flushed at ${Date.now()}`);

        sseClients.add(res);
        req.on('close', () => {
          console.log(`[calculation-stream] client closed at ${Date.now()}`);
          sseClients.delete(res);
        });

        // Sync state only for active calculations (page-refresh mid-run reconnect).
        // Done/error belong to a previous calculation — don't replay them.
        if (calcStatus.status === 'calculating') {
          res.write(`data: ${JSON.stringify({ type: 'progress', progress: calcStatus.progress, frontier: calcStatus.frontier })}\n\n`);
        }
      });

      router.get('/grib-info', (_req: Request, res: Response) => {
        const info: GribInfo = { loaded: grib !== null };
        if (grib) {
          info.path = settings?.gribPath;
          info.timeStart = grib.times[0].toISOString();
          info.timeEnd = grib.times[grib.times.length - 1].toISOString();
          info.nTimes = grib.times.length;
          info.latMin = grib.latMin;
          info.latMax = grib.latMin + grib.latStep * (grib.nLat - 1);
          info.lonMin = grib.lonMin;
          info.lonMax = grib.lonMin + grib.lonStep * (grib.nLon - 1);
        }
        res.json(info);
      });

      router.get('/land-polygons', async (req: Request, res: Response) => {
        if (!landIndex) return void res.status(503).json({ error: 'land index not ready' });
        const latMin = parseFloat(req.query.latMin as string);
        const lonMin = parseFloat(req.query.lonMin as string);
        const latMax = parseFloat(req.query.latMax as string);
        const lonMax = parseFloat(req.query.lonMax as string);
        if ([latMin, lonMin, latMax, lonMax].some(isNaN)) {
          return void res.status(400).json({ error: 'latMin, lonMin, latMax, lonMax required' });
        }
        const polys = polygonsInBbox(landIndex, latMin, lonMin, latMax, lonMax);
        res.setHeader('Content-Type', 'application/json');
        res.write('{"type":"FeatureCollection","features":[');
        for (let i = 0; i < polys.length; i++) {
          const p = polys[i];
          const coords: [number, number][] = [];
          for (let j = 0; j < p.exterior.length; j += 2) coords.push([p.exterior[j], p.exterior[j + 1]]);
          if (coords.length > 0) coords.push(coords[0]);
          const feature = JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: null });
          res.write(i === 0 ? feature : `,${feature}`);
          await new Promise<void>(r => setImmediate(r));
        }
        res.end(']}');
      });

      router.post('/reload-grib', async (req: Request, res: Response) => {
        const gribPath: string = req.body?.path ?? settings?.gribPath;
        if (!gribPath) return void res.status(400).json({ error: 'No gribPath provided or configured' });
        try {
          app.setPluginStatus('Reloading GRIB2 file...');
          grib = await loadGrib(gribPath);
          if (settings) settings.gribPath = gribPath;
          res.json({ success: true, nTimes: grib.times.length });
          setReady();
        } catch (e: any) {
          app.setPluginError(`GRIB reload failed: ${e.message}`);
          res.status(500).json({ error: e.message });
        }
      });
    },
  };

  return plugin;
};
