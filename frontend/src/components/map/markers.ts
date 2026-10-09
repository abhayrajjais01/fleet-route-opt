// ─── CUSTOM SVG MAP MARKERS (US-004, Track A: Manthan Nimodiya) ───────────────
// Hand-drawn SVG divIcons: no image assets to bundle and colours match the app's status palette.
import L from 'leaflet'

export const PRIORITY_COLOR: Record<string, string> = {
  EXPRESS: '#dc2626',
  HIGH: '#ea580c',
  STANDARD: '#2563eb',
  LOW: '#64748b',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

/** Distribution hub: dark rounded square with a warehouse glyph and the hub code underneath. */
export function hubIcon(code: string, selected: boolean): L.DivIcon {
  const ring = selected ? '#7c3aed' : '#0f172a'
  const svg = `
    <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="30" height="30" rx="8" fill="#0f172a" stroke="${ring}" stroke-width="${selected ? 3 : 1.5}"/>
      <path d="M9 24V15l8-5 8 5v9h-4.5v-5.5h-7V24z" fill="#fff"/>
    </svg>`
  return L.divIcon({
    className: 'fleet-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center">${svg}<span style="margin-top:2px;padding:0 4px;border-radius:4px;background:#0f172a;color:#fff;font:600 9px 'JetBrains Mono',monospace;white-space:nowrap">${escapeHtml(code)}</span></div>`,
    iconSize: [60, 50],
    iconAnchor: [30, 17],
    popupAnchor: [0, -18],
  })
}

/** Delivery waypoint: teardrop pin coloured by priority, with an optional sequence label (1, 2, 3...). */
export function stopIcon(priority: string, label: string | number | null, dimmed = false): L.DivIcon {
  const color = PRIORITY_COLOR[priority] ?? PRIORITY_COLOR.STANDARD
  const text = label === null ? '' : `<text x="14" y="17" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="11" font-weight="700" fill="${color}">${escapeHtml(label)}</text>`
  const svg = `
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" style="opacity:${dimmed ? 0.45 : 1}">
      <path d="M14 37C14 37 26 22.5 26 13.5A12 12 0 0 0 2 13.5C2 22.5 14 37 14 37Z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="13.5" r="7.5" fill="#fff"/>
      ${text}
    </svg>`
  return L.divIcon({ className: 'fleet-marker', html: svg, iconSize: [28, 38], iconAnchor: [14, 37], popupAnchor: [0, -32] })
}
