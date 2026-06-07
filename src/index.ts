// SignalK plugin entry point — registers API routes, manages plugin lifecycle and server state.

import * as nodepath from 'node:path';
import { Router, Request, Response } from 'express';
import { GribFileEntry, GribInfoResponse, PolarData, LandIndex, LandEdgeIndex, CalculationStatus, PluginSettings } from './types';
import { loadGrib, scanGribDir, readGribMeta } from './lib/grib';
import { MultiFileWindProvider } from './lib/windprovider';
import { parsePolar } from './lib/polar';
import { buildLandIndex, polygonsInBbox, isPointOnLand } from './lib/landmask';
import { saveRoute } from './lib/resources';
import { pluginDataDir, loadBundledEdgeIndex, loadBundledDilatedIndex } from './lib/setup';
import { RoutingAlgorithm } from './lib/routing/algorithm';
import { IsochroneAlgorithm } from './lib/routing/isochrone';

const ALGORITHMS: Map<string, RoutingAlgorithm> = new Map([
  ['isochrone', new IsochroneAlgorithm()],
]);

const DEFAULT_ALGORITHM = 'isochrone';

module.exports = (app: any) => {
  let gribFiles: GribFileEntry[] = [];
  let gribFailedFiles: Array<{ path: string; error: string }> = [];
  let polar: PolarData | null = null;
  let landIndex: LandIndex | null = null;              // polygon index — overlay only
  let edgeIndex: LandEdgeIndex | null = null;          // edge-tile index — routing land checks
  let dilatedLandIndex: LandIndex | null = null;       // dilated polygon index — overlay (REQ-42)
  let dilatedEdgeIndex: LandEdgeIndex | null = null;   // dilated edge-tile index — safety margin routing (REQ-39)
  let dilatedIndexReady = false;
  let settings: PluginSettings | null = null;
  let calcStatus: CalculationStatus = { status: 'idle', progress: 0 };
  let pendingRoute: import('./types').RoutePoint[] | null = null;
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
    if (gribFiles.length > 0) parts.push(`${gribFiles.length} GRIB file(s) indexed`);
    if (polar) parts.push('polar loaded');
    if (edgeIndex) parts.push(`land index: ${edgeIndex.edgeGrid.size} cells`);
    if (gribFailedFiles.length > 0) parts.push(`${gribFailedFiles.length} file(s) failed to index`);
    app.setPluginStatus(parts.join(' · '));
  }

  async function scanAndIndexGribDir(dir: string): Promise<void> {
    gribFiles = [];
    gribFailedFiles = [];
    let paths: string[];
    try {
      paths = await scanGribDir(dir);
    } catch (e: any) {
      app.setPluginError(`Failed to scan GRIB directory: ${e.message}`);
      return;
    }
    for (const p of paths) {
      try {
        const meta = await readGribMeta(p);
        gribFiles.push({ meta, data: null });
      } catch (e: any) {
        gribFailedFiles.push({ path: p, error: e.message });
      }
    }
  }

  const plugin = {
    id: 'signalk-weather-routing',
    name: 'Weather Routing',

    start: async (cfg: PluginSettings) => {
      // Schema migration: saved configs from before REQ-32 have gribPath instead of gribDir.
      if (!cfg.gribDir && (cfg as any).gribPath) {
        cfg.gribDir = nodepath.dirname((cfg as any).gribPath);
      }
      settings = cfg;
      app.setPluginStatus('Starting...');

      if (cfg.polarPath) {
        try {
          polar = parsePolar(cfg.polarPath);
        } catch (e: any) {
          app.setPluginError(`Failed to load polar file: ${e.message}`);
        }
      }

      try {
        app.setPluginStatus('Loading land data...');
        const dataDir = pluginDataDir(app);
        edgeIndex = loadBundledEdgeIndex(dataDir);
        landIndex = buildLandIndex(edgeIndex.polygons);
        dilatedEdgeIndex = loadBundledDilatedIndex(dataDir);
        dilatedLandIndex = buildLandIndex(dilatedEdgeIndex.polygons);
        dilatedIndexReady = true;
      } catch (e: any) {
        app.setPluginError(`Failed to load land data: ${e.message}`);
        return;
      }

      if (!cfg.gribDir) {
        app.setPluginStatus('No GRIB directory configured — set gribDir in plugin settings');
        return;
      }

      app.setPluginStatus('Indexing GRIB directory...');
      await scanAndIndexGribDir(cfg.gribDir);
      setReady();
    },

    stop: () => {
      gribFiles = [];
      gribFailedFiles = [];
      polar = null;
      landIndex = null;
      edgeIndex = null;
      dilatedLandIndex = null;
      dilatedEdgeIndex = null;
      dilatedIndexReady = false;
      calcStatus = { status: 'idle', progress: 0 };
      pendingRoute = null;
      closeSseClients();
    },

    schema: () => ({
      type: 'object',
      required: ['polarPath'],
      properties: {
        gribDir: {
          type: 'string',
          title: 'Path to GRIB2 directory',
          description: 'Filesystem path to a directory containing GRIB2 weather forecast files (e.g. from OpenSkiron)',
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
        if (gribFiles.length === 0) return void res.status(503).json({ error: 'No GRIB files indexed — configure gribDir and reload' });
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

        const useLandAvoidance = req.body?.useLandAvoidance !== false; // default true
        const useSafetyMargin = req.body?.useSafetyMargin === true;
        if (useSafetyMargin && !dilatedEdgeIndex) {
          return void res.status(503).json({ error: 'Safety margin index not ready yet' });
        }
        const activeIndex = !useLandAvoidance
          ? null
          : useSafetyMargin ? dilatedEdgeIndex : edgeIndex;

        if (useLandAvoidance && activeIndex) {
          if (isPointOnLand(activeIndex, start.lat, start.lon))
            return void res.status(400).json({ error: 'Start point is on land — move it to open water' });
          if (isPointOnLand(activeIndex, end.lat, end.lon))
            return void res.status(400).json({ error: 'Destination is on land — move it to open water' });
        }

        const departureMs = new Date(departureTime).getTime();
        const enabledPaths: string[] | undefined = req.body?.enabledGribPaths;
        const selectedEntries = gribFiles.filter(f =>
          f.meta.timeEnd.getTime() >= departureMs &&
          (enabledPaths == null || enabledPaths.includes(f.meta.path))
        );
        if (selectedEntries.length === 0) {
          return void res.status(400).json({ error: 'No GRIB files cover the requested departure time' });
        }

        // Nautical Safety Rule: hard error if departure is before the forecast starts.
        // Silent substitution to the nearest GRIB time would route on wrong weather data.
        const earliestGribStart = new Date(Math.min(...selectedEntries.map(f => f.meta.timeStart.getTime())));
        if (departureMs < earliestGribStart.getTime()) {
          return void res.status(400).json({
            error: `Departure time is before the forecast period — forecast starts ${earliestGribStart.toISOString().slice(0, 16).replace('T', ' ')} UTC. Load a GRIB file covering your departure time or adjust the departure.`,
          });
        }

        // Nautical Safety Rule: hard error if start point is outside all loaded GRIB files' coverage.
        // wind.getWind() silently clamps out-of-domain queries to the nearest grid edge; the router
        // would proceed on extrapolated wind with no indication the departure is outside coverage.
        const pointCoveredByGrib = selectedEntries.some(f =>
          start.lat >= f.meta.latMin && start.lat <= f.meta.latMax &&
          start.lon >= f.meta.lonMin && start.lon <= f.meta.lonMax
        );
        if (!pointCoveredByGrib) {
          return void res.status(400).json({
            error: 'Start point is outside the GRIB coverage area — load a GRIB file that covers your departure location',
          });
        }

        calcStatus = { status: 'calculating', progress: 0 };
        res.json({ status: 'calculating' });

        try {
          for (const entry of selectedEntries) {
            if (entry.data === null) {
              try {
                entry.data = await loadGrib(entry.meta.path);
              } catch (e: any) {
                console.warn(`[weather-routing] Failed to load GRIB file ${entry.meta.path}: ${e.message}`);
              }
            }
          }

          const loadedEntries = selectedEntries.filter(e => e.data !== null);
          if (loadedEntries.length === 0) {
            throw new Error('All relevant GRIB files failed to load — check file integrity');
          }

          const wind = new MultiFileWindProvider(loadedEntries);

          const { route, warning } = await algorithm.calculate(
            wind, polar, activeIndex, req.body,
            (pct, frontier) => {
              calcStatus = { status: 'calculating', progress: pct, frontier };
              pushSse({ type: 'progress', progress: pct, frontier });
            },
            options,
          );

          pendingRoute = route;
          if (warning) {
            calcStatus = { status: 'warning', progress: 100, warning };
            app.setPluginStatus(`Partial route: ${route.length} waypoints`);
            pushSse({ type: 'warning', warning });
          } else {
            calcStatus = { status: 'done', progress: 100 };
            app.setPluginStatus(`Route ready: ${route.length} waypoints`);
            pushSse({ type: 'done' });
          }
          closeSseClients();
        } catch (e: any) {
          calcStatus = { status: 'error', progress: 0, error: e.message };
          app.setPluginError(`Route calculation failed: ${e.message}`);
          pushSse({ type: 'error', error: e.message, reason: e.reason ?? 'unknown' });
          closeSseClients();
        }
      });

      router.get('/status', (_req: Request, res: Response) => {
        res.json({ ...calcStatus, dilatedIndexReady });
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
        const info: GribInfoResponse = {
          gribDir: settings?.gribDir ?? '',
          files: gribFiles.map(f => f.meta),
          failedFiles: gribFailedFiles,
        };
        res.json(info);
      });

      router.get('/land-polygons', async (req: Request, res: Response) => {
        const useDilated = req.query.dilated === 'true';
        const index = useDilated ? dilatedLandIndex : landIndex;
        if (!index) {
          return void res.status(503).json({ error: useDilated ? 'dilated land index not ready' : 'land index not ready' });
        }
        const latMin = parseFloat(req.query.latMin as string);
        const lonMin = parseFloat(req.query.lonMin as string);
        const latMax = parseFloat(req.query.latMax as string);
        const lonMax = parseFloat(req.query.lonMax as string);
        if ([latMin, lonMin, latMax, lonMax].some(isNaN)) {
          return void res.status(400).json({ error: 'latMin, lonMin, latMax, lonMax required' });
        }
        const polys = polygonsInBbox(index, latMin, lonMin, latMax, lonMax);
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

      router.get('/pending-route', (_req: Request, res: Response) => {
        if (!pendingRoute) return void res.status(404).json({ error: 'No pending route' });
        res.json({
          feature: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: pendingRoute.map(p => [p.lon, p.lat]),
            },
            properties: {
              coordinatesMeta: pendingRoute.map(p => ({
                name: p.time.toISOString(),
                time: p.time.toISOString(),
                windDir: Math.round(p.windDir),
                heading: Math.round(p.heading),
                twa: Math.round(p.twa),
                tws: Math.round(p.tws * 10) / 10,
                boatSpeed: Math.round(p.boatSpeed * 10) / 10,
                legCalcMs: p.legCalcMs,
                ...(p.waveHeight !== undefined ? { waveHeight: Math.round(p.waveHeight * 100) / 100 } : {}),
                ...(p.gribFilePath !== undefined ? { gribFile: p.gribFilePath } : {}),
              })),
            },
          },
        });
      });

      router.post('/save-route', async (req: Request, res: Response) => {
        if (!pendingRoute) return void res.status(404).json({ error: 'No pending route to save' });
        const name: string = req.body?.name?.trim() || `Weather Route ${new Date().toLocaleString()}`;
        try {
          const routeId = await saveRoute(app, pendingRoute, name);
          res.json({ routeId });
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      });

      router.post('/reload-grib', async (req: Request, res: Response) => {
        const dir = settings?.gribDir;
        if (!dir) return void res.status(400).json({ error: 'No gribDir configured' });
        try {
          app.setPluginStatus('Re-indexing GRIB directory...');
          await scanAndIndexGribDir(dir);
          res.json({ success: true, nFiles: gribFiles.length, failedFiles: gribFailedFiles });
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
