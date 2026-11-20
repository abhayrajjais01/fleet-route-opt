// ─── DELIVERY DENSITY HEATMAP (US-008, Week 13 · Track B: Abhayraj Jaiswal) ─────────────────
// Delivery attempts binned into ~2 km squares on a Leaflet map. One sequential hue (blue, light → dark) carries
// the count; hovering a square shows its count and on-time share. The hubs are 100+ km apart, at which zoom a 2 km
// square is a few pixels, so the map opens on the busiest hub's area and a row of buttons jumps between hubs.
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryDensity } from '../../lib/analyticsApi'
import { escapeHtml, hubIcon } from '../map/markers'
import { addBasemap } from '../map/tiles'
import { DENSITY_STEPS, densityClass } from './densityScale'

type Cell = DeliveryDensity['cells'][number]

/** Each cell belongs to its nearest hub (deliveries are dispatched from the closest depot). */
function cellsByHub(density: DeliveryDensity): Map<string, Cell[]> {
  const out = new Map<string, Cell[]>(density.hubs.map(h => [h.code, []]))
  for (const c of density.cells) {
    let best = density.hubs[0], bestD = Infinity
    for (const h of density.hubs) {
      const d = (h.lat - c.lat) ** 2 + (h.lon - c.lon) ** 2
      if (d < bestD) { best = h; bestD = d }
    }
    if (best) out.get(best.code)!.push(c)
  }
  return out
}

export default function DeliveryDensityMap({ density }: { density: DeliveryDensity }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  const groups = useMemo(() => cellsByHub(density), [density])
  const hubTotals = useMemo(() => density.hubs
    .map(h => ({ code: h.code, stops: (groups.get(h.code) ?? []).reduce((n, c) => n + c.stops, 0) }))
    .filter(h => h.stops > 0), [density, groups])
  const busiest = hubTotals.reduce<{ code: string; stops: number } | null>((a, b) => (!a || b.stops > a.stops ? b : a), null)
  const [focus, setFocus] = useState<string>('auto')
  const target = focus === 'auto' ? (hubTotals.length > 1 ? busiest?.code ?? 'all' : 'all') : focus
  useEffect(() => setFocus('auto'), [density])             // new filters: back to the busiest area

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true })
    addBasemap(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Squares and hubs: redrawn when the data changes.
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    const half = density.cell_deg / 2
    for (const c of density.cells) {
      L.rectangle([[c.lat - half, c.lon - half], [c.lat + half, c.lon + half]], {
        color: '#ffffff', weight: 1, opacity: 0.9,                // 1px surface gap between neighbouring squares
        fillColor: DENSITY_STEPS[densityClass(c.stops, density.max_stops)], fillOpacity: 0.82,
      })
        .bindTooltip(`<b>${c.stops} deliver${c.stops === 1 ? 'y' : 'ies'}</b><br>${c.on_time_pct}% on time${c.failed ? ` · ${c.failed} failed` : ''}`,
          { sticky: true, direction: 'top' })
        .addTo(g)
    }
    for (const h of density.hubs) {
      L.marker([h.lat, h.lon], { icon: hubIcon(h.code, false), keyboard: false, opacity: 0.9, zIndexOffset: -100 })
        .bindTooltip(escapeHtml(h.code), { direction: 'top' }).addTo(g)
    }
  }, [density])

  // Viewport: the chosen hub's squares, or everything.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const cells = target === 'all' ? density.cells : groups.get(target) ?? []
    const half = density.cell_deg / 2
    if (cells.length) {
      const pts = cells.flatMap(c => [[c.lat - half, c.lon - half], [c.lat + half, c.lon + half]] as L.LatLngTuple[])
      m.fitBounds(L.latLngBounds(pts), { padding: [20, 20], maxZoom: 13 })
    } else {
      m.setView([19.08, 72.95], 10)
    }
    setTimeout(() => m.invalidateSize(), 0)             // the card may have been laid out after the map was created
  }, [density, groups, target])

  return (
    <div>
      {hubTotals.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2 text-xs" role="group" aria-label="Zoom the map to">
          {[...[...hubTotals].sort((a, b) => b.stops - a.stops), { code: 'all', stops: hubTotals.reduce((n, h) => n + h.stops, 0) }].map(h => (
            <button key={h.code} onClick={() => setFocus(h.code)} aria-pressed={target === h.code}
              className={`rounded-md px-2 py-0.5 ring-1 ${target === h.code ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:text-slate-900'}`}>
              {h.code === 'all' ? 'Whole network' : h.code} <span className="tabular-nums opacity-70">{h.stops}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={el} className="h-80 w-full rounded-lg overflow-hidden ring-1 ring-slate-200" role="img"
        aria-label={`Map of delivery density: ${density.cells.length} areas, busiest with ${density.max_stops} deliveries`} />
    </div>
  )
}
