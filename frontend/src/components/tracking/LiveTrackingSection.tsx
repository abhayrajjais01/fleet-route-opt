// ─── LIVE TRACKING (US-008 telemetry view & In-Transit FSM) ───────────────────
// Map-first: the map fills the page, a floating trip list sits on the left, a playback bar (play/pause,
// draggable time slider, speed) sits at the bottom, and a tabbed drawer opens only for the selected trip.
// Positions, ETAs and SLA risk are derived from the clock + reported events (see simulation.ts), so dragging
// the slider or reporting a delay instantly re-plays the day.
// Integrates Track A's VRPTW solver stop sequencing with Track B's In-Transit FSM lifecycle.
import React, { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, ShipmentStatus, UserRole, Vehicle } from '../../lib/types'
import { clock, estimateLeg, legsAlong, toMinutes, type LatLng } from '../../lib/geo'
import { optimizeRoutes } from '../../lib/routesApi'
import { emptyEvents, feedFor, viewAt, type FeedItem, type StopView, type TripEvents, type TripPlan, type TripState, type TripView } from './simulation'
import TrackingMap, { type MapInsets, STOP_COLOR } from './TrackingMap'
import { FsmProgressBar } from './FsmProgressBar'
import {
  arriveAtStop,
  deliverShipment,
  failDelivery,
  reportDelay as apiReportDelay,
  type TransitFailureReason,
} from '../../lib/transitApi'

const TRIP_COLORS = ['#7c3aed', '#0891b2', '#ea580c', '#db2777', '#16a34a']
const DEFAULT_DEPART = '08:30'
const DAY_START = 6 * 60, DAY_END = 21 * 60
const RATES = [
  { label: '1×', perSecond: 1 / 60 },  // sim minutes per real second
  { label: '30×', perSecond: 0.5 },
  { label: '120×', perSecond: 2 },
  { label: '600×', perSecond: 10 },
]

const TRIP_STATE: Record<TripState, { label: string; color: string }> = {
  SCHEDULED: { label: 'Scheduled', color: '#64748b' },
  IN_TRANSIT: { label: 'On the road', color: '#2563eb' },
  RETURNING: { label: 'Returning', color: '#7c3aed' },
  COMPLETED: { label: 'Completed', color: '#16a34a' },
  ROUTE_BLOCKED: { label: 'Blocked', color: '#dc2626' },
}
const STOP_LABEL: Record<string, string> = { PENDING: 'Upcoming', NEXT: 'Heading here', ARRIVED: 'On site', DELIVERED: 'Delivered', FAILED: 'Failed', BLOCKED: 'Needs re-route' }

/** Greedy nearest-neighbour order: offline fallback when the VRPTW optimizer API is unreachable. */
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

