// Type-specific facades over the generic MultiFileGribProvider.
// Each facade implements an existing interface so routing/endpoints change minimally.

import { MultiFileGribProvider } from './multiFileGribProvider';
import { WindProvider, WindVector } from '../types';

// WindField wraps the engine and implements the WindProvider interface.
// getWind = windU + windV (sampled as a pair from the same file).
// getWave = swh channel. Used by routing, overlays, and the conditions graph.
export class WindField implements WindProvider {
  readonly times: Date[];

  constructor(private provider: MultiFileGribProvider) {
    this.times = provider.times('windU');
  }

  getWind(lat: number, lon: number, timeIdx: number): WindVector {
    const t = this.times[timeIdx];
    if (!t) return { u: 0, v: 0 };
    const r = this.provider.samplePaired('windU', 'windV', lat, lon, t);
    return r ? { u: r.a, v: r.b } : { u: 0, v: 0 };
  }

  getWave(lat: number, lon: number, t: Date): number | undefined {
    return this.provider.sample('swh', lat, lon, t);
  }

  coversPoint(lat: number, lon: number): boolean {
    return this.provider.coversSpatial('windU', lat, lon);
  }

  coversPointAtTime(lat: number, lon: number, timeIdx: number): boolean {
    const t = this.times[timeIdx];
    if (!t) return false;
    return this.provider.covers('windU', lat, lon, t);
  }

  getFilePathForPoint(lat: number, lon: number, timeIdx: number): string {
    const t = this.times[timeIdx];
    if (!t) return '';
    return this.provider.filePathFor('windU', lat, lon, t) ?? '';
  }
}
