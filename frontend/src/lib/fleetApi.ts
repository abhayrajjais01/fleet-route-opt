// ─── FLEET ROSTER (backend-backed) ───────────────────────────────────────────
// Hubs, vehicles, drivers and (for admins) user accounts load from and save to the backend, so a driver added by
// one person is there for every other user, role and device, and survives a reload. Mirrors
// backend/app/api/v1/fleet.py and backend/app/api/v1/users.py. When the backend can't be reached the workspace
// keeps its built-in demo data and says so; nothing here invents data.
import { API_V1 } from './api'
import type { Driver, DriverStatus, Hub, LicenseType, User, UserRole, Vehicle, VehicleStatus, VehicleType } from './types'

export class FleetApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = Array.isArray(body?.detail) ? body.detail.map((d: { msg: string }) => d.msg).join('; ') : body?.detail
    const fallback = res.status === 403 ? 'Your role is not allowed to make this change.' : `Request failed (${res.status})`
    throw new FleetApiError(detail || fallback, res.status)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

// ── wire formats ─────────────────────────────────────────────────────────────
interface ApiHub { id: number; name: string; code: string; address: string; latitude: number; longitude: number; contact_phone: string; operating_hours: string }
interface ApiVehicle { id: number; name: string; plate_number: string; vehicle_type: VehicleType; max_payload_kg: number; max_volume_m3: number; fuel_efficiency_kpl: number; current_status: VehicleStatus; assigned_hub_id: number }
interface ApiDriver {
  id: number; full_name: string; license_number: string; license_type: LicenseType; phone_number: string; status: DriverStatus
  max_driving_hours_per_day: number; hazmat_endorsed: boolean; assigned_hub_id: number; user_id: number | null; current_vehicle_id: number | null
  account_active: boolean | null; account_email: string | null
}
interface ApiUser { id: number; email: string; full_name: string; role: UserRole; is_active: boolean; driver: { id: number } | null; profile_missing: boolean; reset_requested: boolean }

/** Fields the backend does not store (fuel gauge, driver rating) keep the value the app already showed. */
export interface Extras { fuelPct: (plate: string) => number | undefined; rating: (licence: string) => number | undefined }

const toHub = (h: ApiHub): Hub => ({ id: h.id, name: h.name, code: h.code, address: h.address, latitude: h.latitude, longitude: h.longitude,
  contact_phone: h.contact_phone, operating_hours: h.operating_hours })
const toVehicle = (v: ApiVehicle, x: Extras): Vehicle => ({ id: v.id, name: v.name, plate_number: v.plate_number, vehicle_type: v.vehicle_type,
  max_payload_kg: v.max_payload_kg, max_volume_m3: v.max_volume_m3, fuel_efficiency_kpl: v.fuel_efficiency_kpl, current_status: v.current_status,
  assigned_hub_id: v.assigned_hub_id, fuel_pct: x.fuelPct(v.plate_number) ?? 100 })
export const toDriver = (d: ApiDriver, x: Extras): Driver => ({ id: d.id, full_name: d.full_name, license_number: d.license_number, license_type: d.license_type,
  phone_number: d.phone_number, status: d.status, max_driving_hours_per_day: d.max_driving_hours_per_day, assigned_hub_id: d.assigned_hub_id,
  current_vehicle_id: d.current_vehicle_id, rating: x.rating(d.license_number) ?? 4.5, user_id: d.user_id, hazmat_endorsed: d.hazmat_endorsed,
  account_active: d.account_active, account_email: d.account_email })
const toUser = (u: ApiUser): User => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, is_active: u.is_active, reset_requested: u.reset_requested })

export interface Roster { hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]; users: User[] | null }

// Request bodies (only fields the backend accepts)
const hubBody = (h: Omit<Hub, 'id'>) => ({ name: h.name, code: h.code, address: h.address, latitude: h.latitude, longitude: h.longitude,
  contact_phone: h.contact_phone, operating_hours: h.operating_hours })
const vehicleBody = (v: Omit<Vehicle, 'id'>) => ({ name: v.name, plate_number: v.plate_number, vehicle_type: v.vehicle_type, max_payload_kg: v.max_payload_kg,
  max_volume_m3: v.max_volume_m3, fuel_efficiency_kpl: v.fuel_efficiency_kpl, current_status: v.current_status, assigned_hub_id: v.assigned_hub_id })
