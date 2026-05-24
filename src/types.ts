export interface LatLon {
  lat: number;
  lon: number;
}

export interface WindVector {
  u: number;  // eastward m/s
  v: number;  // northward m/s
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
}

export interface PolarData {
  tws: number[];        // sorted ascending, knots
  twa: number[];        // sorted ascending, 0–180 degrees
  speeds: number[][];   // speeds[twaIdx][twsIdx], knots
}

export interface LandMask {
  latMin: number;
  latStep: number;
  lonMin: number;
  lonStep: number;
  nLat: number;
  nLon: number;
  data: Uint8Array;  // packed bits, row-major lat×lon (1 = land)
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
  parent?: IsochronePoint;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  time: Date;
  heading: number;
  twa: number;       // degrees, 0–180
  tws: number;       // knots
  boatSpeed: number; // knots
  windDir: number;   // meteorological: degrees FROM which wind blows, 0–360
}

export interface CalculationRequest {
  start: LatLon;
  end: LatLon;
  departureTime: string;             // ISO 8601
  options?: Record<string, unknown>; // per-algorithm tuning
}

export interface CalculationStatus {
  status: 'idle' | 'calculating' | 'done' | 'error';
  progress: number; // 0–100
  routeId?: string;
  error?: string;
}

export interface GribInfo {
  loaded: boolean;
  path?: string;
  timeStart?: string;
  timeEnd?: string;
  nTimes?: number;
  latMin?: number;
  latMax?: number;
  lonMin?: number;
  lonMax?: number;
}

export interface PluginSettings {
  gribPath: string;
  polarPath: string;
  landMaskPath?: string;
  algorithm?: string;
}
