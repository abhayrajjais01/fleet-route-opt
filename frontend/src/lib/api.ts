// ─── API CLIENT (FastAPI backend) ─────────────────────────────────────────────
// Set VITE_API_URL (e.g. https://fleet-route-opt.onrender.com) for deployed builds; defaults to local uvicorn.
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'
export const API_V1 = `${API_BASE}/api/v1`

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_V1}/health`, { signal: AbortSignal.timeout(1500) })
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
