// ─── AUDIT COMPLIANCE PANEL (US-008, Week 14 · Track B: Abhayraj Jaiswal) ─────────────────────
// Runs the server-side compliance checks over the whole audit log (no gaps in the sequence, full before/after
// snapshots, every dispatched shipment has history) and exports the trail as CSV or a printable PDF report.
import { useEffect, useState } from 'react'
import { auditApi, type AuditReport, type AuditReportFilters } from '../../lib/auditApi'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const CHECKS: { key: keyof AuditReport['checks']; label: string; detail: (r: AuditReport) => string }[] = [
  { key: 'sequence', label: 'No missing entries', detail: r => {
    const c = r.checks.sequence
    if (c.status === 'pass') return `${plural(c.entries, 'entry', 'entries')}, numbered without gaps`
    const missing = c.gaps.reduce((n, g) => n + g.missing, 0)
    return `${plural(missing, 'id', 'ids')} missing (first after #${c.gaps[0]?.after_id}). ${c.note}`
  } },
  { key: 'snapshots', label: 'Before / after recorded', detail: r => {
    const c = r.checks.snapshots
    return c.ok ? 'Every change keeps both states' : `${plural(c.missing.length, 'change', 'changes')} without a full snapshot`
  } },
  { key: 'coverage', label: 'Every status change logged', detail: r => {
    const c = r.checks.coverage
    if (c.ok) return c.shipments_checked ? `All ${c.shipments_checked} shipments match their last logged status` : 'No shipments yet'
    const list = c.untracked.slice(0, 3).map(u => `${u.tracking_number} is ${u.status}, logged ${u.last_logged_status ?? 'never'}`).join('; ')
    return `${plural(c.untracked.length, 'shipment', 'shipments')} in an unlogged status: ${list}${c.untracked.length > 3 ? '…' : ''}`
  } },
]

const LOOK = {
  pass: { box: 'bg-white ring-slate-200', dot: 'bg-emerald-600', icon: '✓', word: 'Pass', text: 'text-emerald-700' },
  warn: { box: 'bg-amber-50 ring-amber-200', dot: 'bg-amber-500', icon: '?', word: 'Review', text: 'text-amber-800' },
  fail: { box: 'bg-red-50 ring-red-200', dot: 'bg-red-600', icon: '!', word: 'Fail', text: 'text-red-700' },
} as const

export default function AuditCompliancePanel({ authToken }: { authToken: string | null }) {
  const [filters, setFilters] = useState<AuditReportFilters>({})
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!authToken) { setError('Sign in to run the compliance checks against the server audit log.'); return }
    let cancelled = false
    setBusy('report')
    auditApi.report(filters, authToken)
      .then(r => { if (!cancelled) { setReport(r); setError(null) } })
      .catch(e => { if (!cancelled) setError(e instanceof TypeError ? 'The compliance report needs the backend to be running.' : (e as Error).message) })
      .finally(() => { if (!cancelled) setBusy(null) })
    return () => { cancelled = true }
  }, [authToken, filters.date_from, filters.date_to])

  const download = async (kind: 'csv' | 'pdf') => {
    setBusy(kind)
    try { await auditApi.download(kind, filters, authToken) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <section aria-label="Compliance report" className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex-shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-slate-700 mr-1" title="Checks run on the server's audit log, which records every API change">
          Compliance report <span className="font-normal text-slate-400">· server audit log</span>
        </p>
        <label className="flex items-center gap-1 text-xs text-slate-500">From
          <input type="date" value={filters.date_from ?? ''} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))}
            className="bg-white ring-1 ring-slate-200 rounded-md px-1.5 py-0.5 text-xs outline-none" />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">to
          <input type="date" value={filters.date_to ?? ''} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))}
            className="bg-white ring-1 ring-slate-200 rounded-md px-1.5 py-0.5 text-xs outline-none" />
        </label>
        {report && <span className="text-xs text-slate-500">{report.total} server entr{report.total === 1 ? 'y' : 'ies'} in range</span>}
        <div className="flex-1" />
        <button onClick={() => download('csv')} disabled={!authToken || busy === 'csv'}
          className="rounded-md px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200 bg-white hover:text-slate-900 disabled:opacity-50">
          {busy === 'csv' ? 'Exporting…' : 'Export CSV'}
        </button>
        <button onClick={() => download('pdf')} disabled={!authToken || busy === 'pdf'}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50">
          {busy === 'pdf' ? 'Preparing…' : 'PDF report'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      {report && (
        <ul className="mt-2 grid sm:grid-cols-3 gap-2">
          {CHECKS.map(c => {
            const look = LOOK[report.checks[c.key].status ?? (report.checks[c.key].ok ? 'pass' : 'fail')]
            const detail = c.detail(report)
            return (
              <li key={c.key} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ring-1 ${look.box}`}>
                <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${look.dot}`}>{look.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">{c.label} <span className={look.text}>· {look.word}</span></p>
                  <p className="text-[11px] text-slate-500 truncate" title={detail}>{detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
