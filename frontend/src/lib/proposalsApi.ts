// ─── STRUCTURED ACTION PROPOSALS (mirrors backend/app/schemas/copilot.py, Week 11) ───────────
// Track B: Abhayraj Jaiswal — US-005
// The Copilot drawer turns a disruption message into a proposal card (current vs proposed routes + impact),
// and applies it to the live plan only when the dispatcher accepts.
import { apiRequest } from './api'
import { toMinutes } from './geo'
import type { FleetRouteIn, RouteStopIn, RouteVehicle } from './routesApi'
import type { Driver, Hub, Shipment, Vehicle } from './types'

export type DiffChange = 'SAME' | 'MOVED' | 'ADDED' | 'REMOVED' | 'COMPLETED'
export type VehicleDiffStatus = 'OUT_OF_SERVICE' | 'CHANGED' | 'NEW_VEHICLE' | 'RESEQUENCED' | 'UNCHANGED'

export interface RouteDiffEntry {
  stop_id: string; name: string; change: DiffChange
  before_position: number | null; after_position: number | null
  before_eta: string | null; after_eta: string | null; planned_eta: string | null; sla_after: string | null
  moved_to: string | null; moved_from: string | null
}
export interface RouteImpactMetrics { distance_km: number; duration_min: number; cost: number; late_min: number; stops: number }
export interface VehicleRouteDiff {
  vehicle: string; status: VehicleDiffStatus; before: RouteDiffEntry[]; after: RouteDiffEntry[]
  current: RouteImpactMetrics | null; proposed: RouteImpactMetrics | null
}
export interface ProposalCard {
  card_id: string; proposal_id: string; status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED'
  intent: string; planner: string; tool_call: { name: string; arguments: Record<string, unknown> }; summary: string
  vehicles: VehicleRouteDiff[]
  impact: { current: RouteImpactMetrics; proposed: RouteImpactMetrics; delta_km: number; delta_minutes: number; delta_cost: number; delta_late_min: number }
  routes_after: Record<string, { stop_id: string; eta: string; sla: string }[]>
  unassigned: Record<string, string>; violations: string[]
  created_at: string; decided_at: string | null; decided_by: string | null; decision_note: string | null
}
export interface DisruptionRequestBody {
  message: string; hub: { id: string; latitude: number; longitude: number; label?: string }
  routes: FleetRouteIn[]; spare_vehicles: RouteVehicle[]; now: string; use_llm?: boolean
}

const auth = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {})

export const proposalsApi = {
  create: (body: DisruptionRequestBody, token: string | null) =>
    apiRequest<ProposalCard>('/copilot/proposals', { method: 'POST', headers: auth(token), body: JSON.stringify(body) }),
  decide: (cardId: string, decision: 'ACCEPT' | 'REJECT', token: string | null, note?: string) =>
    apiRequest<ProposalCard>(`/copilot/proposals/${encodeURIComponent(cardId)}/decision`, {
      method: 'POST', headers: auth(token), body: JSON.stringify({ decision, note }),
    }),
}

