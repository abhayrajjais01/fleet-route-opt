// ─── AUDIT COMPLIANCE PANEL (US-008, Week 14 · Track B: Abhayraj Jaiswal) ─────────────────────
// Runs the server-side compliance checks over the whole audit log (no gaps in the sequence, full before/after
// snapshots, every dispatched shipment has history) and exports the trail as CSV or a printable PDF report.
import { useEffect, useState } from 'react'
import { auditApi, type AuditReport, type AuditReportFilters } from '../../lib/auditApi'

const CHECKS: { key: keyof AuditReport['checks']; label: string; pass: (r: AuditReport) => string; fail: (r: AuditReport) => string }[] = [
  { key: 'sequence', label: 'No missing entries',
    pass: r => `${r.checks.sequence.entries} entries, numbered without gaps`,
    fail: r => `${r.checks.sequence.gaps.reduce((n, g) => n + g.missing, 0)} entr${r.checks.sequence.gaps.length === 1 ? 'y' : 'ies'} missing (after #${r.checks.sequence.gaps[0]?.after_id})` },
  { key: 'snapshots', label: 'Before / after recorded',
    pass: () => 'Every change keeps both states',
    fail: r => `${r.checks.snapshots.missing.length} change${r.checks.snapshots.missing.length === 1 ? '' : 's'} without a full snapshot` },
  { key: 'coverage', label: 'Every shipment traced',
    pass: r => r.checks.coverage.shipments_checked ? `All ${r.checks.coverage.shipments_checked} dispatched shipments have history` : 'No shipment has been dispatched yet',
    fail: r => `${r.checks.coverage.untracked.length} changed with no audit entry (${r.checks.coverage.untracked.slice(0, 3).map(u => u.tracking_number).join(', ')}${r.checks.coverage.untracked.length > 3 ? '…' : ''})` },
]

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
            const ok = report.checks[c.key].ok
            return (
              <li key={c.key} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ring-1 ${ok ? 'bg-white ring-slate-200' : 'bg-red-50 ring-red-200'}`}>
                <span aria-hidden className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{ok ? '✓' : '!'}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">{c.label} <span className={ok ? 'text-emerald-700' : 'text-red-700'}>· {ok ? 'Pass' : 'Fail'}</span></p>
                  <p className="text-[11px] text-slate-500 truncate" title={ok ? c.pass(report) : c.fail(report)}>{ok ? c.pass(report) : c.fail(report)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
