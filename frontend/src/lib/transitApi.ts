// ─── TRANSIT FSM API CLIENT (US-008, Week 6 Track B) ─────────────────────────
import { apiRequest } from './api'
import type { ShipmentStatus, ShipmentPriority } from './types'

export type TransitFailureReason =
  | 'CONSIGNEE_UNAVAILABLE'
  | 'INCORRECT_ADDRESS'
  | 'DAMAGED_PACKAGE'
  | 'ACCESS_RESTRICTED'
  | 'CUSTOMER_REFUSED'
  | 'VEHICLE_ISSUE'
  | 'OTHER'

export interface TransitTransitionResponse {
  shipment_id: number
  tracking_number: string
  previous_status: ShipmentStatus
  current_status: ShipmentStatus
  assigned_vehicle_id?: number | null
  actor_name: string
  actor_role: string
  timestamp: string
  details: string
  metadata: Record<string, any>
}

export interface TripStopFsmSummary {
  id: number
  tracking_number: string
  customer_name: string
  destination_address: string
  latitude: number
  longitude: number
  status: ShipmentStatus
  priority: ShipmentPriority
  weight_kg: number
  time_window_start: string
  time_window_end: string
  stop_sequence: number
}

export interface TripFsmProgressResponse {
  vehicle_id: number
  vehicle_name: string
  plate_number: string
  vehicle_status: string
  driver_id?: number | null
  driver_name?: string | null
  driver_status?: string | null
  total_stops: number
  completed_stops: number
  failed_stops: number
  in_transit_stops: number
  arrived_stops: number
  pending_stops: number
  current_stop_index: number
  trip_progress_pct: number
  is_trip_active: boolean
  stops: TripStopFsmSummary[]
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function departShipment(
  shipmentId: number,
  vehicleId?: number,
  notes?: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/depart`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ vehicle_id: vehicleId, notes }),
  })
}

export async function arriveAtStop(
  shipmentId: number,
  latitude?: number,
  longitude?: number,
  notes?: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/arrive`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ latitude, longitude, notes }),
  })
}

export async function deliverShipment(
  shipmentId: number,
  recipientName: string,
  signatureText?: string,
  notes?: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/deliver`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ recipient_name: recipientName, signature_text: signatureText, notes }),
  })
}

export async function failDelivery(
  shipmentId: number,
  reasonCode: TransitFailureReason,
  notes: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/fail`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ reason_code: reasonCode, notes }),
  })
}

export async function reportDelay(
  shipmentId: number,
  delayMinutes: number,
  reason: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/delay`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ delay_minutes: delayMinutes, reason }),
  })
}

export async function redispatchShipment(
  shipmentId: number,
  notes?: string,
  token?: string | null
): Promise<TransitTransitionResponse> {
  return apiRequest<TransitTransitionResponse>(`/transit/shipments/${shipmentId}/redispatch`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ notes }),
  })
}

export async function getTripFsmProgress(
  vehicleId: number,
  token?: string | null
): Promise<TripFsmProgressResponse> {
  return apiRequest<TripFsmProgressResponse>(`/transit/trips/${vehicleId}/progress`, {
    method: 'GET',
    headers: authHeaders(token),
  })
}

export async function getFsmTransitionRules(
  token?: string | null
): Promise<Record<string, string[]>> {
  return apiRequest<Record<string, string[]>>('/transit/fsm/transitions', {
    method: 'GET',
    headers: authHeaders(token),
  })
}
