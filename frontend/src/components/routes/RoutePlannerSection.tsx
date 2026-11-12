// ─── ROUTE PLANNER (Weeks 7, 8, 9, 11 · Track A) ──────────────────────────────
// Batch planning for one hub:
//   Week 7  optimize the hub's open orders onto its vehicles; colour-coded routes on the map + manifest with
//           capacity bars and ETAs
//   Week 8  drag stops to re-order them (within or across routes); ETAs update instantly from a local estimate,
//           then the server's /routes/evaluate confirms them; late stops and broken constraints get badges;
//           "Approve & dispatch" locks every route
//   Week 9  ask the Optimization Agent "what if" in plain language; its proposal is applied only on approval
//   Week 11 "Explain" shows the SOP-grounded rationale and turn-by-turn driver instructions
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { clock, estimateLeg, toMinutes, type LatLng } from '../../lib/geo'
import {
  optimizeRoutes, routeOpsApi,
  type DisruptionProposal, type RouteEvaluation, type RouteExplanation, type RouteStopIn, type RouteVehicle, type SlaState,
} from '../../lib/routesApi'
import RoutePlanMap, { type PlanMapRoute } from './RoutePlanMap'

const ROUTE_COLORS = ['#7c3aed', '#0891b2', '#ea580c', '#db2777', '#16a34a']
const OPEN_STATUSES = ['UNASSIGNED', 'CLUSTERED']

interface PlanRoute { vehicle: Vehicle; driver: Driver | null; stops: Shipment[]; evaluation: RouteEvaluation | null; confirmed: boolean }
export interface RouteDispatch { vehicleId: number; driverId: number; departure: string; shipmentIds: number[] }

const toStopIn = (s: Shipment): RouteStopIn => ({
  id: String(s.id), name: s.customer_name, address: s.destination_address, priority: s.priority,
  latitude: s.latitude!, longitude: s.longitude!, weight_kg: s.weight_kg, volume_m3: s.volume_m3,
  window_start: s.time_window_start, window_end: s.time_window_end,
})
const toVehicle = (v: Vehicle, driver?: Driver | null): RouteVehicle => ({
  id: String(v.id), label: v.plate_number, capacity_kg: v.max_payload_kg, capacity_m3: v.max_volume_m3, vehicle_type: v.vehicle_type,
  max_shift_hours: Math.min(14, driver?.max_driving_hours_per_day ?? 10),
})

/** Instant client-side estimate (same constants as the backend) so a drag never waits on the network. */
function localEvaluate(hub: Hub, v: Vehicle, driver: Driver | null, stops: Shipment[], departure: string): RouteEvaluation {
  let t = toMinutes(departure), at: LatLng = [hub.latitude, hub.longitude], km = 0
  const out: RouteEvaluation['stops'] = []
  stops.forEach((s, i) => {
    const leg = estimateLeg(at, [s.latitude!, s.longitude!], v.vehicle_type)
    const arrival = t + leg.minutes, open = toMinutes(s.time_window_start), close = toMinutes(s.time_window_end)
    const start = Math.max(arrival, open), late = Math.max(0, arrival - close)
    const sla: SlaState = late > 0 ? 'PREDICTED_BREACH' : close - arrival <= 15 ? 'AT_RISK' : 'ON_TIME'
    out.push({ stop_id: String(s.id), sequence: i + 1, arrival: clock(arrival), service_start: clock(start), departure: clock(start + 10), wait_min: start - arrival,
      leg_km: leg.km, leg_min: leg.minutes, completed: false, sla, minutes_late: late, eta_shift_min: null })
    km += leg.km; t = start + 10; at = [s.latitude!, s.longitude!]
  })
  const back = estimateLeg(at, [hub.latitude, hub.longitude], v.vehicle_type)
  const kg = stops.reduce((a, s) => a + s.weight_kg, 0), m3 = stops.reduce((a, s) => a + s.volume_m3, 0)
  const duration = t + back.minutes - toMinutes(departure), limit = (driver?.max_driving_hours_per_day ?? 10) * 60
  const violations = [
    ...(kg > v.max_payload_kg ? [`Over payload: ${kg} kg on a ${v.max_payload_kg} kg vehicle`] : []),
    ...(m3 > v.max_volume_m3 ? [`Over volume: ${m3.toFixed(1)} m³ on a ${v.max_volume_m3} m³ vehicle`] : []),
    ...out.filter(e => e.minutes_late > 0).map(e => `${e.stop_id} arrives ${Math.round(e.minutes_late)} min after its window closes`),
    ...(duration > limit ? [`Route takes ${Math.round(duration)} min, over the ${limit} min shift limit`] : []),
  ]
  return { route_state: 'ROUTE_PROPOSED', feasible: !violations.length, stops: out, distance_km: km + back.km, duration_min: duration,
    return_time: clock(t + back.minutes), load_kg: kg, load_m3: m3, utilisation: Math.max(kg / v.max_payload_kg, m3 / v.max_volume_m3), violations }
}

