// ─── ROAD PATHS (Track A: Manthan Nimodiya) ───────────────────────────────────
// Real road geometry, km and drive minutes for an ordered stop sequence, from the backend road router
// (/api/v1/routes/road-path, OSRM on OpenStreetMap). Every map draws its routes with this, so lines follow
// streets instead of cutting across buildings and water. Results are cached per sequence and concurrent
// requests for the same sequence share one call. If the backend is unreachable the legs fall back to the
// local estimate with straight lines, and the next call tries again.
import { estimateLeg, haversineKm, type LatLng, type Leg } from './geo'
import { routesApi, type MatrixVehicleType } from './routesApi'

export interface RoadLeg extends Leg { path: LatLng[] }
export interface RoadRoute { legs: RoadLeg[]; source: 'road' | 'estimate'; offRoad?: number[] }  // offRoad: indexes of points far from any road

const cache = new Map<string, Promise<RoadRoute>>()
const keyOf = (pts: LatLng[], vt: string) => `${vt}|${pts.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(';')}`

export function estimateRoute(points: LatLng[], vehicleType = 'VAN'): RoadRoute {
  return { legs: points.slice(1).map((p, i) => ({ ...estimateLeg(points[i], p, vehicleType), path: [points[i], p] })), source: 'estimate' }
}

/** Road legs for consecutive pairs (A→B, B→C, ...). Never rejects. */
export function roadRoute(points: LatLng[], vehicleType = 'VAN'): Promise<RoadRoute> {
  if (points.length < 2) return Promise.resolve({ legs: [], source: 'estimate' })
  const key = keyOf(points, vehicleType)
  const hit = cache.get(key)
  if (hit) return hit
  const p = routesApi.roadPath(points.map(([latitude, longitude], i) => ({ id: `p${i}`, latitude, longitude })), vehicleType as MatrixVehicleType)
    .then(res => {
      if (res.source !== 'osrm') cache.delete(key) // the server fell back; ask again next time
      return { legs: res.legs.map(l => ({ km: l.km, minutes: l.minutes, path: l.path as LatLng[] })), source: res.source === 'osrm' ? 'road' : 'estimate',
        offRoad: res.off_road.map(id => Number(id.slice(1))) } as RoadRoute
    })
    .catch(() => { cache.delete(key); return estimateRoute(points, vehicleType) })
  cache.set(key, p)
  return p
}

// ── Walking along a path ──────────────────────────────────────────────────────
const cumCache = new WeakMap<LatLng[], number[]>()
function cumulative(path: LatLng[]): number[] {
  let c = cumCache.get(path)
  if (!c) {
    c = [0]
    for (let i = 1; i < path.length; i++) c.push(c[i - 1] + haversineKm(path[i - 1], path[i]))
    cumCache.set(path, c)
  }
  return c
}

/** The point a fraction f (0..1) of the way along the path by distance, the segment index, and the heading there. */
export function pointAlong(path: LatLng[], f: number): { at: LatLng; seg: number; heading: number } {
  if (path.length === 1) return { at: path[0], seg: 0, heading: 0 }
  const c = cumulative(path), total = c[c.length - 1]
  const d = Math.min(1, Math.max(0, f)) * total
  let i = 1
  while (i < c.length - 1 && c[i] < d) i++
  const a = path[i - 1], b = path[i], span = c[i] - c[i - 1]
  const t = span > 0 ? (d - c[i - 1]) / span : 1
  return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], seg: i - 1, heading: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI }
}

/** The part of the path from its start up to fraction f. */
export function pathUpTo(path: LatLng[], f: number): LatLng[] {
  const { at, seg } = pointAlong(path, f)
  return [...path.slice(0, seg + 1), at]
}
