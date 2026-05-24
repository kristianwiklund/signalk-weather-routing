import * as fs from 'fs';
import { LandMask } from '../types';

// Binary format (version 1):
//   offset  0: uint32 LE version = 1
//   offset  4: uint32 LE nLat
//   offset  8: uint32 LE nLon
//   offset 12: float32 LE latMin
//   offset 16: float32 LE latStep
//   offset 20: float32 LE lonMin
//   offset 24: float32 LE lonStep
//   offset 28: packed bits, row-major lat×lon (1 = land)

export class LandMaskVersionError extends Error {
  constructor(version: number) {
    super(`Unsupported land mask version: ${version} (expected 1)`);
    this.name = 'LandMaskVersionError';
  }
}

export function loadLandMask(filePath: string): LandMask {
  const buf = fs.readFileSync(filePath);
  const view = new DataView(buf.buffer, buf.byteOffset);

  const version = view.getUint32(0, true);
  if (version !== 1) throw new LandMaskVersionError(version);

  const nLat = view.getUint32(4, true);
  const nLon = view.getUint32(8, true);
  const latMin = view.getFloat32(12, true);
  const latStep = view.getFloat32(16, true);
  const lonMin = view.getFloat32(20, true);
  const lonStep = view.getFloat32(24, true);

  const packedBytes = Math.ceil((nLat * nLon) / 8);
  const data = new Uint8Array(buf.buffer, buf.byteOffset + 28, packedBytes);

  return { latMin, latStep, lonMin, lonStep, nLat, nLon, data };
}

export function isLand(mask: LandMask, lat: number, lon: number): boolean {
  const latI = Math.floor((lat - mask.latMin) / mask.latStep);
  const lonI = Math.floor((lon - mask.lonMin) / mask.lonStep);

  if (latI < 0 || latI >= mask.nLat || lonI < 0 || lonI >= mask.nLon) return false;

  const bit = latI * mask.nLon + lonI;
  return (mask.data[bit >> 3] & (1 << (bit & 7))) !== 0;
}