const fmtDur = (min: number) => { const m = Math.max(0, Math.round(min)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min` }

export interface LiveTrackingSectionProps {
  hubs: Hub[]
  vehicles: Vehicle[]
  drivers: Driver[]
  shipments: Shipment[]
  activeRole: UserRole
  driverId: number
  active?: boolean
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenPlanner?: () => void
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
  active = true,
  addAudit,
  onOpenPlanner,
  authToken,
  setShipments,
}: LiveTrackingSectionProps) {
  const [plans, setPlans] = useState<TripPlan[]>([])
  const [events, setEvents] = useState<Record<string, TripEvents>>({})
  const [simMin, setSimMin] = useState(toMinutes('08:20'))
  const [playing, setPlaying] = useState(true)
  const [rate, setRate] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Driver modal state
  const [deliverModal, setDeliverModal] = useState<StopView | null>(null)
  const [recipientInput, setRecipientInput] = useState('')
  const [failModal, setFailModal] = useState<StopView | null>(null)
  const [failReason, setFailReason] = useState<TransitFailureReason>('CONSIGNEE_UNAVAILABLE')
  const [failNotes, setFailNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
    Promise.all(tripInputs.map(async (input): Promise<TripPlan> => {
      let t = input
      const departure = t.stops.map(s => s.dispatch_time ?? DEFAULT_DEPART).sort()[0]
      // Sequence stops with the VRPTW solver (time windows, capacity); fall back to nearest-neighbour offline.
      try {
        const res = await optimizeRoutes(
          { id: `hub-${t.hub.id}`, latitude: t.hub.latitude, longitude: t.hub.longitude },
          t.stops.map(s => ({ id: String(s.id), latitude: s.latitude!, longitude: s.longitude!, weight_kg: s.weight_kg, volume_m3: s.volume_m3, window_start: s.time_window_start, window_end: s.time_window_end })),
          [{ id: String(t.vehicle.id), capacity_kg: t.vehicle.max_payload_kg, capacity_m3: t.vehicle.max_volume_m3, vehicle_type: t.vehicle.vehicle_type, max_shift_hours: Math.min(14, t.driver?.max_driving_hours_per_day ?? 10) }],
          departure,
        )
        const order = res.routes[0]?.stop_ids ?? []
        const rank = (s: Shipment) => { const i = order.indexOf(String(s.id)); return i < 0 ? order.length + 1 : i }
        t = { ...t, stops: [...t.stops].sort((a, b) => rank(a) - rank(b)) }
      } catch { /* keep nearest-neighbour order */ }
      const pts: LatLng[] = [[t.hub.latitude, t.hub.longitude], ...t.stops.map(s => [s.latitude!, s.longitude!] as LatLng), [t.hub.latitude, t.hub.longitude]]
      const { legs, source } = await legsAlong(pts, t.vehicle.vehicle_type)
      const depart = Math.min(...t.stops.map(s => toMinutes(s.dispatch_time ?? DEFAULT_DEPART)))
      return { id: `trip-${t.vehicle.id}`, vehicle: t.vehicle, driver: t.driver, hub: t.hub, stops: t.stops, legs, departMin: depart, legSource: source }
    })).then(p => { if (!cancelled) setPlans(p) })
    return () => { cancelled = true }
  }, [inputsKey])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setSimMin(m => {
      const next = m + RATES[rate].perSecond * 0.25
      if (next >= DAY_END) { setPlaying(false); return DAY_END }
      return next
    }), 250)
    return () => clearInterval(id)
  }, [playing, rate])

  // Space toggles play/pause while this page is visible (ignored while typing in a field).
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, select, button')) return
      e.preventDefault()
      setPlaying(p => !p)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  const views: TripView[] = plans.map(p => viewAt(p, events[p.id] ?? emptyEvents(), simMin))
  const colors = Object.fromEntries(plans.map((p, i) => [p.id, TRIP_COLORS[i % TRIP_COLORS.length]]))
  const isDriver = activeRole === 'DRIVER'
  const myTrip = views.find(v => v.plan.driver?.id === driverId) ?? null

  // Drivers see only their vehicle; dispatchers see every dispatched vehicle.
  const visible = isDriver ? (myTrip ? [myTrip] : []) : views
  const selected = visible.find(v => v.plan.id === (isDriver ? myTrip?.plan.id : selectedId)) ?? null

  function updateEvents(trip: TripView, fn: (e: TripEvents) => TripEvents) {
    setEvents(prev => ({ ...prev, [trip.plan.id]: fn(prev[trip.plan.id] ?? emptyEvents()) }))
  }

  const actor = isDriver ? myTrip?.plan.driver?.full_name ?? 'Driver' : 'Dispatcher'

  const actions = {
    async delay(trip: TripView, minutes: number, reason: string) {
      if (authToken && trip.nextStop) {
        try {
          await apiReportDelay(trip.nextStop.shipment.id, minutes, reason, authToken)
        } catch (err: any) {
          setActionError(err.message || 'Server rejected transit delay.')
          return
        }
      }
      setActionError(null)
      updateEvents(trip, e => ({ ...e, delays: [...e.delays, { at: simMin, minutes, reason }] }))
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'ROUTE', entity_id: trip.plan.vehicle.id, details: `${trip.plan.vehicle.plate_number} delayed +${minutes} min (${reason}) at ${clock(simMin)}; downstream ETAs recalculated` })
    },
    async arrive(trip: TripView) {
      const s = trip.nextStop
      if (!s) return
      if (authToken) {
        try {
          await arriveAtStop(s.shipment.id, s.shipment.latitude, s.shipment.longitude, 'Driver checked in', authToken)
        } catch (err: any) {
          setActionError(err.message || 'Arrival check-in rejected by server.')
          return
        }
      }
      setActionError(null)
      if (setShipments) {
        setShipments(prev => prev.map(sh => sh.id === s.shipment.id ? { ...sh, status: 'ARRIVED' } : sh))
      }
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'SHIPMENT', entity_id: s.shipment.id, details: `${s.shipment.tracking_number} → ARRIVED at ${s.shipment.customer_name} (${clock(simMin)})` })
    },
    fail(trip: TripView) {
      const s = trip.nextStop
      if (!s) return
      setActionError(null)
      setFailModal(s)
      setFailNotes('')
    },
    deliver(trip: TripView) {
      const s = trip.nextStop
      if (!s) return
      setActionError(null)
      setDeliverModal(s)
      setRecipientInput(s.shipment.customer_name)
    },
    breakdown(trip: TripView) {
      updateEvents(trip, e => ({ ...e, blockedAt: simMin }))
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'ROUTE', entity_id: trip.plan.vehicle.id, details: `${trip.plan.vehicle.plate_number} breakdown → ROUTE_BLOCKED at ${clock(simMin)}; ${trip.stops.filter(s => s.state === 'BLOCKED' || s.state === 'NEXT' || s.state === 'PENDING').length} stops need another vehicle` })
    },
  }

  async function handleConfirmDelivery() {
    if (!deliverModal) return
    const s = deliverModal
    setActionLoading(true)
    setActionError(null)
    const recipient = recipientInput.trim() || s.shipment.customer_name

    if (authToken) {
      try {
        await deliverShipment(s.shipment.id, recipient, 'SIG-VERIFIED', 'Handed over to consignee', authToken)
      } catch (err: any) {
        setActionError(err.message || 'Delivery confirmation rejected by server.')
        setActionLoading(false)
        return
      }
    }

    if (setShipments) {
      setShipments(prev => prev.map(sh => sh.id === s.shipment.id ? { ...sh, status: 'DELIVERED' } : sh))
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
  }

  async function handleConfirmFailure() {
    if (!failModal) return
    const s = failModal
    setActionLoading(true)
    setActionError(null)

    if (authToken) {
      try {
        await failDelivery(s.shipment.id, failReason, failNotes || 'Delivery failed', authToken)
      } catch (err: any) {
        setActionError(err.message || 'Failure reporting rejected by server.')
        setActionLoading(false)
        return
      }
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
  }

  const allStops = visible.flatMap(v => v.stops)
  const delivered = allStops.filter(s => s.state === 'DELIVERED').length
  const atRisk = visible.reduce((n, v) => n + v.atRisk, 0)
  const onTheRoad = visible.filter(v => v.state === 'IN_TRANSIT' || v.state === 'RETURNING').length

  const insets: MapInsets = useMemo(() => ({
    left: !isDriver ? 340 : 20,
    right: selected ? 400 : 20,
    top: 20,
    bottom: 90,
  }), [isDriver, selected])

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
      {/* ── Background map ── */}
      <TrackingMap
        views={visible}
        colors={colors}
        selectedId={selected?.plan.id ?? null}
        hoveredId={hoveredId}
        onSelect={id => setSelectedId(id)}
        focusKey={plans.map(p => p.id).join()}
        insets={insets}
      />

      {/* ── Floating trip list (dispatchers only) ── */}
      {!isDriver && (
        <div className="absolute top-4 left-4 z-20 w-80 max-h-[calc(100%-110px)] flex flex-col rounded-2xl bg-white/95 backdrop-blur shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800">Fleet telemetry</p>
              <p className="text-[11px] text-slate-500">{onTheRoad} on the road · {delivered}/{allStops.length} delivered</p>
            </div>
            {atRisk > 0 && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                {atRisk} at SLA risk
              </span>
            )}
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100">
            {views.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">
                <p>No trips dispatched yet.</p>
                {onOpenPlanner && (
                  <button onClick={onOpenPlanner} className="mt-2 text-xs font-medium text-blue-600 hover:underline">
                    Open Dispatch Planner
                  </button>
                )}
              </div>
            ) : (
              views.map(v => {
                const isSelected = selected?.plan.id === v.plan.id
                const pct = v.kmTotal ? Math.min(100, Math.round((v.kmDone / v.kmTotal) * 100)) : 0
                return (
                  <button
                    key={v.plan.id}
                    onClick={() => setSelectedId(isSelected ? null : v.plan.id)}
                    onMouseEnter={() => setHoveredId(v.plan.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full text-left p-3 transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[v.plan.id] }} />
                      <span className="font-mono text-xs font-semibold text-slate-900">{v.plan.vehicle.plate_number}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-600 truncate flex-1">{v.plan.driver?.full_name ?? 'Unassigned'}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: TRIP_STATE[v.state].color, background: `${TRIP_STATE[v.state].color}15` }}>
                        {TRIP_STATE[v.state].label}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[v.plan.id] }} />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono tabular-nums">{pct}%</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{v.stops.filter(s => s.state === 'DELIVERED').length}/{v.stops.length} stops</span>
                      {v.nextStop && v.state !== 'ROUTE_BLOCKED' && (
                        <span>Next: {v.nextStop.shipment.customer_name.slice(0, 16)} · {clock(v.nextStop.eta)}</span>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Driver banner if no trip ── */}
      {isDriver && !myTrip && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl bg-white shadow-lg px-6 py-5 text-center pointer-events-auto">
            <p className="text-sm font-medium text-slate-800">No trip assigned to you right now.</p>
            <p className="text-xs text-slate-500 mt-1">When a dispatcher assigns you to a route, your live stops will appear here.</p>
          </div>
        </div>
      )}

      {/* ── Selected trip drawer (right side) ── */}
      {selected && (
        <TripDrawer
          trip={selected}
          color={colors[selected.plan.id]}
          simMin={simMin}
          actions={actions}
          actionError={actionError}
          onClearError={() => setActionError(null)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ── Playback bar (bottom) ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur shadow-xl border border-slate-200/80">
        <button
          onClick={() => setPlaying(p => !p)}
          title="Space to play / pause"
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current translate-x-0.5"><polygon points="6 4 20 12 6 20 6 4" /></svg>
          )}
        </button>

        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums w-12 text-center">
          {clock(simMin)}
        </span>

        <input
          type="range"
          min={DAY_START}
          max={DAY_END}
          value={simMin}
          onChange={e => setSimMin(Number(e.target.value))}
          className="w-48 sm:w-64 accent-blue-600 cursor-pointer"
        />

        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5">
          {RATES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRate(i)}
              className={`px-2 py-0.5 text-xs font-semibold rounded-lg transition-colors ${rate === i ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => { setEvents({}); setSimMin(toMinutes('08:20')) }}
          title="Reset reported events and rewind to 08:20"
          className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          Reset
        </button>
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
              {actionError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  ⚠ {actionError}
                </div>
              )}
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
              {actionError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  ⚠ {actionError}
                </div>
              )}
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

