// ─── SLA & ETA ALERTS (Weeks 10 + 12 · Track A) ───────────────────────────────
// Watches the live trip views and raises a toast when something changes that a dispatcher must act on:
//   - ETAs moved (a delay was reported): "3 stops on MH-04 moved back up to 30 min"       (Week 10)
//   - a stop is now predicted to miss its window (PREDICTED_BREACH)                       (Week 12)
//   - a stop was delivered after its window closed (SLA_BREACHED)                         (Week 12)
//   - a trip became ROUTE_BLOCKED (breakdown)                                             (Week 12)
// Serious alerts play a short tone (Web Audio; off until the dispatcher turns sound on, since browsers
// block audio before a click anyway).
import { useEffect, useRef, useState } from 'react'
import type { TripView } from './simulation'

type Level = 'info' | 'warning' | 'critical'
interface Toast { id: number; level: Level; title: string; body: string }

const STYLE: Record<Level, { ring: string; dot: string; label: string }> = {
  info: { ring: 'ring-slate-200', dot: 'bg-sky-500', label: 'ETA update' },
  warning: { ring: 'ring-amber-200', dot: 'bg-amber-500', label: 'SLA risk' },
  critical: { ring: 'ring-red-200', dot: 'bg-red-600', label: 'Action needed' },
}

function beep(ctx: AudioContext, level: Level) {
  const osc = ctx.createOscillator(), gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = level === 'critical' ? 880 : 660
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (level === 'critical' ? 0.45 : 0.25))
  osc.connect(gain).connect(ctx.destination)
  osc.start(); osc.stop(ctx.currentTime + 0.5)
}

export default function SlaAlerts({ views }: { views: TripView[] }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [sound, setSound] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const seen = useRef<{ etas: Map<string, number>; late: Set<string>; breached: Set<string>; blocked: Set<string>; ready: boolean }>({
    etas: new Map(), late: new Set(), breached: new Set(), blocked: new Set(), ready: false,
  })
  const nextId = useRef(1)

  function push(level: Level, title: string, body: string) {
    const id = nextId.current++
    setToasts(t => [{ id, level, title, body }, ...t].slice(0, 4))
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), level === 'critical' ? 12000 : 7000)
    if (sound && level !== 'info' && audio.current) beep(audio.current, level)
  }

  useEffect(() => {
    const s = seen.current
    for (const v of views) {
      const plate = v.plan.vehicle.plate_number
      if (v.state === 'ROUTE_BLOCKED' && !s.blocked.has(v.plan.id)) {
        s.blocked.add(v.plan.id)
        if (s.ready) push('critical', `${plate} is blocked`, `${v.stops.filter(x => x.state === 'BLOCKED').length} stops need another vehicle. Open the Route Planner to re-route them.`)
      }
      let moved = 0, maxShift = 0
      for (const st of v.stops) {
        const key = `${v.plan.id}:${st.shipment.id}`
        const prev = s.etas.get(key)
        if (Number.isFinite(st.eta)) {
          if (prev !== undefined && st.state !== 'DELIVERED' && st.eta - prev >= 5) { moved++; maxShift = Math.max(maxShift, st.eta - prev) }
          s.etas.set(key, st.eta)
        }
        // Blocked stops have no ETA (Infinity); the ROUTE_BLOCKED alert above already covers them.
        if (st.late && Number.isFinite(st.lateBy) && st.state !== 'DELIVERED' && st.state !== 'FAILED' && st.state !== 'BLOCKED' && !s.late.has(key)) {
          s.late.add(key)
          if (s.ready) push('warning', `${st.shipment.customer_name} will be late`, `${plate} now arrives ${Math.round(st.lateBy)} min after the ${st.shipment.time_window_end} window. Tell the customer or re-route.`)
        }
        if (st.late && st.state === 'DELIVERED' && !s.breached.has(key)) {
          s.breached.add(key)
          if (s.ready) push('critical', `SLA breached: ${st.shipment.customer_name}`, `${plate} delivered ${Math.round(st.lateBy)} min after the window. Logged for audit.`)
        }
      }
      if (moved && s.ready) push('info', `ETAs updated on ${plate}`, `${moved} stop${moved > 1 ? 's' : ''} moved back by up to ${Math.round(maxShift)} min; later stops were recalculated.`)
    }
    // The first pass only records the starting state, so opening the page doesn't flood the dispatcher.
    s.ready = s.ready || views.length > 0
  })

  if (!views.length) return null
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[360px] max-w-[calc(100%-32px)] flex flex-col gap-2 pointer-events-none" aria-live="polite">
      <button
        onClick={() => { if (!audio.current) audio.current = new AudioContext(); setSound(v => !v) }}
        className="pointer-events-auto self-center px-2.5 py-1 rounded-full bg-white/90 backdrop-blur ring-1 ring-slate-900/5 shadow-sm text-xs text-slate-600 hover:text-slate-900">
        {sound ? 'Alert sound on' : 'Alert sound off'}
      </button>
      {toasts.map(t => (
        <div key={t.id} role={t.level === 'critical' ? 'alert' : 'status'} className={`pointer-events-auto rounded-xl bg-white shadow-lg ring-1 ${STYLE[t.level].ring} px-4 py-3`}>
          <div className="flex items-start gap-2.5">
            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STYLE[t.level].dot}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-500">{STYLE[t.level].label}</p>
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              <p className="text-xs text-slate-600 mt-0.5">{t.body}</p>
            </div>
            <button onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}
