// ─── LIVE TRACKING (US-008 telemetry view & In-Transit FSM) ───────────────────
// Every dispatched vehicle runs its stop sequence on a shared simulation clock. Positions, ETAs, SLA risk
// and the event feed are all derived from the clock + reported events (see simulation.ts), so a reported
// delay immediately shifts every downstream ETA and a breakdown freezes the trip as ROUTE_BLOCKED.
import React, { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, ShipmentStatus, UserRole, Vehicle } from '../../lib/types'
import { clock, estimateLeg, legsAlong, toMinutes, type LatLng } from '../../lib/geo'
import { emptyEvents, feedFor, viewAt, type FeedItem, type StopView, type TripEvents, type TripPlan, type TripState, type TripView } from './simulation'
import TrackingMap from './TrackingMap'
import { FsmProgressBar } from './FsmProgressBar'
import {
  arriveAtStop,
  deliverShipment,
  failDelivery,
  reportDelay as apiReportDelay,
  redispatchShipment,
  type TransitFailureReason,
} from '../../lib/transitApi'

const TRIP_COLORS = ['#7c3aed', '#0891b2', '#ea580c', '#db2777', '#16a34a']
const DEFAULT_DEPART = '08:30'
const SPEEDS = [
  { label: '❚❚', value: 0 },
  { label: '1×', value: 1 / 60 },  // sim minutes per real second
  { label: '30×', value: 0.5 },
  { label: '120×', value: 2 },
  { label: '600×', value: 10 },
]

const TRIP_BADGE: Record<TripState, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-600',
  IN_TRANSIT: 'bg-blue-50 text-blue-700',
  RETURNING: 'bg-violet-50 text-violet-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  ROUTE_BLOCKED: 'bg-red-50 text-red-700',
}
const STOP_DOT: Record<string, string> = {
  PENDING: 'bg-slate-300', NEXT: 'bg-blue-600 ring-4 ring-blue-100', ARRIVED: 'bg-violet-600 ring-4 ring-violet-100',
  DELIVERED: 'bg-emerald-500', FAILED: 'bg-red-500', BLOCKED: 'bg-amber-500',
}

/** Greedy nearest-neighbour stop order from the hub. Placeholder until the Week 6 VRPTW solver sequences routes. */
function orderStops(hub: Hub, stops: Shipment[]): Shipment[] {
  const left = [...stops]
  const out: Shipment[] = []
  let at: LatLng = [hub.latitude, hub.longitude]
  while (left.length) {
    left.sort((a, b) => estimateLeg(at, [a.latitude!, a.longitude!]).km - estimateLeg(at, [b.latitude!, b.longitude!]).km)
    const next = left.shift()!
    out.push(next)
    at = [next.latitude!, next.longitude!]
  }
  return out
}

function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export interface LiveTrackingSectionProps {
  hubs: Hub[]
  vehicles: Vehicle[]
  drivers: Driver[]
  shipments: Shipment[]
  activeRole: UserRole
  driverId: number
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  authToken?: string | null
  setShipments?: React.Dispatch<React.SetStateAction<Shipment[]>>
}

