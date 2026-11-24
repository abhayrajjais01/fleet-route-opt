// ─── LOGIN PAGE ────────────────────────────────────────────────────────────────────────────────
// Sign in with an account (the workspace then shows only what that account's role may use), or explore the
// whole platform in demo mode, where every profile can be switched to.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { DEMO_MODE_ENABLED, SignInError, signIn, startDemo, type Session } from '../../lib/session'
import type { UserRole } from '../../lib/types'

const DEMO_PROFILES: { role: UserRole; title: string; sees: string; accent: string }[] = [
  { role: 'ADMIN', title: 'Admin', sees: 'Everything, including users and the audit trail', accent: 'bg-red-600' },
  { role: 'FLEET_MANAGER', title: 'Fleet manager', sees: 'Fleet assets, executive KPIs and reports', accent: 'bg-purple-600' },
  { role: 'DISPATCHER', title: 'Dispatcher', sees: 'Orders, route planning, live tracking, copilot', accent: 'bg-blue-600' },
  { role: 'DRIVER', title: 'Driver', sees: 'The mobile app: today’s stops and actions', accent: 'bg-emerald-600' },
]

const FEATURES = [
  ['Route planning', 'VRPTW optimisation with time windows, capacity and shift limits'],
  ['AI dispatch copilot', 'Breakdowns and delays become reviewable re-route proposals'],
  ['Compliance & audit', 'SOP-grounded answers and an append-only audit trail'],
] as const

export default function LoginPage({ onSession, notice }: { onSession: (s: Session) => void; notice?: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => { emailRef.current?.focus() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setBusy(true); setError(null)
    try {
      onSession(await signIn(email, password))
    } catch (err) {
      setError(err instanceof SignInError ? err.message : 'Sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Brand panel (wide screens) */}
      <aside className="hidden lg:flex w-[44%] max-w-xl flex-col justify-between bg-slate-900 text-white p-10 relative overflow-hidden">
        <div aria-hidden className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-violet-600/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <p className="font-bold">FleetOps</p>
            <p className="text-[11px] text-slate-400">AI Route Optimizer</p>
          </div>
        </div>
        <div className="relative">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">Plan, run and audit every delivery across the Mumbai–Pune network.</h1>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                <div><p className="font-semibold">{t}</p><p className="text-sm text-slate-400">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Access is role-based: you see the parts of the platform your role is assigned.</p>
      </aside>

      {/* Sign-in */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <Logo />
            <div className="leading-tight"><p className="font-bold">FleetOps</p><p className="text-[11px] text-slate-500">AI Route Optimizer</p></div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use the account your administrator created for you.</p>

          {notice && <p role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{notice}</p>}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email</label>
              <input id="login-email" ref={emailRef} type="email" autoComplete="username" inputMode="email" value={email}
                onChange={e => setEmail(e.target.value)} disabled={busy} placeholder="you@company.com"
                className="mt-1.5 w-full rounded-lg bg-white px-3 py-2.5 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
              <div className="relative mt-1.5">
                <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
                  onChange={e => setPassword(e.target.value)} disabled={busy}
                  className="w-full rounded-lg bg-white pl-3 pr-16 py-2.5 text-sm ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60" />
                <button type="button" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-800">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <p aria-live="polite" className={`text-sm text-red-700 ${error ? '' : 'sr-only'}`}>{error ?? ''}</p>
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <span aria-hidden className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {DEMO_MODE_ENABLED && (
            <section aria-labelledby="demo-heading" className="mt-10">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">or</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <h3 id="demo-heading" className="mt-6 text-sm font-semibold text-slate-800">Explore in demo mode</h3>
              <p className="mt-0.5 text-sm text-slate-500">No account needed. Sample data, every feature, and you can switch between all four profiles at any time.</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_PROFILES.map(p => (
                  <button key={p.role} type="button" onClick={() => onSession(startDemo(p.role))} disabled={busy}
                    className="group text-left rounded-xl bg-white p-3 ring-1 ring-slate-200 hover:ring-violet-400 hover:shadow-sm transition disabled:opacity-60">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${p.accent}`} />
                      <span className="text-sm font-semibold text-slate-800">{p.title}</span>
                      <span aria-hidden className="ml-auto text-slate-300 group-hover:text-violet-500">→</span>
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{p.sees}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function Logo() {
  return (
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-900/30">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" />
      </svg>
    </div>
  )
}
