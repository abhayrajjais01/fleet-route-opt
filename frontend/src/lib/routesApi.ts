// ─── ROUTE OPTIMIZATION CONTRACT (mirrors backend/app/schemas/route.py) ───────
// Track A: Manthan Nimodiya — US-003 / US-004
import { apiRequest } from './api'

export type MatrixVehicleType = 'VAN' | 'BOX_TRUCK' | 'SEMI_TRUCK' | 'EV'

export interface GeoPoint { id: string; latitude: number; longitude: number; label?: string }

export interface DistanceMatrixResponse {
  ids: string[]
  vehicle_type: MatrixVehicleType
  straight_km: number[][]
  distance_km: number[][]
  duration_min: number[][]
  computed_ms: number
  cache: { hits: number; misses: number; entries: number; max_entries: number }
}

export const routesApi = {
  distanceMatrix: (points: GeoPoint[], vehicleType: MatrixVehicleType = 'VAN') =>
    apiRequest<DistanceMatrixResponse>('/routes/distance-matrix', {
      method: 'POST',
      body: JSON.stringify({ points, vehicle_type: vehicleType }),
    }),
}

// ─── VRPTW optimizer (Week 6) ─────────────────────────────────────────────────
export interface OptimizeStop extends GeoPoint { weight_kg: number; volume_m3: number; window_start: string; window_end: string; service_min?: number }
export interface OptimizeVehicle { id: string; capacity_kg: number; capacity_m3: number; vehicle_type: MatrixVehicleType; max_shift_hours?: number }
export interface OptimizeResponse {
  status: 'ROUTE_PROPOSED' | 'OPTIMIZATION_FAILED'
  routes: { vehicle_id: string; stop_ids: string[]; distance_km: number; duration_min: number; return_time: string; utilisation: number;
    visits: { stop_id: string; arrival: string; service_start: string; departure: string; wait_min: number }[] }[]
  unassigned: Record<string, string>
  total_distance_km: number
  separate_trips_km: number
  saving_pct: number
  compute_ms: number
}

export function optimizeRoutes(hub: GeoPoint, stops: OptimizeStop[], vehicles: OptimizeVehicle[], departure: string) {
  return apiRequest<OptimizeResponse>('/routes/optimize', { method: 'POST', body: JSON.stringify({ hub, stops, vehicles, departure }) })
}
