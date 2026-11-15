// ─── EXECUTIVE KPI ANALYTICS DASHBOARD (US-008, Week 12 · Track B: Abhayraj Jaiswal) ──────────
// Headline KPIs vs the previous period, daily delivery volume, SLA compliance by time of day and a
// driver efficiency comparison, all scoped by one filter row (date range, hub, vehicle category).
// The "Right now" strip reads the live plan and changes the moment a trip event happens; the
// historical charts refetch on trip events and every minute.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { analyticsApi, type DailyPoint, type DriverEfficiency, type ExecutiveDashboard as Data, type ExecutiveFilters, type HourBucket, type KpiCard, type KpiKey } from '../../lib/analyticsApi'
import type { Shipment, Vehicle } from '../../lib/types'

// Validated with the dataviz palette checker (light surface): blue / yellow / red, adjacent CVD-safe.
// Yellow is below 3:1 on white, so every chart has a legend and a table view.
const C = { onTime: '#2a78d6', late: '#eda100', failed: '#e34948', series: '#2a78d6', grid: '#e8e8e4', axis: '#c3c2b7', muted: '#898781' }

const KPI_META: Record<KpiKey, { label: string; fmt: (v: number) => string; unit?: string }> = {
  on_time_pct: { label: 'On-time delivery rate', fmt: v => `${v.toFixed(1)}%` },
  otif_pct: { label: 'OTIF', fmt: v => `${v.toFixed(1)}%` },
  deliveries: { label: 'Deliveries', fmt: v => Math.round(v).toLocaleString('en-IN') },
  total_cost: { label: 'Total operating cost', fmt: v => rupees(v) },
  cost_per_delivery: { label: 'Cost per delivery', fmt: v => `₹${Math.round(v).toLocaleString('en-IN')}` },
  fleet_utilisation_pct: { label: 'Fleet utilisation', fmt: v => `${v.toFixed(1)}%` },
  total_km: { label: 'Total distance', fmt: v => `${Math.round(v).toLocaleString('en-IN')} km` },
  failed_pct: { label: 'Failed deliveries', fmt: v => `${v.toFixed(1)}%` },
}

