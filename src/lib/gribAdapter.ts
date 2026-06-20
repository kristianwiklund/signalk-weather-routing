// Adapters that bridge the existing per-type loaders (loadGrib/loadCurrentGrib) to the
// generic LoadedGribFile representation. These are thin transforms — the heavy band-reading
// stays in the proven loaders. Eventually (post-Phase-1) a single loadGribFile can replace
// both loaders, but for now adapters are the safe, behaviour-preserving migration path.

import { GribData, CurrentGribData, GribFileMeta, LoadedGribFile, ChannelKey, ChannelGrid } from '../types';

// Convert a wind GRIB's loaded data (GribData) to a LoadedGribFile with channels:
// windU, windV, and swh (if present).
export function gribDataToLoadedFile(meta: GribFileMeta, data: GribData): LoadedGribFile {
  const channels = new Map<ChannelKey, ChannelGrid>();
  const grid = {
    latMin: data.latMin,
    latStep: data.latStep,
    lonMin: data.lonMin,
    lonStep: data.lonStep,
    nLat: data.nLat,
    nLon: data.nLon,
  };

  const uByTime = new Map<number, Float32Array>();
  const vByTime = new Map<number, Float32Array>();
  for (let i = 0; i < data.times.length; i++) {
    const ms = data.times[i].getTime();
    uByTime.set(ms, data.u10[i]);
    vByTime.set(ms, data.v10[i]);
  }
  channels.set('windU', { ...grid, byTime: uByTime });
  channels.set('windV', { ...grid, byTime: vByTime });

  if (data.swhByTime && data.swhByTime.size > 0) {
    const swhGrid = data.swhGrid ?? grid;
    channels.set('swh', { ...swhGrid, byTime: data.swhByTime });
  }

  return { meta, channels };
}

// Convert an ocean current GRIB's loaded data (CurrentGribData) to a LoadedGribFile
// with channels: currentU, currentV.
export function currentGribDataToLoadedFile(meta: GribFileMeta, data: CurrentGribData): LoadedGribFile {
  const channels = new Map<ChannelKey, ChannelGrid>();
  const grid = {
    latMin: data.latMin,
    latStep: data.latStep,
    lonMin: data.lonMin,
    lonStep: data.lonStep,
    nLat: data.nLat,
    nLon: data.nLon,
  };

  const uByTime = new Map<number, Float32Array>();
  const vByTime = new Map<number, Float32Array>();
  for (let i = 0; i < data.times.length; i++) {
    const ms = data.times[i].getTime();
    uByTime.set(ms, data.u[i]);
    vByTime.set(ms, data.v[i]);
  }
  channels.set('currentU', { ...grid, byTime: uByTime });
  channels.set('currentV', { ...grid, byTime: vByTime });

  return { meta, channels };
}
