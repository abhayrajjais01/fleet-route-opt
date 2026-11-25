// ─── OPERATING COST & CO2 (mirrors backend/app/services/analytics/metrics.py) ─────────────────────────────
// Diesel ₹95/L at 2.68 kg CO2/L; EVs 0.17 kWh/km at ₹9/kWh and 0.716 kg CO2/kWh (India grid); drivers ₹250/h for
// the first 8 hours and twice that after (Motor Transport Workers Act, 1961 s.27).
import type { Vehicle } from './types'

export const COSTS = { fuelPerL: 95, electricityPerKwh: 9, driverPerH: 250, shiftH: 8, overtimeX: 2, dieselCo2: 2.68, evKwhPerKm: 0.17, gridCo2: 0.716 }

export interface TripCost { energy: number; driver: number; total: number; co2: number; overtimeH: number }

export function tripCost(v: Pick<Vehicle, 'vehicle_type' | 'fuel_efficiency_kpl'>, km: number, minutes: number): TripCost {
  const ev = v.vehicle_type === 'EV'
  const litres = ev ? 0 : km / (v.fuel_efficiency_kpl || 1)
  const kwh = ev ? km * COSTS.evKwhPerKm : 0
  const hours = minutes / 60, overtimeH = Math.max(0, hours - COSTS.shiftH)
  const driver = (hours - overtimeH) * COSTS.driverPerH + overtimeH * COSTS.overtimeX * COSTS.driverPerH
  const energy = litres * COSTS.fuelPerL + kwh * COSTS.electricityPerKwh
  return { energy, driver, total: energy + driver, co2: litres * COSTS.dieselCo2 + kwh * COSTS.gridCo2, overtimeH }
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
