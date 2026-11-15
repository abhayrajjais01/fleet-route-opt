// ─── EXECUTIVE KPI ANALYTICS (mirrors backend/app/schemas/analytics.py, Week 12) ──────────────
// Track B: Abhayraj Jaiswal — US-008
import { apiRequest } from './api'

export type KpiKey = 'on_time_pct' | 'otif_pct' | 'deliveries' | 'total_cost' | 'cost_per_delivery' | 'fleet_utilisation_pct' | 'total_km' | 'failed_pct'

export interface KpiCard { key: KpiKey; value: number; previous: number | null; change: number | null; change_pct: number | null; higher_is_better: boolean }
export interface DailyPoint { date: string; stops: number; deliveries: number; on_time: number; late: number; failed: number; on_time_pct: number | null; cost: number; km: number }
export interface HourBucket { hour: number; stops: number; on_time: number; late: number; failed: number; on_time_pct: number | null }
export interface DriverEfficiency {
  rank: number; driver: string; vehicle_types: string[]; hubs: string[]; trips: number; stops: number; deliveries: number
  on_time_pct: number; stops_per_hour: number; km_per_stop: number; cost_per_delivery: number; utilisation_pct: number
}
export interface Period { date_from: string; date_to: string; days: number }
export interface ExecutiveDashboard {
  source: string; period: Period; previous_period: Period; filters: { hub: string | null; vehicle_type: string | null }
  kpis: KpiCard[]; daily: DailyPoint[]; sla_by_hour: HourBucket[]; drivers: DriverEfficiency[]
  live: { generated_at: string; shipments_by_status: Record<string, number>; vehicles_by_status: Record<string, number> }
  options: { hubs: string[]; vehicle_types: string[] }; assumptions: Record<string, number>
}
export interface ExecutiveFilters { date_from?: string; date_to?: string; hub?: string; vehicle_type?: string }

export const analyticsApi = {
  executive: (filters: ExecutiveFilters, token: string | null) => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][])
    const qs = q.toString()
    return apiRequest<ExecutiveDashboard>(`/analytics/executive${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
}
