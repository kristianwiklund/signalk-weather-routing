import { GribData, LandMask, PolarData, CalculationRequest, RoutePoint } from '../../types';

export interface RoutingAlgorithm {
  readonly id: string;
  readonly name: string;
  calculate(
    grib: GribData,
    polar: PolarData,
    landMask: LandMask | null,
    request: CalculationRequest,
    onProgress: (pct: number) => void,
    options?: Record<string, unknown>,
  ): Promise<RoutePoint[]>;
}
