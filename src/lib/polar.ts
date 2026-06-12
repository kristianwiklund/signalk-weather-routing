// Polar diagram loading (ORC/OpenCPN semicolon-delimited CSV) and bilinear boat-speed interpolation.

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

  // Below the polar's minimum close-hauled angle the boat cannot make progress against the wind.
  // Bilinear extrapolation below polar.twa[0] produces non-zero speeds for impossible headings.
  if (twa < polar.twa[0]) return 0;

  // Wind too light to sail: clamping tTws to 0 would return the minimum-column speed unchanged,
  // which is physically impossible (3 kn of wind cannot produce the same speed as 6 kn).
  if (twsKnots < polar.tws[0]) return 0;

  const twsIdx = bracketIndex(polar.tws, twsKnots);
  const twaIdx = bracketIndex(polar.twa, twa);

  if (twsIdx < 0 || twaIdx < 0) return 0;

  const twa0 = polar.twa[twaIdx];
  const twa1 = polar.twa[Math.min(twaIdx + 1, polar.twa.length - 1)];
  const tws0 = polar.tws[twsIdx];
  const tws1 = polar.tws[Math.min(twsIdx + 1, polar.tws.length - 1)];

  // Clamp to [0,1]: prevents extrapolation beyond polar bounds.
  // TWS below minimum is already rejected above; the lower clamp here only fires at the minimum column exactly.
  const tTwa = twa1 === twa0 ? 0 : Math.max(0, Math.min(1, (twa - twa0) / (twa1 - twa0)));
  const tTws = tws1 === tws0 ? 0 : Math.max(0, Math.min(1, (twsKnots - tws0) / (tws1 - tws0)));

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
  if (value <= arr[0]) return 0; // clamp to lowest bracket; tTws/tTwa lower-clamp prevents below-minimum extrapolation
  if (value >= arr[arr.length - 1]) return arr.length - 2;
  for (let i = 0; i < arr.length - 1; i++) {
    if (value >= arr[i] && value <= arr[i + 1]) return i;
  }
  return -1;
}
