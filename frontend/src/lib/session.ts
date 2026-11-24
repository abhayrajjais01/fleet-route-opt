// ─── SESSION: sign-in vs demo mode ────────────────────────────────────────────────────────────
// Two ways into the platform:
//   user  — a real account (email + password). The workspace is locked to that account's role: the sidebar,
//           sections and API calls are exactly what the role may use, and every request carries its token.
//   demo  — no account. A role switcher shows every profile and feature, signed in behind the scenes with the
//           seeded demo accounts. Turned off for a deployment with VITE_DEMO_MODE=false.
// The session lives in sessionStorage: it survives a reload, ends when the tab closes, and is never shared
// between tabs. The token is checked against the server when the page loads.
import { API_V1, setSignedInToken } from './api'
import type { UserRole } from './types'

export interface SessionUser { id: number; email: string; full_name: string; role: UserRole }
export type Session =
  | { mode: 'user'; token: string; user: SessionUser }
  | { mode: 'demo'; startRole: UserRole }

export const DEMO_MODE_ENABLED = (import.meta.env.VITE_DEMO_MODE as string | undefined) !== 'false'

const KEY = 'fleetops.session'
const ROLES: UserRole[] = ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER']

function read(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (s.mode === 'demo' && DEMO_MODE_ENABLED && ROLES.includes(s.startRole)) return s
    if (s.mode === 'user' && typeof s.token === 'string' && ROLES.includes(s.user?.role)) return s
  } catch { /* storage blocked or corrupt: start at the login page */ }
  return null
}

function write(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s))
    else sessionStorage.removeItem(KEY)
  } catch { /* private mode: the session simply won't survive a reload */ }
}

/** Makes `s` the active session (or signs out with null). */
export function activate(s: Session | null): Session | null {
  setSignedInToken(s?.mode === 'user' ? s.token : null)
  write(s)
  return s
}

export class SignInError extends Error {}

async function me(token: string): Promise<SessionUser> {
  const res = await fetch(`${API_V1}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new SignInError('Your session has expired. Please sign in again.')
  const u = await res.json()
  return { id: u.id, email: u.email, full_name: u.full_name, role: u.role }
}

/** Email + password sign-in. Throws SignInError with a message fit to show under the form. */
export async function signIn(email: string, password: string): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${API_V1}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
  } catch {
    throw new SignInError("Can't reach the server. Check that the backend is running, then try again.")
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.detail
    if (res.status === 401) throw new SignInError('That email and password don’t match an account.')
    if (res.status === 403) throw new SignInError('This account has been deactivated. Ask an administrator to restore it.')
    if (res.status === 429) throw new SignInError(typeof detail === 'string' ? detail : 'Too many attempts. Please wait a minute.')
    if (res.status === 422) throw new SignInError('Enter a valid email address.')
    throw new SignInError(`Sign-in failed (${res.status}). Please try again.`)
  }
  const data = await res.json()
  const user: SessionUser = data.user
    ? { id: data.user.id, email: data.user.email, full_name: data.user.full_name, role: data.user.role }
    : await me(data.access_token)
  return { mode: 'user', token: data.access_token, user }
}

export function startDemo(startRole: UserRole = 'ADMIN'): Session {
  return { mode: 'demo', startRole }
}

/**
 * The session to resume on page load: the stored one, with a signed-in token re-checked against the server
 * (expired, revoked or deactivated → back to the login page, with `expired` set). If the server can't be reached
 * the stored session is kept, so a flaky connection doesn't sign anyone out.
 */
export async function restore(): Promise<{ session: Session | null; expired: boolean }> {
  const s = read()
  if (!s || s.mode === 'demo') return { session: s, expired: false }
  try {
    return { session: { ...s, user: await me(s.token) }, expired: false }
  } catch (e) {
    return e instanceof SignInError ? { session: null, expired: true } : { session: s, expired: false }
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}
