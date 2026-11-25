// ─── SHIPMENTS & DISPATCHES (backend-backed) ─────────────────────────────────
// Mirrors backend/app/api/v1/shipments.py. Orders and dispatches live on the server, so every dispatcher sees the same
// plan and a refresh loses nothing. A plan change carries what this dispatcher was looking at; if a colleague changed
// the same shipment, vehicle or driver first, the server refuses it (409) and nothing is saved.
import { ApiError, apiRequest } from './api'
import type { DeliveryProof } from './transitApi'
import type { Driver, DriverStatus, Shipment, ShipmentStatus, Vehicle, VehicleStatus } from './types'

const PAGE = 500
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

type ApiShipment = Required<Pick<Shipment, 'id' | 'tracking_number' | 'customer_name' | 'destination_address' | 'latitude' | 'longitude' | 'weight_kg' | 'volume_m3'
  | 'time_window_start' | 'time_window_end' | 'priority' | 'status' | 'hub_id'>> & {
  hazard_class: string | null; assigned_vehicle_id: number | null; dispatch_time: string | null; route_sequence: number | null }

const toShipment = (s: ApiShipment): Shipment => ({
  id: s.id, tracking_number: s.tracking_number, customer_name: s.customer_name, destination_address: s.destination_address, latitude: s.latitude, longitude: s.longitude,
  weight_kg: s.weight_kg, volume_m3: s.volume_m3, time_window_start: s.time_window_start, time_window_end: s.time_window_end, priority: s.priority, status: s.status,
  hub_id: s.hub_id, hazard_class: s.hazard_class, assigned_vehicle_id: s.assigned_vehicle_id, dispatch_time: s.dispatch_time ?? undefined, route_sequence: s.route_sequence })

/** Order fields the server accepts on create and edit. */
const orderBody = (s: Omit<Shipment, 'id'>) => ({
  tracking_number: s.tracking_number, customer_name: s.customer_name, destination_address: s.destination_address, latitude: s.latitude, longitude: s.longitude,
  weight_kg: s.weight_kg, volume_m3: s.volume_m3, time_window_start: s.time_window_start, time_window_end: s.time_window_end, priority: s.priority,
  hub_id: s.hub_id, hazard_class: s.hazard_class || null })

export interface PlanState { shipments: Shipment[]; vehicles: Vehicle[]; drivers: Driver[] }
interface PlanBody {
  reason: string
  shipments: { id: number; expected_status: ShipmentStatus; expected_vehicle_id: number | null; status: ShipmentStatus; assigned_vehicle_id: number | null; route_sequence: number | null; dispatch_time: string | null }[]
  vehicles: { id: number; expected_status: VehicleStatus; current_status: VehicleStatus }[]
  drivers: { id: number; expected_status: DriverStatus; expected_vehicle_id: number | null; status: DriverStatus; current_vehicle_id: number | null }[]
}

/** What changed between two plans, in the shape the server takes. Null when no shipment changed. */
export function planChange(before: PlanState, after: PlanState, reason: string): PlanBody | null {
  const key = (s: Shipment) => [s.status, s.assigned_vehicle_id ?? null, s.route_sequence ?? null, s.dispatch_time ?? null].join('|')
  const s0 = new Map(before.shipments.map(s => [s.id, s]))
  const v0 = new Map(before.vehicles.map(v => [v.id, v]))
  const d0 = new Map(before.drivers.map(d => [d.id, d]))
  const shipments = after.shipments.flatMap(s => {
    const was = s0.get(s.id)
    return was && key(was) !== key(s) ? [{ id: s.id, expected_status: was.status, expected_vehicle_id: was.assigned_vehicle_id ?? null, status: s.status,
      assigned_vehicle_id: s.assigned_vehicle_id ?? null, route_sequence: s.route_sequence ?? null, dispatch_time: s.dispatch_time ?? null }] : []
  })
  if (!shipments.length) return null
  return {
    reason: reason.slice(0, 300), shipments,
    vehicles: after.vehicles.flatMap(v => {
      const was = v0.get(v.id)
      return was && was.current_status !== v.current_status ? [{ id: v.id, expected_status: was.current_status, current_status: v.current_status }] : []
    }),
    drivers: after.drivers.flatMap(d => {
      const was = d0.get(d.id)
      return was && (was.status !== d.status || was.current_vehicle_id !== d.current_vehicle_id)
        ? [{ id: d.id, expected_status: was.status, expected_vehicle_id: was.current_vehicle_id, status: d.status, current_vehicle_id: d.current_vehicle_id }] : []
    }),
  }
}

