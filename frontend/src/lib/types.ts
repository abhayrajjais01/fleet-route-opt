// ─── SHARED DOMAIN TYPES (mirrors backend Pydantic schemas) ──────────────────
export type UserRole = 'ADMIN' | 'FLEET_MANAGER' | 'DISPATCHER' | 'DRIVER'
export type VehicleType = 'VAN' | 'BOX_TRUCK' | 'SEMI_TRUCK' | 'EV'
export type VehicleStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'MAINTENANCE' | 'DECOMMISSIONED'
export type DriverStatus = 'ON_DUTY' | 'OFF_DUTY' | 'ON_TRIP' | 'RESTING'
export type LicenseType = 'CLASS_A' | 'CLASS_B' | 'COMMERCIAL'
export type ShipmentStatus = 'UNASSIGNED' | 'CLUSTERED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
export type ShipmentPriority = 'LOW' | 'STANDARD' | 'HIGH' | 'EXPRESS'
export type AuditAction = 'ROUTE_MODIFIED' | 'STATUS_CHANGE' | 'COPILOT_OVERRIDE' | 'DISPATCH_APPROVED' | 'ASSET_CREATED' | 'ASSET_DELETED'
export type AdminSection = 'dashboard' | 'fleet' | 'shipments' | 'workflow' | 'map' | 'tracking' | 'compliance' | 'audit' | 'users'
export interface Vehicle { id: number; name: string; plate_number: string; vehicle_type: VehicleType; max_payload_kg: number; max_volume_m3: number; fuel_efficiency_kpl: number; current_status: VehicleStatus; assigned_hub_id: number; fuel_pct: number }
export interface Driver { id: number; full_name: string; license_number: string; license_type: LicenseType; phone_number: string; status: DriverStatus; max_driving_hours_per_day: number; assigned_hub_id: number; current_vehicle_id: number | null; rating: number }
export interface Hub { id: number; name: string; code: string; address: string; latitude: number; longitude: number; contact_phone: string; operating_hours: string }
export interface Shipment { id: number; tracking_number: string; customer_name: string; destination_address: string; weight_kg: number; volume_m3: number; time_window_start: string; time_window_end: string; priority: ShipmentPriority; status: ShipmentStatus; hub_id: number; latitude?: number; longitude?: number; assigned_vehicle_id?: number | null; dispatch_time?: string }
export interface User { id: number; email: string; full_name: string; role: UserRole; is_active: boolean }
export interface AuditEntry { id: number; timestamp: string; actor_name: string; action_type: AuditAction; entity_type: string; entity_id: number; details: string }
