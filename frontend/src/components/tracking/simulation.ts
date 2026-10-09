// ─── TRIP TELEMETRY SIMULATOR ─────────────────────────────────────────────────
// Deterministic, time-driven model of an in-transit trip: hub → stops → hub.
// Everything (vehicle position, stop states, ETAs, SLA risk, events) is derived from the simulation clock
// plus the dispatcher/driver events (delays, failed stops, breakdowns), so scrubbing time or replaying an
// event always gives the same answer. Replace with live GPS + the backend FSM once Track B ships it.
import type { Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { toMinutes, type LatLng, type Leg } from '../../lib/geo'

export const SERVICE_MINUTES = 10

export interface TripPlan {
  id: string
  vehicle: Vehicle
  driver: Driver | null
  hub: Hub
  stops: Shipment[]        // in visiting order
  legs: Leg[]              // stops.length + 1 legs (last one returns to the hub)
  departMin: number        // minutes after midnight
  legSource: 'api' | 'estimate'
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

function baseTimeline(plan: TripPlan): Interval[] {
  const pts = pointsOf(plan)
  const out: Interval[] = []
  let t = plan.departMin
  plan.legs.forEach((leg, i) => {
    out.push({ kind: 'drive', start: t, end: t + leg.minutes, leg: i, from: 0, to: 1 })
    t += leg.minutes
    const stop = plan.stops[i]
    if (!stop) return
    const windowOpen = toMinutes(stop.time_window_start)
    if (t < windowOpen) {
      out.push({ kind: 'wait', start: t, end: windowOpen, stop: i, at: pts[i + 1] })
      t = windowOpen
    }
    out.push({ kind: 'service', start: t, end: t + SERVICE_MINUTES, stop: i, at: pts[i + 1] })
    t += SERVICE_MINUTES
  })
  return out
}

function positionIn(iv: Interval, t: number, pts: LatLng[]): LatLng {
  if (iv.kind !== 'drive') return iv.at!
  const span = iv.end - iv.start
  const f = iv.from! + (iv.to! - iv.from!) * (span > 0 ? Math.min(1, Math.max(0, (t - iv.start) / span)) : 1)
  const a = pts[iv.leg!], b = pts[iv.leg! + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

/** Inserts a stationary hold of `minutes` at time `at`, shifting everything after it. */
function insertHold(timeline: Interval[], at: number, minutes: number, pts: LatLng[]): Interval[] {
  const idx = timeline.findIndex(iv => at >= iv.start && at < iv.end)
  if (idx < 0) return timeline
  const iv = timeline[idx]
  const here = positionIn(iv, at, pts)
  const before: Interval[] = []
  const after: Interval[] = []
  if (iv.kind === 'drive') {
    const f = iv.from! + (iv.to! - iv.from!) * ((at - iv.start) / (iv.end - iv.start))
    before.push({ ...iv, end: at, to: f })
    after.push({ ...iv, start: at + minutes, end: iv.end + minutes, from: f })
  } else {
    before.push({ ...iv, end: at })
    after.push({ ...iv, start: at + minutes, end: iv.end + minutes })
  }
  const shifted = timeline.slice(idx + 1).map(x => ({ ...x, start: x.start + minutes, end: x.end + minutes }))
  return [...timeline.slice(0, idx), ...before, { kind: 'hold', start: at, end: at + minutes, at: here }, ...after, ...shifted]
}

export function buildTimeline(plan: TripPlan, events: TripEvents): Interval[] {
  const pts = pointsOf(plan)
  let tl = baseTimeline(plan)
  for (const d of [...events.delays].sort((a, b) => a.at - b.at)) tl = insertHold(tl, d.at, d.minutes, pts)
  if (events.blockedAt !== null) {
    const idx = tl.findIndex(iv => events.blockedAt! < iv.end)
    if (idx >= 0) {
      const iv = tl[idx]
      const here = positionIn(iv, Math.max(iv.start, events.blockedAt), pts)
      const head = events.blockedAt > iv.start ? [{ ...iv, end: events.blockedAt, ...(iv.kind === 'drive' ? { to: iv.from! + (iv.to! - iv.from!) * ((events.blockedAt - iv.start) / (iv.end - iv.start)) } : {}) }] : []
      tl = [...tl.slice(0, idx), ...head, { kind: 'hold', start: events.blockedAt, end: Infinity, at: here }]
    }
  }
  return tl
}

export function viewAt(plan: TripPlan, events: TripEvents, t: number): TripView {
  const pts = pointsOf(plan)
  const tl = buildTimeline(plan, events)
  const kmTotal = plan.legs.reduce((s, l) => s + l.km, 0)
  const blocked = events.blockedAt !== null && t >= events.blockedAt

  let kmDone = 0, driveMinutes = 0, speedKmh = 0, heading = 0
  let position: LatLng = pts[0]
  let legIdx = -1
  for (const iv of tl) {
    if (t < iv.start) break
    const until = Math.min(t, iv.end)
    if (iv.kind === 'drive') {
      legIdx = Math.max(legIdx, iv.leg!)
      const leg = plan.legs[iv.leg!]
      const frac = iv.end > iv.start ? (until - iv.start) / (iv.end - iv.start) : 1
      kmDone += leg.km * (iv.to! - iv.from!) * frac
      driveMinutes += until - iv.start
      if (t < iv.end) {
        const a = pts[iv.leg!], b = pts[iv.leg! + 1]
        heading = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
        // ±8% wobble so the readout looks like live telemetry; deterministic in t
        speedKmh = (leg.km / (leg.minutes / 60)) * (1 + 0.08 * Math.sin(t * 1.7))
      }
    }
    position = positionIn(iv, until, pts)
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
    path: pts,
    pathDone: [...pts.slice(0, legIdx + 1), position],
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