export const shipmentsApi = {
  async list(token: string): Promise<Shipment[]> {
    const all: ApiShipment[] = []
    for (let skip = 0; ; skip += PAGE) {
      const page = await apiRequest<ApiShipment[]>(`/shipments?limit=${PAGE}&skip=${skip}`, { headers: auth(token) })
      all.push(...page)
      if (page.length < PAGE) break
    }
    return all.map(toShipment).sort((a, b) => a.id - b.id)
  },
  create: (token: string, s: Omit<Shipment, 'id'>) =>
    apiRequest<ApiShipment>('/shipments', { method: 'POST', headers: auth(token), body: JSON.stringify(orderBody(s)) }).then(toShipment),
  update: (token: string, id: number, s: Omit<Shipment, 'id'>) =>
    apiRequest<ApiShipment>(`/shipments/${id}`, { method: 'PATCH', headers: auth(token), body: JSON.stringify(orderBody(s)) }).then(toShipment),
  setStatus: (token: string, id: number, status: ShipmentStatus, notes?: string) =>
    apiRequest<ApiShipment>(`/shipments/${id}/status`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ status, notes }) }).then(toShipment),
  remove: (token: string, id: number) => apiRequest<void>(`/shipments/${id}`, { method: 'DELETE', headers: auth(token) }),
  async createMany(token: string, list: Omit<Shipment, 'id'>[]): Promise<{ created: Shipment[]; errors: string[] }> {
    const res = await apiRequest<{ created_shipments: ApiShipment[]; errors: { row: number; tracking_number: string | null; reason: string }[] }>('/shipments/batch', {
      method: 'POST', headers: auth(token), body: JSON.stringify({ shipments: list.map(orderBody) }) })
    return { created: res.created_shipments.map(toShipment), errors: res.errors.map(e => `Row ${e.row}${e.tracking_number ? ` (${e.tracking_number})` : ''}: ${e.reason}`) }
  },
  savePlan: (token: string, body: PlanBody) => apiRequest<ApiShipment[]>('/shipments/plan', { method: 'POST', headers: auth(token), body: JSON.stringify(body) }),
  deliveryCode: (token: string, id: number, reissue = false) =>
    apiRequest<{ code: string; attempts_left: number }>(`/shipments/${id}/delivery-code${reissue ? '?reissue=true' : ''}`, { method: 'POST', headers: auth(token) }),
}

/** Proof of delivery in words, for receipts. */
export const proofMethod = (p: DeliveryProof) => (p.method === 'SIGNATURE' ? `Signature of ${p.recipient_name}, taken by ${p.captured_by_name}` : `Delivery code verified, entered by ${p.captured_by_name}`)
export const proofTime = (p: DeliveryProof) => new Date(/Z|[+-]\d\d:\d\d$/.test(p.created_at) ? p.created_at : `${p.created_at}Z`).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

/** A message for the dispatcher. */
export function saveError(e: unknown): string {
  if (e instanceof TypeError) return 'Not saved: the server can’t be reached.'
  if (e instanceof ApiError && e.status === 401) return 'Not saved: your session has ended. Sign in again.'
  return e instanceof Error ? e.message : 'Not saved.'
}
