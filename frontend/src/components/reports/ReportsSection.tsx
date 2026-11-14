// ─── OPERATIONAL REPORTS (Weeks 13–14 · Track A) ──────────────────────────────
// KPIs from the metrics engine, filterable by period / hub / vehicle type / driver, with the daily OTIF trend,
// a per-hub comparison and CSV / PDF exports that use exactly the same filters.
import { useEffect, useState } from 'react'
import { reportsApi, type Kpis, type MetricsResponse, type ReportFilters } from '../../lib/reportsApi'

const KPI_TILES: { key: keyof Kpis; label: string; fmt: (v: number) => string; def: string; good?: 'up' | 'down' }[] = [
  { key: 'otif_pct', label: 'OTIF', fmt: v => `${v}%`, def: 'otif_pct', good: 'up' },
  { key: 'on_time_pct', label: 'On time', fmt: v => `${v}%`, def: 'on_time_pct', good: 'up' },
  { key: 'sla_breach_pct', label: 'SLA breaches', fmt: v => `${v}%`, def: 'sla_breach_pct', good: 'down' },
  { key: 'avg_transit_min', label: 'Avg trip time', fmt: v => `${(v / 60).toFixed(1)} h`, def: 'avg_transit_min' },
  { key: 'route_efficiency_index', label: 'Route efficiency', fmt: v => `${v}×`, def: 'route_efficiency_index', good: 'up' },
  { key: 'fuel_l_per_100km', label: 'Fuel burn', fmt: v => `${v} L/100km`, def: 'fuel_l_per_100km', good: 'down' },
  { key: 'cost_per_ton_km', label: 'Cost per ton-km', fmt: v => `₹${v}`, def: 'cost_per_ton_km', good: 'down' },
  { key: 'fleet_utilisation_pct', label: 'Fleet utilisation', fmt: v => `${v}%`, def: 'fleet_utilisation_pct', good: 'up' },
]

