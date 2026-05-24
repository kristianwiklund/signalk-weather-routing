const R_NM = 3440.065;  // Earth radius in nautical miles

export function haversineNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const lat1R = lat1 * (Math.PI / 180);
  const lat2R = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function destinationPoint(
  lat: number,
  lon: number,
  distNM: number,
  bearingDeg: number
): { lat: number; lon: number } {
  const d = distNM / R_NM;
  const brng = bearingDeg * (Math.PI / 180);
  const lat1 = lat * (Math.PI / 180);
  const lon1 = lon * (Math.PI / 180);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

  return {
    lat: lat2 * (180 / Math.PI),
    lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function windSpeedKnots(u: number, v: number): number {
  return Math.sqrt(u * u + v * v) * 1.94384;
}

// Meteorological wind direction: the direction FROM which the wind blows (0=N, 90=E)
export function windDirection(u: number, v: number): number {
  return ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
}
