// ─── ROUTE PLAN MAP (Week 7) ──────────────────────────────────────────────────
// Colour-coded route polylines (hub → stops → hub, along the real roads) with numbered stop pins and ETA popups. Hovering a route in
// the manifest highlights it here; other routes fade. Unplanned candidate stops show as grey dots.
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { escapeHtml, hubIcon, pinIcon } from '../map/markers'
import { addBasemap } from '../map/tiles'
import { roadRoute } from '../../lib/roads'
import type { LatLng } from '../../lib/geo'

export interface PlanMapStop { id: string; name: string; lat: number; lon: number; eta?: string; window: string; late?: boolean }
export interface PlanMapRoute { id: string; label: string; color: string; stops: PlanMapStop[] }

export default function RoutePlanMap({ hub, routes, pending, focusId, padding }: {
  hub: { code: string; lat: number; lon: number }
  routes: PlanMapRoute[]
  pending: PlanMapStop[]
  focusId: string | null
  padding: { left: number; right: number }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const lastFit = useRef('')                                        // stop set the view was last fitted to
  const [roads, setRoads] = useState<Record<string, LatLng[]>>({})  // waypoint key → road path

  const waypointsOf = (r: PlanMapRoute): LatLng[] => [[hub.lat, hub.lon], ...r.stops.map(s => [s.lat, s.lon] as LatLng), [hub.lat, hub.lon]]
  const routeKeys = routes.map(r => JSON.stringify(waypointsOf(r)))
  useEffect(() => {
    let live = true
    routes.forEach((r, i) => {
      const k = routeKeys[i]
      if (roads[k]) return
      roadRoute(waypointsOf(r)).then(res => { if (live && res.source === 'road') setRoads(m => ({ ...m, [k]: res.legs.flatMap(l => l.path) })) })
    })
    return () => { live = false }
  }, [routeKeys.join('|')])

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { zoomControl: false }).setView([hub.lat, hub.lon], 11)
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    addBasemap(map)
    layer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(ref.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; lastFit.current = '' }
  }, [])

  const key = JSON.stringify([hub.code, focusId, routes.map((r, i) => [r.id, !!roads[routeKeys[i]], r.stops.map(s => s.id + (s.eta ?? '') + (s.late ? '!' : ''))]), pending.map(p => p.id)])
  const fitKey = JSON.stringify([hub.code, focusId, routeKeys, pending.map(p => p.id), padding.left, padding.right])
  useEffect(() => {
    const map = mapRef.current, g = layer.current
    if (!map || !g) return
    g.clearLayers()
    for (const p of pending) {
      L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#64748b', fillOpacity: 0.9 })
        .bindTooltip(`${escapeHtml(p.name)} · window ${escapeHtml(p.window)}`, { direction: 'top', offset: [0, -6] }).addTo(g)
    }
    routes.forEach((r, ri) => {
      const faded = focusId !== null && focusId !== r.id
      const path: L.LatLngExpression[] = roads[routeKeys[ri]] ?? waypointsOf(r)
      L.polyline(path, { color: '#fff', weight: focusId === r.id ? 8 : 6, opacity: faded ? 0.2 : 0.9, interactive: false }).addTo(g)
      L.polyline(path, { color: r.color, weight: focusId === r.id ? 5 : 3.5, opacity: faded ? 0.18 : 0.9, lineCap: 'round', interactive: false }).addTo(g)
      r.stops.forEach((s, i) => {
        if (s.late && !faded) L.circleMarker([s.lat, s.lon], { radius: 19, color: '#d97706', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(g)
        L.marker([s.lat, s.lon], { icon: pinIcon(r.color, i + 1, faded), zIndexOffset: faded ? 0 : 400 })
          .bindPopup(`<div style="font-family:'DM Sans',sans-serif;min-width:190px">
            <p style="margin:0;font-weight:700;color:#0f172a">${i + 1}. ${escapeHtml(s.name)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b">${escapeHtml(r.label)}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#334155">ETA <b>${escapeHtml(s.eta ?? '—')}</b> · window ${escapeHtml(s.window)}</p>
            ${s.late ? '<p style="margin:4px 0 0;font-size:12px;color:#b45309;font-weight:600">Arrives after the window closes</p>' : ''}
          </div>`).addTo(g)
      })
    })
    L.marker([hub.lat, hub.lon], { icon: hubIcon(hub.code, true), zIndexOffset: 1000, interactive: false }).addTo(g)

    const pts: L.LatLngExpression[] = [[hub.lat, hub.lon], ...pending.map(p => [p.lat, p.lon] as [number, number]),
      ...routes.flatMap(r => (focusId && focusId !== r.id ? [] : r.stops.map(s => [s.lat, s.lon] as [number, number])))]
    // Refit only when the set of stops changes, not when a road path arrives or an ETA updates.
    if (pts.length > 1 && ref.current?.clientWidth && lastFit.current !== fitKey) {
      lastFit.current = fitKey
      map.invalidateSize()
      map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [padding.left + 40, 40], paddingBottomRight: [padding.right + 40, 40], maxZoom: 13 })
    }
  }, [key, padding.left, padding.right]) // keyed on content; routes/pending arrays are rebuilt every render

  return <div ref={ref} className="absolute inset-0 z-0" />
}
