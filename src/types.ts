// All shared TypeScript interfaces and data types for the plugin.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface WindVector {
  u: number;  // eastward m/s
  v: number;  // northward m/s
}

// Metadata read from a GRIB file at startup — no grid data loaded yet.
export interface GribFileMeta {
  path: string;
  mtime: number;     // file modification time, ms since epoch (used for conflict resolution)
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  latStep: number;
  lonStep: number;
  timeStart: Date;
  timeEnd: Date;
  nTimes: number;
}

// One entry per GRIB file; data is null until lazy-loaded at calculation time.
export interface GribFileEntry {
  meta: GribFileMeta;
  data: GribData | null;
}

// Abstraction over one or more loaded GRIB files; used by the routing algorithm.
export interface WindProvider {
  readonly times: Date[];  // merged, sorted, deduplicated time axis across all files
  getWind(lat: number, lon: number, timeIdx: number): WindVector;
  getWave(lat: number, lon: number, t: Date): number | undefined;
  coversPoint(lat: number, lon: number): boolean;
  getFilePathForPoint(lat: number, lon: number, timeIdx: number): string;
}

export interface GribData {
  times: Date[];
  latMin: number;
  latStep: number;
  lonMin: number;
  lonStep: number;
  nLat: number;
  nLon: number;
  u10: Float32Array[];  // [timeIdx][latIdx * nLon + lonIdx], m/s, index 0 = latMin
  v10: Float32Array[];
  swhByTime?: Map<number, Float32Array>;  // validTimeMs → swh grid (m), same layout as u10
}

export interface PolarData {
  tws: number[];        // sorted ascending, knots
  twa: number[];        // sorted ascending, 0–180 degrees
  speeds: number[][];   // speeds[twaIdx][twsIdx], knots
}

export interface LandPolygon {
  bboxLatMin: number;
  bboxLatMax: number;
  bboxLonMin: number;
  bboxLonMax: number;
  exterior: Float64Array;  // interleaved [lon0,lat0, lon1,lat1, ...]
}

// Spatial grid: cell key = (floor(lat)+90)*360 + (floor(lon)+180)
export interface LandIndex {
  polygons: LandPolygon[];
  grid: Map<number, number[]>;  // cell key → polygon indices
}

// Edge-tile index for fast segment-crossing checks.
// edgeGrid: 0.1° cell key → flat Uint32Array of [polyIdx, edgeIdx, polyIdx, edgeIdx, ...].
// polyGrid: 1° cell key → polygon indices (same key formula as LandIndex.grid), for isPointOnLand.
export interface LandEdgeIndex {
  polygons: LandPolygon[];
  edgeGrid: Map<number, Uint32Array>;
  polyGrid: Map<number, number[]>;
}

export interface IsochronePoint {
  lat: number;
  lon: number;
  time: Date;
  heading: number;
  twa: number;
  tws: number;
  boatSpeed: number;
  windDir: number;
  stepCalcMs: number; // wall-clock ms to compute the isochrone step that created this point
  gribFilePath?: string;
  parent?: IsochronePoint;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  time: Date;
  heading: number;
  twa: number;        // degrees, 0–180
  tws: number;        // knots
  boatSpeed: number;  // knots
  windDir: number;    // meteorological: degrees FROM which wind blows, 0–360
  legCalcMs: number;  // wall-clock ms the algorithm spent computing this leg; 0 for start and destination
  waveHeight?: number; // significant wave height (m), present when swh data available in GRIB
  gribFilePath?: string; // path of the GRIB file that supplied weather data at this waypoint
}

export interface CalculationRequest {
  start: LatLon;
  end: LatLon;
  departureTime: string;             // ISO 8601
  waypoints?: Array<LatLon>;         // intermediate required waypoints in order
  useSafetyMargin?: boolean;
  useLandAvoidance?: boolean;
  enabledGribPaths?: string[];       // if absent, all files are used
  options?: Record<string, unknown>; // per-algorithm tuning
}

export interface CalculationStatus {
  status: 'idle' | 'calculating' | 'done' | 'warning' | 'error';
  progress: number; // 0–100
  routeId?: string;
  error?: string;
  warning?: string;
  frontier?: Array<[number, number]>; // [lat, lon] pairs of current isochrone frontier
}

export interface GribInfoResponse {
  gribDir: string;
  files: GribFileMeta[];
  failedFiles: Array<{ path: string; error: string }>;
}

export interface PluginSettings {
  gribDir: string;
  polarPath: string;
  algorithm?: string;
  hideTestButtons?: boolean;
  headingStep?: number;
  sectorSize?: number;
  minBoatSpeed?: number;
  arrivalRadiusNm?: number;
  coneHalfAngle?: number;
  coneDisableLookaheadNm?: number;
  maxHeadingChange?: number;
}
