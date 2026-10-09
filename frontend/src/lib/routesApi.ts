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
