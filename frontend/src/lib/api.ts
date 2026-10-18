// ─── API CLIENT (FastAPI backend) ───────────────────────────────────────────
// Set VITE_API_URL (e.g. https://fleet-route-opt.onrender.com) for deployed builds; defaults to local uvicorn.
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'
export const API_V1 = `${API_BASE}/api/v1`

export const DEMO_CREDENTIALS: Record<string, { email: string; pass: string }> = {
  ADMIN: { email: 'admin@fleetopt.io', pass: 'password123' },
  FLEET_MANAGER: { email: 'manager@fleetopt.io', pass: 'password123' },
  DISPATCHER: { email: 'dispatch@fleetopt.io', pass: 'password123' },
  DRIVER: { email: 'driver@fleetopt.io', pass: 'password123' },
}

const cachedTokens: Record<string, string> = {}

export async function fetchAuthToken(role: string = 'ADMIN'): Promise<string | null> {
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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const detail = Array.isArray(body?.detail) ? body.detail.map((d: { msg: string }) => d.msg).join('; ') : body?.detail
    throw new Error(detail || `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}