const driverBody = (d: Omit<Driver, 'id'>) => ({ full_name: d.full_name, license_number: d.license_number, license_type: d.license_type, phone_number: d.phone_number,
  status: d.status, max_driving_hours_per_day: d.max_driving_hours_per_day, hazmat_endorsed: !!d.hazmat_endorsed, assigned_hub_id: d.assigned_hub_id,
  current_vehicle_id: d.current_vehicle_id })

export interface NewUser {
  email: string; password: string; full_name: string; role: UserRole; is_active: boolean
  driver?: { license_number: string; license_type: LicenseType; phone_number: string; assigned_hub_id: number; max_driving_hours_per_day: number; hazmat_endorsed?: boolean }
  driver_id?: number
}

export const fleetApi = {
  /** Everything the workspace needs. Users are listed only for admins (the endpoint is admin-only). */
  async load(token: string, isAdmin: boolean, x: Extras): Promise<Roster> {
    const [hubs, vehicles, drivers, users] = await Promise.all([
      call<ApiHub[]>('/fleet/hubs', token),
      call<ApiVehicle[]>('/fleet/vehicles?limit=500', token),
      call<ApiDriver[]>('/fleet/drivers?limit=500', token),
      isAdmin ? call<ApiUser[]>('/users', token) : Promise.resolve(null),
    ])
    return { hubs: hubs.map(toHub), vehicles: vehicles.map(v => toVehicle(v, x)), drivers: drivers.map(d => toDriver(d, x)), users: users ? users.map(toUser) : null }
  },
  saveHub: (token: string, h: Omit<Hub, 'id'>, id?: number) =>
    (id ? call<ApiHub>(`/fleet/hubs/${id}`, token, { method: 'PUT', body: JSON.stringify(hubBody(h)) })
        : call<ApiHub>('/fleet/hubs', token, { method: 'POST', body: JSON.stringify(hubBody(h)) })).then(toHub),
  deleteHub: (token: string, id: number) => call<void>(`/fleet/hubs/${id}`, token, { method: 'DELETE' }),
  saveVehicle: (token: string, v: Omit<Vehicle, 'id'>, x: Extras, id?: number) =>
    (id ? call<ApiVehicle>(`/fleet/vehicles/${id}`, token, { method: 'PUT', body: JSON.stringify(vehicleBody(v)) })
        : call<ApiVehicle>('/fleet/vehicles', token, { method: 'POST', body: JSON.stringify(vehicleBody(v)) })).then(r => toVehicle(r, x)),
  deleteVehicle: (token: string, id: number) => call<void>(`/fleet/vehicles/${id}`, token, { method: 'DELETE' }),
  saveDriver: (token: string, d: Omit<Driver, 'id'>, x: Extras, id?: number) => {
    const body = driverBody(d)
    if (id) { const { license_number: _ln, ...update } = body; return call<ApiDriver>(`/fleet/drivers/${id}`, token, { method: 'PUT', body: JSON.stringify(update) }).then(r => toDriver(r, x)) }
    return call<ApiDriver>('/fleet/drivers', token, { method: 'POST', body: JSON.stringify(body) }).then(r => toDriver(r, x))
  },
  deleteDriver: (token: string, id: number) => call<void>(`/fleet/drivers/${id}`, token, { method: 'DELETE' }),
  createUser: (token: string, u: NewUser) => call<ApiUser>('/users', token, { method: 'POST', body: JSON.stringify(u) }).then(toUser),
  updateUser: (token: string, id: number, patch: { full_name?: string; role?: UserRole; is_active?: boolean }) =>
    call<ApiUser>(`/users/${id}`, token, { method: 'PATCH', body: JSON.stringify(patch) }).then(toUser),
  resetPassword: (token: string, id: number) => call<{ temporary_password: string }>(`/users/${id}/reset-password`, token, { method: 'POST' }).then(r => r.temporary_password),
  linkDriver: (token: string, userId: number, driverId: number | null) =>
    call<ApiUser>(`/users/${userId}/driver`, token, { method: 'PUT', body: JSON.stringify({ driver_id: driverId }) }).then(toUser),
}
