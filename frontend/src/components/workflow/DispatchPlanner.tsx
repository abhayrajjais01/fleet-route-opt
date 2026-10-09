// ─── DISPATCH PLANNER (replaces the Week 2 mock workflow canvas) ─────────────
// Plans one shipment end to end with real, explainable checks instead of a scripted animation:
//   1. origin hub      — road distance from every hub (distance-matrix API)
//   2. vehicle         — best-fit by payload/volume, status and fuel
//   3. driver          — on duty at the hub, enough driving hours left for the round trip
//   4. schedule & SLA  — departure → ETA vs. the customer's delivery window
//   5. policy checks   — each verdict cites the governing SOP clause from the RAG knowledge base
// Approving dispatches the trip, which then appears in Live Tracking.
import { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { clock, estimateLeg, legsAlong, toMinutes, type Leg } from '../../lib/geo'
import { routesApi } from '../../lib/routesApi'
import { ragApi, type PolicyCitation } from '../../lib/ragApi'
import LeafletMap from '../map/LeafletMap'
import { PRIORITY_COLOR } from '../map/markers'

type Verdict = 'pass' | 'warn' | 'fail'
export interface DispatchDecision { shipmentId: number; vehicleId: number; driverId: number; departure: string }

const VERDICT_STYLE: Record<Verdict, { icon: string; ring: string; text: string; bg: string }> = {
  pass: { icon: '✓', ring: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  warn: { icon: '!', ring: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  fail: { icon: '✕', ring: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
}
const worst = (vs: Verdict[]): Verdict => (vs.includes('fail') ? 'fail' : vs.includes('warn') ? 'warn' : 'pass')
const fmtDur = (min: number) => { const m = Math.round(min); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min` }

const POLICY_QUERIES = {
  capacity: 'vehicle payload and volume capacity limits overloading',
  hours: 'driver maximum daily driving hours and rest breaks',
  window: 'delivery time window SLA breach priority',
  readiness: 'pre-trip inspection vehicle defects maintenance status',
} as const
type PolicyKey = keyof typeof POLICY_QUERIES

export default function DispatchPlanner({ shipments, hubs, vehicles, drivers, initialShipmentId, onDispatch, addAudit, onOpenTracking }: {
  shipments: Shipment[]; hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]
  initialShipmentId: number | null
  onDispatch: (d: DispatchDecision) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenTracking: () => void
}) {
  const queue = useMemo(() => [...shipments].sort((a, b) => Number(b.status === 'UNASSIGNED') - Number(a.status === 'UNASSIGNED')), [shipments])
  const [shipmentId, setShipmentId] = useState<number | null>(initialShipmentId ?? queue.find(s => s.status === 'UNASSIGNED')?.id ?? queue[0]?.id ?? null)
  useEffect(() => { if (initialShipmentId) setShipmentId(initialShipmentId) }, [initialShipmentId])
  const shipment = shipments.find(s => s.id === shipmentId) ?? null

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      <aside className="w-60 xl:w-72 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <p className="text-[15px] font-bold text-slate-900">Dispatch Planner</p>
          <p className="text-[11px] text-slate-500">Pick a shipment to plan its trip</p>
        </div>
        {queue.map(s => {
          const on = s.id === shipmentId
          return (
            <button key={s.id} onClick={() => setShipmentId(s.id)} className={`w-full text-left px-4 py-2.5 border-l-[3px] transition-colors ${on ? 'bg-violet-50/70 border-violet-600' : 'border-transparent hover:bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-slate-800">{s.tracking_number}</span>
                <span className="text-[9px] font-bold" style={{ color: PRIORITY_COLOR[s.priority] }}>{s.priority}</span>
                <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${s.status === 'UNASSIGNED' ? 'bg-red-50 text-red-600' : s.status === 'DELIVERED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{s.status}</span>
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{s.customer_name} · {s.weight_kg} kg · {s.time_window_start}–{s.time_window_end}</p>
            </button>
          )
        })}
      </aside>
      {shipment
        ? <PlanView key={shipment.id} shipment={shipment} hubs={hubs} vehicles={vehicles} drivers={drivers} onDispatch={onDispatch} addAudit={addAudit} onOpenTracking={onOpenTracking} />
        : <div className="flex-1 flex items-center justify-center text-sm text-slate-400">No shipments to plan yet. Add one in Shipments.</div>}
    </div>
  )
}

function PlanView({ shipment, hubs, vehicles, drivers, onDispatch, addAudit, onOpenTracking }: {
  shipment: Shipment; hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]
  onDispatch: (d: DispatchDecision) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenTracking: () => void
}) {
  const hasCoords = Number.isFinite(shipment.latitude) && Number.isFinite(shipment.longitude)
  const hub = hubs.find(h => h.id === shipment.hub_id) ?? null
  const alreadyDispatched = shipment.status !== 'UNASSIGNED' && shipment.status !== 'CLUSTERED'
  const [departure, setDeparture] = useState(shipment.dispatch_time ?? '08:30')
  const [vehicleOverride, setVehicleOverride] = useState<number | null>(null)
  const [driverOverride, setDriverOverride] = useState<number | null>(null)
  const [hubKm, setHubKm] = useState<Record<number, Leg>>({})
  const [routeLegs, setRouteLegs] = useState<Leg[] | null>(null)
  const [legSource, setLegSource] = useState<'api' | 'estimate'>('api')
  const [policies, setPolicies] = useState<Partial<Record<PolicyKey, PolicyCitation | null>>>({})
  const [justDispatched, setJustDispatched] = useState(false)

  // 1. Origin hub distances.
  useEffect(() => {
    if (!hasCoords || !hubs.length) return
    const stop = { id: 'stop', latitude: shipment.latitude!, longitude: shipment.longitude! }
    routesApi.distanceMatrix([stop, ...hubs.map(h => ({ id: `hub-${h.id}`, latitude: h.latitude, longitude: h.longitude }))])
      .then(m => setHubKm(Object.fromEntries(hubs.map((h, j) => [h.id, { km: m.distance_km[0][j + 1], minutes: m.duration_min[0][j + 1] }]))))
      .catch(() => setHubKm(Object.fromEntries(hubs.map(h => [h.id, estimateLeg([shipment.latitude!, shipment.longitude!], [h.latitude, h.longitude])]))))
  }, [shipment.id, hasCoords, hubs])

  // 2. Vehicle candidates (best-fit: eligible vehicle with the highest payload utilisation).
  const vehicleRows = vehicles.filter(v => v.assigned_hub_id === shipment.hub_id).map(v => {
    const wPct = (shipment.weight_kg / v.max_payload_kg) * 100
    const vPct = (shipment.volume_m3 / v.max_volume_m3) * 100
    const reasons: string[] = []
    let verdict: Verdict = 'pass'
    if (v.current_status !== 'AVAILABLE') { verdict = 'fail'; reasons.push(v.current_status === 'IN_TRANSIT' ? 'already on a trip' : v.current_status.toLowerCase()) }
    if (wPct > 100) { verdict = 'fail'; reasons.push(`over payload by ${Math.round(shipment.weight_kg - v.max_payload_kg)} kg`) }
    if (vPct > 100) { verdict = 'fail'; reasons.push('not enough cargo volume') }
    if (verdict === 'pass' && v.fuel_pct < 25) { verdict = 'warn'; reasons.push(`low fuel ${v.fuel_pct}%`) }
    return { v, wPct, vPct, verdict, reasons }
  })
  const autoVehicle = [...vehicleRows].filter(r => r.verdict !== 'fail').sort((a, b) => b.wPct - a.wPct)[0]?.v ?? null
  const vehicle = vehicles.find(v => v.id === vehicleOverride) ?? autoVehicle

  // Round-trip legs for the chosen vehicle type.
  useEffect(() => {
    if (!hasCoords || !hub) return
    let cancelled = false
    const pts: [number, number][] = [[hub.latitude, hub.longitude], [shipment.latitude!, shipment.longitude!], [hub.latitude, hub.longitude]]
    legsAlong(pts, vehicle?.vehicle_type ?? 'VAN').then(r => { if (!cancelled) { setRouteLegs(r.legs); setLegSource(r.source) } })
    return () => { cancelled = true }
  }, [shipment.id, hub?.id, vehicle?.vehicle_type, hasCoords])

  const tripMinutes = routeLegs ? routeLegs[0].minutes + routeLegs[1].minutes : 0
  const tripKm = routeLegs ? routeLegs[0].km + routeLegs[1].km : 0

  // 3. Driver candidates.
  const driverRows = drivers.filter(d => d.assigned_hub_id === shipment.hub_id).map(d => {
    const reasons: string[] = []
    let verdict: Verdict = 'pass'
    if (d.status !== 'ON_DUTY') { verdict = 'fail'; reasons.push(d.status === 'ON_TRIP' ? 'on another trip' : d.status.replace('_', ' ').toLowerCase()) }
    const limit = d.max_driving_hours_per_day * 60
    if (verdict === 'pass' && tripMinutes > limit) { verdict = 'fail'; reasons.push(`trip needs ${fmtDur(tripMinutes)}, limit ${d.max_driving_hours_per_day} h`) }
    else if (verdict === 'pass' && tripMinutes > limit * 0.8) { verdict = 'warn'; reasons.push('uses >80% of daily driving limit') }
    return { d, verdict, reasons, limit }
  })
  const autoDriver = [...driverRows].filter(r => r.verdict !== 'fail').sort((a, b) => b.d.rating - a.d.rating)[0]?.d ?? null
  const driver = drivers.find(d => d.id === driverOverride) ?? autoDriver

  // 4. Schedule.
  const departMin = toMinutes(departure)
  const eta = routeLegs ? departMin + routeLegs[0].minutes : NaN
  const open = toMinutes(shipment.time_window_start), close = toMinutes(shipment.time_window_end)
  const waitMin = Math.max(0, open - eta)
  const lateMin = Math.max(0, eta - close)
  const returnMin = routeLegs ? Math.max(eta, open) + 10 + routeLegs[1].minutes : NaN

  // 5. Policy citations (one RAG lookup per rule).
  useEffect(() => {
    let cancelled = false
    ;(Object.keys(POLICY_QUERIES) as PolicyKey[]).forEach(k => {
      ragApi.search(POLICY_QUERIES[k], [], 1)
        .then(r => { if (!cancelled) setPolicies(p => ({ ...p, [k]: r.results[0] ?? null })) })
        .catch(() => { if (!cancelled) setPolicies(p => ({ ...p, [k]: null })) })
    })
    return () => { cancelled = true }
  }, [])

  const vRow = vehicleRows.find(r => r.v.id === vehicle?.id)
  const dRow = driverRows.find(r => r.d.id === driver?.id)
  const checks: { key: PolicyKey; title: string; verdict: Verdict; detail: string }[] = [
    { key: 'capacity', title: 'Payload & volume', verdict: !vRow ? 'fail' : vRow.wPct > 100 || vRow.vPct > 100 ? 'fail' : vRow.wPct > 90 ? 'warn' : 'pass',
      detail: vRow ? `${shipment.weight_kg} kg of ${vRow.v.max_payload_kg} kg (${Math.round(vRow.wPct)}%) · ${shipment.volume_m3} m³ of ${vRow.v.max_volume_m3} m³ (${Math.round(vRow.vPct)}%)` : 'No vehicle selected' },
    { key: 'hours', title: 'Driver hours of service', verdict: !dRow ? 'fail' : dRow.verdict,
      detail: dRow ? `Round trip ${fmtDur(tripMinutes)} of ${dRow.d.max_driving_hours_per_day} h daily limit` : 'No eligible driver on duty at this hub' },
    { key: 'window', title: 'Delivery window', verdict: !routeLegs ? 'warn' : lateMin > 0 ? (shipment.priority === 'EXPRESS' || shipment.priority === 'HIGH' ? 'fail' : 'warn') : 'pass',
      detail: routeLegs ? (lateMin > 0 ? `ETA ${clock(eta)} misses ${shipment.time_window_end} by ${fmtDur(lateMin)}; leave earlier` : `ETA ${clock(eta)} within ${shipment.time_window_start}–${shipment.time_window_end}${waitMin > 0 ? ` (waits ${fmtDur(waitMin)})` : ''}`) : 'Computing route…' },
    { key: 'readiness', title: 'Vehicle readiness', verdict: !vehicle ? 'fail' : vehicle.current_status === 'MAINTENANCE' ? 'fail' : vehicle.fuel_pct < 25 ? 'warn' : 'pass',
      detail: vehicle ? `${vehicle.current_status.replace('_', ' ')} · fuel ${vehicle.fuel_pct}% · est. ${(tripKm / vehicle.fuel_efficiency_kpl).toFixed(1)} L for this trip` : '—' },
  ]
  const overall = worst(checks.map(c => c.verdict))
  const canDispatch = !alreadyDispatched && hasCoords && !!vehicle && !!driver && overall !== 'fail'

  function approve() {
    if (!vehicle || !driver) return
    onDispatch({ shipmentId: shipment.id, vehicleId: vehicle.id, driverId: driver.id, departure })
    addAudit({ actor_name: 'Dispatcher', action_type: 'DISPATCH_APPROVED', entity_type: 'SHIPMENT', entity_id: shipment.id,
      details: `${shipment.tracking_number} dispatched on ${vehicle.plate_number} with ${driver.full_name}, departs ${departure}, ETA ${clock(eta)} (${tripKm.toFixed(1)} km round trip)` })
    setJustDispatched(true)
  }

  if (!hasCoords || !hub) {
    return <div className="flex-1 flex items-center justify-center p-10 text-center"><div><p className="font-semibold text-slate-700">{shipment.tracking_number} has no {hub ? 'coordinates' : 'origin hub'}</p><p className="text-xs text-slate-400 mt-1">Add latitude/longitude in Shipments before planning.</p></div></div>
  }

  const nearestHub = Object.entries(hubKm).sort((a, b) => a[1].km - b[1].km)[0]
  return (
    <div className="flex-1 flex min-w-0">
      {/* ── Steps ── */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-900">{shipment.tracking_number}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${PRIORITY_COLOR[shipment.priority]}18`, color: PRIORITY_COLOR[shipment.priority] }}>{shipment.priority}</span>
            </div>
            <p className="text-base font-semibold text-slate-900 mt-0.5">{shipment.customer_name}</p>
            <p className="text-xs text-slate-500">{shipment.destination_address}</p>
          </div>
          <Fact label="Weight" value={`${shipment.weight_kg} kg`} />
          <Fact label="Volume" value={`${shipment.volume_m3} m³`} />
          <Fact label="Window" value={`${shipment.time_window_start}–${shipment.time_window_end}`} />
        </div>

        <Step n={1} title="Origin hub" verdict={nearestHub && Number(nearestHub[0]) !== hub.id && hubKm[hub.id] && hubKm[hub.id].km - nearestHub[1].km > 5 ? 'warn' : 'pass'}
          summary={hubKm[hub.id] ? `${hub.code} · ${hubKm[hub.id].km.toFixed(1)} km by road` : hub.code}>
          <div className="grid gap-2">
            {hubs.map(h => {
              const leg = hubKm[h.id]
              const isOrigin = h.id === hub.id
              return (
                <div key={h.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isOrigin ? 'border-violet-300 bg-violet-50/60' : 'border-slate-200'}`}>
                  <span className="font-mono text-[11px] font-bold text-slate-700 w-24">{h.code}</span>
                  <span className="text-xs text-slate-600 flex-1 truncate">{h.name}</span>
                  <span className="text-xs font-semibold text-slate-800 tabular-nums">{leg ? `${leg.km.toFixed(1)} km` : '…'}</span>
                  <span className="text-[11px] text-slate-400 w-16 text-right tabular-nums">{leg ? fmtDur(leg.minutes) : ''}</span>
                  {isOrigin && <span className="text-[9px] font-bold text-violet-700">ORIGIN</span>}
                </div>
              )
            })}
          </div>
          {nearestHub && Number(nearestHub[0]) !== hub.id && <p className="text-[11px] text-amber-700 mt-2">{hubs.find(h => h.id === Number(nearestHub[0]))?.code} is closer to this customer; consider re-homing the order.</p>}
        </Step>

        <Step n={2} title="Vehicle" verdict={vRow ? vRow.verdict : 'fail'} summary={vehicle ? `${vehicle.name} · ${vehicle.plate_number}` : 'No eligible vehicle at this hub'}>
          <div className="grid gap-2">
            {vehicleRows.map(r => {
              const on = r.v.id === vehicle?.id
              return (
                <button key={r.v.id} disabled={r.verdict === 'fail' || alreadyDispatched} onClick={() => setVehicleOverride(r.v.id)} className={`text-left px-3 py-2 rounded-lg border transition-colors ${on ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-55 disabled:cursor-not-allowed`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full border-2 ${on ? 'border-violet-600 bg-violet-600' : 'border-slate-300'}`} />
                    <span className="text-xs font-semibold text-slate-800">{r.v.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{r.v.plate_number} · {r.v.vehicle_type.replace('_', ' ')}</span>
                    {r.v.id === autoVehicle?.id && <span className="ml-auto text-[9px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">BEST FIT</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2 pl-6">
                    <Meter label="Payload" pct={r.wPct} />
                    <Meter label="Volume" pct={r.vPct} />
                  </div>
                  {r.reasons.length > 0 && <p className={`text-[11px] mt-1 pl-6 ${VERDICT_STYLE[r.verdict].text}`}>{r.reasons.join(' · ')}</p>}
                </button>
              )
            })}
            {!vehicleRows.length && <p className="text-xs text-slate-400">No vehicles registered at {hub.code}.</p>}
          </div>
        </Step>

        <Step n={3} title="Driver" verdict={dRow ? dRow.verdict : 'fail'} summary={driver ? `${driver.full_name} · ${driver.license_type.replace('_', ' ')} · ★ ${driver.rating}` : 'No eligible driver on duty'}>
          <div className="grid gap-2">
            {driverRows.map(r => {
              const on = r.d.id === driver?.id
              return (
                <button key={r.d.id} disabled={r.verdict === 'fail' || alreadyDispatched} onClick={() => setDriverOverride(r.d.id)} className={`text-left px-3 py-2 rounded-lg border transition-colors ${on ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 hover:border-slate-300'} disabled:opacity-55 disabled:cursor-not-allowed`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full border-2 ${on ? 'border-violet-600 bg-violet-600' : 'border-slate-300'}`} />
                    <span className="text-xs font-semibold text-slate-800">{r.d.full_name}</span>
                    <span className="text-[10px] text-slate-400">{r.d.license_type.replace('_', ' ')} · ★ {r.d.rating} · {r.d.max_driving_hours_per_day} h/day</span>
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.d.status.replace('_', ' ')}</span>
                  </div>
                  {r.reasons.length > 0 && <p className={`text-[11px] mt-1 pl-6 ${VERDICT_STYLE[r.verdict].text}`}>{r.reasons.join(' · ')}</p>}
                </button>
              )
            })}
          </div>
        </Step>

        <Step n={4} title="Schedule & SLA" verdict={checks[2].verdict} summary={routeLegs ? `Depart ${departure} → ETA ${clock(eta)} → back ${clock(returnMin)}` : 'Computing…'}>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-[11px] text-slate-500">Departure<br />
              <input type="time" value={departure} disabled={alreadyDispatched} onChange={e => setDeparture(e.target.value)} className="mt-1 border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800" />
            </label>
            <Fact label="Outbound" value={routeLegs ? `${routeLegs[0].km.toFixed(1)} km · ${fmtDur(routeLegs[0].minutes)}` : '…'} />
            <Fact label="ETA" value={routeLegs ? clock(eta) : '…'} tone={lateMin > 0 ? 'bad' : 'good'} />
            <Fact label="Window" value={`${shipment.time_window_start}–${shipment.time_window_end}`} />
            {waitMin > 0 && <Fact label="Wait on site" value={fmtDur(waitMin)} />}
          </div>
          {routeLegs && <TimelineBar depart={departMin} eta={eta} open={open} close={close} back={returnMin} />}
          <p className="text-[10px] text-slate-400 mt-2">Drive times from {legSource === 'api' ? 'the backend distance engine' : 'the offline estimate (API unreachable)'} · 10 min service time on site</p>
        </Step>

        <Step n={5} title="Policy checks" verdict={overall} summary={`${checks.filter(c => c.verdict === 'pass').length}/${checks.length} passed`}>
          <div className="grid gap-2">
            {checks.map(c => {
              const cite = policies[c.key]
              return (
                <div key={c.key} className={`rounded-lg border border-slate-200 p-3 ${VERDICT_STYLE[c.verdict].bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${VERDICT_STYLE[c.verdict].ring}`}>{VERDICT_STYLE[c.verdict].icon}</span>
                    <span className="text-xs font-semibold text-slate-800">{c.title}</span>
                    {cite && <span className="ml-auto font-mono text-[10px] text-violet-700">{cite.doc_id} {cite.section}</span>}
                  </div>
                  <p className={`text-[11px] mt-1 pl-6 ${VERDICT_STYLE[c.verdict].text}`}>{c.detail}</p>
                  {cite && <p className="text-[11px] text-slate-500 mt-1 pl-6 italic line-clamp-2">“{cite.excerpt}”</p>}
                  {cite === null && <p className="text-[10px] text-slate-400 mt-1 pl-6">Policy citation unavailable (knowledge base offline)</p>}
                </div>
              )
            })}
          </div>
        </Step>
      </div>

      {/* ── Route preview & decision ── */}
      <aside className="w-[320px] xl:w-[360px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
        <div className="h-64 flex-shrink-0 border-b border-slate-200">
          <LeafletMap hubs={[hub]} stops={[{ ...shipment, latitude: shipment.latitude!, longitude: shipment.longitude! }]} selectedHubId={hub.id}
            metrics={routeLegs ? { [shipment.id]: { rank: 1, roadKm: routeLegs[0].km, minutes: routeLegs[0].minutes } } : {}} onSelectHub={() => {}} />
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Trip summary</p>
          <div className="grid grid-cols-2 gap-2">
            <Fact label="Round trip" value={routeLegs ? `${tripKm.toFixed(1)} km` : '…'} boxed />
            <Fact label="Drive time" value={routeLegs ? fmtDur(tripMinutes) : '…'} boxed />
            <Fact label="Fuel" value={vehicle && routeLegs ? `${(tripKm / vehicle.fuel_efficiency_kpl).toFixed(1)} L` : '—'} boxed />
            <Fact label="Back at hub" value={routeLegs ? clock(returnMin) : '…'} boxed />
          </div>
          <div className={`rounded-xl p-3 ${VERDICT_STYLE[overall].bg}`}>
            <p className={`text-xs font-bold ${VERDICT_STYLE[overall].text}`}>
              {overall === 'pass' ? 'All checks passed: ready to dispatch' : overall === 'warn' ? 'Dispatchable with warnings' : 'Blocked: resolve the failed checks'}
            </p>
            <ul className="mt-1 space-y-0.5">
              {checks.filter(c => c.verdict !== 'pass').map(c => <li key={c.key} className="text-[11px] text-slate-600">• {c.title}: {c.detail}</li>)}
            </ul>
          </div>
          {alreadyDispatched || justDispatched ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-bold text-emerald-700">✓ {justDispatched ? 'Dispatched' : `Already ${shipment.status.toLowerCase().replace('_', ' ')}`}</p>
              <button onClick={onOpenTracking} className="mt-2 w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">Open in Live Tracking →</button>
            </div>
          ) : (
            <button onClick={approve} disabled={!canDispatch} className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-sm">
              Approve & Dispatch
            </button>
          )}
          <p className="text-[10px] text-slate-400">Human-in-the-loop: nothing changes until you approve. Every dispatch is written to the audit log.</p>
        </div>
      </aside>
    </div>
  )
}

function Step({ n, title, verdict, summary, children }: { n: number; title: string; verdict: Verdict; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  const st = VERDICT_STYLE[verdict]
  return (
    <section className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className={`w-6 h-6 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${st.ring}`}>{verdict === 'pass' ? n : st.icon}</span>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="text-xs text-slate-500 truncate flex-1">{summary}</span>
        <span className="text-slate-300 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-4 pb-4 pl-[52px]">{children}</div>}
    </section>
  )
}

function Fact({ label, value, tone, boxed }: { label: string; value: string; tone?: 'good' | 'bad'; boxed?: boolean }) {
  return (
    <div className={boxed ? 'rounded-lg border border-slate-200 px-2.5 py-1.5' : ''}>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function Meter({ label, pct }: { label: string; pct: number }) {
  const c = pct > 100 ? '#dc2626' : pct > 90 ? '#d97706' : '#7c3aed'
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500"><span>{label}</span><span className="tabular-nums" style={{ color: c }}>{Math.round(pct)}%</span></div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-0.5"><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: c }} /></div>
    </div>
  )
}

/** Horizontal day strip: delivery window band, departure, ETA and return markers. */
function TimelineBar({ depart, eta, open, close, back }: { depart: number; eta: number; open: number; close: number; back: number }) {
  const from = Math.min(depart, open) - 30, to = Math.max(back, close) + 30
  const x = (m: number) => `${((m - from) / (to - from)) * 100}%`
  return (
    <div className="relative h-14 mt-3 rounded-lg bg-slate-50 border border-slate-200">
      <div className="absolute top-2 bottom-5 bg-emerald-100 border-x border-emerald-300" style={{ left: x(open), width: `calc(${x(close)} - ${x(open)})` }} />
      <div className="absolute top-[18px] h-1 bg-violet-300 rounded" style={{ left: x(depart), width: `calc(${x(back)} - ${x(depart)})` }} />
      {[{ m: depart, l: 'Depart', c: '#0f172a' }, { m: eta, l: 'ETA', c: eta > close ? '#dc2626' : '#7c3aed' }, { m: back, l: 'Back', c: '#64748b' }].map(p => (
        <div key={p.l} className="absolute top-1 -translate-x-1/2 flex flex-col items-center" style={{ left: x(p.m) }}>
          <span className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: p.c, marginTop: 12 }} />
          <span className="text-[9px] font-semibold mt-1 whitespace-nowrap" style={{ color: p.c }}>{p.l} {clock(p.m)}</span>
        </div>
      ))}
      <span className="absolute bottom-1 text-[9px] text-emerald-700 font-semibold" style={{ left: x(open) }}>&nbsp;window</span>
    </div>
  )
}
