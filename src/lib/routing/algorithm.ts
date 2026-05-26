import { GribData, LandEdgeIndex, PolarData, CalculationRequest, RoutePoint } from '../../types';

export interface RoutingAlgorithm {
  readonly id: string;
  readonly name: string;
  calculate(
    grib: GribData,
    polar: PolarData,
    edgeIndex: LandEdgeIndex | null,
    request: CalculationRequest,
    onProgress: (pct: number, frontier: Array<[number, number]>) => void,
    options?: Record<string, unknown>,
  ): Promise<RoutePoint[]>;
}
