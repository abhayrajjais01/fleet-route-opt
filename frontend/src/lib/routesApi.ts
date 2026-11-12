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

// ─── Route evaluation, explanations, optimization agent (Weeks 8–12) ──────────
export interface RouteVehicle { id: string; label?: string; capacity_kg: number; capacity_m3: number; vehicle_type: MatrixVehicleType; max_shift_hours?: number }
export interface RouteStopIn extends OptimizeStop { name?: string; address?: string; priority?: string }
export type SlaState = 'ON_TIME' | 'AT_RISK' | 'PREDICTED_BREACH' | 'SLA_BREACHED' | 'FAILED'
export interface StopEta {
  stop_id: string; sequence: number; arrival: string; service_start: string; departure: string; wait_min: number
  leg_km: number; leg_min: number; completed: boolean; sla: SlaState; minutes_late: number; eta_shift_min: number | null
}
export interface RouteEvaluation {
  route_state: string; feasible: boolean; stops: StopEta[]; distance_km: number; duration_min: number; return_time: string
  load_kg: number; load_m3: number; utilisation: number; violations: string[]
}
export interface RouteExplanation {
  summary: string; stop_reasons: { stop_id: string; reason: string }[]; driver_instructions: string[]
  citations: { doc_id: string; section: string; heading: string; excerpt: string; score: number }[]; evaluation: RouteEvaluation
}
export interface FleetRouteIn { vehicle: RouteVehicle; stops: RouteStopIn[]; departure: string; completed?: Record<string, string> }
export interface DisruptionProposal {
  proposal_id: string; intent: string; planner: string; tool_call: { name: string; arguments: Record<string, unknown> }; summary: string
  changes: { stop_id: string; name: string; from_vehicle: string; to_vehicle: string | null; old_eta: string | null; new_eta: string | null }[]
  affected_stops: string[]; routes_after: Record<string, { stop_id: string; eta: string; sla: string }[]>; unassigned: Record<string, string>
  late_minutes_before: number; late_minutes_after: number; violations: string[]; requires_approval: boolean
}

const post = <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const routeOpsApi = {
  evaluate: (hub: GeoPoint, vehicle: RouteVehicle, stops: RouteStopIn[], departure: string) =>
    post<RouteEvaluation>('/routes/evaluate', { hub, vehicle, stops, departure }),
  explain: (hub: GeoPoint, hubName: string, vehicle: RouteVehicle, stops: RouteStopIn[], departure: string, separateTripsKm?: number) =>
    post<RouteExplanation>('/routes/explain', { hub, hub_name: hubName, vehicle, stops, departure, separate_trips_km: separateTripsKm }),
  disruption: (message: string, hub: GeoPoint, routes: FleetRouteIn[], spareVehicles: RouteVehicle[], now: string) =>
    post<DisruptionProposal>('/routes/disruption', { message, hub, routes, spare_vehicles: spareVehicles, now }),
}
