// ─── AUDIT TRAIL COMPLIANCE REPORT (mirrors backend/app/services/audit_report.py, Week 14) ──────
// Track B: Abhayraj Jaiswal — US-008
import { API_V1, apiRequest } from './api'

export interface AuditChecks {
  sequence: { ok: boolean; entries: number; first_id: number | null; last_id: number | null; gaps: { after_id: number; before_id: number; missing: number }[] }
  snapshots: { ok: boolean; missing: { id: number; action_type: string; entity: string }[] }
  coverage: { ok: boolean; shipments_checked: number; untracked: { id: number; tracking_number: string; status: string }[] }
}
export interface AuditReport {
  generated_at: string; total: number; truncated: boolean; first_entry_at: string | null; last_entry_at: string | null
  by_action: Record<string, number>; by_entity: Record<string, number>
  by_actor: { actor_name: string; actor_role: string; entries: number }[]; by_day: { date: string; entries: number }[]
  checks: AuditChecks
}
export interface AuditReportFilters { date_from?: string; date_to?: string; action_type?: string }

const query = (f: AuditReportFilters) => new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()
const auth = (token: string | null): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {})

export const auditApi = {
  report: (f: AuditReportFilters, token: string | null) => apiRequest<AuditReport>(`/audit/report?${query(f)}`, { headers: auth(token) }),
  async download(kind: 'csv' | 'pdf', f: AuditReportFilters, token: string | null) {
    const res = await fetch(`${API_V1}/audit/${kind === 'csv' ? 'export.csv' : 'report.pdf'}?${query(f)}`, { headers: auth(token) })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.detail ?? `Export failed (${res.status})`)
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `audit-trail.${kind}`
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  },
}
