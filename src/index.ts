// SignalK plugin entry point — registers API routes, manages plugin lifecycle and server state.

import * as nodepath from 'node:path';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import express, { Router, Request, Response } from 'express';

// Side-effect: copies gdal-async .node binary from optional dep — must run before ./lib/grib
import './lib/ensure-gdal-binary';

import {
  CurrentFileEntry,
  CurrentProvider,
  GribFileEntry,
  GribInfoResponse,
  PolarData,
  LandIndex,
  LandEdgeIndex,
  RegionIndex,
  CalculationStatus,
  PluginSettings,
  RoutePoint,
  LatLon,
} from './types';
import {
  loadGrib,
  loadCurrentGrib,
  scanGribDir,
  readGribMeta,
  getCurrentAt,
  nearestCurrentTimeIndex,
  sanitizeGribName,
} from './lib/grib';
import { MultiFileGribProvider } from './lib/multiFileGribProvider';
import { WindField, CurrentField } from './lib/fields';
import { gribDataToLoadedFile, currentGribDataToLoadedFile } from './lib/gribAdapter';
import { proposeCombination, combinationFileFromMeta } from './lib/gribCombination';
// SingleFileCurrentProvider retained for backward compat but unused — multi-file current
// is now handled via MultiFileGribProvider + CurrentField (Phase 2, REQ-141).
import { parsePolar } from './lib/polar';
import { buildLandIndex, polygonsInBbox, isPointOnLand } from './lib/landmask';
import { saveRoute } from './lib/resources';
import { buildRegionIndex, validRegionUuids } from './lib/regions';
import {
  pluginDataDir,
  loadBundledEdgeIndex,
  loadBundledDilatedIndex,
  hiresLandAvailable,
  loadHiresEdgeIndex,
  loadHiresDilatedIndex,
} from './lib/setup';
import { validateCalculateInput } from './lib/validation';
import { SignalKApp } from './lib/signalk-app';
import { computeGridBounds } from './lib/grid';
import { RoutingAlgorithm } from './lib/routing/algorithm';
import { IsochroneAlgorithm } from './lib/routing/isochrone';

const ALGORITHMS: Map<string, RoutingAlgorithm> = new Map([['isochrone', new IsochroneAlgorithm()]]);

const DEFAULT_ALGORITHM = 'isochrone';

