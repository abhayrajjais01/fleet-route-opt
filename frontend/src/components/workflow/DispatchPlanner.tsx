// ─── DISPATCH PLANNER ─────────────────────────────────────────────────────────
// Map-first planning for one shipment. A floating plan card shows the four decisions (origin hub, vehicle,
// driver, departure) as rows you click to change, a short checklist whose rows expand into the governing SOP
// clause from the RAG knowledge base, and a single Approve button. The system proposes; the dispatcher decides.
import { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { clock, estimateLeg, legsAlong, toMinutes, type Leg } from '../../lib/geo'
import { routesApi } from '../../lib/routesApi'
import { ragApi, type PolicyCitation } from '../../lib/ragApi'
import LeafletMap from '../map/LeafletMap'
import { PRIORITY_COLOR } from '../map/markers'

type Verdict = 'pass' | 'warn' | 'fail'
export interface DispatchDecision { shipmentId: number; vehicleId: number; driverId: number; departure: string }

const TONE: Record<Verdict, { text: string; dot: string; soft: string }> = {
  pass: { text: 'text-emerald-700', dot: 'bg-emerald-500', soft: 'bg-emerald-50' },
  warn: { text: 'text-amber-700', dot: 'bg-amber-500', soft: 'bg-amber-50' },
  fail: { text: 'text-red-700', dot: 'bg-red-500', soft: 'bg-red-50' },
}
const worst = (vs: Verdict[]): Verdict => (vs.includes('fail') ? 'fail' : vs.includes('warn') ? 'warn' : 'pass')
const fmtDur = (min: number) => { const m = Math.round(min); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min` }

const POLICY_QUERIES = {
  capacity: 'vehicle payload and volume capacity limits overloading',
  hours: 'driver maximum daily driving hours and rest breaks',
  window: 'delivery time window SLA breach priority',
  readiness: 'pre-trip inspection vehicle defects maintenance status',
} as const
type PolicyKey = keyof typeof POLICY_QUERIES

const ICONS = {
  hub: 'M3 21V9l9-6 9 6v12h-6v-7H9v7z',
  vehicle: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  driver: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
}

export default function DispatchPlanner({ shipments, hubs, vehicles, drivers, initialShipmentId, onDispatch, addAudit, onOpenTracking }: {
  shipments: Shipment[]; hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]
  initialShipmentId: number | null
  onDispatch: (d: DispatchDecision) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenTracking: () => void
}) {
  const groups = useMemo(() => ([
    { key: 'plan', title: 'To plan', items: shipments.filter(s => s.status === 'UNASSIGNED' || s.status === 'CLUSTERED') },
    { key: 'live', title: 'Scheduled & on the road', items: shipments.filter(s => s.status === 'ASSIGNED' || s.status === 'IN_TRANSIT') },
    { key: 'done', title: 'Completed', items: shipments.filter(s => s.status === 'DELIVERED' || s.status === 'FAILED') },
  ]), [shipments])
  const [shipmentId, setShipmentId] = useState<number | null>(initialShipmentId ?? groups[0].items[0]?.id ?? shipments[0]?.id ?? null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ plan: true, live: false, done: false })
  useEffect(() => { if (initialShipmentId) setShipmentId(initialShipmentId) }, [initialShipmentId])
  const shipment = shipments.find(s => s.id === shipmentId) ?? null

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-[280px] flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
        {groups.map(g => (
          <div key={g.key} className="mb-2">
            <button onClick={() => setOpenGroups(o => ({ ...o, [g.key]: !o[g.key] }))} className="w-full flex items-center gap-2 px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
              <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 transition-transform ${openGroups[g.key] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
              {g.title}<span className="ml-auto font-normal text-slate-400">{g.items.length}</span>
            </button>
            {openGroups[g.key] && g.items.map(s => {
              const on = s.id === shipmentId
              const urgent = s.priority === 'EXPRESS' || s.priority === 'HIGH'
              return (
                <button key={s.id} onClick={() => setShipmentId(s.id)} className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${on ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate flex-1">{s.customer_name}</span>
                    {urgent && <span className="text-[11px] font-semibold" style={{ color: PRIORITY_COLOR[s.priority] }}>{s.priority.toLowerCase()}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{s.weight_kg} kg · {s.time_window_start}–{s.time_window_end}</p>
                </button>
              )
            })}
            {openGroups[g.key] && g.items.length === 0 && <p className="px-3 pb-2 text-xs text-slate-400">Nothing here.</p>}
          </div>
        ))}
      </aside>
      {shipment
        ? <PlanView key={shipment.id} shipment={shipment} hubs={hubs} vehicles={vehicles} drivers={drivers} onDispatch={onDispatch} addAudit={addAudit} onOpenTracking={onOpenTracking} />
        : <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Add a shipment to start planning.</div>}
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
  const locked = shipment.status !== 'UNASSIGNED' && shipment.status !== 'CLUSTERED'
  const [departure, setDeparture] = useState(shipment.dispatch_time ?? '08:30')
  const [vehicleId, setVehicleId] = useState<number | null>(shipment.assigned_vehicle_id ?? null)
  const [driverId, setDriverId] = useState<number | null>(null)
  const [open, setOpen] = useState<null | 'hub' | 'vehicle' | 'driver'>(null)
  const [openCheck, setOpenCheck] = useState<PolicyKey | null>(null)
  const [hubLegs, setHubLegs] = useState<Record<number, Leg>>({})
  const [routeLegs, setRouteLegs] = useState<Leg[] | null>(null)
  const [policies, setPolicies] = useState<Partial<Record<PolicyKey, PolicyCitation | null>>>({})
  const [justDispatched, setJustDispatched] = useState(false)

  useEffect(() => {
    if (!hasCoords || !hubs.length) return
    const stop = { id: 'stop', latitude: shipment.latitude!, longitude: shipment.longitude! }
    routesApi.distanceMatrix([stop, ...hubs.map(h => ({ id: `hub-${h.id}`, latitude: h.latitude, longitude: h.longitude }))])
      .then(m => setHubLegs(Object.fromEntries(hubs.map((h, j) => [h.id, { km: m.distance_km[0][j + 1], minutes: m.duration_min[0][j + 1] }]))))
      .catch(() => setHubLegs(Object.fromEntries(hubs.map(h => [h.id, estimateLeg([shipment.latitude!, shipment.longitude!], [h.latitude, h.longitude])]))))
  }, [shipment.id, hasCoords, hubs])

  // Vehicles: best fit = eligible vehicle with the highest payload utilisation.
  const vehicleRows = vehicles.filter(v => v.assigned_hub_id === shipment.hub_id).map(v => {
    const wPct = (shipment.weight_kg / v.max_payload_kg) * 100
    const vPct = (shipment.volume_m3 / v.max_volume_m3) * 100
    let verdict: Verdict = 'pass'
    let note = `${Math.round(wPct)}% of payload`
    if (v.id !== shipment.assigned_vehicle_id && v.current_status !== 'AVAILABLE') { verdict = 'fail'; note = v.current_status === 'IN_TRANSIT' ? 'Already on a trip' : 'In maintenance' }
    else if (wPct > 100 || vPct > 100) { verdict = 'fail'; note = wPct > 100 ? `Over payload by ${Math.round(shipment.weight_kg - v.max_payload_kg)} kg` : 'Not enough cargo space' }
    else if (v.fuel_pct < 25) { verdict = 'warn'; note = `${Math.round(wPct)}% of payload · fuel ${v.fuel_pct}%` }
    return { v, wPct, vPct, verdict, note }
  })
  const bestVehicle = [...vehicleRows].filter(r => r.verdict !== 'fail').sort((a, b) => b.wPct - a.wPct)[0]?.v ?? null
  const vehicle = vehicles.find(v => v.id === vehicleId) ?? bestVehicle

  useEffect(() => {
    if (!hasCoords || !hub) return
    let cancelled = false
    legsAlong([[hub.latitude, hub.longitude], [shipment.latitude!, shipment.longitude!], [hub.latitude, hub.longitude]], vehicle?.vehicle_type ?? 'VAN')
      .then(r => { if (!cancelled) setRouteLegs(r.legs) })
    return () => { cancelled = true }
  }, [shipment.id, hub?.id, vehicle?.vehicle_type, hasCoords])
  const tripMinutes = routeLegs ? routeLegs[0].minutes + routeLegs[1].minutes : 0
  const tripKm = routeLegs ? routeLegs[0].km + routeLegs[1].km : 0

  const driverRows = drivers.filter(d => d.assigned_hub_id === shipment.hub_id).map(d => {
    let verdict: Verdict = 'pass'
    let note = `★ ${d.rating} · ${d.max_driving_hours_per_day}h/day`
    const assignedHere = vehicle && d.current_vehicle_id === vehicle.id
    if (!assignedHere && d.status !== 'ON_DUTY') { verdict = 'fail'; note = d.status === 'ON_TRIP' ? 'On another trip' : d.status === 'RESTING' ? 'Resting' : 'Off duty' }
    else if (tripMinutes > d.max_driving_hours_per_day * 60) { verdict = 'fail'; note = `Trip needs ${fmtDur(tripMinutes)}, limit ${d.max_driving_hours_per_day}h` }
    else if (tripMinutes > d.max_driving_hours_per_day * 60 * 0.8) { verdict = 'warn'; note = 'Uses most of today\'s driving hours' }
    return { d, verdict, note }
  })
  const bestDriver = [...driverRows].filter(r => r.verdict !== 'fail').sort((a, b) => b.d.rating - a.d.rating)[0]?.d ?? null
  const driver = drivers.find(d => d.id === driverId) ?? (locked && vehicle ? drivers.find(d => d.current_vehicle_id === vehicle.id) : null) ?? bestDriver

  const departMin = toMinutes(departure)
  const eta = routeLegs ? departMin + routeLegs[0].minutes : NaN
  const open_ = toMinutes(shipment.time_window_start), close = toMinutes(shipment.time_window_end)
  const lateMin = Math.max(0, eta - close)
  const waitMin = Math.max(0, open_ - eta)
  const backMin = routeLegs ? Math.max(eta, open_) + 10 + routeLegs[1].minutes : NaN

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
    { key: 'capacity', title: 'Fits the vehicle', verdict: !vRow ? 'fail' : vRow.wPct > 100 || vRow.vPct > 100 ? 'fail' : vRow.wPct > 90 ? 'warn' : 'pass',
      detail: vRow ? `${shipment.weight_kg} of ${vRow.v.max_payload_kg} kg, ${shipment.volume_m3} of ${vRow.v.max_volume_m3} m³` : 'No vehicle selected' },
    { key: 'hours', title: 'Driver has the hours', verdict: !dRow ? 'fail' : dRow.verdict,
      detail: dRow ? `${fmtDur(tripMinutes)} round trip, limit ${dRow.d.max_driving_hours_per_day}h a day` : 'No driver on duty at this hub' },
    { key: 'window', title: 'Arrives in the window', verdict: !routeLegs ? 'warn' : lateMin > 0 ? (shipment.priority === 'EXPRESS' || shipment.priority === 'HIGH' ? 'fail' : 'warn') : 'pass',
      detail: routeLegs ? (lateMin > 0 ? `${fmtDur(lateMin)} late: leave earlier` : `Arrives ${clock(eta)}${waitMin > 0 ? `, waits ${fmtDur(waitMin)}` : ''}`) : 'Calculating route…' },
    { key: 'readiness', title: 'Vehicle is ready', verdict: !vehicle ? 'fail' : vehicle.current_status === 'MAINTENANCE' ? 'fail' : vehicle.fuel_pct < 25 ? 'warn' : 'pass',
      detail: vehicle ? `Fuel ${vehicle.fuel_pct}%, needs about ${(tripKm / vehicle.fuel_efficiency_kpl).toFixed(1)} L` : '—' },
  ]
  const overall = worst(checks.map(c => c.verdict))
  const canDispatch = !locked && hasCoords && !!vehicle && !!driver && overall !== 'fail'

  function approve() {
    if (!vehicle || !driver) return
    onDispatch({ shipmentId: shipment.id, vehicleId: vehicle.id, driverId: driver.id, departure })
    addAudit({ actor_name: 'Dispatcher', action_type: 'DISPATCH_APPROVED', entity_type: 'SHIPMENT', entity_id: shipment.id,
      details: `${shipment.tracking_number} dispatched on ${vehicle.plate_number} with ${driver.full_name}, departs ${departure}, ETA ${clock(eta)}` })
    setJustDispatched(true)
  }

  if (!hasCoords || !hub) {
    return <div className="flex-1 flex items-center justify-center p-10 text-center"><div><p className="font-medium text-slate-800">This shipment has no location yet</p><p className="text-sm text-slate-500 mt-1">Add its coordinates in Shipments to plan a route.</p></div></div>
  }

  const closest = Object.entries(hubLegs).sort((a, b) => a[1].km - b[1].km)[0]
  const closerHub = closest && Number(closest[0]) !== hub.id && hubLegs[hub.id] && hubLegs[hub.id].km - closest[1].km > 5 ? hubs.find(h => h.id === Number(closest[0])) : null
  const toggle = (k: 'hub' | 'vehicle' | 'driver') => setOpen(o => (o === k ? null : k))

  return (
    <div className="flex-1 relative min-w-0">
      <LeafletMap hubs={hubs} stops={[{ ...shipment, latitude: shipment.latitude!, longitude: shipment.longitude! }]} selectedHubId={hub.id}
        metrics={routeLegs ? { [shipment.id]: { rank: 1, roadKm: routeLegs[0].km, minutes: routeLegs[0].minutes } } : {}} onSelectHub={() => {}}
        fitPadding={{ topLeft: [60, 60], bottomRight: [460, 60] }} />

      <div className="absolute top-4 right-4 bottom-4 w-[400px] rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Shipment */}
          <div className="px-5 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLOR[shipment.priority] }} />
              <span className="font-medium" style={{ color: PRIORITY_COLOR[shipment.priority] }}>{shipment.priority.charAt(0) + shipment.priority.slice(1).toLowerCase()}</span>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-slate-500">{shipment.tracking_number}</span>
            </div>
            <p className="text-lg font-semibold text-slate-900 mt-1.5">{shipment.customer_name}</p>
            <p className="text-sm text-slate-500">{shipment.destination_address}</p>
            <div className="flex gap-2 mt-3 text-xs">
              {[`${shipment.weight_kg} kg`, `${shipment.volume_m3} m³`, `${shipment.time_window_start}–${shipment.time_window_end}`].map(t => <span key={t} className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">{t}</span>)}
            </div>
          </div>

          {/* Decisions */}
          <div className="px-3 py-2">
            <Decision icon={ICONS.hub} label="From" value={hub.name} sub={hubLegs[hub.id] ? `${hubLegs[hub.id].km.toFixed(1)} km · ${fmtDur(hubLegs[hub.id].minutes)} to the customer` : 'Measuring distance…'}
              verdict={closerHub ? 'warn' : 'pass'} open={open === 'hub'} onToggle={() => toggle('hub')}>
              {hubs.map(h => (
                <Option key={h.id} selected={h.id === hub.id} disabled title={h.name} note={hubLegs[h.id] ? `${hubLegs[h.id].km.toFixed(1)} km · ${fmtDur(hubLegs[h.id].minutes)}` : '…'} />
              ))}
              {closerHub && <p className="px-3 pt-1 text-xs text-amber-700">{closerHub.name} is closer. Consider moving this order there.</p>}
            </Decision>

            <Decision icon={ICONS.vehicle} label="Vehicle" value={vehicle?.name ?? 'No vehicle free'} sub={vRow ? `${vRow.v.plate_number} · ${vRow.note}` : 'Every vehicle at this hub is busy'}
              verdict={vRow?.verdict ?? 'fail'} open={open === 'vehicle'} onToggle={() => !locked && toggle('vehicle')} locked={locked}>
              {vehicleRows.map(r => (
                <Option key={r.v.id} selected={r.v.id === vehicle?.id} disabled={r.verdict === 'fail'} title={r.v.name} note={r.note} badge={r.v.id === bestVehicle?.id ? 'Best fit' : undefined}
                  onClick={() => { setVehicleId(r.v.id); setOpen(null) }} meter={Math.min(100, r.wPct)} />
              ))}
            </Decision>

            <Decision icon={ICONS.driver} label="Driver" value={driver?.full_name ?? 'No driver free'} sub={dRow?.note ?? 'Nobody on duty at this hub'}
              verdict={dRow?.verdict ?? 'fail'} open={open === 'driver'} onToggle={() => !locked && toggle('driver')} locked={locked}>
              {driverRows.map(r => (
                <Option key={r.d.id} selected={r.d.id === driver?.id} disabled={r.verdict === 'fail'} title={r.d.full_name} note={r.note} badge={r.d.id === bestDriver?.id ? 'Suggested' : undefined}
                  onClick={() => { setDriverId(r.d.id); setOpen(null) }} />
              ))}
            </Decision>

            <div className="flex items-center gap-3 px-2 py-3">
              <RowIcon d={ICONS.clock} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">Leaves at</p>
                <p className="text-sm text-slate-500 mt-0.5">{routeLegs ? <>Arrives <span className={`font-medium ${lateMin > 0 ? 'text-red-600' : 'text-slate-900'}`}>{clock(eta)}</span> · back {clock(backMin)}</> : 'Calculating…'}</p>
              </div>
              <input type="time" value={departure} disabled={locked} onChange={e => setDeparture(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-slate-50" />
            </div>
            {routeLegs && <WindowStrip depart={departMin} eta={eta} open={open_} close={close} back={backMin} />}
          </div>

          {/* Checks */}
          <div className="px-5 pt-3 pb-5 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Checks · {checks.filter(c => c.verdict === 'pass').length} of {checks.length} passed</p>
            <div className="space-y-1">
              {checks.map(c => {
                const cite = policies[c.key]
                const isOpen = openCheck === c.key
                return (
                  <div key={c.key} className={`rounded-lg ${isOpen ? 'bg-slate-50' : ''}`}>
                    <button onClick={() => setOpenCheck(isOpen ? null : c.key)} className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg hover:bg-slate-50">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${TONE[c.verdict].soft}`}><span className={`w-2 h-2 rounded-full ${TONE[c.verdict].dot}`} /></span>
                      <span className="text-sm text-slate-800 flex-1">{c.title}</span>
                      <span className={`text-xs font-medium ${TONE[c.verdict].text}`}>{c.verdict === 'pass' ? 'OK' : c.verdict === 'warn' ? 'Review' : 'Blocked'}</span>
                      <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {isOpen && (
                      <div className="px-10 pb-3 text-xs">
                        <p className={TONE[c.verdict].text}>{c.detail}</p>
                        {cite ? <p className="text-slate-500 mt-2 leading-relaxed"><span className="font-mono text-violet-700">{cite.doc_id} {cite.section}</span> · {cite.excerpt}</p>
                          : <p className="text-slate-400 mt-2">{cite === null ? 'Policy text unavailable (knowledge base offline).' : 'Looking up the policy…'}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Decision footer */}
        <div className="border-t border-slate-100 px-5 py-4 bg-white">
          {locked || justDispatched ? (
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">✓</span>
              <div className="flex-1"><p className="text-sm font-medium text-slate-900">{justDispatched ? 'Dispatched' : 'Already scheduled'}</p><p className="text-xs text-slate-500">{vehicle?.plate_number} leaves at {departure}</p></div>
              <button onClick={onOpenTracking} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">Track it</button>
            </div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-slate-500 mb-3">
                <span>{routeLegs ? `${tripKm.toFixed(1)} km round trip` : '—'}</span>
                <span>{routeLegs ? `${fmtDur(tripMinutes)} driving` : ''}</span>
                <span>{vehicle && routeLegs ? `${(tripKm / vehicle.fuel_efficiency_kpl).toFixed(1)} L fuel` : ''}</span>
              </div>
              <button onClick={approve} disabled={!canDispatch} className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed">
                {overall === 'fail' ? 'Fix the failed checks to dispatch' : 'Approve & dispatch'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RowIcon({ d }: { d: string }) {
  return (
    <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </span>
  )
}

function Decision({ icon, label, value, sub, verdict, open, onToggle, locked, children }: {
  icon: string; label: string; value: string; sub: string; verdict: Verdict; open: boolean; onToggle: () => void; locked?: boolean; children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl ${open ? 'bg-slate-50' : ''}`}>
      <button onClick={onToggle} className={`w-full flex items-center gap-3 px-2 py-3 text-left rounded-xl ${locked ? 'cursor-default' : 'hover:bg-slate-50'}`}>
        <RowIcon d={icon} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-sm font-medium text-slate-900 truncate">{value}</p>
          <p className={`text-xs truncate ${verdict === 'pass' ? 'text-slate-500' : TONE[verdict].text}`}>{sub}</p>
        </div>
        {!locked && <svg viewBox="0 0 24 24" className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>}
      </button>
      {open && <div className="pb-2 px-1">{children}</div>}
    </div>
  )
}

function Option({ title, note, selected, disabled, badge, meter, onClick }: { title: string; note: string; selected: boolean; disabled?: boolean; badge?: string; meter?: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled && !selected} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg ${selected ? 'bg-white ring-1 ring-violet-300' : 'hover:bg-white'} disabled:opacity-50 disabled:cursor-not-allowed`}>
      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selected ? 'border-violet-600 bg-violet-600 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><span className="text-sm text-slate-900 truncate">{title}</span>{badge && <span className="text-[11px] font-medium text-violet-700 bg-violet-50 px-1.5 rounded">{badge}</span>}</div>
        <p className="text-xs text-slate-500 truncate">{note}</p>
        {meter !== undefined && <div className="mt-1 h-1 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-violet-500" style={{ width: `${meter}%` }} /></div>}
      </div>
    </button>
  )
}

/** Day strip: green delivery window, the trip span, and departure / arrival / return markers. */
function WindowStrip({ depart, eta, open, close, back }: { depart: number; eta: number; open: number; close: number; back: number }) {
  const from = Math.min(depart, open) - 20, to = Math.max(back, close) + 20
  const x = (m: number) => `${((m - from) / (to - from)) * 100}%`
  return (
    <div className="mx-2 mb-2">
      <div className="relative h-8">
        <div className="absolute top-2.5 h-3 rounded bg-emerald-100" style={{ left: x(open), width: `calc(${x(close)} - ${x(open)})` }} />
        <div className="absolute top-[15px] h-0.5 bg-slate-300" style={{ left: x(depart), width: `calc(${x(back)} - ${x(depart)})` }} />
        {[{ m: depart, c: '#0f172a' }, { m: eta, c: eta > close ? '#dc2626' : '#7c3aed' }, { m: back, c: '#94a3b8' }].map((p, i) => (
          <span key={i} className="absolute top-[10px] w-3 h-3 -ml-1.5 rounded-full border-2 border-white shadow" style={{ left: x(p.m), background: p.c }} />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-slate-400"><span>leave {clock(depart)}</span><span className="text-emerald-700">window {clock(open)}–{clock(close)}</span><span>back {clock(back)}</span></div>
    </div>
  )
}
