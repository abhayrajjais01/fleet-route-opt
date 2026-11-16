// Structured Action Proposal Card with Route Diff Viewer (US-005, Week 11 · Track B: Abhayraj Jaiswal)
// Shown inside the Copilot drawer: what the agent proposes, current vs proposed stop order per vehicle,
// the km / time / cost / lateness impact, and one-click Accept / Reject.
import { useState } from 'react'
import type { DiffChange, ProposalCard as Card, RouteDiffEntry, RouteImpactMetrics, VehicleRouteDiff } from '../../lib/proposalsApi'

const TOOL_LABEL: Record<string, string> = {
  reassign_stops: 'Reassign stops',
  apply_delay: 'Absorb delay',
  reoptimize_route: 'Re-sequence route',
}
const STATUS_LABEL: Record<VehicleRouteDiff['status'], string> = {
  OUT_OF_SERVICE: 'Out of service',
  CHANGED: 'Stops changed',
  NEW_VEHICLE: 'Spare vehicle',
  RESEQUENCED: 'Re-ordered',
  UNCHANGED: 'Same order',
}
const CHANGE_STYLE: Record<DiffChange, string> = {
  SAME: 'text-slate-300',
  MOVED: 'text-amber-300 bg-amber-500/10',
  ADDED: 'text-emerald-300 bg-emerald-500/10',
  REMOVED: 'text-rose-300 bg-rose-500/10 line-through decoration-rose-400/60',
  COMPLETED: 'text-slate-500',
}
const CHANGE_MARK: Record<DiffChange, string> = { SAME: '', MOVED: '↕', ADDED: '+', REMOVED: '−', COMPLETED: '✓' }

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const mins = (n: number) => (Math.abs(n) >= 60 ? `${Math.floor(Math.abs(n) / 60)}h ${Math.round(Math.abs(n) % 60)}m` : `${Math.round(Math.abs(n))} min`)

function Delta({ value, format }: { value: number; format: (n: number) => string }) {
  // Every impact metric is "lower is better": less distance, time, cost and lateness.
  if (Math.abs(value) < 0.05) return <span className="text-slate-500">no change</span>
  const better = value < 0
  return <span className={better ? 'text-emerald-400' : 'text-rose-400'}>{better ? '▼' : '▲'} {format(Math.abs(value))}</span>
}

function ImpactRow({ label, current, proposed, delta, format }: {
  label: string; current: number; proposed: number; delta: number; format: (n: number) => string
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-2 py-1 border-b border-slate-700/40 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono text-slate-400 tabular-nums">{format(current)}</span>
      <span className="font-mono text-slate-100 tabular-nums">→ {format(proposed)}</span>
      <span className="font-mono text-[10px] text-right min-w-[70px] tabular-nums"><Delta value={delta} format={format} /></span>
    </div>
  )
}

