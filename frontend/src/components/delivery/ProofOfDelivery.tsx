// ─── PROOF OF DELIVERY ────────────────────────────────────────────────────────
// Who received the parcel, and the proof: the customer's 6-digit delivery code (verified by the server) or a signature
// drawn on the screen. Used by the driver app and Live Tracking. Confirm stays disabled until there is real proof.
import { useEffect, useRef, useState } from 'react'
import type { Proof, Strokes } from '../../lib/transitApi'

const MIN_POINTS = 8
const MIN_INK = 0.25    // same rule as the server (services/delivery_proof.py)
const ASPECT = 2.4      // pad width / height

function inkOf(strokes: Strokes) {
  let ink = 0, points = 0
  for (const s of strokes) for (let i = 0; i < s.length; i++) {
    points++
    if (i) ink += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1])
  }
  return { ink, points }
}
export const isSigned = (strokes: Strokes) => { const { ink, points } = inkOf(strokes); return points >= MIN_POINTS && ink >= MIN_INK }

export function SignaturePad({ strokes, onChange, dark }: { strokes: Strokes; onChange: (s: Strokes) => void; dark?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<[number, number][] | null>(null)
  const latest = useRef(strokes)
  latest.current = strokes

  function paint() {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const scale = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    if (c.width !== Math.round(w * scale)) { c.width = Math.round(w * scale); c.height = Math.round(h * scale) }
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const s of [...latest.current, ...(drawing.current ? [drawing.current] : [])]) {
      ctx.beginPath()
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)))
      ctx.stroke()
    }
  }
  useEffect(paint, [strokes])
  useEffect(() => { window.addEventListener('resize', paint); return () => window.removeEventListener('resize', paint) }, [])

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    const clamp = (v: number) => Math.max(0, Math.min(1, Math.round(v * 10000) / 10000))
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]
  }
  const finish = () => {
    const s = drawing.current
    drawing.current = null
    if (s) onChange([...latest.current, s])
  }
  return (
    <div>
      <canvas ref={canvas} role="img" aria-label={isSigned(strokes) ? 'Signature captured' : 'Signature pad: sign here'}
        className="w-full rounded-xl bg-white ring-1 ring-slate-300 touch-none cursor-crosshair" style={{ aspectRatio: ASPECT }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = [at(e)]; paint() }}
        onPointerMove={e => { if (drawing.current) { drawing.current.push(at(e)); paint() } }}
        onPointerUp={finish} onPointerCancel={finish} />
      <div className={`mt-1 flex items-center justify-between text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
        <span>{isSigned(strokes) ? 'Signature captured' : strokes.length ? 'Please sign in full' : 'Ask the recipient to sign above'}</span>
        <button type="button" onClick={() => onChange([])} disabled={!strokes.length} className="font-semibold disabled:opacity-40">Clear</button>
      </div>
    </div>
  )
}

export interface ProofDraft { recipient: string; method: 'signature' | 'code'; strokes: Strokes; code: string }
export const emptyProof = (): ProofDraft => ({ recipient: '', method: 'signature', strokes: [], code: '' })

/** The proof to send, or null while something is missing. */
export function proofOf(d: ProofDraft): { recipient: string; proof: Proof } | null {
  const recipient = d.recipient.trim()
  if (recipient.length < 2) return null
  if (d.method === 'code') return /^\d{6}$/.test(d.code) ? { recipient, proof: { delivery_code: d.code } } : null
  return isSigned(d.strokes) ? { recipient, proof: { signature: d.strokes } } : null
}

export default function ProofFields({ draft, onChange, dark, offline }: { draft: ProofDraft; onChange: (d: ProofDraft) => void; dark?: boolean; offline?: boolean }) {
  const set = (p: Partial<ProofDraft>) => onChange({ ...draft, ...p })
  const label = `block text-xs font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-slate-600'}`
  const input = `w-full px-3 py-2 rounded-xl text-sm outline-none border ${dark ? 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500' : 'bg-white border-slate-200 text-slate-800 focus:border-blue-500'}`
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="pod-recipient" className={label}>Received by</label>
        <input id="pod-recipient" value={draft.recipient} onChange={e => set({ recipient: e.target.value })} placeholder="Full name of the person receiving it" autoComplete="off" className={input} />
      </div>
      <div>
        <p className={label}>Proof</p>
        <div role="group" aria-label="Proof of delivery" className={`grid grid-cols-2 gap-1 rounded-xl p-1 mb-2 ${dark ? 'bg-slate-900' : 'bg-slate-100'}`}>
          {([['signature', 'Signature'], ['code', 'Delivery code']] as const).map(([m, text]) => (
            <button key={m} type="button" aria-pressed={draft.method === m} onClick={() => set({ method: m })}
              className={`rounded-lg py-1.5 text-xs font-semibold ${draft.method === m ? (dark ? 'bg-slate-700 text-white' : 'bg-white text-slate-900 shadow-sm') : dark ? 'text-slate-400' : 'text-slate-500'}`}>{text}</button>
          ))}
        </div>
        {draft.method === 'signature' ? <SignaturePad strokes={draft.strokes} onChange={strokes => set({ strokes })} dark={dark} /> : (
          <>
            <input aria-label="6-digit delivery code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={draft.code}
              onChange={e => set({ code: e.target.value.replace(/\D/g, '') })} placeholder="6 digits" className={`${input} font-mono tracking-[0.4em] text-center`} />
            <p className={`mt-1 text-[11px] ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
              {offline ? 'You’re offline: the code is checked when you reconnect. A signature is safer.' : 'The customer has this code from dispatch. It is checked by the server.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
