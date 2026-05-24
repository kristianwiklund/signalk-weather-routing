import * as fs from 'fs';
import { PolarData } from '../types';

export function parsePolar(filePath: string): PolarData {
  const lines = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  // Header: twa/tws;6;8;10;12;14;16;20
  const header = lines[0].split(';');
  const tws = header.slice(1).map(Number).filter(v => !isNaN(v));

  const twa: number[] = [];
  const speeds: number[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';').map(Number);
    if (isNaN(parts[0])) continue;
    twa.push(parts[0]);
    speeds.push(parts.slice(1, 1 + tws.length));
  }

  return { tws, twa, speeds };
}

export function interpolateBoatSpeed(polar: PolarData, twaDeg: number, twsKnots: number): number {
  // Polar is symmetric: use absolute TWA clamped to 0–180
  const twa = Math.min(180, Math.max(0, Math.abs(twaDeg)));

  const twsIdx = bracketIndex(polar.tws, twsKnots);
  const twaIdx = bracketIndex(polar.twa, twa);

  if (twsIdx < 0 || twaIdx < 0) return 0;

  const twa0 = polar.twa[twaIdx];
  const twa1 = polar.twa[Math.min(twaIdx + 1, polar.twa.length - 1)];
  const tws0 = polar.tws[twsIdx];
  const tws1 = polar.tws[Math.min(twsIdx + 1, polar.tws.length - 1)];

  const tTwa = twa1 === twa0 ? 0 : (twa - twa0) / (twa1 - twa0);
  const tTws = tws1 === tws0 ? 0 : (twsKnots - tws0) / (tws1 - tws0);

  const s00 = polar.speeds[twaIdx]?.[twsIdx] ?? 0;
  const s10 = polar.speeds[Math.min(twaIdx + 1, polar.twa.length - 1)]?.[twsIdx] ?? 0;
  const s01 = polar.speeds[twaIdx]?.[Math.min(twsIdx + 1, polar.tws.length - 1)] ?? 0;
  const s11 = polar.speeds[Math.min(twaIdx + 1, polar.twa.length - 1)]?.[Math.min(twsIdx + 1, polar.tws.length - 1)] ?? 0;

  return (
    (1 - tTwa) * (1 - tTws) * s00 +
    tTwa * (1 - tTws) * s10 +
    (1 - tTwa) * tTws * s01 +
    tTwa * tTws * s11
  );
}

function bracketIndex(arr: number[], value: number): number {
  if (value <= arr[0]) return 0;
  if (value >= arr[arr.length - 1]) return arr.length - 2;
  for (let i = 0; i < arr.length - 1; i++) {
    if (value >= arr[i] && value <= arr[i + 1]) return i;
  }
  return -1;
}
