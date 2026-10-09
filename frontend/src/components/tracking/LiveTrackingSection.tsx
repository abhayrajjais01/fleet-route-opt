// ─── LIVE TRACKING (US-008 telemetry view) ────────────────────────────────────
// Map-first: the map fills the page, a floating trip list sits on the left, a playback bar (play/pause,
// draggable time slider, speed) sits at the bottom, and a tabbed drawer opens only for the selected trip.
// Positions, ETAs and SLA risk are derived from the clock + reported events (see simulation.ts), so dragging
// the slider or reporting a delay instantly re-plays the day.
import { useEffect, useMemo, useState } from 'react'
import type { AuditEntry, Driver, Hub, Shipment, UserRole, Vehicle } from '../../lib/types'
import { clock, estimateLeg, legsAlong, toMinutes, type LatLng } from '../../lib/geo'
import { emptyEvents, feedFor, viewAt, type FeedItem, type StopView, type TripEvents, type TripPlan, type TripState, type TripView } from './simulation'
import TrackingMap, { STOP_COLOR } from './TrackingMap'

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

const fmtDur = (min: number) => { const m = Math.max(0, Math.round(min)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min` }

export default function LiveTrackingSection({ hubs, vehicles, drivers, shipments, activeRole, driverId, active, addAudit, onOpenPlanner }: {
  hubs: Hub[]; vehicles: Vehicle[]; drivers: Driver[]; shipments: Shipment[]
  activeRole: UserRole; driverId: number; active: boolean
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onOpenPlanner: () => void
}) {
  const [plans, setPlans] = useState<TripPlan[]>([])
  const [events, setEvents] = useState<Record<string, TripEvents>>({})
  const [simMin, setSimMin] = useState(toMinutes('08:20'))
  const [playing, setPlaying] = useState(true)
  const [rate, setRate] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const tripInputs = useMemo(() => {
    const byVehicle = new Map<number, Shipment[]>()
    for (const s of shipments) {
      if (!s.assigned_vehicle_id || !['ASSIGNED', 'IN_TRANSIT'].includes(s.status)) continue
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
  }, [inputsKey]) // tripInputs is rebuilt on every render; inputsKey captures its content

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
  const visible = isDriver ? (myTrip ? [myTrip] : []) : views
  const selected = isDriver ? myTrip : views.find(v => v.plan.id === selectedId) ?? null

  const feed: FeedItem[] = visible.flatMap(v => feedFor(v, events[v.plan.id] ?? emptyEvents(), simMin)).sort((a, b) => b.at - a.at)
  const allStops = visible.flatMap(v => v.stops)
  const delivered = allStops.filter(s => s.state === 'DELIVERED').length
  const late = visible.reduce((n, v) => n + v.atRisk, 0)
  const onRoad = visible.filter(v => v.state === 'IN_TRANSIT' || v.state === 'RETURNING').length

  const actor = isDriver ? myTrip?.plan.driver?.full_name ?? 'Driver' : 'Dispatcher'
  function updateEvents(trip: TripView, fn: (e: TripEvents) => TripEvents) {
    setEvents(prev => ({ ...prev, [trip.plan.id]: fn(prev[trip.plan.id] ?? emptyEvents()) }))
  }
  const actions = {
    delay(trip: TripView, minutes: number, reason: string) {
      updateEvents(trip, e => ({ ...e, delays: [...e.delays, { at: simMin, minutes, reason }] }))
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'ROUTE', entity_id: trip.plan.vehicle.id, details: `${trip.plan.vehicle.plate_number} delayed +${minutes} min (${reason}) at ${clock(simMin)}; downstream ETAs recalculated` })
    },
    fail(trip: TripView) {
      const s = trip.nextStop
      if (!s) return
      updateEvents(trip, e => ({ ...e, failed: { ...e.failed, [s.shipment.id]: simMin } }))
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'SHIPMENT', entity_id: s.shipment.id, details: `${s.shipment.tracking_number} → FAILED (customer unavailable) at ${clock(simMin)}` })
    },
    breakdown(trip: TripView) {
      updateEvents(trip, e => ({ ...e, blockedAt: simMin }))
      addAudit({ actor_name: actor, action_type: 'STATUS_CHANGE', entity_type: 'ROUTE', entity_id: trip.plan.vehicle.id, details: `${trip.plan.vehicle.plate_number} breakdown → ROUTE_BLOCKED at ${clock(simMin)}` })
    },
  }
  function reset() { setEvents({}); setSimMin(toMinutes('08:20')); setPlaying(true) }

  const drawerOpen = !!selected
  const listOpen = !isDriver && !drawerOpen // the drawer replaces the list while a trip is open
  const leftInset = listOpen ? 332 : 16
  const rightInset = drawerOpen ? 412 : 16

  return (
    <div className="relative h-full overflow-hidden bg-slate-100">
      <TrackingMap views={visible} colors={colors} selectedId={isDriver ? myTrip?.plan.id ?? null : selectedId} hoveredId={hoveredId}
        onSelect={id => !isDriver && setSelectedId(id)} focusKey={`${plans.map(p => p.id).join()}|${isDriver}`}
        insets={{ left: leftInset, right: rightInset, bottom: 96, top: 0 }} />

      {/* ── Trip list ── */}
      {listOpen && (
        <div className="absolute top-4 left-4 bottom-28 w-[300px] flex flex-col pointer-events-none">
          <div className="pointer-events-auto rounded-2xl bg-white/95 backdrop-blur shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 flex flex-col min-h-0">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 grid grid-cols-3 gap-2">
              <Stat value={onRoad} label="on the road" />
              <Stat value={`${delivered}/${allStops.length}`} label="delivered" />
              <Stat value={late} label="running late" tone={late ? 'warn' : undefined} />
            </div>
            <div className="overflow-y-auto p-2">
              {views.length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-sm text-slate-600">No trips on the road yet.</p>
                  <button onClick={onOpenPlanner} className="mt-3 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">Plan a dispatch</button>
                </div>
              )}
              {views.map(v => {
                const pct = v.kmTotal ? Math.min(100, (v.kmDone / v.kmTotal) * 100) : 0
                const on = selectedId === v.plan.id
                const st = TRIP_STATE[v.state]
                return (
                  <button key={v.plan.id}
                    onClick={() => setSelectedId(on ? null : v.plan.id)}
                    onMouseEnter={() => setHoveredId(v.plan.id)} onMouseLeave={() => setHoveredId(null)}
                    className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${on ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                    <div className="flex gap-3">
                      <span className="w-1 rounded-full flex-shrink-0" style={{ background: colors[v.plan.id] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{v.plan.driver?.full_name ?? v.plan.vehicle.name}</span>
                          <span className="text-xs font-medium flex-shrink-0" style={{ color: st.color }}>{st.label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{v.plan.vehicle.plate_number} · {v.stops.filter(s => s.state === 'DELIVERED').length} of {v.stops.length} stops</p>
                        <div className="mt-2 h-1 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: colors[v.plan.id] }} /></div>
                        {v.atRisk > 0 && <p className="text-xs text-amber-700 mt-1.5">{v.atRisk} stop{v.atRisk > 1 ? 's' : ''} running late</p>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Playback bar ── */}
      <div className="absolute bottom-4 transition-[right] duration-300" style={{ left: leftInset, right: rightInset }}>
        {feed[0] && (
          <p className="mb-2 ml-1 inline-block max-w-full truncate rounded-full bg-white/90 backdrop-blur px-3 py-1 text-xs text-slate-600 shadow-sm ring-1 ring-slate-900/5">
            <span className="font-mono text-slate-400">{clock(feed[0].at)}</span>&nbsp; {feed[0].trip} · {feed[0].text}
          </p>
        )}
        <div className="rounded-2xl bg-white/95 backdrop-blur shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5 px-3 py-2.5 flex items-center gap-3">
          <button onClick={() => setPlaying(p => !p)} title="Play / pause (space)" className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-700 flex-shrink-0">
            {playing
              ? <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>}
          </button>
          <span className="font-mono text-lg font-semibold text-slate-900 tabular-nums w-14">{clock(simMin)}</span>
          <div className="flex-1 min-w-[120px] flex flex-col">
            <input type="range" min={DAY_START} max={DAY_END} step={1} value={simMin} onChange={e => setSimMin(Number(e.target.value))}
              className="w-full accent-violet-600 cursor-pointer" aria-label="Simulation time" />
            <div className="flex justify-between text-[11px] text-slate-400 px-0.5">{['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'].map(t => <span key={t}>{t}</span>)}</div>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5 flex-shrink-0">
            {RATES.map((r, i) => (
              <button key={r.label} onClick={() => { setRate(i); setPlaying(true) }} className={`px-2 py-1 text-xs font-medium rounded-md ${rate === i ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>{r.label}</button>
            ))}
          </div>
          <button onClick={reset} title="Reset the day" className="w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>
      </div>

      {/* ── Trip drawer ── */}
      <div className={`absolute top-4 bottom-4 right-4 w-[380px] transition-transform duration-300 ${drawerOpen ? 'translate-x-0' : 'translate-x-[420px]'}`}>
        {selected && (
          <TripDrawer key={selected.plan.id} trip={selected} color={colors[selected.plan.id]} simMin={simMin} feed={feed.filter(f => f.trip === selected.plan.vehicle.plate_number)}
            canClose={!isDriver} onClose={() => setSelectedId(null)} actions={actions} />
        )}
      </div>

      {isDriver && !myTrip && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl bg-white shadow-lg px-6 py-5 text-center pointer-events-auto"><p className="text-sm font-medium text-slate-800">No trip assigned to you right now.</p></div>
        </div>
      )}
    </div>
  )
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'warn' }) {
  return (
    <div>
      <p className={`text-xl font-semibold tabular-nums leading-none ${tone === 'warn' ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  )
}

type Actions = {
  delay: (t: TripView, minutes: number, reason: string) => void
  fail: (t: TripView) => void
  breakdown: (t: TripView) => void
}

function TripDrawer({ trip, color, simMin, feed, canClose, onClose, actions }: {
  trip: TripView; color: string; simMin: number; feed: FeedItem[]; canClose: boolean; onClose: () => void; actions: Actions
}) {
  const [tab, setTab] = useState<'overview' | 'stops' | 'activity'>('overview')
  const p = trip.plan
  const st = TRIP_STATE[trip.state]
  const pct = trip.kmTotal ? Math.min(100, (trip.kmDone / trip.kmTotal) * 100) : 0

  return (
    <div className="h-full rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 flex flex-col overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-slate-900">{p.driver?.full_name ?? 'Unassigned driver'}</p>
            <p className="text-sm text-slate-500">{p.vehicle.name} · {p.vehicle.plate_number}</p>
          </div>
          {canClose && (
            <button onClick={onClose} className="h-8 px-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center gap-1" aria-label="Back to all trips">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>All trips
            </button>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
          <span className="font-medium" style={{ color: st.color }}>{st.label}</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600">{trip.kmDone.toFixed(1)} of {trip.kmTotal.toFixed(1)} km</span>
          <span className="ml-auto text-slate-500">back {Number.isFinite(trip.endMin) ? clock(trip.endMin) : '—'}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} /></div>
      </div>

      <div className="px-5">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(['overview', 'stops', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1.5 text-sm font-medium rounded-md capitalize ${tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === 'overview' && <Overview trip={trip} simMin={simMin} actions={actions} />}
        {tab === 'stops' && (
          <ol>
            <Row dot="#0f172a" title={`Leave ${p.hub.code}`} time={clock(p.departMin)} sub={p.hub.name} />
            {trip.stops.map(s => <StopRow key={s.shipment.id} s={s} />)}
            <Row dot={trip.state === 'COMPLETED' ? '#16a34a' : '#cbd5e1'} title={`Back at ${p.hub.code}`} time={Number.isFinite(trip.endMin) ? clock(trip.endMin) : '—'} sub="End of trip" last />
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

  return (
    <div className="space-y-5">
      {blocked && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Vehicle broke down</p>
          <p className="mt-1">{trip.stops.filter(s => s.state === 'BLOCKED').length} remaining stops need another vehicle.</p>
        </div>
      )}
      {next && !blocked && !done && (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">{next.state === 'ARRIVED' ? 'At stop' : 'Next stop'} · {next.index + 1} of {trip.stops.length}</p>
          <p className="text-base font-semibold text-slate-900 mt-1">{next.shipment.customer_name}</p>
          <p className="text-sm text-slate-500">{next.shipment.destination_address}</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums leading-none">{next.state === 'ARRIVED' ? 'Here' : clock(next.eta)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {next.state === 'ARRIVED'
                  ? simMin < toMinutes(next.shipment.time_window_start) ? `waiting for the ${next.shipment.time_window_start} window` : 'unloading'
                  : `in ${fmtDur(next.eta - simMin)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">window</p>
              <p className="text-sm font-medium text-slate-800">{next.shipment.time_window_start}–{next.shipment.time_window_end}</p>
            </div>
          </div>
          {next.late && <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Expected {fmtDur(next.lateBy)} after the window closes</p>}
        </div>
      )}
      {done && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 font-medium">Trip completed and back at {p.hub.code}.</div>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Metric label="Speed" value={`${Math.round(trip.speedKmh)} km/h`} />
        <Metric label="Driving today" value={fmtDur(trip.driveMinutes)} hint={`of ${limit / 60}h limit`} warn={trip.driveMinutes > limit * 0.85} />
        <Metric label="Fuel used" value={`${(trip.kmDone / p.vehicle.fuel_efficiency_kpl).toFixed(1)} L`} />
        <Metric label="Delays" value={trip.delayMinutes ? `+${trip.delayMinutes} min` : 'None'} warn={trip.delayMinutes > 0} />
      </div>

      {started && !blocked && !done && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Report an issue</p>
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
          <p className="text-xs text-slate-400 mt-3">Later ETAs update immediately and every report is written to the audit log.</p>
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

function StopRow({ s }: { s: StopView }) {
  return (
    <Row dot={STOP_COLOR[s.state]} title={s.shipment.customer_name} time={Number.isFinite(s.eta) ? clock(s.eta) : '—'} sub={`${STOP_LABEL[s.state]} · window ${s.shipment.time_window_start}–${s.shipment.time_window_end}`}>
      {s.late && s.state !== 'FAILED' && (
        <p className={`text-xs mt-1 ${s.state === 'DELIVERED' ? 'text-red-600' : 'text-amber-700'}`}>
          {s.state === 'DELIVERED' ? `Delivered ${fmtDur(s.lateBy)} late` : `Expected ${fmtDur(s.lateBy)} late`}
        </p>
      )}
    </Row>
  )
}