module.exports = (app: SignalKApp) => {
  let gribFiles: GribFileEntry[] = [];
  let currentFiles: CurrentFileEntry[] = [];
  let currentProvider: CurrentProvider | null = null;
  let gribFailedFiles: Array<{ path: string; error: string }> = [];
  let polar: PolarData | null = null;
  let landIndex: LandIndex | null = null; // polygon index — overlay only
  let edgeIndex: LandEdgeIndex | null = null; // edge-tile index — routing land checks
  let dilatedLandIndex: LandIndex | null = null; // dilated polygon index — overlay (REQ-42)
  let dilatedEdgeIndex: LandEdgeIndex | null = null; // dilated edge-tile index — safety margin routing (REQ-39)
  let dilatedIndexReady = false;
  let hiresActive = false;
  let regionIndex: RegionIndex | null = null;
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
    if (gribFiles.length > 0) parts.push(`${gribFiles.length} wind GRIB file(s)`);
    if (currentFiles.length > 0) parts.push(`${currentFiles.length} current GRIB file(s)`);
    if (polar) parts.push('polar loaded');
    if (edgeIndex) parts.push(`land index: ${edgeIndex.edgeGrid.size} cells`);
    if (gribFailedFiles.length > 0) parts.push(`${gribFailedFiles.length} file(s) failed to index`);
    app.setPluginStatus(parts.join(' · '));
  }

  async function archiveFile(gribDir: string, filePath: string): Promise<void> {
    const archiveDir = nodepath.join(gribDir, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });
    const base = nodepath.basename(filePath);
    const ext = nodepath.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    let dest = nodepath.join(archiveDir, base);
    let serial = 2;
    while (true) {
      try {
        await fs.access(dest);
      } catch {
        break;
      }
      dest = nodepath.join(archiveDir, `${stem}.${serial}${ext}`);
      serial++;
    }
    await fs.rename(filePath, dest);
  }

  // Stream a request body to a file. Cleans up the partial file on abort/error.
  function streamReqToFile(req: Request, target: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const out = createWriteStream(target);
      const fail = (err: unknown) => {
        out.destroy();
        fs.unlink(target).catch(() => {});
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      out.on('finish', () => resolve());
      out.on('error', fail);
      req.on('error', fail);
      req.on('aborted', () => fail(new Error('upload aborted by client')));
      req.pipe(out);
    });
  }

  async function scanAndIndexGribDir(dir: string): Promise<void> {
    gribFiles = [];
    currentFiles = [];
    currentProvider = null;
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
        if (meta.type === 'current') {
          currentFiles.push({ meta, data: null });
        } else {
          gribFiles.push({ meta, data: null });
        }
      } catch (e: any) {
        gribFailedFiles.push({ path: p, error: e.message });
      }
    }
    // Load all current files and build the current provider via the generic engine (Phase 2).
    if (currentFiles.length > 0) {
      for (const f of currentFiles) {
        try {
          f.data = await loadCurrentGrib(f.meta.path);
        } catch (e: any) {
          gribFailedFiles.push({ path: f.meta.path, error: `Current GRIB load failed: ${e.message}` });
        }
      }
      const loaded = currentFiles.filter((f) => f.data !== null);
      if (loaded.length > 0) {
        currentProvider = new CurrentField(
          new MultiFileGribProvider(loaded.map((f) => currentGribDataToLoadedFile(f.meta, f.data!))),
        );
      } else {
        currentProvider = null;
      }
    }
  }

  async function loadRegions(): Promise<void> {
    try {
      if (!app.resourcesApi?.listResources) {
        app.debug('resourcesApi.listResources not available — skipping region load');
        regionIndex = null;
        return;
      }
      const apiRegions = await app.resourcesApi.listResources('regions');
      regionIndex = buildRegionIndex(apiRegions);
    } catch (e: any) {
      app.debug(`Failed to load regions: ${e.message}`);
      regionIndex = null;
    }
  }

  // Removes stale region UUIDs from plugin config. Called only from start() so that
  // frequent read-only loadRegions() calls (from /calculate, /reload-grib, /avoid-regions)
  // do not mutate persisted config as a side effect (BUG-116).
  async function cleanStaleRegionIds(): Promise<void> {
    if (!settings || !settings.avoidRegionIds || settings.avoidRegionIds.length === 0) return;
    if (!regionIndex) return;
    const valid = validRegionUuids(regionIndex);
    const stale = settings.avoidRegionIds.filter((id) => !valid.has(id));
    if (stale.length > 0) {
      settings.avoidRegionIds = settings.avoidRegionIds.filter((id) => valid.has(id));
      try {
        app.savePluginOptions?.(settings);
      } catch {
        /* not critical */
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
        if (hiresLandAvailable()) {
          app.debug('hires (f-tier) land index detected — using high-resolution data');
          hiresActive = true;
          edgeIndex = loadHiresEdgeIndex(dataDir);
          landIndex = buildLandIndex(edgeIndex.polygons);
          dilatedEdgeIndex = loadHiresDilatedIndex(dataDir);
        } else {
          edgeIndex = loadBundledEdgeIndex(dataDir);
          landIndex = buildLandIndex(edgeIndex.polygons);
          dilatedEdgeIndex = loadBundledDilatedIndex(dataDir);
        }
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
      await loadRegions();
      await cleanStaleRegionIds();
      setReady();
    },

    stop: () => {
      gribFiles = [];
      currentFiles = [];
      currentProvider = null;
      gribFailedFiles = [];
      polar = null;
      landIndex = null;
      edgeIndex = null;
      dilatedLandIndex = null;
      dilatedEdgeIndex = null;
      dilatedIndexReady = false;
      regionIndex = null;
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
        hideTestButtons: {
          type: 'boolean',
          title: 'Hide test buttons',
          description: 'When enabled, the Run test / Helsinki test / Gothenburg test buttons are hidden in the webapp.',
          default: true,
        },
        windSpeedMs: {
          type: 'boolean',
          title: 'Display wind speed in m/s',
          description:
            'When enabled, wind speed is displayed and entered in m/s everywhere in the webapp, overriding the SignalK unit preference.',
          default: false,
        },
        headingStep: {
          type: 'number',
          title: 'Heading step (degrees)',
          description:
            'Angular resolution when evaluating candidate headings. Lower = finer routes, slower calculation.',
          default: 5,
        },
        sectorSize: {
          type: 'number',
          title: 'Frontier sector size (degrees)',
          description: 'Bearing sector width for frontier pruning — top 2 candidates per sector are kept.',
          default: 1,
        },
        minBoatSpeed: {
          type: 'number',
          title: 'Minimum boat speed (knots)',
          description: 'Headings producing less than this speed are discarded.',
          default: 0.3,
        },
        arrivalRadiusNm: {
          type: 'number',
          title: 'Arrival radius (NM)',
          description: 'Distance from destination at which the route is considered complete.',
          default: 2,
        },
        coneHalfAngle: {
          type: 'number',
          title: 'Directional cone half-angle (degrees)',
          description:
            'Half-angle of the heading cone applied when the direct path to the destination is clear of land.',
          default: 100,
        },
        coneDisableLookaheadNm: {
          type: 'number',
          title: 'Cone land-check distance (NM)',
          description: 'How far ahead to check for land when deciding whether to disable the directional cone.',
          default: 100,
        },
        maxHeadingChange: {
          type: 'number',
          title: 'Max heading change per step (degrees)',
          description: 'Maximum course change allowed between consecutive timesteps.',
          default: 120,
        },
        waveOverlayMaxM: {
          type: 'number',
          title: 'Wave overlay max (m)',
          description: 'Upper bound of the wave height colour scale. Heights >= this value appear red. Default: 3.0.',
          default: 3.0,
        },
        conditionsGraphHeight: {
          type: 'number',
          title: 'Conditions graph height (px)',
          description: 'Height of the conditions graph panel in pixels. Default: 150.',
          default: 150,
          minimum: 80,
          maximum: 400,
        },
        forecastSkillHorizonHours: {
          type: 'number',
          title: 'Forecast skill horizon (hours)',
          description:
            'Hours from the model reference time beyond which forecast skill is considered low. The Grib Manager timeline and the route conditions graph shade this region as low-confidence. Default: 96.',
          default: 96,
          minimum: 24,
          maximum: 240,
        },
        avoidRegionIds: {
          type: 'array',
          title: 'Avoided region UUIDs',
          description: 'UUIDs of SignalK regions to avoid during routing. Manage via the webapp map overlay.',
          items: { type: 'string' },
          default: [],
        },
      },
    }),

    registerWithRouter: (router: Router) => {
      const leafletDist = nodepath.join(nodepath.dirname(require.resolve('leaflet/package.json')), 'dist');
      router.use('/leaflet', express.static(leafletDist));

      router.post('/calculate', async (req: Request, res: Response) => {
        if (gribFiles.length === 0)
          return void res.status(503).json({
            error: 'No GRIB files indexed — configure gribDir and reload',
          });
        if (!polar) return void res.status(503).json({ error: 'Polar data not loaded' });
        if (calcStatus.status === 'calculating') {
          return void res.status(409).json({ error: 'Calculation already in progress' });
        }
        // Refresh region index so newly-created SignalK regions are picked up
        // even if they were added after plugin startup (REQ-98).
        await loadRegions();

        const { start, end, departureTime, options } = req.body ?? {};
        // Plugin settings act as defaults; per-request options override.
        const mergedOptions: Record<string, unknown> = {
          headingStep: settings?.headingStep,
          sectorSize: settings?.sectorSize,
          minBoatSpeed: settings?.minBoatSpeed,
          arrivalRadiusNm: settings?.arrivalRadiusNm,
          coneHalfAngle: settings?.coneHalfAngle,
          coneDisableLookaheadNm: settings?.coneDisableLookaheadNm,
          maxHeadingChange: settings?.maxHeadingChange,
          ...options,
        };
        const inputValidation = validateCalculateInput({
          start,
          end,
          departureTime,
        });
        if (!inputValidation.valid) {
          return void res.status(400).json({ error: inputValidation.error });
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
        const activeIndex = !useLandAvoidance ? null : useSafetyMargin ? dilatedEdgeIndex : edgeIndex;

        if (useLandAvoidance && activeIndex) {
          if (isPointOnLand(activeIndex, start.lat, start.lon))
            return void res.status(400).json({
              error: 'Start point is on land — move it to open water',
            });
          if (isPointOnLand(activeIndex, end.lat, end.lon))
            return void res.status(400).json({
              error: 'Destination is on land — move it to open water',
            });
        }

        const departureMs = new Date(departureTime).getTime();
        if (isNaN(departureMs)) {
          return void res.status(400).json({
            error: 'Invalid departureTime — expected ISO 8601 string',
          });
        }
        const enabledPaths: string[] | undefined = req.body?.enabledGribPaths;
        const selectedEntries = gribFiles.filter(
          (f) =>
            f.meta.timeEnd.getTime() >= departureMs && (enabledPaths == null || enabledPaths.includes(f.meta.path)),
        );
        if (selectedEntries.length === 0) {
          return void res.status(400).json({
            error:
              'No wind GRIB files cover the requested departure time — load a wind GRIB file that includes your departure time',
          });
        }

        // Nautical Safety Rule: hard error if departure is before the forecast starts.
        // Silent substitution to the nearest GRIB time would route on wrong weather data.
        const earliestGribStart = new Date(Math.min(...selectedEntries.map((f) => f.meta.timeStart.getTime())));
        if (departureMs < earliestGribStart.getTime()) {
          return void res.status(400).json({
            error: `Departure time is before the forecast period — forecast starts ${earliestGribStart.toISOString().slice(0, 16).replace('T', ' ')} UTC. Load a GRIB file covering your departure time or adjust the departure.`,
          });
        }

        // Nautical Safety Rule: hard error if start point is outside all loaded GRIB files' coverage.
        // wind.getWind() silently clamps out-of-domain queries to the nearest grid edge; the router
        // would proceed on extrapolated wind with no indication the departure is outside coverage.
        const pointCoveredByGrib = selectedEntries.some(
          (f) =>
            start.lat >= f.meta.latMin &&
            start.lat <= f.meta.latMax &&
            start.lon >= f.meta.lonMin &&
            start.lon <= f.meta.lonMax,
        );
        if (!pointCoveredByGrib) {
          return void res.status(400).json({
            error:
              'Start point is outside the GRIB coverage area — load a GRIB file that covers your departure location',
          });
        }

        const waypoints: Array<LatLon> = Array.isArray(req.body?.waypoints) ? req.body.waypoints : [];
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          if (useLandAvoidance && activeIndex) {
            if (isPointOnLand(activeIndex, wp.lat, wp.lon))
              return void res.status(400).json({
                error: `Waypoint ${i + 1} is on land — move it to open water`,
              });
          }
          // GRIB coverage is independent of land avoidance — always checked.
          const wpCovered = selectedEntries.some(
            (f) =>
              wp.lat >= f.meta.latMin && wp.lat <= f.meta.latMax && wp.lon >= f.meta.lonMin && wp.lon <= f.meta.lonMax,
          );
          if (!wpCovered)
            return void res.status(400).json({
              error: `Waypoint ${i + 1} is outside the GRIB coverage area — load a GRIB file covering all waypoints`,
            });
        }

        calcStatus = { status: 'calculating', progress: 0 };
        res.json({ status: 'calculating' });

        try {
          const calcFailedFiles: Array<{ path: string; error: string }> = [];
          for (const entry of selectedEntries) {
            if (entry.data === null) {
              try {
                entry.data = await loadGrib(entry.meta.path);
              } catch (e: any) {
                app.debug(`Failed to load GRIB file ${entry.meta.path}: ${e.message}`);
                calcFailedFiles.push({
                  path: entry.meta.path,
                  error: e.message,
                });
              }
            }
          }

          const loadedEntries = selectedEntries.filter((e) => e.data !== null);
          if (loadedEntries.length === 0) {
            throw new Error('All relevant GRIB files failed to load — check file integrity');
          }

          const wind = new WindField(
            new MultiFileGribProvider(
              loadedEntries.filter((e) => e.data).map((e) => gribDataToLoadedFile(e.meta, e.data!)),
            ),
          );

          let route: RoutePoint[];
          let warning: string | undefined;

          const activeCurrentProvider = req.body.useCurrentGrib === false ? null : currentProvider;

          if (waypoints.length === 0) {
            const result = await algorithm.calculate(
              wind,
              activeCurrentProvider,
              polar,
              activeIndex,
              regionIndex,
              req.body,
              (pct, frontier) => {
                calcStatus = { status: 'calculating', progress: pct, frontier };
                pushSse({ type: 'progress', progress: pct, frontier });
              },
              mergedOptions,
            );
            route = result.route;
            warning = result.warning;
          } else {
            const points: Array<LatLon> = [start, ...waypoints, end];
            const segCount = points.length - 1;
            const fullRoute: RoutePoint[] = [];
            const warnings: string[] = [];

            for (let i = 0; i < segCount; i++) {
              const segStart = points[i];
              const segEnd = points[i + 1];
              const segDepartureTime = i === 0 ? departureTime : fullRoute[fullRoute.length - 1].time.toISOString();
              const progressBase = i / segCount;
              const progressTop = (i + 1) / segCount;

              const segResult = await algorithm.calculate(
                wind,
                activeCurrentProvider,
                polar,
                activeIndex,
                regionIndex,
                {
                  ...req.body,
                  start: segStart,
                  end: segEnd,
                  departureTime: segDepartureTime,
                },
                (pct, frontier) => {
                  const mapped = progressBase * 100 + pct * (progressTop - progressBase);
                  calcStatus = {
                    status: 'calculating',
                    progress: mapped,
                    frontier,
                  };
                  pushSse({ type: 'progress', progress: mapped, frontier });
                },
                mergedOptions,
              );

              if (segResult.warning) warnings.push(`Leg ${i + 1}: ${segResult.warning}`);
              // Skip the first point of subsequent segments to avoid duplicate junction waypoints.
              fullRoute.push(...(i === 0 ? segResult.route : segResult.route.slice(1)));
            }

            route = fullRoute;
            warning = warnings.length > 0 ? warnings.join('; ') : undefined;
          }

          pendingRoute = route;
          const loadWarning =
            calcFailedFiles.length > 0
              ? `${calcFailedFiles.length} GRIB file(s) failed to load: ${calcFailedFiles.map((f) => f.path.split('/').pop()).join(', ')}`
              : undefined;
          if (warning) {
            calcStatus = {
              status: 'warning',
              progress: 100,
              warning: loadWarning ? `${warning}; ${loadWarning}` : warning,
            };
            app.setPluginStatus(`Partial route: ${route.length} waypoints`);
            pushSse({ type: 'warning', warning: calcStatus.warning });
          } else if (loadWarning) {
            calcStatus = {
              status: 'warning',
              progress: 100,
              warning: loadWarning,
            };
            app.setPluginStatus(`Route ready: ${route.length} waypoints (${loadWarning})`);
            pushSse({ type: 'warning', warning: loadWarning });
          } else {
            calcStatus = { status: 'done', progress: 100 };
            app.setPluginStatus(`Route ready: ${route.length} waypoints`);
            pushSse({ type: 'done' });
          }
          closeSseClients();
        } catch (e: any) {
          calcStatus = { status: 'error', progress: 0, error: e.message };
          app.setPluginError(`Route calculation failed: ${e.message}`);
          pushSse({
            type: 'error',
            error: e.message,
            reason: e.reason ?? 'unknown',
          });
          closeSseClients();
        }
      });

      router.get('/status', (_req: Request, res: Response) => {
        res.json({
          ...calcStatus,
          dilatedIndexReady,
          hiresLandActive: hiresActive,
          polarMinTws: polar?.tws[0] ?? null,
          nRegions: regionIndex?.regions.size ?? null,
          avoidRegionIds: settings?.avoidRegionIds ?? [],
        });
      });

      router.get('/calculation-stream', (req: Request, res: Response) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        if (typeof (res as any).flush === 'function') (res as any).flush();

        sseClients.add(res);
        req.on('close', () => {
          sseClients.delete(res);
        });

        // Sync state only for active calculations (page-refresh mid-run reconnect).
        // Done/error belong to a previous calculation — don't replay them.
        if (calcStatus.status === 'calculating') {
          res.write(
            `data: ${JSON.stringify({ type: 'progress', progress: calcStatus.progress, frontier: calcStatus.frontier })}\n\n`,
          );
        }
      });

      router.get('/grib-info', (_req: Request, res: Response) => {
        const info: GribInfoResponse = {
          gribDir: settings?.gribDir ?? '',
          files: gribFiles.map((f) => f.meta),
          currentFiles: currentFiles.map((f) => f.meta),
          failedFiles: gribFailedFiles,
        };
        res.json(info);
      });

      router.get('/wind-times', async (_req: Request, res: Response) => {
        if (gribFiles.length === 0) return void res.status(503).json({ error: 'No GRIB files indexed' });
        for (const entry of gribFiles) {
          if (entry.data === null) {
            try {
              entry.data = await loadGrib(entry.meta.path);
            } catch (e: any) {
              return void res.status(503).json({ error: `Failed to load GRIB: ${e.message}` });
            }
          }
        }
        const wind = new WindField(
          new MultiFileGribProvider(gribFiles.filter((f) => f.data).map((f) => gribDataToLoadedFile(f.meta, f.data!))),
        );
        res.json({ times: wind.times.map((t) => t.toISOString()) });
      });

      router.get('/current-times', (_req: Request, res: Response) => {
        if (!currentProvider) return void res.json({ times: [] });
        res.json({ times: currentProvider.times.map((t) => t.toISOString()) });
      });

      // Per-file actual timestep axis (wind + current). Unlike /wind-times (which returns the
      // merged axis), this returns each file's real times[] so the UI can render an accurate
      // Grib Manager timeline with true coverage and detect non-uniform granularity
      // (e.g. ICON-EU hourly→3-hourly). Joins to /grib-info meta by path.
      router.get('/grib-times', async (_req: Request, res: Response) => {
        const files: Array<{
          path: string;
          type: 'wind' | 'current';
          times: string[];
        }> = [];
        for (const entry of gribFiles) {
          if (entry.data === null) {
            try {
              entry.data = await loadGrib(entry.meta.path);
            } catch (e: any) {
              return void res.status(503).json({ error: `Failed to load GRIB: ${e.message}` });
            }
          }
          files.push({
            path: entry.meta.path,
            type: 'wind',
            times: entry.data!.times.map((t) => t.toISOString()),
          });
        }
        for (const entry of currentFiles) {
          if (entry.data !== null) {
            files.push({
              path: entry.meta.path,
              type: 'current',
              times: entry.data!.times.map((t) => t.toISOString()),
            });
          }
        }
        res.json({ files });
      });

      // Departure-aware optimized combination proposal: which wind GRIBs to enable, ranked by
      // referenceTime → granularity → spatial → mtime with a conservative geographic stitch.
      // Optional departureTime (ISO) scopes the proposal; omit for now-forward. Advisory only —
      // the user accepts/overrides; routing still selects per-point at runtime.
      router.get('/grib-combination', (req: Request, res: Response) => {
        const depRaw = req.query.departureTime as string | undefined;
        let departureTime: Date | undefined;
        if (depRaw !== undefined && depRaw !== '') {
          const dep = new Date(depRaw);
          if (isNaN(dep.getTime())) {
            return void res.status(400).json({
              error: 'Invalid departureTime — expected ISO 8601 string',
            });
          }
          departureTime = dep;
        }
        const files = gribFiles.map((f) => combinationFileFromMeta(f.meta));
        res.json(proposeCombination(files, { departureTime }));
      });

      router.get('/wind-grid', (_req: Request, res: Response) => {
        const timeIdx = parseInt(_req.query.timeIdx as string);
        if (isNaN(timeIdx)) return void res.status(400).json({ error: 'timeIdx required' });

        const enabledPaths = _req.query.path
          ? ((Array.isArray(_req.query.path) ? _req.query.path : [_req.query.path]) as string[])
          : undefined;

        const loaded = gribFiles.filter(
          (f) => f.data !== null && (!enabledPaths || enabledPaths.includes(f.meta.path)),
        );
        if (loaded.length === 0)
          return void res.status(503).json({ error: 'GRIB data not loaded — fetch /wind-times first' });

        const wind = new WindField(
          new MultiFileGribProvider(loaded.filter((f) => f.data).map((f) => gribDataToLoadedFile(f.meta, f.data!))),
        );
        if (timeIdx < 0 || timeIdx >= wind.times.length)
          return void res.status(400).json({
            error: `timeIdx out of range [0, ${wind.times.length - 1}]`,
          });

        const timeMs = wind.times[timeIdx].getTime();
        const { latMin, lonMin, latStep, lonStep, nLat, nLon } = computeGridBounds(loaded as GribFileEntry[]);

        const points: Array<{
          lat: number;
          lon: number;
          u: number;
          v: number;
        }> = [];
        for (let i = 0; i <= nLat; i++) {
          const lat = latMin + i * latStep;
          for (let j = 0; j <= nLon; j++) {
            const lon = lonMin + j * lonStep;
            // Only include points covered both spatially and temporally by at least one file.
            const covered = loaded.some(
              (f) =>
                f.meta.latMin <= lat &&
                lat <= f.meta.latMax &&
                f.meta.lonMin <= lon &&
                lon <= f.meta.lonMax &&
                f.meta.timeStart.getTime() <= timeMs &&
                f.meta.timeEnd.getTime() >= timeMs,
            );
            if (!covered) continue;
            const { u, v } = wind.getWind(lat, lon, timeIdx);
            points.push({ lat: +lat.toFixed(4), lon: +lon.toFixed(4), u, v });
          }
        }
        res.json({ timeMs, points });
      });

      router.get('/wave-grid', (_req: Request, res: Response) => {
        const timeIdx = parseInt(_req.query.timeIdx as string);
        if (isNaN(timeIdx)) return void res.status(400).json({ error: 'timeIdx required' });

        const enabledPaths = _req.query.path
          ? ((Array.isArray(_req.query.path) ? _req.query.path : [_req.query.path]) as string[])
          : undefined;

        const loaded = gribFiles.filter(
          (f) => f.data !== null && (!enabledPaths || enabledPaths.includes(f.meta.path)),
        );
        if (loaded.length === 0)
          return void res.status(503).json({ error: 'GRIB data not loaded — fetch /wind-times first' });

        const wind = new WindField(
          new MultiFileGribProvider(loaded.filter((f) => f.data).map((f) => gribDataToLoadedFile(f.meta, f.data!))),
        );
        if (timeIdx < 0 || timeIdx >= wind.times.length)
          return void res.status(400).json({
            error: `timeIdx out of range [0, ${wind.times.length - 1}]`,
          });

        const timeMs = wind.times[timeIdx].getTime();
        const { latMin, latMax, lonMin, lonMax, latStep, lonStep, nLat, nLon } = computeGridBounds(
          loaded as GribFileEntry[],
        );

        const points: Array<{ lat: number; lon: number; waveHeight?: number }> = [];
        for (let i = 0; i <= nLat; i++) {
          const lat = latMin + i * latStep;
          for (let j = 0; j <= nLon; j++) {
            const lon = lonMin + j * lonStep;
            // Skip points outside wave data coverage (spatial + temporal + swh present)
            if (
              !loaded.some(
                (f) =>
                  f.data?.swhByTime?.size &&
                  f.meta.latMin <= lat &&
                  lat <= f.meta.latMax &&
                  f.meta.lonMin <= lon &&
                  lon <= f.meta.lonMax &&
                  f.meta.timeStart.getTime() <= timeMs &&
                  f.meta.timeEnd.getTime() >= timeMs,
              )
            )
              continue;
            const wh = wind.getWave(lat, lon, new Date(timeMs));
            points.push({
              lat: +lat.toFixed(4),
              lon: +lon.toFixed(4),
              ...(wh !== undefined ? { waveHeight: +wh.toFixed(3) } : {}),
            });
          }
        }
        res.json({
          timeMs,
          latMin: +latMin.toFixed(4),
          latMax: +latMax.toFixed(4),
          lonMin: +lonMin.toFixed(4),
          lonMax: +lonMax.toFixed(4),
          latStep: +latStep.toFixed(4),
          lonStep: +lonStep.toFixed(4),
          points,
        });
      });

      router.get('/current-grid', (_req: Request, res: Response) => {
        const timeMsParam = parseInt(_req.query.timeMs as string);
        if (isNaN(timeMsParam)) return void res.status(400).json({ error: 'timeMs required' });

        if (!currentProvider || currentFiles.length === 0)
          return void res.status(503).json({ error: 'No ocean current GRIB loaded' });

        const loaded = currentFiles.filter((f) => f.data !== null);
        if (loaded.length === 0) return void res.status(503).json({ error: 'Ocean current data not yet loaded' });

        const t = new Date(timeMsParam);
        const { latMin, lonMin, latStep, lonStep, nLat, nLon } = computeGridBounds(
          loaded as unknown as GribFileEntry[],
        );

        const points: Array<{ lat: number; lon: number; u: number; v: number }> = [];
        for (let i = 0; i <= nLat; i++) {
          const lat = latMin + i * latStep;
          for (let j = 0; j <= nLon; j++) {
            const lon = lonMin + j * lonStep;
            // Coverage gate: at least one current file covers this point spatially + temporally.
            const covered = loaded.some(
              (f) =>
                f.meta.latMin <= lat &&
                lat <= f.meta.latMax &&
                f.meta.lonMin <= lon &&
                lon <= f.meta.lonMax &&
                f.meta.timeStart.getTime() <= timeMsParam &&
                f.meta.timeEnd.getTime() >= timeMsParam,
            );
            if (!covered) continue;
            const { u, v } = currentProvider!.getCurrent(lat, lon, t);
            // Skip near-zero current — land/fill cells are typically 0 in RTOFS/CMEMS.
            if (u * u + v * v < 0.0001) continue;
            points.push({ lat: +lat.toFixed(4), lon: +lon.toFixed(4), u, v });
          }
        }
        res.json({ timeMs: timeMsParam, points });
      });

      router.get('/land-polygons', async (req: Request, res: Response) => {
        const useDilated = req.query.dilated === 'true';
        const index = useDilated ? dilatedLandIndex : landIndex;
        if (!index) {
          return void res.status(503).json({
            error: useDilated ? 'dilated land index not ready' : 'land index not ready',
          });
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
          const feature = JSON.stringify({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: null,
          });
          res.write(i === 0 ? feature : `,${feature}`);
          await new Promise<void>((r) => setImmediate(r));
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
              coordinates: pendingRoute.map((p) => [p.lon, p.lat]),
            },
            properties: {
              coordinatesMeta: pendingRoute.map((p) => ({
                name: p.time.toISOString(),
                time: p.time.toISOString(),
                windDir: Math.round(p.windDir),
                heading: Math.round(p.heading),
                twa: Math.round(p.twa),
                tws: Math.round(p.tws * 10) / 10,
                ...(p.boatSpeed !== undefined ? { boatSpeed: Math.round(p.boatSpeed * 10) / 10 } : {}),
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
          await loadRegions();
          res.json({
            success: true,
            nFiles: gribFiles.length,
            nCurrentFiles: currentFiles.length,
            failedFiles: gribFailedFiles,
          });
          setReady();
        } catch (e: any) {
          app.setPluginError(`GRIB reload failed: ${e.message}`);
          res.status(500).json({ error: e.message });
        }
      });

      // Pre-flight collision check for GRIB upload (REQ-139).
      router.get('/grib-exists', async (req: Request, res: Response) => {
        const dir = settings?.gribDir;
        if (!dir) return void res.status(400).json({ error: 'No gribDir configured' });
        const base = sanitizeGribName(req.query.name as string);
        if (!base) return void res.status(400).json({ error: 'Invalid or non-GRIB filename' });
        try {
          await fs.stat(nodepath.join(dir, base));
          res.json({ exists: true });
        } catch {
          res.json({ exists: false });
        }
      });

      // Upload a GRIB into gribDir (REQ-139). Body is the raw file (octet-stream); name in query.
      // On name collision, the client passes archive=1 after prompting the user — the existing
      // file is moved to the archive folder (non-destructive) before writing the new one. An
      // uploaded file that fails GRIB validation is deleted and a hard error is returned.
      router.post('/upload-grib', async (req: Request, res: Response) => {
        const dir = settings?.gribDir;
        if (!dir) return void res.status(400).json({ error: 'No gribDir configured' });
        const base = sanitizeGribName(req.query.name as string);
        if (!base) return void res.status(400).json({ error: 'Invalid or non-GRIB filename' });
        const target = nodepath.join(dir, base);
        try {
          if (req.query.archive === '1') {
            try {
              await fs.stat(target);
              await archiveFile(dir, target);
            } catch {
              /* nothing to archive — proceed */
            }
          }
          app.setPluginStatus(`Receiving GRIB upload: ${base}`);
          await streamReqToFile(req, target);
          try {
            await readGribMeta(target); // validate: must be a readable wind/current GRIB
          } catch (e: any) {
            await fs.unlink(target).catch(() => {});
            app.setPluginError(`Uploaded file rejected: ${e.message}`);
            return void res.status(400).json({ error: `Uploaded file is not a supported GRIB: ${e.message}` });
          }
          await scanAndIndexGribDir(dir);
          await loadRegions();
          res.json({
            success: true,
            nFiles: gribFiles.length,
            nCurrentFiles: currentFiles.length,
            failedFiles: gribFailedFiles,
          });
          setReady();
        } catch (e: any) {
          app.setPluginError(`GRIB upload failed: ${e.message}`);
          res.status(500).json({ error: e.message });
        }
      });

      router.post('/archive-grib-file', async (req: Request, res: Response) => {
        const dir = settings?.gribDir;
        if (!dir) return void res.status(400).json({ error: 'No gribDir configured' });
        const { path: filePath } = req.body as { path?: string };
        if (!filePath) return void res.status(400).json({ error: 'Missing path' });
        const resolvedDir = nodepath.resolve(dir);
        const resolvedPath = nodepath.resolve(filePath);
        if (!resolvedPath.startsWith(resolvedDir + nodepath.sep))
          return void res.status(400).json({ error: 'Path is outside gribDir' });
        try {
          await archiveFile(dir, filePath);
          await scanAndIndexGribDir(dir);
          res.json({ success: true });
          setReady();
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      });

      router.post('/archive-old-gribs', async (req: Request, res: Response) => {
        const dir = settings?.gribDir;
        if (!dir) return void res.status(400).json({ error: 'No gribDir configured' });
        const now = new Date();
        const oldPaths = [
          ...gribFiles.filter((f) => f.meta.timeEnd < now).map((f) => f.meta.path),
          ...currentFiles.filter((f) => f.meta.timeEnd < now).map((f) => f.meta.path),
        ];
        try {
          for (const p of oldPaths) await archiveFile(dir, p);
          await scanAndIndexGribDir(dir);
          res.json({
            success: true,
            archived: oldPaths.map((p) => nodepath.basename(p)),
          });
          setReady();
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      });

      // REQ-98: Standard SignalK Resources API for region data.
      // The frontend fetches region geometry directly from /signalk/v2/api/resources/regions.
      // This plugin provides a lightweight endpoint for reading/writing the avoid list.

      router.get('/avoid-regions', (_req: Request, res: Response) => {
        res.json({ avoidRegionIds: settings?.avoidRegionIds ?? [] });
      });

      router.put('/avoid-regions', async (req: Request, res: Response) => {
        // Refresh the region index so newly-created regions are recognised.
        await loadRegions();
        const ids: string[] = Array.isArray(req.body?.avoidRegionIds) ? req.body.avoidRegionIds : [];
        // Validate: only accept UUIDs that actually exist in the current regionIndex.
        const valid = regionIndex ? validRegionUuids(regionIndex) : new Set<string>();
        if (valid.size === 0) {
          return void res.status(400).json({
            error: 'No SignalK regions available — cannot validate region IDs',
          });
        }
        const filtered = ids.filter((id) => valid.has(id));
        if (settings) {
          settings.avoidRegionIds = filtered;
          try {
            app.savePluginOptions?.(settings);
          } catch {
            /* best-effort */
          }
        }
        res.json({ avoidRegionIds: filtered });
      });

      router.get('/region-index', (_req: Request, res: Response) => {
        // Serves the parsed region index (ring arrays) for frontend overlay rendering.
        // The frontend typically fetches region polygons from the standard resources API,
        // but this endpoint provides them pre-parsed for convenience and consistency.
        if (!regionIndex) return void res.status(404).json({ error: 'No regions loaded' });
        const entries: Array<{
          uuid: string;
          rings: Array<Array<[number, number]>>;
        }> = [];
        for (const [key, ring] of regionIndex.regions) {
          const n = ring.exterior.length / 2;
          const coords: Array<[number, number]> = [];
          for (let i = 0; i < n; i++) coords.push([ring.exterior[i * 2], ring.exterior[i * 2 + 1]]);
          entries.push({ uuid: key, rings: [coords] });
        }
        res.json(entries);
      });
    },
  };

  return plugin;
};