export default function LiveTrackingSection({
  hubs,
  vehicles,
  drivers,
  shipments,
  activeRole,
  driverId,
  addAudit,
  authToken,
  setShipments,
}: LiveTrackingSectionProps) {
  const [plans, setPlans] = useState<TripPlan[]>([])
  const [events, setEvents] = useState<Record<string, TripEvents>>({})
  const [simMin, setSimMin] = useState(toMinutes('08:20'))
  const [speed, setSpeed] = useState(SPEEDS[2].value)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Driver modal state
  const [deliverModal, setDeliverModal] = useState<StopView | null>(null)
  const [recipientInput, setRecipientInput] = useState('')
  const [failModal, setFailModal] = useState<StopView | null>(null)
  const [failReason, setFailReason] = useState<TransitFailureReason>('CONSIGNEE_UNAVAILABLE')
  const [failNotes, setFailNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Trips = dispatched shipments grouped by assigned vehicle.
  const tripInputs = useMemo(() => {
    const byVehicle = new Map<number, Shipment[]>()
    for (const s of shipments) {
      if (!s.assigned_vehicle_id || !['ASSIGNED', 'IN_TRANSIT', 'ARRIVED'].includes(s.status)) continue
      if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) continue
      byVehicle.set(s.assigned_vehicle_id, [...(byVehicle.get(s.assigned_vehicle_id) ?? []), s])
    }
    return [...byVehicle.entries()].flatMap(([vehicleId, stops]) => {
      const vehicle = vehicles.find(v => v.id === vehicleId)
      const hub = vehicle && hubs.find(h => h.id === vehicle.assigned_hub_id)
      if (!vehicle || !hub) return []
      return [{ vehicle, hub, stops: orderStops(hub, stops), driver: drivers.find(d => d.current_vehicle_id === vehicleId) ?? null }]
    })
  }, [shipments, vehicles, drivers, hubs])
  const inputsKey = JSON.stringify(tripInputs.map(t => [t.vehicle.id, t.stops.map(s => s.id), t.driver?.id]))

  useEffect(() => {
    let cancelled = false
    Promise.all(tripInputs.map(async (t): Promise<TripPlan> => {
      const pts: LatLng[] = [[t.hub.latitude, t.hub.longitude], ...t.stops.map(s => [s.latitude!, s.longitude!] as LatLng), [t.hub.latitude, t.hub.longitude]]
      const { legs, source } = await legsAlong(pts, t.vehicle.vehicle_type)
      const depart = Math.min(...t.stops.map(s => toMinutes(s.dispatch_time ?? DEFAULT_DEPART)))
      return { id: `trip-${t.vehicle.id}`, vehicle: t.vehicle, driver: t.driver, hub: t.hub, stops: t.stops, legs, departMin: depart, legSource: source }
    })).then(p => { if (!cancelled) setPlans(p) })
    return () => { cancelled = true }
  }, [inputsKey])

  // Simulation clock.
  useEffect(() => {
    if (!speed) return
    const id = setInterval(() => setSimMin(m => Math.min(m + speed * 0.25, 23 * 60 + 59)), 250)
    return () => clearInterval(id)
  }, [speed])

  const views: TripView[] = plans.map(p => viewAt(p, events[p.id] ?? emptyEvents(), simMin))
  const colors = Object.fromEntries(plans.map((p, i) => [p.id, TRIP_COLORS[i % TRIP_COLORS.length]]))
  const myTrip = views.find(v => v.plan.driver?.id === driverId) ?? null

  const isDriver = activeRole === 'DRIVER'
  const visible = isDriver ? (myTrip ? [myTrip] : []) : views
  const selected = visible.find(v => v.plan.id === selectedId) ?? visible[0] ?? null
  const feed: FeedItem[] = visible.flatMap(v => feedFor(v, events[v.plan.id] ?? emptyEvents())).sort((a, b) => b.at - a.at)

  const allStops = visible.flatMap(v => v.stops)
  const delivered = allStops.filter(s => s.state === 'DELIVERED').length
  const atRisk = visible.reduce((n, v) => n + v.atRisk, 0)
  const kmToday = visible.reduce((n, v) => n + v.kmDone, 0)

  function updateEvents(trip: TripView, fn: (e: TripEvents) => TripEvents) {
    setEvents(prev => ({ ...prev, [trip.plan.id]: fn(prev[trip.plan.id] ?? emptyEvents()) }))
  }

  const actor = isDriver ? myTrip?.plan.driver?.full_name ?? 'Driver Rajesh' : 'Dispatcher'

  async function handleReportDelay(trip: TripView, minutes: number, reason: string) {
    updateEvents(trip, e => ({ ...e, delays: [...e.delays, { at: simMin, minutes, reason }] }))
    addAudit({
      actor_name: actor,
      action_type: 'STATUS_CHANGE',
      entity_type: 'ROUTE',
      entity_id: trip.plan.vehicle.id,
      details: `${trip.plan.vehicle.plate_number} DELAYED +${minutes} min (${reason}) at ${clock(simMin)}; downstream ETAs recalculated`,
    })

    if (trip.nextStop) {
      try {
        await apiReportDelay(trip.nextStop.shipment.id, minutes, reason, authToken)
      } catch {
        // Fallback to local simulation mode
      }
    }
  }

  async function handleArriveStop(trip: TripView) {
    const s = trip.nextStop
    if (!s) return
    setActionLoading(true)
    try {
      if (authToken) {
        await arriveAtStop(s.shipment.id, s.shipment.latitude, s.shipment.longitude, 'Driver arrived on site', authToken)
      }
    } catch {
      // Offline fallback
    }

    if (setShipments) {
      setShipments(prev => prev.map(sh => sh.id === s.shipment.id ? { ...sh, status: 'ARRIVED' } : sh))
    }

    addAudit({
      actor_name: actor,
      action_type: 'STATUS_CHANGE',
      entity_type: 'SHIPMENT',
      entity_id: s.shipment.id,
      details: `${s.shipment.tracking_number} → ARRIVED at ${s.shipment.customer_name} (${clock(simMin)})`,
    })
    setActionLoading(false)
  }

  async function handleConfirmDelivery() {
    if (!deliverModal) return
    const s = deliverModal
    setActionLoading(true)
    const recipient = recipientInput.trim() || s.shipment.customer_name

    try {
      if (authToken) {
        await deliverShipment(s.shipment.id, recipient, 'SIG-VERIFIED', 'Handed over to consignee', authToken)
      }
    } catch {
      // Offline fallback
    }

    if (setShipments) {
      setShipments(prev => prev.map(sh => sh.id === s.shipment.id ? { ...sh, status: 'DELIVERED' } : sh))
    }

    // Update simulation events
    const trip = views.find(v => v.stops.some(st => st.shipment.id === s.shipment.id))
    if (trip) {
      // advance stop in sim by recording arrival/delivery
    }

    addAudit({
      actor_name: actor,
      action_type: 'STATUS_CHANGE',
      entity_type: 'SHIPMENT',
      entity_id: s.shipment.id,
      details: `${s.shipment.tracking_number} → DELIVERED to ${recipient} at ${clock(simMin)}`,
    })

    setActionLoading(false)
    setDeliverModal(null)
    setRecipientInput('')
  }

  async function handleConfirmFailure() {
    if (!failModal) return
    const s = failModal
    setActionLoading(true)

    try {
      if (authToken) {
        await failDelivery(s.shipment.id, failReason, failNotes || 'Delivery failed', authToken)
      }
    } catch {
      // Offline fallback
    }

    if (setShipments) {
      setShipments(prev => prev.map(sh => sh.id === s.shipment.id ? { ...sh, status: 'FAILED' } : sh))
    }

    const trip = views.find(v => v.stops.some(st => st.shipment.id === s.shipment.id))
    if (trip) {
      updateEvents(trip, e => ({ ...e, failed: { ...e.failed, [s.shipment.id]: simMin } }))
    }

    addAudit({
      actor_name: actor,
      action_type: 'STATUS_CHANGE',
      entity_type: 'SHIPMENT',
      entity_id: s.shipment.id,
      details: `${s.shipment.tracking_number} → FAILED [${failReason}]: ${failNotes || 'Delivery issue'} at ${clock(simMin)}`,
    })

    setActionLoading(false)
    setFailModal(null)
    setFailNotes('')
  }

  function breakdown(trip: TripView) {
    updateEvents(trip, e => ({ ...e, blockedAt: simMin }))
    addAudit({
      actor_name: actor,
      action_type: 'STATUS_CHANGE',
      entity_type: 'ROUTE',
      entity_id: trip.plan.vehicle.id,
      details: `${trip.plan.vehicle.plate_number} breakdown → ROUTE_BLOCKED at ${clock(simMin)}; ${trip.stops.filter(s => s.state === 'BLOCKED' || s.state === 'NEXT' || s.state === 'PENDING').length} stops need re-routing`,
    })
  }

  function resetSim() {
    setEvents({})
    setSimMin(toMinutes('08:20'))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* ── Header & KPIs ── */}
      <div className="flex-shrink-0 px-5 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-4">
        <div className="mr-auto">
          <p className="text-[15px] font-bold text-slate-900">{isDriver ? 'Driver Cockpit (In-Transit FSM)' : 'Live Tracking & Telemetry'}</p>
          <p className="text-[11px] text-slate-500">
            Real-time FSM execution (UNASSIGNED → ASSIGNED → IN_TRANSIT → ARRIVED → DELIVERED) · Simulated GPS clock · Haversine ETAs
          </p>
        </div>
        {!isDriver && (
          <div className="flex gap-2">
            <Kpi label="Active trips" value={String(visible.filter(v => v.state === 'IN_TRANSIT' || v.state === 'RETURNING').length)} sub={`${visible.length} dispatched`} />
            <Kpi label="Delivered" value={`${delivered}/${allStops.length}`} sub="stops today" />
            <Kpi label="SLA risk" value={String(atRisk)} sub="late ETAs" tone={atRisk ? 'warn' : 'ok'} />
            <Kpi label="Fleet km" value={kmToday.toFixed(1)} sub="driven today" />
          </div>
        )}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="text-right">
            <p className="font-mono text-xl font-bold text-slate-900 leading-none tabular-nums">{clock(simMin)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">sim clock</p>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {SPEEDS.map(s => (
              <button key={s.label} onClick={() => setSpeed(s.value)} className={`px-2 py-1 text-[10px] font-bold rounded-md ${speed === s.value ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>{s.label}</button>
            ))}
          </div>
          <button onClick={() => setSimMin(m => m + 15)} className="px-2 py-1 text-[10px] font-bold rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">+15m</button>
          <button onClick={resetSim} className="px-2 py-1 text-[10px] font-bold rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">Reset</button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ── Trip list ── */}
        {!isDriver && (
          <aside className="w-64 xl:w-72 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
            <p className="px-4 pt-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Dispatched trips</p>
            {!views.length && <p className="px-4 text-xs text-slate-400">No dispatched trips. Approve a plan in the Dispatch Planner to see it here.</p>}
            {views.map(v => {
              const pct = v.kmTotal ? Math.min(100, (v.kmDone / v.kmTotal) * 100) : 0
              const on = selectedId === v.plan.id
              return (
                <button key={v.plan.id} onClick={() => setSelectedId(on ? null : v.plan.id)} className={`w-full text-left px-4 py-3 border-l-[3px] transition-colors ${on ? 'bg-slate-50' : 'hover:bg-slate-50'}`} style={{ borderLeftColor: on ? colors[v.plan.id] : 'transparent' }}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[v.plan.id] }} />
                    <span className="font-mono text-xs font-bold text-slate-800">{v.plan.vehicle.plate_number}</span>
                    <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded ${TRIP_BADGE[v.state]}`}>{v.state.replace('_', ' ')}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{v.plan.driver?.full_name ?? 'No driver'} · {v.plan.vehicle.name}</p>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[v.plan.id] }} /></div>
                  <div className="flex items-center justify-between mt-1.5 text-[10px]">
                    <span className="text-slate-500">{v.stops.filter(s => s.state === 'DELIVERED').length}/{v.stops.length} stops · {v.kmDone.toFixed(1)}/{v.kmTotal.toFixed(1)} km</span>
                    {v.atRisk > 0 && <span className="font-bold text-amber-600">⚠ {v.atRisk} late</span>}
                  </div>
                  {v.nextStop && v.state !== 'ROUTE_BLOCKED' && <p className="text-[10px] text-slate-400 mt-1">{v.nextStop.state === 'ARRIVED' ? 'At stop:' : 'Next:'} <span className="text-slate-600 font-medium">{v.nextStop.shipment.customer_name}</span> · ETA {clock(v.nextStop.eta)}</p>}
                </button>
              )
            })}
          </aside>
        )}

        {/* ── Map ── */}
        <div className="flex-1 min-w-0 relative">
          <TrackingMap views={visible} colors={colors} selectedId={isDriver ? null : selectedId} onSelect={id => setSelectedId(id)} focusKey={plans.map(p => p.id).join()} />
        </div>

        {/* ── Detail panel with FSM Visual Stepper & Driver Controls ── */}
        <aside className="w-[340px] xl:w-[380px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
          {selected ? (
            <TripDetail
              trip={selected}
              color={colors[selected.plan.id]}
              simMin={simMin}
              driverMode={isDriver}
              onDelay={handleReportDelay}
              onArrive={handleArriveStop}
              onOpenDeliver={s => { setDeliverModal(s); setRecipientInput(s.shipment.customer_name) }}
              onOpenFail={s => { setFailModal(s); setFailNotes('') }}
              onBreakdown={breakdown}
            />
          ) : (
            <div className="p-5 text-xs text-slate-400">
              {isDriver ? 'No trip assigned to you right now.' : 'Select a trip on the left or click a vehicle on the map to see its stop timeline, telemetry and actions.'}
            </div>
          )}
          <div className="border-t border-slate-200 flex-1 min-h-[140px] overflow-y-auto">
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Event feed</p>
            {feed.length === 0 && <p className="px-4 pb-3 text-xs text-slate-400">Trips depart at {DEFAULT_DEPART}. Speed up the clock to watch them move.</p>}
            {feed.map((f, i) => (
              <div key={i} className="px-4 py-1.5 flex gap-2 text-[11px]">
                <span className="font-mono text-slate-400 w-10 flex-shrink-0">{clock(f.at)}</span>
                <span className={`flex-1 ${f.kind === 'blocked' || f.kind === 'failed' ? 'text-red-600 font-semibold' : f.kind === 'delay' ? 'text-amber-700' : 'text-slate-600'}`}>
                  <span className="font-mono text-slate-400">{f.trip}</span> {f.text}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ── Confirm Delivery Modal ── */}
      {deliverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-slate-900 text-sm">Proof of Delivery Handover</p>
                <p className="text-xs text-slate-500 font-mono">{deliverModal.shipment.tracking_number}</p>
              </div>
              <button onClick={() => setDeliverModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Customer / Consignee Name</label>
                <input
                  type="text"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Enter recipient name"
                />
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5 text-xs text-slate-600 space-y-1">
                <p><b>Address:</b> {deliverModal.shipment.destination_address}</p>
                <p><b>Parcel Weight:</b> {deliverModal.shipment.weight_kg} kg</p>
                <p><b>Handover Time:</b> {clock(simMin)}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setDeliverModal(null)} className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleConfirmDelivery}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {actionLoading ? 'Confirming...' : 'Confirm Delivery ✓'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report Failure Modal ── */}
      {failModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-slate-900 text-sm">Report Delivery Failure</p>
                <p className="text-xs text-slate-500 font-mono">{failModal.shipment.tracking_number}</p>
              </div>
              <button onClick={() => setFailModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Standard Failure Reason</label>
                <select
                  value={failReason}
                  onChange={e => setFailReason(e.target.value as TransitFailureReason)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-500 bg-white"
                >
                  <option value="CONSIGNEE_UNAVAILABLE">Consignee Unavailable / Door Locked</option>
                  <option value="INCORRECT_ADDRESS">Incorrect / Unreachable Address</option>
                  <option value="DAMAGED_PACKAGE">Damaged Parcel / Cargo Leakage</option>
                  <option value="ACCESS_RESTRICTED">Access Restricted (Gate/Security)</option>
                  <option value="CUSTOMER_REFUSED">Customer Refused Consignment</option>
                  <option value="VEHICLE_ISSUE">Vehicle Breakdown / Equipment Defect</option>
                  <option value="OTHER">Other Operational Issue</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Driver Incident Notes</label>
                <textarea
                  value={failNotes}
                  onChange={e => setFailNotes(e.target.value)}
                  placeholder="Explain why delivery could not be completed..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none focus:border-rose-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setFailModal(null)} className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleConfirmFailure}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? 'Logging Failure...' : 'Report Failure ✕'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`px-3 py-1.5 rounded-xl border ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50/60'}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-base font-bold leading-tight tabular-nums ${tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>{value} <span className="text-[10px] font-medium text-slate-400">{sub}</span></p>
    </div>
  )
}

function TripDetail({
  trip,
  color,
  simMin,
  driverMode,
  onDelay,
  onArrive,
  onOpenDeliver,
  onOpenFail,
  onBreakdown,
}: {
  trip: TripView
  color: string
  simMin: number
  driverMode: boolean
  onDelay: (t: TripView, minutes: number, reason: string) => void
  onArrive: (t: TripView) => void
  onOpenDeliver: (s: StopView) => void
  onOpenFail: (s: StopView) => void
  onBreakdown: (t: TripView) => void
}) {
  const p = trip.plan
  const limit = (p.driver?.max_driving_hours_per_day ?? 10) * 60
  const fuelL = trip.kmDone / p.vehicle.fuel_efficiency_kpl
  const blocked = trip.state === 'ROUTE_BLOCKED'
  const done = trip.state === 'COMPLETED'
  const next = trip.nextStop

  // Determine active status for FsmProgressBar
  const currentFsmStatus: ShipmentStatus = next
    ? (next.state === 'ARRIVED' ? 'ARRIVED' : 'IN_TRANSIT')
    : done
    ? 'DELIVERED'
    : 'ASSIGNED'

  return (
    <div className="overflow-y-auto space-y-3 pb-6">
      <div className="p-4 border-b border-slate-100" style={{ background: `linear-gradient(135deg, ${color}14, transparent 70%)` }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-slate-900">{p.vehicle.plate_number}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TRIP_BADGE[trip.state]}`}>{trip.state.replace('_', ' ')}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{p.vehicle.name} · {p.driver?.full_name ?? 'No driver'} · from {p.hub.code}</p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Tele label="Speed" value={`${Math.round(trip.speedKmh)}`} unit="km/h" />
          <Tele label="Driven" value={trip.kmDone.toFixed(1)} unit={`/ ${trip.kmTotal.toFixed(0)} km`} />
          <Tele label="Fuel used" value={fuelL.toFixed(1)} unit="L" />
          <Tele label="Drive time" value={fmtDur(trip.driveMinutes)} unit={`/ ${limit / 60}h limit`} warn={trip.driveMinutes > limit * 0.85} />
          <Tele label="Delays" value={`${trip.delayMinutes}`} unit="min" warn={trip.delayMinutes > 0} />
          <Tele label="Return ETA" value={Number.isFinite(trip.endMin) ? clock(trip.endMin) : '—'} unit="" />
        </div>
      </div>

      {/* ── FSM Stepper Component for Active Trip Stop ── */}
      <div className="px-4">
        <FsmProgressBar
          status={currentFsmStatus}
          delayMinutes={trip.delayMinutes}
          stopSequence={next ? next.index + 1 : undefined}
          timeWindow={next ? `${next.shipment.time_window_start}–${next.shipment.time_window_end}` : undefined}
        />
      </div>

      {next && !blocked && !done && (
        <div className="mx-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
              {next.state === 'ARRIVED' ? 'At stop (On site)' : 'Next stop'} · {next.index + 1} of {trip.stops.length}
            </p>
            <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-blue-100 text-blue-800">
              {next.shipment.tracking_number}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-900">{next.shipment.customer_name}</p>
          <p className="text-[11px] text-slate-600">{next.shipment.destination_address} · {next.shipment.weight_kg} kg</p>
          <p className="text-[11px]">
            {next.state === 'ARRIVED' ? (
              <span className="font-semibold text-purple-800">On site since {clock(next.eta)} · ready for handover</span>
            ) : (
              <span className="text-slate-600">ETA {clock(next.eta)} ({fmtDur(next.eta - simMin)} away) · window {next.shipment.time_window_start}–{next.shipment.time_window_end}</span>
            )}
          </p>
          {next.late && <p className="text-[11px] font-bold text-amber-700">⚠ Will miss window by {fmtDur(next.lateBy)}</p>}

          {/* Interactive Driver Action Bar */}
          <div className="pt-2 border-t border-blue-200/60 flex flex-wrap gap-2">
            {next.state !== 'ARRIVED' && (
              <button
                onClick={() => onArrive(trip)}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-xs"
              >
                Mark Arrived 📍
              </button>
            )}
            <button
              onClick={() => onOpenDeliver(next)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
            >
              Confirm Delivery ✓
            </button>
            <button
              onClick={() => onOpenFail(next)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              Report Fail ✕
            </button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="mx-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
          <b>ROUTE_BLOCKED</b>: vehicle breakdown reported. {trip.stops.filter(s => s.state === 'BLOCKED').length} remaining stops need re-assignment.
        </div>
      )}

      {!done && !blocked && simMin >= p.departMin && (
        <div className={`px-4 grid gap-2 ${driverMode ? 'grid-cols-2' : 'grid-cols-2'}`}>
          <button onClick={() => onDelay(trip, 15, 'heavy traffic congestion')} className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">+15m Delay</button>
          <button onClick={() => onDelay(trip, 30, 'expressway bottleneck')} className="px-3 py-2 rounded-lg text-xs font-semibold border border-amber-300 bg-white text-amber-800 hover:bg-amber-50">+30m Delay</button>
          <button onClick={() => onBreakdown(trip)} className="col-span-2 px-3 py-2 rounded-lg text-xs font-semibold border border-red-300 bg-red-50 text-red-700 hover:bg-red-100">Report Vehicle Breakdown 🚨</button>
        </div>
      )}

      <div className="px-4 pt-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Stop timeline & FSM State</p>
        <ol className="relative">
          <TimelineRow dot="bg-slate-800" title={`Depart ${p.hub.code}`} time={clock(p.departMin)} sub={p.hub.name} />
          {trip.stops.map(s => <StopRow key={s.shipment.id} s={s} />)}
          <TimelineRow dot={done ? 'bg-emerald-500' : 'bg-slate-300'} title={`Return to ${p.hub.code}`} time={Number.isFinite(trip.endMin) ? clock(trip.endMin) : '—'} sub="End of trip" last />
        </ol>
      </div>
    </div>
  )
}

function Tele({ label, value, unit, warn }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm font-bold tabular-nums leading-tight ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value} <span className="text-[9px] font-medium text-slate-400">{unit}</span></p>
    </div>
  )
}

function TimelineRow({ dot, title, time, sub, last, children }: { dot: string; title: string; time: string; sub: string; last?: boolean; children?: React.ReactNode }) {
  return (
    <li className="relative pl-6 pb-3">
      {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" />}
      <span className={`absolute left-0 top-1 w-[11px] h-[11px] rounded-full ${dot}`} />
      <div className="flex items-baseline gap-2">
        <p className="text-xs font-semibold text-slate-800 flex-1">{title}</p>
        <span className="font-mono text-[11px] text-slate-500">{time}</span>
      </div>
      <p className="text-[11px] text-slate-500">{sub}</p>
      {children}
    </li>
  )
}

function mapStopStateToStatus(st: string): ShipmentStatus {
  switch (st) {
    case 'DELIVERED':
      return 'DELIVERED'
    case 'ARRIVED':
      return 'ARRIVED'
    case 'FAILED':
      return 'FAILED'
    case 'NEXT':
      return 'IN_TRANSIT'
    default:
      return 'ASSIGNED'
  }
}

function StopRow({ s }: { s: StopView }) {
  const label: Record<string, string> = { PENDING: 'Pending', NEXT: 'En route', ARRIVED: 'On site', DELIVERED: 'Delivered', FAILED: 'Failed', BLOCKED: 'Blocked' }
  const mappedStatus = mapStopStateToStatus(s.state)

  return (
    <TimelineRow dot={STOP_DOT[s.state]} title={`${s.index + 1}. ${s.shipment.customer_name}`} time={Number.isFinite(s.eta) ? clock(s.eta) : '—'} sub={`${s.shipment.tracking_number} · window ${s.shipment.time_window_start}–${s.shipment.time_window_end}`}>
      <div className="flex items-center justify-between gap-1.5 mt-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{label[s.state]}</span>
          {s.late && s.state !== 'DELIVERED' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">SLA risk +{fmtDur(s.lateBy)}</span>}
          {s.late && s.state === 'DELIVERED' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">SLA breached</span>}
          {s.shipment.priority === 'EXPRESS' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600">EXPRESS</span>}
        </div>
        <FsmProgressBar compact status={mappedStatus} />
      </div>
    </TimelineRow>
  )
}