const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`)

export default function RoutePlannerSection({ hubs, vehicles, drivers, shipments, onAddShipments, onDispatchRoutes, addAudit, onOpenTracking }: {
  hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]; shipments: Shipment[]
  onAddShipments: (s: Shipment[]) => void
  onDispatchRoutes: (r: RouteDispatch[]) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenTracking: () => void
}) {
  const busiestHub = useMemo(() => {
    const open = (h: Hub) => shipments.filter(s => s.hub_id === h.id && OPEN_STATUSES.includes(s.status)).length
    return [...hubs].sort((a, b) => open(b) - open(a))[0]?.id ?? hubs[0]?.id
  }, []) // initial choice only
  const [hubId, setHubId] = useState<number>(busiestHub)
  const [departure, setDeparture] = useState('08:30')
  const hub = hubs.find(h => h.id === hubId)!
  const candidates = shipments.filter(s => s.hub_id === hubId && OPEN_STATUSES.includes(s.status) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
  const hubVehicles = vehicles.filter(v => v.assigned_hub_id === hubId && v.current_status !== 'MAINTENANCE' && v.current_status !== 'DECOMMISSIONED')
  const [orderIds, setOrderIds] = useState<Set<number>>(new Set())
  const [vehicleIds, setVehicleIds] = useState<Set<number>>(new Set())
  const [plan, setPlan] = useState<PlanRoute[] | null>(null)
  const [unassigned, setUnassigned] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<{ km: number; separate: number; saving: number; ms: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [explainFor, setExplainFor] = useState<number | null>(null)
  const [dispatched, setDispatched] = useState(false)

  // Reset selections when the hub changes: all open orders, all free vehicles.
  useEffect(() => {
    setOrderIds(new Set(candidates.map(s => s.id)))
    setVehicleIds(new Set(hubVehicles.filter(v => v.current_status === 'AVAILABLE').map(v => v.id)))
    setPlan(null); setUnassigned({}); setStats(null); setError(null); setDispatched(false)
  }, [hubId])
  // Newly added sample orders join the selection.
  const candidateKey = candidates.map(s => s.id).join()
  useEffect(() => { setOrderIds(prev => new Set([...prev, ...candidates.filter(s => !plan?.some(r => r.stops.includes(s))).map(s => s.id)])) }, [candidateKey])

  const hubPoint = { id: `hub-${hub.id}`, latitude: hub.latitude, longitude: hub.longitude }
  const freeDrivers = drivers.filter(d => d.assigned_hub_id === hubId && d.status === 'ON_DUTY' && d.current_vehicle_id == null).sort((a, b) => b.rating - a.rating)

  async function evaluateRoute(r: PlanRoute): Promise<PlanRoute> {
    if (!r.stops.length) return { ...r, evaluation: null, confirmed: true }
    try {
      const ev = await routeOpsApi.evaluate(hubPoint, toVehicle(r.vehicle, r.driver), r.stops.map(toStopIn), departure)
      return { ...r, evaluation: ev, confirmed: true }
    } catch {
      return { ...r, evaluation: localEvaluate(hub, r.vehicle, r.driver, r.stops, departure), confirmed: false }
    }
  }

  async function optimize() {
    const orders = candidates.filter(s => orderIds.has(s.id))
    const fleet = hubVehicles.filter(v => vehicleIds.has(v.id))
    if (!orders.length || !fleet.length) return
    setBusy(true); setError(null); setDispatched(false)
    try {
      const res = await optimizeRoutes(hubPoint, orders.map(toStopIn), fleet.map(v => toVehicle(v, null)), departure)
      const byId = new Map(orders.map(s => [String(s.id), s]))
      const pool = [...freeDrivers]
      const routes: PlanRoute[] = res.routes.map(r => {
        const vehicle = fleet.find(v => String(v.id) === r.vehicle_id)!
        const driver = drivers.find(d => d.current_vehicle_id === vehicle.id && d.status === 'ON_DUTY') ?? pool.shift() ?? null
        return { vehicle, driver, stops: r.stop_ids.map(id => byId.get(id)!), evaluation: null, confirmed: false }
      })
      setPlan(await Promise.all(routes.map(evaluateRoute)))
      setUnassigned(res.unassigned)
      setStats({ km: res.total_distance_km, separate: res.separate_trips_km, saving: res.saving_pct, ms: res.compute_ms })
      addAudit({ actor_name: 'Dispatcher', action_type: 'ROUTE_MODIFIED', entity_type: 'HUB', entity_id: hub.id,
        details: `Optimized ${orders.length} orders onto ${res.routes.length} route(s) at ${hub.code}: ${res.total_distance_km} km, ${res.saving_pct}% less than separate trips` })
    } catch (e) {
      setError(e instanceof TypeError ? 'The route optimizer is offline. Start the backend and try again.' : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // ── Week 8: drag-and-drop resequencing ──
  const drag = useRef<{ route: number; index: number } | null>(null)
  async function move(from: { route: number; index: number }, to: { route: number; index: number }) {
    if (!plan) return
    const next = plan.map(r => ({ ...r, stops: [...r.stops] }))
    const [s] = next[from.route].stops.splice(from.index, 1)
    const target = from.route === to.route && to.index > from.index ? to.index - 1 : to.index
    next[to.route].stops.splice(target, 0, s)
    const touched = new Set([from.route, to.route])
    // Instant local estimate first, then the server's evaluation replaces it.
    const local = next.map((r, i) => (touched.has(i) ? { ...r, evaluation: r.stops.length ? localEvaluate(hub, r.vehicle, r.driver, r.stops, departure) : null, confirmed: false } : r))
    setPlan(local)
    const confirmed = await Promise.all(local.map((r, i) => (touched.has(i) ? evaluateRoute(r) : Promise.resolve(r))))
    setPlan(confirmed)
    addAudit({ actor_name: 'Dispatcher', action_type: 'ROUTE_MODIFIED', entity_type: 'SHIPMENT', entity_id: s.id,
      details: `${s.tracking_number} moved to stop ${target + 1} on ${next[to.route].vehicle.plate_number} (manual resequence)` })
  }

  function approveAll() {
    if (!plan) return
    const routes = plan.filter(r => r.stops.length && r.driver)
    onDispatchRoutes(routes.map(r => ({ vehicleId: r.vehicle.id, driverId: r.driver!.id, departure, shipmentIds: r.stops.map(s => s.id) })))
    routes.forEach(r => addAudit({ actor_name: 'Dispatcher', action_type: 'DISPATCH_APPROVED', entity_type: 'VEHICLE', entity_id: r.vehicle.id,
      details: `${r.vehicle.plate_number} dispatched with ${r.driver!.full_name} at ${departure}: ${r.stops.map(s => s.tracking_number).join(' → ')}` }))
    setDispatched(true)
  }

  // ── Week 9: optimization agent ──
  const [agentText, setAgentText] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [proposal, setProposal] = useState<DisruptionProposal | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  async function askAgent(message: string) {
    if (!plan || !message.trim()) return
    setAgentBusy(true); setAgentError(null)
    const routed = plan.filter(r => r.stops.length)
    const spares = hubVehicles.filter(v => v.current_status === 'AVAILABLE' && !routed.some(r => r.vehicle.id === v.id))
    try {
      const p = await routeOpsApi.disruption(message, hubPoint,
        routed.map(r => ({ vehicle: toVehicle(r.vehicle, r.driver), stops: r.stops.map(toStopIn), departure })),
        spares.map(v => toVehicle(v)), departure)
      setProposal(p)
    } catch (e) {
      setAgentError(e instanceof TypeError ? 'The optimization agent is offline.' : (e as Error).message)
    } finally {
      setAgentBusy(false)
    }
  }
  async function applyProposal(p: DisruptionProposal) {
    if (!plan) return
    const all = new Map(plan.flatMap(r => r.stops).map(s => [String(s.id), s]))
    const findVehicle = (key: string) => hubVehicles.find(v => v.plate_number === key || String(v.id) === key)
    const next: PlanRoute[] = plan.map(r => ({ ...r, stops: [...r.stops] }))
    const pool = freeDrivers.filter(d => !plan.some(r => r.driver?.id === d.id))
    for (const [key, visits] of Object.entries(p.routes_after)) {
      const vehicle = findVehicle(key)
      if (!vehicle) continue
      const stops = visits.map(v => all.get(v.stop_id)).filter((s): s is Shipment => !!s)
      const existing = next.find(r => r.vehicle.id === vehicle.id)
      if (existing) existing.stops = stops
      else next.push({ vehicle, driver: pool.shift() ?? null, stops, evaluation: null, confirmed: false })
    }
    if (p.tool_call.name === 'reassign_stops') {
      const broken = findVehicle(String(p.tool_call.arguments.vehicle_id))
      next.forEach(r => { if (r.vehicle.id === broken?.id) r.stops = [] })
    }
    setPlan(await Promise.all(next.map(evaluateRoute)))
    setUnassigned(prev => ({ ...prev, ...p.unassigned }))
    addAudit({ actor_name: 'Dispatcher', action_type: 'COPILOT_OVERRIDE', entity_type: 'HUB', entity_id: hub.id,
      details: `Approved agent proposal ${p.proposal_id} (${p.tool_call.name}): ${p.summary}` })
    setProposal(null); setAgentText('')
  }

  function addSamples() {
    const rng = (n: number) => Math.random() * n
    const windows = [['08:30', '11:00'], ['09:00', '12:00'], ['10:00', '13:00'], ['11:00', '15:00'], ['12:00', '17:00']]
    const names = ['Croma', 'Decathlon', 'Big Basket', 'Asian Paints', 'Zepto', 'Blinkit', 'Lenskart', 'Pepperfry']
    const base = Date.now()
    onAddShipments(names.map((n, i) => {
      const [ws, we] = windows[i % windows.length]
      return { id: base + i, tracking_number: `SMP-${String(base + i).slice(-5)}`, customer_name: `${n} (sample)`, destination_address: `Sample stop near ${hub.name}`,
        weight_kg: 80 + Math.round(rng(320)), volume_m3: Math.round((0.4 + rng(2.4)) * 10) / 10, time_window_start: ws, time_window_end: we,
        priority: (['STANDARD', 'STANDARD', 'HIGH', 'LOW', 'EXPRESS'] as const)[i % 5], status: 'UNASSIGNED', hub_id: hub.id,
        latitude: hub.latitude + (rng(0.12) - 0.06), longitude: hub.longitude + (rng(0.12) - 0.06) }
    }))
  }

  const routesForMap: PlanMapRoute[] = (plan ?? []).filter(r => r.stops.length).map((r, i) => ({
    id: String(r.vehicle.id), label: r.vehicle.plate_number, color: ROUTE_COLORS[i % ROUTE_COLORS.length],
    stops: r.stops.map((s, j) => ({ id: String(s.id), name: s.customer_name, lat: s.latitude!, lon: s.longitude!, window: `${s.time_window_start}–${s.time_window_end}`,
      eta: r.evaluation?.stops[j]?.arrival, late: (r.evaluation?.stops[j]?.minutes_late ?? 0) > 0 })),
  }))
  const planned = new Set((plan ?? []).flatMap(r => r.stops.map(s => s.id)))
  const pendingForMap = candidates.filter(s => orderIds.has(s.id) && !planned.has(s.id))
    .map(s => ({ id: String(s.id), name: s.customer_name, lat: s.latitude!, lon: s.longitude!, window: `${s.time_window_start}–${s.time_window_end}` }))
  const blockers = (plan ?? []).filter(r => r.stops.length).flatMap(r => [
    ...(!r.driver ? [`${r.vehicle.plate_number} has no driver on duty`] : []),
    ...(r.evaluation?.violations.filter(v => !v.includes('after its window')) ?? []).map(v => `${r.vehicle.plate_number}: ${v}`),
  ])
  const lateCount = (plan ?? []).reduce((n, r) => n + (r.evaluation?.stops.filter(e => e.minutes_late > 0).length ?? 0), 0)
  const explainRoute = explainFor !== null && plan ? plan[explainFor] : null

  return (
    <div className="relative h-full overflow-hidden bg-slate-100">
      <RoutePlanMap hub={{ code: hub.code, lat: hub.latitude, lon: hub.longitude }} routes={routesForMap} pending={pendingForMap} focusId={focusId}
        padding={{ left: 336, right: plan ? 436 : 0 }} />

      {/* ── Setup panel ── */}
      <div className="absolute top-4 left-4 bottom-4 w-[320px] rounded-2xl bg-white/95 backdrop-blur shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {hubs.map(h => (
              <button key={h.id} onClick={() => setHubId(h.id)} className={`px-3 py-1.5 rounded-full text-sm ${hubId === h.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {h.name.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between text-sm text-slate-600" htmlFor="plan-departure">
            Vehicles leave at
            <input id="plan-departure" type="time" value={departure} onChange={e => { setDeparture(e.target.value); setPlan(null) }}
              className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-medium text-slate-900" />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <section>
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-xs font-semibold text-slate-500">Open orders · {candidates.length}</p>
              <button onClick={addSamples} className="text-xs font-medium text-violet-700 hover:text-violet-900">+ Add sample orders</button>
            </div>
            {candidates.length === 0 && <p className="px-1 text-sm text-slate-500">No open orders at this hub. Add sample orders to try the planner.</p>}
            {candidates.map(s => (
              <label key={s.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-violet-600" checked={orderIds.has(s.id)}
                  onChange={e => setOrderIds(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-900 truncate">{s.customer_name}</span>
                  <span className="block text-xs text-slate-500">{s.weight_kg} kg · {s.time_window_start}–{s.time_window_end}{s.priority === 'EXPRESS' || s.priority === 'HIGH' ? ` · ${s.priority.toLowerCase()}` : ''}</span>
                </span>
              </label>
            ))}
          </section>
          <section>
            <p className="text-xs font-semibold text-slate-500 px-1 mb-1">Vehicles · {hubVehicles.length}</p>
            {hubVehicles.map(v => (
              <label key={v.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-violet-600" checked={vehicleIds.has(v.id)}
                  onChange={e => setVehicleIds(prev => { const n = new Set(prev); e.target.checked ? n.add(v.id) : n.delete(v.id); return n })} />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-900">{v.name}</span>
                  <span className="block text-xs text-slate-500">{v.plate_number} · {v.max_payload_kg} kg{v.current_status === 'IN_TRANSIT' ? ' · on a trip (plans its next run)' : ''}</span>
                </span>
              </label>
            ))}
          </section>
        </div>
        <div className="p-4 border-t border-slate-100">
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <button onClick={optimize} disabled={busy || !orderIds.size || !vehicleIds.size}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400">
            {busy ? 'Optimizing…' : plan ? 'Re-optimize' : `Optimize ${orderIds.size} order${orderIds.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* ── Manifest ── */}
      {plan && (
        <div className="absolute top-4 right-4 bottom-4 w-[420px] rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 flex flex-col overflow-hidden">
          {stats && (
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 grid grid-cols-3 gap-2">
              <div><p className="text-xl font-semibold text-slate-900 tabular-nums">{plan.filter(r => r.stops.length).length}</p><p className="text-xs text-slate-500">routes</p></div>
              <div><p className="text-xl font-semibold text-slate-900 tabular-nums">{plan.reduce((a, r) => a + (r.evaluation?.distance_km ?? 0), 0).toFixed(0)} km</p><p className="text-xs text-slate-500">vs {stats.separate.toFixed(0)} km separately</p></div>
              <div><p className={`text-xl font-semibold tabular-nums ${lateCount ? 'text-amber-600' : 'text-emerald-600'}`}>{lateCount}</p><p className="text-xs text-slate-500">late stops</p></div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {Object.keys(unassigned).length > 0 && (
              <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">{Object.keys(unassigned).length} order(s) could not be planned</p>
                {Object.entries(unassigned).map(([id, why]) => <p key={id} className="text-xs mt-0.5">{shipments.find(s => String(s.id) === id)?.customer_name ?? id}: {why}</p>)}
              </div>
            )}
            {plan.map((r, ri) => (r.stops.length === 0 ? null : (
              <div key={r.vehicle.id} onMouseEnter={() => setFocusId(String(r.vehicle.id))} onMouseLeave={() => setFocusId(null)}
                className="rounded-xl border border-slate-200 overflow-hidden"
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (drag.current) move(drag.current, { route: ri, index: r.stops.length }); drag.current = null }}>
                <div className="px-3 pt-3 pb-2" style={{ borderTop: `3px solid ${ROUTE_COLORS[plan.filter((x, k) => k < ri && x.stops.length).length % ROUTE_COLORS.length]}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{r.vehicle.plate_number}</span>
                    <span className="text-xs text-slate-500 truncate">{r.driver ? r.driver.full_name : 'No driver on duty'}</span>
                    {!r.confirmed && <span className="ml-auto text-[11px] text-slate-400">estimating…</span>}
                  </div>
                  {r.evaluation && (
                    <>
                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.evaluation.utilisation * 100)}%`, background: r.evaluation.utilisation > 1 ? '#dc2626' : '#7c3aed' }} /></div>
                        <span className="tabular-nums">{Math.round(r.evaluation.utilisation * 100)}% full</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{r.evaluation.distance_km.toFixed(1)} km · {fmtDur(r.evaluation.duration_min)} · back {r.evaluation.return_time}</p>
                    </>
                  )}
                </div>
                <ol>
                  {r.stops.map((s, si) => {
                    const e = r.evaluation?.stops[si]
                    return (
                      <li key={s.id} draggable={!dispatched}
                        onDragStart={() => { drag.current = { route: ri, index: si } }}
                        onDragOver={ev => ev.preventDefault()}
                        onDrop={ev => { ev.stopPropagation(); if (drag.current) move(drag.current, { route: ri, index: si }); drag.current = null }}
                        className={`flex items-center gap-3 px-3 py-2 border-t border-slate-100 ${dispatched ? '' : 'cursor-grab active:cursor-grabbing hover:bg-slate-50'}`}>
                        <span className="text-slate-300 text-xs select-none" aria-hidden>⋮⋮</span>
                        <span className="w-5 text-xs font-semibold text-slate-500 tabular-nums">{si + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 truncate">{s.customer_name}</p>
                          <p className="text-xs text-slate-500">window {s.time_window_start}–{s.time_window_end}{e && e.wait_min >= 10 ? ` · waits ${Math.round(e.wait_min)} min` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium tabular-nums ${e && e.minutes_late > 0 ? 'text-red-600' : 'text-slate-900'}`}>{e?.arrival ?? '—'}</p>
                          {e && e.minutes_late > 0 && <p className="text-[11px] font-medium text-red-600">{Math.round(e.minutes_late)} min late</p>}
                          {e && e.sla === 'AT_RISK' && <p className="text-[11px] font-medium text-amber-600">tight</p>}
                        </div>
                        {!dispatched && (
                          <span className="flex flex-col">
                            <button aria-label="Move up" disabled={si === 0} onClick={() => move({ route: ri, index: si }, { route: ri, index: si - 1 })} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none">▲</button>
                            <button aria-label="Move down" disabled={si === r.stops.length - 1} onClick={() => move({ route: ri, index: si }, { route: ri, index: si + 2 })} className="text-slate-400 hover:text-slate-700 disabled:opacity-20 text-xs leading-none">▼</button>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
                {r.evaluation && r.evaluation.violations.filter(v => !v.includes('after its window')).map(v => (
                  <p key={v} className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border-t border-red-100">{v}</p>
                ))}
                <div className="flex gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50/60">
                  <button onClick={() => setExplainFor(ri)} className="text-xs font-medium text-violet-700 hover:text-violet-900">Explain route</button>
                  {!dispatched && <button onClick={() => askAgent(`${r.vehicle.plate_number} broke down`)} className="text-xs font-medium text-slate-500 hover:text-slate-800 ml-auto">What if it breaks down?</button>}
                </div>
              </div>
            )))}
            <p className="px-1 text-xs text-slate-400">Drag stops to re-order them, including onto another vehicle. ETAs update instantly{stats ? ` · solved in ${stats.ms.toFixed(1)} ms` : ''}.</p>
          </div>

          {/* Agent box */}
          {!dispatched && (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Ask the optimization agent</p>
              <form className="flex gap-2" onSubmit={e => { e.preventDefault(); askAgent(agentText) }}>
                <input id="agent-message" value={agentText} onChange={e => setAgentText(e.target.value)} placeholder={`e.g. ${plan.find(r => r.stops.length)?.vehicle.plate_number ?? 'MH-43-BX-3310'} delayed 40 min`}
                  className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-violet-200" />
                <button disabled={agentBusy || !agentText.trim()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:bg-slate-200">{agentBusy ? '…' : 'Ask'}</button>
              </form>
              {agentError && <p className="text-xs text-red-600 mt-1.5">{agentError}</p>}
            </div>
          )}

          <div className="border-t border-slate-100 px-4 py-3">
            {dispatched ? (
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">✓</span>
                <p className="flex-1 text-sm font-medium text-slate-900">Routes dispatched</p>
                <button onClick={onOpenTracking} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-700">Track them</button>
              </div>
            ) : (
              <>
                {blockers.length > 0 && <p className="text-xs text-red-600 mb-2">{blockers[0]}{blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ''}</p>}
                <button onClick={approveAll} disabled={blockers.length > 0}
                  className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400">
                  Approve & dispatch {plan.filter(r => r.stops.length).length} route{plan.filter(r => r.stops.length).length === 1 ? '' : 's'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {proposal && <ProposalModal p={proposal} onApprove={() => applyProposal(proposal)} onDecline={() => {
        addAudit({ actor_name: 'Dispatcher', action_type: 'COPILOT_OVERRIDE', entity_type: 'HUB', entity_id: hub.id, details: `Declined agent proposal ${proposal.proposal_id} (${proposal.tool_call.name})` })
        setProposal(null)
      }} />}
      {explainRoute && <ExplainModal hubName={hub.name} hubPoint={hubPoint} route={explainRoute} departure={departure} onClose={() => setExplainFor(null)} />}
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-xl max-h-[85vh] rounded-2xl bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="flex-1"><p className="text-base font-semibold text-slate-900">{title}</p>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  )
}

function ProposalModal({ p, onApprove, onDecline }: { p: DisruptionProposal; onApprove: () => void; onDecline: () => void }) {
  return (
    <Modal title="Re-route proposal" subtitle={`Planned by ${p.planner === 'deterministic' ? 'the deterministic agent' : p.planner} · needs your approval`} onClose={onDecline}
      footer={<><button onClick={onDecline} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Decline</button>
        <button onClick={onApprove} className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700">Approve re-route</button></>}>
      <p className="text-sm text-slate-800">{p.summary}</p>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{p.tool_call.name}({JSON.stringify(p.tool_call.arguments)})</div>
      {p.changes.length > 0 && (
        <table className="w-full mt-4 text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-medium">Stop</th><th className="font-medium">Vehicle</th><th className="font-medium text-right">ETA</th></tr></thead>
          <tbody>
            {p.changes.map(c => (
              <tr key={c.stop_id} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-900">{c.name}</td>
                <td className="text-slate-600">{c.from_vehicle === c.to_vehicle ? c.from_vehicle : <>{c.from_vehicle} → <span className="font-medium text-slate-900">{c.to_vehicle ?? 'unassigned'}</span></>}</td>
                <td className="text-right tabular-nums text-slate-600">{c.old_eta ?? '—'} → <span className="font-medium text-slate-900">{c.new_eta ?? '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-slate-500">Minutes late across affected routes: {p.late_minutes_before} before → {p.late_minutes_after} after.</p>
      {p.violations.length > 0 && <p className="mt-2 text-xs text-red-600">{p.violations.join(' · ')}</p>}
    </Modal>
  )
}

function ExplainModal({ hubName, hubPoint, route, departure, onClose }: {
  hubName: string; hubPoint: { id: string; latitude: number; longitude: number }; route: PlanRoute; departure: string; onClose: () => void
}) {
  const [ex, setEx] = useState<RouteExplanation | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<'why' | 'driver'>('why')
  useEffect(() => {
    const separate = route.stops.reduce((a, s) => a + 2 * estimateLeg([hubPoint.latitude, hubPoint.longitude], [s.latitude!, s.longitude!]).km, 0)
    routeOpsApi.explain(hubPoint, hubName, toVehicle(route.vehicle, route.driver), route.stops.map(toStopIn), departure, separate)
      .then(setEx).catch(e => setErr(e instanceof TypeError ? 'Explanations need the backend to be running.' : (e as Error).message))
  }, [])
  return (
    <Modal title={`Why this route · ${route.vehicle.plate_number}`} subtitle="Built only from computed ETAs and quoted SOP clauses" onClose={onClose}>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!ex && !err && <p className="text-sm text-slate-500">Explaining…</p>}
      {ex && (
        <>
          <p className="text-sm text-slate-800 leading-relaxed">{ex.summary}</p>
          <div className="flex bg-slate-100 rounded-lg p-0.5 mt-4">
            {([['why', 'Stop by stop'], ['driver', 'Driver instructions']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`flex-1 py-1.5 text-sm font-medium rounded-md ${tab === k ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>{l}</button>
            ))}
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {(tab === 'why' ? ex.stop_reasons.map(r => r.reason) : ex.driver_instructions).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          {ex.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-medium text-slate-500">Policies this plan follows</p>
              {ex.citations.map(c => <p key={c.doc_id + c.section} className="text-xs text-slate-600"><span className="font-mono text-violet-700">{c.doc_id} {c.section}</span> · {c.excerpt}</p>)}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
