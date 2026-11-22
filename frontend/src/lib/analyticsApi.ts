// ─── EXECUTIVE KPI ANALYTICS (mirrors backend/app/schemas/analytics.py, Weeks 12–13) ──────────
// Track B: Abhayraj Jaiswal — US-008
import { API_V1, apiRequest } from './api'

export type KpiKey = 'on_time_pct' | 'otif_pct' | 'deliveries' | 'total_cost' | 'cost_per_delivery' | 'fleet_utilisation_pct' | 'total_km' | 'failed_pct'

export interface KpiCard { key: KpiKey; value: number; previous: number | null; change: number | null; change_pct: number | null; higher_is_better: boolean }
export interface DailyPoint { date: string; stops: number; deliveries: number; on_time: number; late: number; failed: number; on_time_pct: number | null; cost: number; km: number }
export interface HourBucket { hour: number; stops: number; on_time: number; late: number; failed: number; on_time_pct: number | null }
export interface DriverEfficiency {
  rank: number; driver: string; vehicle_types: string[]; hubs: string[]; trips: number; stops: number; deliveries: number
  on_time_pct: number; stops_per_hour: number; km_per_stop: number; cost_per_delivery: number; utilisation_pct: number
}
export interface DensityCell { lat: number; lon: number; stops: number; on_time: number; failed: number; on_time_pct: number }
export interface DeliveryDensity { cell_deg: number; max_stops: number; cells: DensityCell[]; hubs: { code: string; lat: number; lon: number }[] }
export interface Period { date_from: string; date_to: string; days: number }
export interface ExecutiveDashboard {
  source: string; period: Period; previous_period: Period; filters: { hub: string | null; vehicle_type: string | null; driver: string | null; priority: string | null }
  kpis: KpiCard[]; daily: DailyPoint[]; sla_by_hour: HourBucket[]; drivers: DriverEfficiency[]; density: DeliveryDensity
  live: { generated_at: string; shipments_by_status: Record<string, number>; vehicles_by_status: Record<string, number> }
  options: { hubs: string[]; vehicle_types: string[]; drivers: string[]; priorities: string[] }; assumptions: Record<string, number>
}
export interface ExecutiveFilters { date_from?: string; date_to?: string; hub?: string; vehicle_type?: string; driver?: string; priority?: string }
export type ExportSection = 'kpis' | 'daily' | 'hours' | 'drivers' | 'density'

const query = (f: ExecutiveFilters) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])

export const analyticsApi = {
  executive: (filters: ExecutiveFilters, token: string | null) => {
    const qs = query(filters).toString()
    return apiRequest<ExecutiveDashboard>(`/analytics/executive${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
  /** Downloads one dashboard view as CSV, or the printable PDF summary, for the same filters. */
  async download(kind: ExportSection | 'pdf', filters: ExecutiveFilters, token: string | null) {
    const q = query(filters)
    if (kind !== 'pdf') q.set('section', kind)
    const res = await fetch(`${API_V1}/analytics/executive/${kind === 'pdf' ? 'summary.pdf' : 'export.csv'}?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Export failed (${res.status})`)
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `executive-${kind}.${kind === 'pdf' ? 'pdf' : 'csv'}`
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  },
}