type Actions = {
  delay: (t: TripView, minutes: number, reason: string) => void
  arrive: (t: TripView) => void
  deliver: (t: TripView) => void
  fail: (t: TripView) => void
  breakdown: (t: TripView) => void
}

function TripDrawer({ trip, color, simMin, actions, actionError, onClearError, onClose }: {
  trip: TripView; color: string; simMin: number; actions: Actions; actionError?: string | null; onClearError?: () => void; onClose: () => void
}) {
  const [tab, setTab] = useState<'overview' | 'stops' | 'activity'>('overview')
  const p = trip.plan
  const feed = feedFor(trip, emptyEvents(), simMin)

  return (
    <div className="absolute top-4 right-4 z-20 w-96 max-h-[calc(100%-110px)] flex flex-col rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-slate-200/80 overflow-hidden">
      {/* ── Drawer header ── */}
      <div className="p-4 border-b border-slate-100 flex items-start justify-between" style={{ background: `linear-gradient(135deg, ${color}10, transparent)` }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="font-mono text-sm font-semibold text-slate-900">{p.vehicle.plate_number}</span>
            <span className="text-xs text-slate-500 font-medium">{p.vehicle.name}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Driver: <span className="font-medium text-slate-700">{p.driver?.full_name ?? 'Unassigned'}</span> · Depot: {p.hub.name}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="px-4 border-b border-slate-100 flex gap-4 text-xs">
        {(['overview', 'stops', 'activity'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2.5 font-medium border-b-2 capitalize transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {actionError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex items-center justify-between">
            <span>⚠ {actionError}</span>
            {onClearError && <button onClick={onClearError} className="text-rose-500 hover:text-rose-800 text-xs font-bold">✕</button>}
          </div>
        )}
        {tab === 'overview' && <Overview trip={trip} simMin={simMin} actions={actions} />}
        {tab === 'stops' && (
          <ol className="space-y-4">
            <Row dot={color} title={`Depart from ${p.hub.name}`} time={clock(p.departMin)} sub="Depot origin" />
            {trip.stops.map(s => <StopRow key={s.shipment.id} s={s} />)}
            <Row dot={color} title={`Return to ${p.hub.name}`} time={Number.isFinite(trip.endMin) ? clock(trip.endMin) : '—'} sub="Trip completion" last />
          </ol>
        )}
        {tab === 'activity' && (
          feed.length === 0
            ? <p className="text-sm text-slate-500">Nothing yet. The trip leaves at {clock(p.departMin)}.</p>
            : <ul className="space-y-3">{feed.map((f, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-xs text-slate-400 pt-0.5 w-11 flex-shrink-0">{clock(f.at)}</span>
                <span className={f.kind === 'blocked' || f.kind === 'failed' ? 'text-red-600' : f.kind === 'delay' ? 'text-amber-700' : 'text-slate-700'}>{f.text}</span>
              </li>
            ))}</ul>
        )}
      </div>
    </div>
  )
}

function Overview({ trip, simMin, actions }: { trip: TripView; simMin: number; actions: Actions }) {
  const [menu, setMenu] = useState<null | 'delay' | 'breakdown'>(null)
  const p = trip.plan
  const next = trip.nextStop
  const limit = (p.driver?.max_driving_hours_per_day ?? 10) * 60
  const blocked = trip.state === 'ROUTE_BLOCKED'
  const done = trip.state === 'COMPLETED'
  const started = simMin >= p.departMin

  const currentFsmStatus: ShipmentStatus = next
    ? (next.state === 'ARRIVED' ? 'ARRIVED' : 'IN_TRANSIT')
    : done
    ? 'DELIVERED'
    : 'ASSIGNED'

  return (
    <div className="space-y-4">
      {/* ── FSM Stepper Lifecycle Component ── */}
      <FsmProgressBar
        status={currentFsmStatus}
        delayMinutes={trip.delayMinutes}
        stopSequence={next ? next.index + 1 : undefined}
        timeWindow={next ? `${next.shipment.time_window_start}–${next.shipment.time_window_end}` : undefined}
      />

      {blocked && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Vehicle broke down</p>
          <p className="mt-1">{trip.stops.filter(s => s.state === 'BLOCKED').length} remaining stops need another vehicle.</p>
        </div>
      )}

      {next && !blocked && !done && (
        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">{next.state === 'ARRIVED' ? 'At stop (On site)' : 'Next stop'} · {next.index + 1} of {trip.stops.length}</p>
            <span className="font-mono text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{next.shipment.tracking_number}</span>
          </div>
          <p className="text-base font-semibold text-slate-900">{next.shipment.customer_name}</p>
          <p className="text-xs text-slate-500">{next.shipment.destination_address} · {next.shipment.weight_kg} kg</p>
          <div className="flex items-end justify-between pt-1">
            <div>
              <p className="text-xl font-bold text-slate-900 tabular-nums leading-none">{next.state === 'ARRIVED' ? 'Arrived' : clock(next.eta)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {next.state === 'ARRIVED'
                  ? simMin < toMinutes(next.shipment.time_window_start) ? `waiting for the ${next.shipment.time_window_start} window` : 'ready for handover'
                  : `in ${fmtDur(next.eta - simMin)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">window</p>
              <p className="text-xs font-semibold text-slate-800">{next.shipment.time_window_start}–{next.shipment.time_window_end}</p>
            </div>
          </div>
          {next.late && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 font-medium">Expected {fmtDur(next.lateBy)} after window closes</p>}

          {/* Interactive Driver Action Bar */}
          <div className="pt-2 border-t border-slate-100 flex gap-2">
            {next.state !== 'ARRIVED' && (
              <button
                onClick={() => actions.arrive(trip)}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-xs"
              >
                Mark Arrived 📍
              </button>
            )}
            <button
              onClick={() => actions.deliver(trip)}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
            >
              Confirm Delivery ✓
            </button>
            <button
              onClick={() => actions.fail(trip)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              Fail ✕
            </button>
          </div>
        </div>
      )}
      {done && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 font-medium">Trip completed and back at {p.hub.code}.</div>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Metric label="Speed" value={`${Math.round(trip.speedKmh)} km/h`} />
        <Metric label="Driving today" value={fmtDur(trip.driveMinutes)} hint={`of ${limit / 60}h limit`} warn={trip.driveMinutes > limit * 0.85} />
        <Metric label="Fuel used" value={`${(trip.kmDone / p.vehicle.fuel_efficiency_kpl).toFixed(1)} L`} />
        <Metric label="Delays" value={trip.delayMinutes ? `+${trip.delayMinutes} min` : 'None'} warn={trip.delayMinutes > 0} />
      </div>

      {started && !blocked && !done && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Report en-route disruption</p>
          <div className="grid grid-cols-3 gap-2">
            <IssueButton active={menu === 'delay'} onClick={() => setMenu(m => m === 'delay' ? null : 'delay')} label="Delay" icon="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            <IssueButton disabled={!next} onClick={() => actions.fail(trip)} label="Failed stop" icon="M6 6l12 12M18 6L6 18" />
            <IssueButton active={menu === 'breakdown'} danger onClick={() => setMenu(m => m === 'breakdown' ? null : 'breakdown')} label="Breakdown" icon="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </div>
          {menu === 'delay' && (
            <div className="mt-2 flex gap-2">
              {[{ m: 15, r: 'traffic' }, { m: 30, r: 'road closure' }, { m: 60, r: 'loading issue' }].map(o => (
                <button key={o.m} onClick={() => { actions.delay(trip, o.m, o.r); setMenu(null) }} className="flex-1 rounded-lg border border-amber-200 bg-amber-50 py-2 text-sm text-amber-800 hover:bg-amber-100">+{o.m} min<span className="block text-xs text-amber-600">{o.r}</span></button>
              ))}
            </div>
          )}
          {menu === 'breakdown' && (
            <div className="mt-2 rounded-lg bg-red-50 p-3 flex items-center gap-3">
              <p className="text-sm text-red-700 flex-1">Stop this trip and flag its remaining stops?</p>
              <button onClick={() => { actions.breakdown(trip); setMenu(null) }} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Confirm</button>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-2">Later ETAs update immediately and every report is written to the audit log.</p>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function IssueButton({ label, icon, onClick, active, danger, disabled }: { label: string; icon: string; onClick: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  const tone = active
    ? danger ? 'border-red-300 bg-red-50 text-red-700' : 'border-amber-300 bg-amber-50 text-amber-800'
    : danger ? 'border-slate-200 text-red-600 hover:bg-red-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
  return (
    <button onClick={onClick} disabled={disabled} className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-sm transition-colors disabled:opacity-40 ${tone}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      {label}
    </button>
  )
}

function Row({ dot, title, time, sub, last, children }: { dot: string; title: string; time: string; sub: string; last?: boolean; children?: React.ReactNode }) {
  return (
    <li className="relative pl-7 pb-5">
      {!last && <span className="absolute left-[6px] top-4 bottom-0 w-px bg-slate-200" />}
      <span className="absolute left-0 top-1 w-[13px] h-[13px] rounded-full border-2 border-white shadow" style={{ background: dot }} />
      <div className="flex items-baseline gap-3">
        <p className="text-sm font-medium text-slate-900 flex-1">{title}</p>
        <span className="font-mono text-sm text-slate-500">{time}</span>
      </div>
      <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
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
  return (
    <Row dot={STOP_COLOR[s.state]} title={s.shipment.customer_name} time={Number.isFinite(s.eta) ? clock(s.eta) : '—'} sub={`${STOP_LABEL[s.state]} · window ${s.shipment.time_window_start}–${s.shipment.time_window_end}`}>
      <div className="mt-1 flex items-center justify-between gap-2">
        {s.late && s.state !== 'FAILED' ? (
          <p className={`text-xs ${s.state === 'DELIVERED' ? 'text-red-600' : 'text-amber-700'}`}>
            {s.state === 'DELIVERED' ? `Delivered ${fmtDur(s.lateBy)} late` : `Expected ${fmtDur(s.lateBy)} late`}
          </p>
        ) : <span />}
        <FsmProgressBar compact status={mapStopStateToStatus(s.state)} />
      </div>
    </Row>
  )
}