export default function ReportsSection() {
  const [filters, setFilters] = useState<ReportFilters>({ days: 30 })
  const [data, setData] = useState<MetricsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    reportsApi.metrics(filters)
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof TypeError ? 'Reports need the backend to be running.' : (e as Error).message) })
    return () => { cancelled = true }
  }, [JSON.stringify(filters)])

  async function exportFile(kind: 'csv' | 'pdf') {
    setExporting(kind)
    try { await reportsApi.download(kind, filters) } catch (e) { setError((e as Error).message) } finally { setExporting(null) }
  }
  const set = (patch: Partial<ReportFilters>) => setFilters(f => ({ ...f, ...patch }))

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Filters + exports in one row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white rounded-lg p-0.5 ring-1 ring-slate-200">
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => set({ days: d })} className={`px-3 py-1.5 text-sm rounded-md ${filters.days === d ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{d} days</button>
            ))}
          </div>
          <Select id="rep-hub" label="All hubs" value={filters.hub} options={data?.options.hubs ?? []} onChange={v => set({ hub: v })} />
          <Select id="rep-type" label="All vehicle types" value={filters.vehicle_type} options={data?.options.vehicle_types ?? []} onChange={v => set({ vehicle_type: v })} format={v => v.replace('_', ' ').toLowerCase()} />
          <Select id="rep-driver" label="All drivers" value={filters.driver} options={data?.options.drivers ?? []} onChange={v => set({ driver: v })} />
          <div className="flex-1" />
          <button onClick={() => exportFile('csv')} disabled={!data || !!exporting} className="px-3 py-1.5 rounded-lg bg-white ring-1 ring-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{exporting === 'csv' ? 'Exporting…' : 'Export CSV'}</button>
          <button onClick={() => exportFile('pdf')} disabled={!data || !!exporting} className="px-3 py-1.5 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{exporting === 'pdf' ? 'Preparing…' : 'Download PDF summary'}</button>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Loading metrics…</p>}

        {data && (
          <>
            <p className="text-xs text-slate-500">{data.source} · {data.kpis.trips} trips, {data.kpis.stops} deliveries. Costs assume fuel ₹{data.assumptions.fuel_price_per_l}/L and driver ₹{data.assumptions.driver_cost_per_hour}/h.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {KPI_TILES.map(t => (
                <div key={t.key} className="rounded-xl bg-white ring-1 ring-slate-200 px-4 py-3" title={data.definitions[t.def]}>
                  <p className="text-xs text-slate-500">{t.label}</p>
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums mt-0.5">{t.fmt(data.kpis[t.key])}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{data.definitions[t.def]}</p>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 rounded-xl bg-white ring-1 ring-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">OTIF by day</p>
                <p className="text-xs text-slate-500">Share of deliveries on time and in full</p>
                <OtifChart daily={data.daily} />
              </div>
              <div className="lg:col-span-2 rounded-xl bg-white ring-1 ring-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">By hub</p>
                <table className="w-full mt-3 text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="pb-2 font-medium">Hub</th><th className="pb-2 font-medium">OTIF</th><th className="pb-2 font-medium text-right">Trips</th><th className="pb-2 font-medium text-right">₹/ton-km</th></tr></thead>
                  <tbody>
                    {Object.entries(data.by_hub).map(([hub, k]) => (
                      <tr key={hub} className="border-t border-slate-100">
                        <td className="py-2 font-mono text-xs text-slate-700">{hub}</td>
                        <td className="py-2 w-[40%]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-violet-600" style={{ width: `${k.otif_pct}%` }} /></div>
                            <span className="tabular-nums text-xs text-slate-700 w-11 text-right">{k.otif_pct}%</span>
                          </div>
                        </td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{k.trips}</td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{k.cost_per_ton_km}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-sm font-semibold text-slate-900 mt-5">By vehicle type</p>
                <table className="w-full mt-2 text-sm">
                  <tbody>
                    {Object.entries(data.by_vehicle_type).map(([t, k]) => (
                      <tr key={t} className="border-t border-slate-100">
                        <td className="py-2 text-slate-700">{t.replace('_', ' ').toLowerCase()}</td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{k.fuel_l_per_100km} L/100km</td>
                        <td className="py-2 text-right tabular-nums text-slate-700">{k.fleet_utilisation_pct}% full</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Select({ id, label, value, options, onChange, format }: { id: string; label: string; value?: string; options: string[]; onChange: (v?: string) => void; format?: (v: string) => string }) {
  return (
    <select id={id} aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}
      className="bg-white ring-1 ring-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 outline-none">
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{format ? format(o) : o}</option>)}
    </select>
  )
}

/** Single-series line with a hover crosshair + tooltip. */
function OtifChart({ daily }: { daily: (Kpis & { date: string })[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!daily.length) return <p className="text-sm text-slate-500 mt-4">No trips in this selection.</p>
  const W = 640, H = 220, L = 36, R = 12, T = 12, B = 28
  const min = Math.max(0, Math.floor((Math.min(...daily.map(d => d.otif_pct)) - 5) / 10) * 10)
  const x = (i: number) => L + (daily.length === 1 ? (W - L - R) / 2 : (i / (daily.length - 1)) * (W - L - R))
  const y = (v: number) => T + (1 - (v - min) / (100 - min)) * (H - T - B)
  const path = daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.otif_pct).toFixed(1)}`).join(' ')
  const ticks = [min, (min + 100) / 2, 100]
  const labelEvery = Math.ceil(daily.length / 6)
  const h = hover !== null ? daily[hover] : null
  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Daily OTIF percentage"
        onMouseMove={e => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - box.left) / box.width) * W
          setHover(Math.max(0, Math.min(daily.length - 1, Math.round(((px - L) / (W - L - R)) * (daily.length - 1)))))
        }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">{Math.round(t)}%</text>
          </g>
        ))}
        {daily.map((d, i) => (i % labelEvery === 0 || i === daily.length - 1) && (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{d.date.slice(5)}</text>
        ))}
        <path d={`${path} L${x(daily.length - 1)},${y(min)} L${x(0)},${y(min)} Z`} fill="#7c3aed" opacity="0.08" />
        <path d={path} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="3 3" />}
        {hover !== null && <circle cx={x(hover)} cy={y(daily[hover].otif_pct)} r="4.5" fill="#7c3aed" stroke="#fff" strokeWidth="2" />}
        <circle cx={x(daily.length - 1)} cy={y(daily[daily.length - 1].otif_pct)} r="3.5" fill="#7c3aed" />
      </svg>
      {h && hover !== null && (
        <div className="absolute pointer-events-none rounded-lg bg-slate-900 text-white text-xs px-2.5 py-1.5 shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: `translateX(${hover > daily.length / 2 ? '-105%' : '5%'})` }}>
          <p className="font-medium">{h.date}</p>
          <p>OTIF {h.otif_pct}% · on time {h.on_time_pct}%</p>
          <p className="text-slate-300">{h.trips} trips · {h.stops} deliveries</p>
        </div>
      )}
    </div>
  )
}