function rupees(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

function presetRange(days: number): ExecutiveFilters {
  const to = new Date(); to.setDate(to.getDate() - 1)
  const from = new Date(to); from.setDate(from.getDate() - (days - 1))
  return { date_from: isoDay(from), date_to: isoDay(to) }
}

export default function ExecutiveDashboard({ authToken, shipments, vehicles }: {
  authToken: string | null; shipments: Shipment[]; vehicles: Vehicle[]
}) {
  const [preset, setPreset] = useState<number | 'custom'>(30)
  const [filters, setFilters] = useState<ExecutiveFilters>(() => presetRange(30))
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)

  // Trip events (any shipment status or vehicle change) trigger a refetch, debounced; plus once a minute.
  const tripSignature = useMemo(() => shipments.map(s => `${s.id}:${s.status}:${s.assigned_vehicle_id ?? ''}`).join('|'), [shipments])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => setTick(n => n + 1), 1500)
    return () => clearTimeout(t)
  }, [tripSignature])
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    analyticsApi.executive(filters, authToken)
      .then(d => { if (!cancelled) { setData(d); setError(null); setRefreshedAt(new Date()) } })
      .catch(e => { if (!cancelled) setError(e instanceof TypeError ? 'The executive dashboard needs the backend to be running.' : (e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [JSON.stringify(filters), authToken, tick])

  const set = (patch: Partial<ExecutiveFilters>) => setFilters(f => ({ ...f, ...patch }))
  const yesterday = isoDay(new Date(Date.now() - 864e5))

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 space-y-6">
        {/* One filter row scopes everything below it */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-white rounded-lg p-0.5 ring-1 ring-slate-200" role="group" aria-label="Date range">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { setPreset(d); setFilters(f => ({ ...f, ...presetRange(d) })) }}
                className={`px-3 py-1.5 text-sm rounded-md ${preset === d ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'text-slate-600 hover:text-slate-900'}`}>
                Last {d} days
              </button>
            ))}
            <button onClick={() => setPreset('custom')}
              className={`px-3 py-1.5 text-sm rounded-md ${preset === 'custom' ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-200' : 'text-slate-600 hover:text-slate-900'}`}>
              Custom
            </button>
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-1 text-sm text-slate-600">
              <input type="date" aria-label="From" value={filters.date_from ?? ''} max={filters.date_to ?? yesterday} onChange={e => set({ date_from: e.target.value })}
                className="bg-white ring-1 ring-slate-200 rounded-lg px-2 py-1 outline-none" />
              <span>to</span>
              <input type="date" aria-label="To" value={filters.date_to ?? ''} max={yesterday} onChange={e => set({ date_to: e.target.value })}
                className="bg-white ring-1 ring-slate-200 rounded-lg px-2 py-1 outline-none" />
            </div>
          )}
          <Select label="All hubs" value={filters.hub} options={data?.options.hubs ?? []} onChange={v => set({ hub: v })} />
          <Select label="All vehicle types" value={filters.vehicle_type} options={data?.options.vehicle_types ?? []} onChange={v => set({ vehicle_type: v })}
            format={v => v.replace('_', ' ').toLowerCase()} />
          <div className="flex-1" />
          <span className="text-xs text-slate-500">{loading ? 'Refreshing…' : refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        </div>

        <LiveStrip shipments={shipments} vehicles={vehicles} />

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Loading KPIs…</p>}

        {data && (
          <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <KpiTiles kpis={data.kpis} previous={data.previous_period} />
            <div className="grid lg:grid-cols-5 gap-6">
              <DailyChart daily={data.daily} />
              <HourChart hours={data.sla_by_hour} />
            </div>
            <Card title="Driver efficiency" subtitle="Ranked by on-time rate, then stops per driving hour">
              <DriverTable drivers={data.drivers} />
            </Card>
            <p className="text-xs text-slate-500">
              {data.source}. {shortDay(data.period.date_from)} – {shortDay(data.period.date_to)} ({data.period.days} days), compared with {shortDay(data.previous_period.date_from)} – {shortDay(data.previous_period.date_to)}.
              Costs assume diesel at ₹{data.assumptions.fuel_price_per_l}/L and drivers at ₹{data.assumptions.driver_cost_per_hour}/h.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Live operations: straight from the app's plan, so it moves with every trip event ─────────
function LiveStrip({ shipments, vehicles }: { shipments: Shipment[]; vehicles: Vehicle[] }) {
  const count = (pred: (s: Shipment) => boolean) => shipments.filter(pred).length
  const items: [string, number, string][] = [
    ['Vehicles on the road', vehicles.filter(v => v.current_status === 'IN_TRANSIT').length, `of ${vehicles.length}`],
    ['Delivered', count(s => s.status === 'DELIVERED'), 'today'],
    ['In transit', count(s => s.status === 'IN_TRANSIT' || s.status === 'ARRIVED'), 'stops'],
    ['Waiting to leave', count(s => s.status === 'ASSIGNED'), 'stops'],
    ['Failed', count(s => s.status === 'FAILED'), 'to redispatch'],
    ['Not planned yet', count(s => s.status === 'UNASSIGNED' || s.status === 'CLUSTERED'), 'orders'],
  ]
  return (
    <section aria-label="Right now" className="rounded-2xl bg-white ring-1 ring-slate-200/70 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
        <h2 className="text-sm font-semibold text-slate-800">Right now</h2>
        <span className="text-xs text-slate-500">updates as trips progress</span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {items.map(([label, value, hint]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-xl font-semibold text-slate-900">{value} <span className="text-xs font-normal text-slate-400">{hint}</span></dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ─── KPI tiles: one hero figure, then stat tiles; deltas coloured by direction × whether up is good ──
function DeltaText({ k, previousLabel }: { k: KpiCard; previousLabel: string }) {
  if (k.change == null || k.previous == null) return <span className="text-xs text-slate-400">no earlier data</span>
  if (Math.abs(k.change) < 0.05) return <span className="text-xs text-slate-500">no change vs {previousLabel}</span>
  const up = k.change > 0
  const good = up === k.higher_is_better
  const meta = KPI_META[k.key]
  const isPct = k.key.endsWith('_pct')
  const amount = isPct ? `${Math.abs(k.change).toFixed(1)} pts` : meta.fmt(Math.abs(k.change))
  return (
    <span className={`text-xs font-medium ${good ? 'text-[#006300]' : 'text-[#b42318]'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {amount}
      {!isPct && k.change_pct != null && ` (${Math.abs(k.change_pct).toFixed(1)}%)`}
      <span className="font-normal text-slate-500"> vs {previousLabel}</span>
      <span className="sr-only">{good ? ' (better)' : ' (worse)'}</span>
    </span>
  )
}

function KpiTiles({ kpis, previous }: { kpis: KpiCard[]; previous: Data['previous_period'] }) {
  const prevLabel = `previous ${previous.days} days`
  const [hero, ...others] = kpis
  const failed = others.find(k => k.key === 'failed_pct')
  const rest = others.filter(k => k !== failed)
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 p-5 sm:col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-center">
        <p className="text-sm text-slate-500">{KPI_META[hero.key].label}</p>
        <p className="text-5xl font-semibold text-slate-900 mt-1">{KPI_META[hero.key].fmt(hero.value)}</p>
        <p className="mt-2"><DeltaText k={hero} previousLabel={prevLabel} /></p>
        {failed && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">{KPI_META.failed_pct.label}</p>
            <p className="text-lg font-semibold text-slate-900">{KPI_META.failed_pct.fmt(failed.value)}</p>
            <DeltaText k={failed} previousLabel="previous period" />
          </div>
        )}
      </div>
      {rest.map(k => (
        <div key={k.key} className="rounded-2xl bg-white ring-1 ring-slate-200/70 p-4">
          <p className="text-xs text-slate-500">{KPI_META[k.key].label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-0.5">{KPI_META[k.key].fmt(k.value)}</p>
          <p className="mt-1"><DeltaText k={k} previousLabel="previous period" /></p>
        </div>
      ))}
    </div>
  )
}

// ─── Chart scaffolding ───────────────────────────────────────────────
function Card({ title, subtitle, className = '', actions, children }: { title: string; subtitle: string; className?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={`rounded-2xl bg-white ring-1 ring-slate-200/70 p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function ViewToggle({ table, onChange }: { table: boolean; onChange: (t: boolean) => void }) {
  return (
    <div className="shrink-0">
      <div className="flex bg-slate-100 rounded-md p-0.5 text-xs" role="group" aria-label="View">
        {(['Chart', 'Table'] as const).map(v => (
          <button key={v} aria-pressed={(v === 'Table') === table} onClick={() => onChange(v === 'Table')}
            className={`px-2 py-0.5 rounded ${(v === 'Table') === table ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{v}</button>
        ))}
      </div>
    </div>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mb-2">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}</span>
      ))}
    </div>
  )
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  // x, y in % of the chart box; flips to the left near the right edge.
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-slate-200 whitespace-nowrap"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(${x > 60 ? 'calc(-100% - 8px)' : '8px'}, -50%)` }}>
      {children}
    </div>
  )
}

const TipRow = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-3 h-0.5 rounded" style={{ background: color }} />
    <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    <span className="text-slate-500">{label}</span>
  </div>
)

/** Rect with only the top corners rounded (data end), square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

function niceMax(v: number) {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p).find(m => m >= v)!
}

// ─── Daily volume: stacked columns (on time / late / failed) ──────────────────
function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 220, L = 34, R = 8, T = 8, B = 24
  const max = niceMax(Math.max(...daily.map(d => d.stops), 1))
  const band = (W - L - R) / daily.length
  const bw = Math.min(24, band * 0.7)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(daily.length / 8)

  return (
    <Card className="lg:col-span-3" title="Daily delivery volume" subtitle="Stops attempted each day, by outcome" actions={<ViewToggle table={table} onChange={setTable} />}>
      {table ? (
        <DataTable head={['Date', 'Stops', 'On time', 'Late', 'Failed', 'On-time %']}
          rows={daily.map(d => [shortDay(d.date), d.stops, d.on_time, d.late, d.failed, d.on_time_pct == null ? '—' : `${d.on_time_pct}%`])} />
      ) : (
        <>
          <Legend items={[['On time', C.onTime], ['Late', C.late], ['Failed', C.failed]]} />
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Stops per day by outcome" onMouseLeave={() => setHover(null)}>
              {ticks.map(t => (
                <g key={t}>
                  <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} strokeWidth={1} />
                  <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={C.muted} className="tabular-nums">{t}</text>
                </g>
              ))}
              {daily.map((d, i) => {
                const x = L + band * i + (band - bw) / 2
                const segs: [number, string][] = [[d.on_time, C.onTime], [d.late, C.late], [d.failed, C.failed]]
                let acc = 0
                const topIdx = segs.map(s => s[0] > 0).lastIndexOf(true)
                return (
                  <g key={d.date} opacity={hover == null || hover === i ? 1 : 0.55}>
                    {segs.map(([v, color], k) => {
                      if (v <= 0) return null
                      const y0 = y(acc), y1 = y(acc + v)
                      acc += v
                      const h = Math.max(0, y0 - y1 - (k < topIdx ? 2 : 0))     // 2px surface gap between segments
                      return k === topIdx
                        ? <path key={k} d={topRounded(x, y1, bw, h, 4)} fill={color} />
                        : <rect key={k} x={x} y={y1 + 2} width={bw} height={h} fill={color} />
                    })}
                    {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={C.muted}>{shortDay(d.date)}</text>}
                    <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" tabIndex={0}
                      aria-label={`${shortDay(d.date)}: ${d.on_time} on time, ${d.late} late, ${d.failed} failed`}
                      onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                  </g>
                )
              })}
            </svg>
            {hover != null && (() => {
              const d = daily[hover]
              return (
                <Tooltip x={((L + band * (hover + 0.5)) / W) * 100} y={40}>
                  <p className="font-medium text-slate-700 mb-0.5">{shortDay(d.date)} · {d.stops} stops</p>
                  <TipRow color={C.onTime} label="on time" value={String(d.on_time)} />
                  <TipRow color={C.late} label="late" value={String(d.late)} />
                  <TipRow color={C.failed} label="failed" value={String(d.failed)} />
                  {d.on_time_pct != null && <p className="mt-0.5 text-slate-500">{d.on_time_pct}% on time</p>}
                </Tooltip>
              )
            })()}
          </div>
        </>
      )}
    </Card>
  )
}

// ─── SLA by hour: one series, on-time % per hour of arrival ───────────────────
function HourChart({ hours }: { hours: HourBucket[] }) {
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const W = 420, H = 220, L = 34, R = 8, T = 16, B = 24
  const band = (W - L - R) / Math.max(hours.length, 1)
  const bw = Math.min(24, band * 0.7)
  const y = (v: number) => T + (H - T - B) * (1 - v / 100)
  const valued = hours.filter(h => h.on_time_pct != null)
  const worst = valued.length ? valued.reduce((a, b) => (b.on_time_pct! < a.on_time_pct! ? b : a)) : null

  return (
    <Card className="lg:col-span-2" title="SLA compliance by time of day" subtitle="Share of stops reached on time, by hour of arrival" actions={<ViewToggle table={table} onChange={setTable} />}>
      {table ? (
        <DataTable head={['Hour', 'Stops', 'On time', 'Late', 'Failed', 'On-time %']}
          rows={hours.map(h => [`${hourLabel(h.hour)}–${hourLabel(h.hour + 1)}`, h.stops, h.on_time, h.late, h.failed, h.on_time_pct == null ? '—' : `${h.on_time_pct}%`])} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="On-time percentage by hour of day" onMouseLeave={() => setHover(null)}>
            {[0, 50, 100].map(t => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} strokeWidth={1} />
                <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={C.muted}>{t}%</text>
              </g>
            ))}
            {hours.map((h, i) => {
              const x = L + band * i + (band - bw) / 2
              const v = h.on_time_pct ?? 0
              return (
                <g key={h.hour} opacity={hover == null || hover === i ? 1 : 0.55}>
                  {v > 0 && <path d={topRounded(x, y(v), bw, y(0) - y(v), 4)} fill={C.series} />}
                  {h === worst && <text x={x + bw / 2} y={y(v) - 4} textAnchor="middle" fontSize={10} fill="#52514e">{v}%</text>}
                  {(i % 2 === 0) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={C.muted}>{hourLabel(h.hour)}</text>}
                  <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" tabIndex={0}
                    aria-label={`${hourLabel(h.hour)}: ${h.on_time_pct ?? 0}% on time of ${h.stops} stops`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                </g>
              )
            })}
          </svg>
          {hover != null && (() => {
            const h = hours[hover]
            return (
              <Tooltip x={((L + band * (hover + 0.5)) / W) * 100} y={40}>
                <p className="font-medium text-slate-700 mb-0.5">{hourLabel(h.hour)}–{hourLabel(h.hour + 1)}</p>
                <TipRow color={C.series} label="on time" value={`${h.on_time_pct ?? 0}%`} />
                <p className="text-slate-500">{h.stops} stops · {h.late} late · {h.failed} failed</p>
              </Tooltip>
            )
          })()}
          {worst && <p className="text-xs text-slate-500 mt-1">Weakest hour: {hourLabel(worst.hour)} ({worst.on_time_pct}% on time).</p>}
        </div>
      )}
    </Card>
  )
}

// ─── Driver comparison table with an inline on-time meter ──────────────────
function DriverTable({ drivers }: { drivers: DriverEfficiency[] }) {
  if (!drivers.length) return <p className="text-sm text-slate-500">No trips for these filters.</p>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
            <th className="py-2 px-1 font-medium">#</th>
            <th className="font-medium">Driver</th>
            <th className="font-medium">On time</th>
            <th className="font-medium text-right">Stops / hr</th>
            <th className="font-medium text-right">km / stop</th>
            <th className="font-medium text-right">Cost / delivery</th>
            <th className="font-medium text-right">Load used</th>
            <th className="font-medium text-right pr-1">Trips · stops</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map(d => (
            <tr key={d.driver} className="border-b border-slate-50 last:border-0">
              <td className="py-2 px-1 text-slate-400 tabular-nums">{d.rank}</td>
              <td>
                <p className="text-slate-900 font-medium">{d.driver}</p>
                <p className="text-xs text-slate-500">{d.hubs.join(', ')} · {d.vehicle_types.map(t => t.replace('_', ' ').toLowerCase()).join(', ')}</p>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-[#cde2fb]" aria-hidden>
                    <div className="h-2 rounded-full" style={{ width: `${d.on_time_pct}%`, background: C.series }} />
                  </div>
                  <span className="tabular-nums text-slate-700">{d.on_time_pct}%</span>
                </div>
              </td>
              <td className="text-right tabular-nums text-slate-700">{d.stops_per_hour.toFixed(2)}</td>
              <td className="text-right tabular-nums text-slate-700">{d.km_per_stop.toFixed(1)}</td>
              <td className="text-right tabular-nums text-slate-700">₹{Math.round(d.cost_per_delivery).toLocaleString('en-IN')}</td>
              <td className="text-right tabular-nums text-slate-700">{d.utilisation_pct}%</td>
              <td className="text-right tabular-nums text-slate-500 pr-1">{d.trips} · {d.stops}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-64 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white"><tr className="text-left text-slate-500 border-b border-slate-100">{head.map((h, i) => <th key={h} className={`py-1.5 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-50">{r.map((c, j) => <td key={j} className={`py-1 tabular-nums ${j ? 'text-right text-slate-700' : 'text-slate-900'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Select({ label, value, options, onChange, format }: { label: string; value?: string; options: string[]; onChange: (v?: string) => void; format?: (v: string) => string }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}
      className="bg-white ring-1 ring-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 outline-none">
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{format ? format(o) : o}</option>)}
    </select>
  )
}
