import { RoutePoint } from '../types';
import { haversineNM } from './geo';

export async function saveRoute(app: any, route: RoutePoint[]): Promise<string> {
  const uuid = crypto.randomUUID();

  const totalDistNM = route.slice(1).reduce((sum, p, i) => {
    return sum + haversineNM(route[i].lat, route[i].lon, p.lat, p.lon);
  }, 0);

  const resource = {
    name: `Weather Route ${new Date().toLocaleString()}`,
    description: `Isochrone route calculated by signalk-weather-routing`,
    distance: Math.round(totalDistNM * 1852),  // SignalK stores distance in metres
    feature: {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: route.map((p) => [p.lon, p.lat]),
      },
      properties: {
        name: `Weather Route`,
        coordinatesMeta: route.map((p) => ({
          name: p.time.toISOString(),
          time: p.time.toISOString(),
          heading: Math.round(p.heading),
          twa: Math.round(p.twa),
          tws: Math.round(p.tws * 10) / 10,
          boatSpeed: Math.round(p.boatSpeed * 10) / 10,
        })),
      },
    },
  };

  if (!app.resourcesApi?.setResource) {
    throw new Error('SignalK resourcesApi is not available — requires SignalK server >= 2.0');
  }

  await app.resourcesApi.setResource('routes', uuid, resource);
  return uuid;
}
