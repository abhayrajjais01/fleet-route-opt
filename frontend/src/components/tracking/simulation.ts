// ─── TRIP TELEMETRY SIMULATOR ─────────────────────────────────────────────────
// Deterministic, time-driven model of an in-transit trip: hub → stops → hub.
// Everything (vehicle position, stop states, ETAs, SLA risk, events) is derived from the simulation clock
// plus the dispatcher/driver events (delays, failed stops, breakdowns), so scrubbing time or replaying an
// event always gives the same answer. Replace with live GPS + the backend FSM once Track B ships it.
import type { Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { toMinutes, type LatLng, type Leg } from '../../lib/geo'
import { pathUpTo, pointAlong } from '../../lib/roads'
import { baseCovered, factorAt, travelTime } from '../../lib/traffic'

export const SERVICE_MINUTES = 10

export interface TripPlan {
  id: string
  vehicle: Vehicle
  driver: Driver | null
  hub: Hub
  stops: Shipment[]        // in visiting order
  legs: (Leg & { path?: LatLng[] })[]  // stops.length + 1 legs (last one returns to the hub); path = road geometry
  departMin: number        // minutes after midnight
  legSource: 'road' | 'api' | 'estimate'
}

export interface TripEvents {
  delays: { at: number; minutes: number; reason: string }[]
  failed: Record<number, number>  // shipment id → sim minute it was marked failed
  blockedAt: number | null
}

export const emptyEvents = (): TripEvents => ({ delays: [], failed: {}, blockedAt: null })

type Kind = 'drive' | 'wait' | 'service' | 'hold'
interface Interval {
  kind: Kind
  start: number
  end: number
  leg?: number              // drive: leg index
  from?: number; to?: number // drive: fraction of the leg covered at start/end
  base?: number             // drive: the whole leg's midday drive minutes (traffic applied by clock time)
  stop?: number             // wait/service: stop index
  at?: LatLng               // stationary position
}

export type StopState = 'PENDING' | 'NEXT' | 'ARRIVED' | 'DELIVERED' | 'FAILED' | 'BLOCKED'
export type TripState = 'SCHEDULED' | 'IN_TRANSIT' | 'RETURNING' | 'COMPLETED' | 'ROUTE_BLOCKED'

export interface StopView { shipment: Shipment; index: number; eta: number; serviceEnd: number; state: StopState; late: boolean; lateBy: number }
export interface TripView {
  plan: TripPlan
  state: TripState
  position: LatLng
  heading: number
  speedKmh: number
  stops: StopView[]
  kmDone: number
  kmTotal: number
  driveMinutes: number
  endMin: number
  delayMinutes: number
  nextStop: StopView | null
  atRisk: number
  path: LatLng[]      // full planned path hub → stops → hub
  pathDone: LatLng[]  // portion already driven, ending at the vehicle
}

const pointsOf = (p: TripPlan): LatLng[] => [
  [p.hub.latitude, p.hub.longitude],
  ...p.stops.map(s => [s.latitude!, s.longitude!] as LatLng),
  [p.hub.latitude, p.hub.longitude],
]

/** Road geometry of leg i, or the straight line between its end points when no road path is known. */
const legPath = (plan: TripPlan, pts: LatLng[], i: number): LatLng[] => plan.legs[i]?.path ?? [pts[i], pts[i + 1]]

/** Fraction of its leg a drive interval has covered at time t (rush-hour aware, so not linear in time). */
function fractionAt(iv: Interval, t: number): number {
  if (!(iv.base! > 0)) return iv.to!
  const until = Math.min(Math.max(t, iv.start), iv.end)
  return Math.min(iv.to!, iv.from! + baseCovered(iv.start, until) / iv.base!)
}

function positionIn(iv: Interval, t: number, plan: TripPlan, pts: LatLng[]): LatLng {
  if (iv.kind !== 'drive') return iv.at!
  return pointAlong(legPath(plan, pts, iv.leg!), fractionAt(iv, t)).at
}

/**
 * Builds the trip timeline forwards: drive each leg at the traffic speed for the time of day, wait for the
 * window, serve the stop. A reported delay becomes a hold at that moment, and whatever follows is re-timed
 * from the new clock time (a leg pushed into the evening peak gets slower), not just shifted.
 */
export function buildTimeline(plan: TripPlan, events: TripEvents): Interval[] {
  const pts = pointsOf(plan)
  const out: Interval[] = []
  let t = plan.departMin
  // Delays reported before departure don't move the trip (same as the backend, which re-times from "now").
  const delays = [...events.delays].filter(d => d.minutes > 0 && d.at >= plan.departMin).sort((a, b) => a.at - b.at)
  let di = 0
  /** The next delay that starts before `until`; one reported during a hold starts when the hold ends. */
  const nextDelay = (until: number) => (di < delays.length && delays[di].at < until ? { at: Math.max(delays[di].at, t), minutes: delays[di].minutes } : null)
  const hold = (at: number, minutes: number, where: LatLng) => { out.push({ kind: 'hold', start: at, end: at + minutes, at: where }); t = at + minutes; di++ }

  plan.legs.forEach((leg, i) => {
    const base = leg.minutes
    let f = 0
    for (;;) {
      const end = t + travelTime(base * (1 - f), t)
      const d = nextDelay(end)
      if (!d) { out.push({ kind: 'drive', start: t, end, leg: i, from: f, to: 1, base }); t = end; break }
      const reached = base > 0 ? Math.min(1, f + baseCovered(t, d.at) / base) : 1
      if (d.at > t) out.push({ kind: 'drive', start: t, end: d.at, leg: i, from: f, to: reached, base })
      hold(d.at, d.minutes, pointAlong(legPath(plan, pts, i), reached).at)
      f = reached
    }
    const stop = plan.stops[i]
    if (!stop) return
    const at = pts[i + 1]
    const open = toMinutes(stop.time_window_start)
    while (t < open) {
      const d = nextDelay(open)
      if (!d) { out.push({ kind: 'wait', start: t, end: open, stop: i, at }); t = open; break }
      if (d.at > t) out.push({ kind: 'wait', start: t, end: d.at, stop: i, at })
      hold(d.at, d.minutes, at)
    }
    let remaining = SERVICE_MINUTES
    while (remaining > 0) {
      const d = nextDelay(t + remaining)
      if (!d) { out.push({ kind: 'service', start: t, end: t + remaining, stop: i, at }); t += remaining; break }
      if (d.at > t) { out.push({ kind: 'service', start: t, end: d.at, stop: i, at }); remaining -= d.at - t }
      hold(d.at, d.minutes, at)
    }
  })

  if (events.blockedAt !== null) {
    const b = events.blockedAt
    const idx = out.findIndex(iv => b < iv.end)
    if (idx >= 0) {
      const iv = out[idx]
      const here = positionIn(iv, Math.max(iv.start, b), plan, pts)
      const head = b > iv.start ? [{ ...iv, end: b, ...(iv.kind === 'drive' ? { to: fractionAt(iv, b) } : {}) }] : []
      return [...out.slice(0, idx), ...head, { kind: 'hold', start: b, end: Infinity, at: here }]
    }
  }
  return out
}

export function viewAt(plan: TripPlan, events: TripEvents, t: number): TripView {
  const pts = pointsOf(plan)
  const tl = buildTimeline(plan, events)
  const kmTotal = plan.legs.reduce((s, l) => s + l.km, 0)
  const blocked = events.blockedAt !== null && t >= events.blockedAt

  let kmDone = 0, driveMinutes = 0, speedKmh = 0, heading = 0
  let position: LatLng = pts[0]
  let legIdx = -1, legFrac = 0
  for (const iv of tl) {
    if (t < iv.start) break
    const until = Math.min(t, iv.end)
    if (iv.kind === 'drive') {
      legIdx = Math.max(legIdx, iv.leg!)
      legFrac = fractionAt(iv, until)
      const leg = plan.legs[iv.leg!]
      kmDone += leg.km * (legFrac - iv.from!)
      driveMinutes += until - iv.start
      if (t < iv.end) {
        heading = pointAlong(legPath(plan, pts, iv.leg!), legFrac).heading
        // Midday speed slowed by the traffic in force now; ±8% wobble so the readout looks like live telemetry.
        speedKmh = leg.minutes > 0 ? (leg.km / (leg.minutes / 60)) / factorAt(t) * (1 + 0.08 * Math.sin(t * 1.7)) : 0
      }
    }
    position = positionIn(iv, until, plan, pts)
  }

  const stops: StopView[] = plan.stops.map((shipment, i) => {
    const arrivalIv = tl.find(iv => iv.stop === i && (iv.kind === 'wait' || iv.kind === 'service'))
    const serviceIv = tl.find(iv => iv.stop === i && iv.kind === 'service')
    const eta = arrivalIv?.start ?? Infinity
    const serviceEnd = serviceIv?.end ?? Infinity
    const windowEnd = toMinutes(shipment.time_window_end)
    const lateBy = Math.max(0, eta - windowEnd)
    let state: StopState
    if (events.failed[shipment.id] !== undefined) state = 'FAILED'
    else if (!Number.isFinite(eta) || (blocked && eta > events.blockedAt!)) state = blocked ? 'BLOCKED' : 'PENDING'
    else if (t >= serviceEnd) state = 'DELIVERED'
    else if (t >= eta) state = 'ARRIVED'
    else state = 'PENDING'
    return { shipment, index: i, eta, serviceEnd, state, late: lateBy > 0 && state !== 'FAILED', lateBy }
  })
  const next = stops.find(s => s.state === 'PENDING' || s.state === 'ARRIVED') ?? null
  if (next && next.state === 'PENDING') next.state = 'NEXT'

  const endMin = tl.length ? tl[tl.length - 1].end : plan.departMin
  let state: TripState
  if (blocked) state = 'ROUTE_BLOCKED'
  else if (t < plan.departMin) state = 'SCHEDULED'
  else if (t >= endMin) state = 'COMPLETED'
  else if (stops.every(s => s.state === 'DELIVERED' || s.state === 'FAILED')) state = 'RETURNING'
  else state = 'IN_TRANSIT'

  return {
    plan, state, position, heading, speedKmh, stops, kmDone, kmTotal, driveMinutes, endMin,
    delayMinutes: events.delays.reduce((s, d) => s + d.minutes, 0),
    nextStop: next,
    atRisk: stops.filter(s => s.late && s.state !== 'DELIVERED').length,
    path: plan.legs.flatMap((_, i) => legPath(plan, pts, i)),
    pathDone: legIdx < 0 ? [pts[0]]
      : [...plan.legs.slice(0, legIdx).flatMap((_, i) => legPath(plan, pts, i)), ...pathUpTo(legPath(plan, pts, legIdx), legFrac)],
  }
}

export interface FeedItem { at: number; trip: string; kind: 'depart' | 'arrive' | 'deliver' | 'return' | 'delay' | 'failed' | 'blocked'; text: string }

/** Event feed for one trip up to time t, derived from the timeline (newest first after merging). */
export function feedFor(view: TripView, events: TripEvents, t: number): FeedItem[] {
  const p = view.plan
  const tag = p.vehicle.plate_number
  const out: FeedItem[] = []
  if (t >= p.departMin) out.push({ at: p.departMin, trip: tag, kind: 'depart', text: `Departed ${p.hub.code}` })
  for (const s of view.stops) {
    if (s.state === 'FAILED') out.push({ at: events.failed[s.shipment.id], trip: tag, kind: 'failed', text: `${s.shipment.tracking_number} marked FAILED` })
    else {
      if (t >= s.eta && Number.isFinite(s.eta)) out.push({ at: s.eta, trip: tag, kind: 'arrive', text: `Arrived ${s.shipment.tracking_number}${s.late ? ` (${Math.round(s.lateBy)} min late)` : ''}` })
      if (t >= s.serviceEnd && Number.isFinite(s.serviceEnd)) out.push({ at: s.serviceEnd, trip: tag, kind: 'deliver', text: `Delivered ${s.shipment.tracking_number} · POD captured` })
    }
  }
  for (const d of events.delays) if (t >= d.at) out.push({ at: d.at, trip: tag, kind: 'delay', text: `Delay +${d.minutes} min: ${d.reason}` })
  if (events.blockedAt !== null && t >= events.blockedAt) out.push({ at: events.blockedAt, trip: tag, kind: 'blocked', text: 'Breakdown reported · ROUTE_BLOCKED' })
  if (view.state === 'COMPLETED') out.push({ at: view.endMin, trip: tag, kind: 'return', text: `Returned to ${p.hub.code}` })
  return out
}
