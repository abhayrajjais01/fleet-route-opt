// ─── LEG COST ESTIMATES (Track A: Manthan Nimodiya) ──────────────────────────
// The backend distance engine (/api/v1/routes/distance-matrix) is the source of truth. The local estimate
// below mirrors its constants so screens keep working when the API is unreachable.
import { routesApi, type MatrixVehicleType } from './routesApi'

export type LatLng = [number, number]
export interface Leg { km: number; minutes: number }

const EARTH_RADIUS_KM = 6371.0088
const ANCHOR_KM = [0, 5, 25, 100, 300]
const CIRCUITY = [1.45, 1.38, 1.3, 1.22, 1.18]
const SPEED_KMH = [20, 26, 36, 48, 56]
const VEHICLE_SPEED_FACTOR: Record<string, number> = { VAN: 1, EV: 1, BOX_TRUCK: 0.9, SEMI_TRUCK: 0.8 }

function interp(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
  }
  return ys[ys.length - 1]
}

export function haversineKm([lat1, lon1]: LatLng, [lat2, lon2]: LatLng): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, a)))
}

export function estimateLeg(a: LatLng, b: LatLng, vehicleType = 'VAN'): Leg {
  const straight = haversineKm(a, b)
  const km = straight * interp(straight, ANCHOR_KM, CIRCUITY)
  const speed = interp(straight, ANCHOR_KM, SPEED_KMH) * (VEHICLE_SPEED_FACTOR[vehicleType] ?? 1)
  return { km, minutes: (km / speed) * 60 }
}

/** Road km and drive minutes for each consecutive pair of points (A→B, B→C, ...). */
export async function legsAlong(points: LatLng[], vehicleType: string): Promise<{ legs: Leg[]; source: 'api' | 'estimate' }> {
  const local = () => points.slice(1).map((p, i) => estimateLeg(points[i], p, vehicleType))
  if (points.length < 2) return { legs: [], source: 'estimate' }
  // The matrix endpoint rejects duplicate ids, not duplicate coordinates, so index-based ids are safe.
  try {
    const m = await routesApi.distanceMatrix(points.map(([latitude, longitude], i) => ({ id: `p${i}`, latitude, longitude })), vehicleType as MatrixVehicleType)
    return { legs: points.slice(1).map((_, i) => ({ km: m.distance_km[i][i + 1], minutes: m.duration_min[i][i + 1] })), source: 'api' }
  } catch {
    return { legs: local(), source: 'estimate' }
  }
}

export function clock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
