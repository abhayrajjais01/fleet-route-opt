// ─── OPERATIONAL REPORTS (Weeks 13–14 · mirrors backend/app/api/v1/reports.py) ─
import { API_V1, apiRequest } from './api'

export interface Kpis {
  trips: number; stops: number; otif_pct: number; on_time_pct: number; in_full_pct: number; sla_breach_pct: number; failed_pct: number
  avg_transit_min: number; route_efficiency_index: number; total_km: number; fuel_l: number; fuel_l_per_100km: number
  total_cost: number; cost_per_ton_km: number; fleet_utilisation_pct: number
}
export interface ReportFilters { days: number; hub?: string; vehicle_type?: string; driver?: string }
export interface MetricsResponse {
  source: string; filters: ReportFilters; assumptions: Record<string, number>; definitions: Record<string, string>
  kpis: Kpis; by_hub: Record<string, Kpis>; by_vehicle_type: Record<string, Kpis>; by_driver: Record<string, Kpis>
  daily: (Kpis & { date: string })[]; options: { hubs: string[]; vehicle_types: string[]; drivers: string[] }
}

export function reportQuery(f: ReportFilters): string {
  const q = new URLSearchParams({ days: String(f.days) })
  if (f.hub) q.set('hub', f.hub)
  if (f.vehicle_type) q.set('vehicle_type', f.vehicle_type)
  if (f.driver) q.set('driver', f.driver)
  return q.toString()
}

export const reportsApi = {
  metrics: (f: ReportFilters) => apiRequest<MetricsResponse>(`/reports/metrics?${reportQuery(f)}`),
  /** Downloads a CSV or PDF export by fetching it and saving the blob. */
  async download(kind: 'csv' | 'pdf', f: ReportFilters) {
    const res = await fetch(`${API_V1}/reports/${kind === 'csv' ? 'export.csv' : 'summary.pdf'}?${reportQuery(f)}`)
    if (!res.ok) throw new Error(`Export failed (${res.status})`)
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `fleet-report.${kind}`
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  },
}
