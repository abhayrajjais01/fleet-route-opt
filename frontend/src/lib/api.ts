// ─── API CLIENT (FastAPI backend) ───────────────────────────────────────────
// Set VITE_API_URL (e.g. https://fleet-route-opt.onrender.com) for deployed builds; defaults to local uvicorn.
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'
export const API_V1 = `${API_BASE}/api/v1`

export const DEMO_CREDENTIALS: Record<string, { email: string; pass: string }> = {
  ADMIN: { email: 'admin@fleetopt.io', pass: 'password123' },
  FLEET_MANAGER: { email: 'manager@fleetopt.io', pass: 'password123' },
  DISPATCHER: { email: 'dispatcher@fleetopt.io', pass: 'password123' },
  DRIVER: { email: 'driver@fleetopt.io', pass: 'password123' },
}

const cachedTokens: Record<string, string> = {}

// A real signed-in account (see lib/session.ts) overrides the demo logins: every call then carries that user's
// token, whatever role a component asks for, so the server's RBAC decides what they can do.
let signedInToken: string | null = null
export function setSignedInToken(token: string | null) {
  signedInToken = token
  for (const k of Object.keys(cachedTokens)) delete cachedTokens[k]
}

/** Demo mode: a token for the demo account of `role`. Signed in: the user's own token. */
export async function fetchAuthToken(role: string = 'ADMIN'): Promise<string | null> {
  if (signedInToken) return signedInToken
  if (cachedTokens[role]) return cachedTokens[role]
  try {
    const creds = DEMO_CREDENTIALS[role] || DEMO_CREDENTIALS.ADMIN
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.pass }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const token = data.access_token || null
    if (token) cachedTokens[role] = token
    return token
  } catch {
    return null
  }
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_V1}/health`, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

/** The server answered, and said no. A TypeError from fetch means it never answered. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = Array.isArray(body?.detail) ? body.detail.map((d: { msg: string }) => d.msg).join('; ') : body?.detail
    throw new ApiError(detail || `Request failed with status ${res.status}`, res.status)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
