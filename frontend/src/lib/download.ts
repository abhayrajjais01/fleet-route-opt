// ─── FILE DOWNLOADS ───────────────────────────────────────────────────────────
// Fetches a generated document (PDF / Excel) with the signed-in user's token and saves it under the file name the
// server chose. Errors carry the server's reason so screens can show it.
import { API_V1 } from './api'

export async function downloadFile(path: string, token: string | null, body?: unknown, fallbackName = 'document'): Promise<void> {
  const res = await fetch(`${API_V1}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (res.status === 401) throw new Error('Sign in to download this document.')
  if (res.status === 403) throw new Error('Your role cannot download this document.')
  if (!res.ok) {
    const detail = await res.json().then(b => (typeof b?.detail === 'string' ? b.detail : null)).catch(() => null)
    throw new Error(detail ?? `Download failed (${res.status})`)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