function StopRow({ e, side }: { e: RouteDiffEntry; side: 'before' | 'after' }) {
  const eta = side === 'before' ? e.before_eta : e.after_eta
  const pos = side === 'before' ? e.before_position : e.after_position
  const hint =
    e.change === 'REMOVED' ? `→ ${e.moved_to ?? 'unassigned'}`
      : e.change === 'ADDED' ? `from ${e.moved_from ?? '—'}`
        : e.change === 'MOVED' ? `was #${side === 'after' ? e.before_position : e.after_position}`
          : null
  const late = side === 'after' && (e.sla_after === 'SLA_BREACHED' || e.sla_after === 'PREDICTED_BREACH')
  return (
    <li className={`flex items-start gap-1.5 rounded-md px-1.5 py-1 ${CHANGE_STYLE[e.change]}`} title={`${e.name} · ${e.change.toLowerCase()}`}>
      <span className="w-4 shrink-0 text-right font-mono text-[10px] text-slate-500">{pos}</span>
      <span className="w-3 shrink-0 text-center font-bold text-[10px]">{CHANGE_MARK[e.change]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{e.name}</span>
        {hint && <span className="block text-[9px] opacity-80 no-underline">{hint}</span>}
      </span>
      <span className={`shrink-0 font-mono text-[10px] ${late ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
        {eta ?? '—'}
        {side === 'before' && e.planned_eta && e.planned_eta !== e.before_eta && (
          <span className="block text-[9px] text-slate-500">plan {e.planned_eta}</span>
        )}
      </span>
    </li>
  )
}

function VehicleDiff({ v }: { v: VehicleRouteDiff }) {
  const km = v.current && v.proposed ? v.proposed.distance_km - v.current.distance_km : null
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-2">
      <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-700/50">
        <span className="font-mono text-[11px] font-bold text-slate-100">{v.vehicle}</span>
        <span className="flex items-center gap-2 text-[10px]">
          {km !== null && Math.abs(km) >= 0.1 && <span className={km < 0 ? 'text-emerald-400' : 'text-rose-400'}>{km > 0 ? '+' : ''}{km.toFixed(1)} km</span>}
          <span className={`px-1.5 py-0.5 rounded font-semibold ${v.status === 'OUT_OF_SERVICE' ? 'bg-rose-500/20 text-rose-300' : v.status === 'UNCHANGED' ? 'bg-slate-700 text-slate-300' : 'bg-blue-500/20 text-blue-300'}`}>
            {STATUS_LABEL[v.status]}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {(['before', 'after'] as const).map(side => {
          const list = side === 'before' ? v.before : v.after
          return (
            <div key={side} className="min-w-0">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">{side === 'before' ? 'Current route' : 'Proposed route'}</p>
              {list.length ? <ol className="space-y-0.5">{list.map(e => <StopRow key={e.stop_id} e={e} side={side} />)}</ol>
                : <p className="px-1.5 py-1 text-slate-500 italic">No stops</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ProposalCard({ card, onDecide }: {
  card: Card
  onDecide: (decision: 'ACCEPT' | 'REJECT') => Promise<void>
}) {
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const imp = card.impact
  const changed = card.vehicles.filter(v => v.status !== 'UNCHANGED')
  const shown = showAll ? card.vehicles : (changed.length ? changed : card.vehicles.slice(0, 1))
  const unassigned = Object.entries(card.unassigned)
  const nameOf = (id: string) => card.vehicles.flatMap(v => v.before).find(e => e.stop_id === id)?.name ?? id

  async function decide(d: 'ACCEPT' | 'REJECT') {
    setBusy(d); setError(null)
    try { await onDecide(d) } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const rows: [string, keyof RouteImpactMetrics, number, (n: number) => string][] = [
    ['Distance', 'distance_km', imp.delta_km, n => `${n.toFixed(1)} km`],
    ['Driving time', 'duration_min', imp.delta_minutes, mins],
    ['Operating cost', 'cost', imp.delta_cost, money],
    ['Minutes late', 'late_min', imp.delta_late_min, n => `${Math.round(n)} min`],
  ]

  return (
    <div className="mt-3 pt-2.5 border-t border-slate-700/60 space-y-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold uppercase tracking-wider text-slate-400">Action proposal · {TOOL_LABEL[card.tool_call.name] ?? card.tool_call.name}</span>
        <span className={`px-1.5 py-0.5 rounded font-bold ${card.status === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-300' : card.status === 'REJECTED' ? 'bg-slate-700 text-slate-300' : 'bg-amber-500/20 text-amber-300'}`}>
          {card.status === 'PROPOSED' ? 'Needs your decision' : card.status === 'ACCEPTED' ? 'Accepted' : 'Rejected'}
        </span>
      </div>

      <div className="rounded-xl bg-slate-900/60 border border-slate-700/70 px-2.5 py-1.5 text-[11px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          <span>Impact</span><span>Current</span><span>Proposed</span><span className="text-right">Change</span>
        </div>
        {rows.map(([label, key, delta, fmt]) => (
          <ImpactRow key={key} label={label} current={imp.current[key]} proposed={imp.proposed[key]} delta={delta} format={fmt} />
        ))}
      </div>

      <div className="space-y-2">
        {shown.map(v => <VehicleDiff key={v.vehicle} v={v} />)}
        {card.vehicles.length > shown.length && (
          <button onClick={() => setShowAll(true)} className="text-[10px] font-bold text-blue-400 hover:text-blue-300">
            Show {card.vehicles.length - shown.length} unchanged vehicle(s)
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-500">
        <span><b className="text-emerald-400">+</b> added</span><span><b className="text-rose-400">−</b> removed</span>
        <span><b className="text-amber-400">↕</b> moved</span><span><b className="text-slate-400">✓</b> delivered</span>
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2 text-[11px] text-rose-200">
          <p className="font-bold">Can't be placed on any vehicle</p>
          {unassigned.map(([id, why]) => <p key={id}>{nameOf(id)}: {why}</p>)}
        </div>
      )}

      {card.status === 'PROPOSED' ? (
        <div className="flex gap-2">
          <button onClick={() => decide('ACCEPT')} disabled={!!busy}
            className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold">
            {busy === 'ACCEPT' ? 'Applying…' : 'Accept proposal'}
          </button>
          <button onClick={() => decide('REJECT')} disabled={!!busy}
            className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 text-xs font-bold">
            {busy === 'REJECT' ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">
          {card.status === 'ACCEPTED' ? 'Applied to live routes' : 'Kept the current routes'}
          {card.decided_by ? ` · ${card.decided_by}` : ''} · logged in the audit trail
        </p>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  )
}