// ─── Building the request from the live plan ───────────────────────────────
const ON_ROUTE = new Set(['ASSIGNED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'])
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`

const toVehicle = (v: Vehicle, driver?: Driver): RouteVehicle => ({
  id: String(v.id), label: v.plate_number, capacity_kg: v.max_payload_kg, capacity_m3: v.max_volume_m3, vehicle_type: v.vehicle_type,
  max_shift_hours: Math.min(14, driver?.max_driving_hours_per_day ?? 10),
})
const toStop = (s: Shipment): RouteStopIn => ({
  id: String(s.id), name: s.customer_name, address: s.destination_address, priority: s.priority,
  latitude: s.latitude!, longitude: s.longitude!, weight_kg: s.weight_kg, volume_m3: s.volume_m3,
  window_start: s.time_window_start, window_end: s.time_window_end,
})

/**
 * Dispatched routes of one hub, in their current order, as the Optimization Agent expects them.
 * The hub is the one whose vehicle the message names; otherwise the hub with the most vehicles on the road.
 * "Now" is the current time while trips are running, else the earliest departure (a what-if on the morning plan).
 * Returns null when no vehicle is on the road.
 */
export function buildDisruptionRequest(message: string, shipments: Shipment[], vehicles: Vehicle[], drivers: Driver[], hubs: Hub[],
  nowDate: Date = new Date()): DisruptionRequestBody | null {
  const byVehicle = new Map<number, Shipment[]>()
  for (const s of shipments) {
    if (!s.assigned_vehicle_id || !ON_ROUTE.has(s.status) || s.latitude == null || s.longitude == null) continue
    byVehicle.set(s.assigned_vehicle_id, [...(byVehicle.get(s.assigned_vehicle_id) ?? []), s])
  }
  const routed = vehicles.filter(v => byVehicle.get(v.id)?.some(s => s.status !== 'DELIVERED'))
  if (!routed.length) return null

  const text = norm(message)
  const named = routed.find(v => text.includes(norm(v.plate_number)) || new RegExp(`\\bv-?0*${v.id}\\b`, 'i').test(message))
  const counts = new Map<number, number>()
  routed.forEach(v => counts.set(v.assigned_hub_id, (counts.get(v.assigned_hub_id) ?? 0) + 1))
  const hubId = named?.assigned_hub_id ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const hub = hubs.find(h => h.id === hubId)
  if (!hub) return null

  const hubRoutes = routed.filter(v => v.assigned_hub_id === hubId)
  const departures = hubRoutes.flatMap(v => byVehicle.get(v.id)!.map(s => toMinutes(s.dispatch_time ?? '08:00')))
  const earliest = Math.min(...departures)
  const current = nowDate.getHours() * 60 + nowDate.getMinutes()
  const now = current >= earliest && current <= 20 * 60 ? current : earliest

  const routes: FleetRouteIn[] = hubRoutes.map(v => {
    const stops = [...byVehicle.get(v.id)!].sort((a, b) => (a.route_sequence ?? a.id) - (b.route_sequence ?? b.id))
    const departure = clock(Math.min(...stops.map(s => toMinutes(s.dispatch_time ?? '08:00'))))
    return {
      vehicle: toVehicle(v, drivers.find(d => d.current_vehicle_id === v.id)),
      stops: stops.map(toStop),
      departure,
      completed: Object.fromEntries(stops.filter(s => s.status === 'DELIVERED').map(s => [String(s.id), clock(Math.max(now, toMinutes(departure)))])),
    }
  })
  const spare = vehicles.filter(v => v.assigned_hub_id === hubId && v.current_status === 'AVAILABLE' && !byVehicle.has(v.id))
  return {
    message,
    hub: { id: String(hub.id), latitude: hub.latitude, longitude: hub.longitude, label: hub.code },
    routes,
    spare_vehicles: spare.map(v => toVehicle(v)),
    now: clock(now),
  }
}

// ─── Applying an accepted proposal to the live plan ─────────────────────────
export interface AppliedProposal {
  shipments: Shipment[]
  vehicles: Vehicle[]
  drivers: Driver[]
  /** Spare vehicles that stayed at the hub because no driver was free; their stops went back to planning. */
  heldBack: { plate: string; stops: number }[]
}

/**
 * New shipment / vehicle / driver state after an accepted proposal. Live Tracking follows
 * assigned_vehicle_id + route_sequence. Driver assignments stay consistent:
 *  - a broken-down vehicle goes to maintenance and its driver is released (ON_DUTY, no vehicle);
 *  - a spare vehicle is dispatched only with a driver: the one already linked to it, else a free ON_DUTY
 *    driver from its hub. With no free driver it stays AVAILABLE and its stops go back to the planning queue.
 */
export function applyAcceptedProposal(card: ProposalCard, shipments: Shipment[], vehicles: Vehicle[], drivers: Driver[], now: string): AppliedProposal {
  const findVehicle = (key: string) => vehicles.find(v => v.plate_number === key || String(v.id) === key)
  const broken = card.tool_call.name === 'reassign_stops' ? findVehicle(String(card.tool_call.arguments.vehicle_id)) : undefined

  const placement = new Map<number, { vehicleId: number; seq: number }>()
  for (const [key, visits] of Object.entries(card.routes_after)) {
    const v = findVehicle(key)
    if (!v) continue
    visits.forEach((visit, i) => placement.set(Number(visit.stop_id), { vehicleId: v.id, seq: i }))
  }

  // Drivers: release the broken vehicle's driver, staff every spare vehicle the proposal uses.
  let nextDrivers = drivers.map(d => (broken && d.current_vehicle_id === broken.id ? { ...d, status: 'ON_DUTY' as const, current_vehicle_id: null } : d))
  const brokenDriverIds = new Set(drivers.filter(d => broken && d.current_vehicle_id === broken.id).map(d => d.id))
  const used = new Set([...placement.values()].map(p => p.vehicleId))
  const dispatched = new Set<number>()
  const heldBack: AppliedProposal['heldBack'] = []
  const heldStops = new Set<number>()
  for (const v of vehicles) {
    if (!used.has(v.id) || v.current_status === 'IN_TRANSIT') continue        // already on the road with its driver
    const linked = nextDrivers.find(d => d.current_vehicle_id === v.id && d.status !== 'OFF_DUTY' && d.status !== 'RESTING')
    // The broken vehicle's driver is still with that vehicle, so they can't take a spare from the hub.
    const free = linked ?? nextDrivers.find(d => d.assigned_hub_id === v.assigned_hub_id && d.status === 'ON_DUTY'
      && d.current_vehicle_id == null && !brokenDriverIds.has(d.id))
    if (free) {
      nextDrivers = nextDrivers.map(d => (d.id === free.id ? { ...d, status: 'ON_TRIP' as const, current_vehicle_id: v.id } : d))
      dispatched.add(v.id)
    } else {
      heldBack.push({ plate: v.plate_number, stops: [...placement.values()].filter(p => p.vehicleId === v.id).length })
      for (const [sid, p] of [...placement]) if (p.vehicleId === v.id) { placement.delete(sid); heldStops.add(sid) }
    }
  }

  const unassigned = new Set(Object.keys(card.unassigned).map(Number))
  const departureOf = new Map<number, string>()
  shipments.forEach(s => { if (s.assigned_vehicle_id && s.dispatch_time) departureOf.set(s.assigned_vehicle_id, s.dispatch_time) })

  const nextShipments = shipments.map(s => {
    const p = placement.get(s.id)
    if (unassigned.has(s.id) || heldStops.has(s.id)) return { ...s, status: 'UNASSIGNED' as const, assigned_vehicle_id: null, route_sequence: null }
    if (!p) return s
    return {
      ...s, assigned_vehicle_id: p.vehicleId, route_sequence: p.seq,
      status: s.status === 'UNASSIGNED' ? ('ASSIGNED' as const) : s.status,
      dispatch_time: s.assigned_vehicle_id === p.vehicleId ? s.dispatch_time : (departureOf.get(p.vehicleId) ?? now),
    }
  })
  const nextVehicles = vehicles.map(v => {
    if (broken && v.id === broken.id) return { ...v, current_status: 'MAINTENANCE' as const }
    if (dispatched.has(v.id)) return { ...v, current_status: 'IN_TRANSIT' as const }
    return v
  })
  return { shipments: nextShipments, vehicles: nextVehicles, drivers: nextDrivers, heldBack }
}
