// ─── LIVE TRACKING MAP ────────────────────────────────────────────────────────
// Calm by default: every trip shows a faint route and small stop dots; the selected (or hovered) trip gets
// numbered pins in its stop-state colours and a bold route. The static layer is rebuilt only when routes,
// stop states or focus change; vehicles move every tick by updating existing markers.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { escapeHtml, hubIcon, pinIcon, vehicleIcon } from '../map/markers'
import { addBasemap } from '../map/tiles'
import { clock } from '../../lib/geo'
import type { StopState, TripView } from './simulation'

export const STOP_COLOR: Record<StopState, string> = {
  PENDING: '#94a3b8', NEXT: '#2563eb', ARRIVED: '#7c3aed', DELIVERED: '#16a34a', FAILED: '#dc2626', BLOCKED: '#f59e0b',
}

export interface MapInsets { left: number; right: number; bottom: number; top: number }

export default function TrackingMap({ views, colors, selectedId, hoveredId, onSelect, focusKey, insets }: {
  views: TripView[]
  colors: Record<string, string>
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string | null) => void
  focusKey: string
  insets: MapInsets // space covered by floating panels, kept clear when fitting routes
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const staticLayer = useRef<L.LayerGroup | null>(null)
  const trailLayer = useRef<L.LayerGroup | null>(null)
  const vehicles = useRef(new Map<string, { marker: L.Marker; iconKey: string }>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const fitRef = useRef<() => void>(() => {})
  const focusId = selectedId ?? hoveredId

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: false }).setView([19.07, 72.9], 11)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    addBasemap(map)
    staticLayer.current = L.layerGroup().addTo(map)
    trailLayer.current = L.layerGroup().addTo(map)
    map.on('click', () => onSelectRef.current(null))
    mapRef.current = map
    // The page can mount hidden (0×0); when it first becomes visible, measure and fit the routes.
    let wasHidden = containerRef.current.clientWidth === 0
    const ro = new ResizeObserver(entries => {
      map.invalidateSize()
      const hidden = entries[0].contentRect.width === 0
      if (wasHidden && !hidden) fitRef.current()
      wasHidden = hidden
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; vehicles.current.clear() }
  }, [])

  const staticKey = JSON.stringify([focusId, views.map(v => [v.plan.id, v.stops.map(s => s.state + (s.late ? '!' : ''))])])
  useEffect(() => {
    const layer = staticLayer.current
    if (!layer) return
    layer.clearLayers()
    const hubsDrawn = new Set<number>()
    for (const v of views) {
      const color = colors[v.plan.id]
      const focused = focusId === v.plan.id
      const faded = focusId !== null && !focused
      L.polyline(v.path, { color, weight: focused ? 4 : 2.5, opacity: faded ? 0.12 : focused ? 0.55 : 0.35, dashArray: focused ? undefined : '1 7', lineCap: 'round', interactive: false }).addTo(layer)
      v.stops.forEach((s, i) => {
        const at: [number, number] = [s.shipment.latitude!, s.shipment.longitude!]
        if (!focused) {
          L.circleMarker(at, { radius: 5, color: '#fff', weight: 2, fillColor: color, fillOpacity: faded ? 0.3 : 0.9, opacity: faded ? 0.4 : 1 })
            .bindTooltip(`${escapeHtml(s.shipment.customer_name)} · ${s.state.toLowerCase()}`, { direction: 'top', offset: [0, -6] })
            .on('click', e => { L.DomEvent.stopPropagation(e); onSelectRef.current(v.plan.id) })
            .addTo(layer)
          return
        }
        const late = s.late && s.state !== 'DELIVERED' && s.state !== 'FAILED'
        if (late) L.circleMarker(at, { radius: 20, color: '#f59e0b', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(layer)
        L.marker(at, { icon: pinIcon(STOP_COLOR[s.state], i + 1), zIndexOffset: 400 })
          .bindPopup(`<div style="font-family:'DM Sans',sans-serif;min-width:200px">
            <p style="margin:0;font-weight:700;color:#0f172a">${i + 1}. ${escapeHtml(s.shipment.customer_name)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b">${escapeHtml(s.shipment.destination_address)}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#334155">ETA <b>${Number.isFinite(s.eta) ? clock(s.eta) : '—'}</b> · window ${escapeHtml(s.shipment.time_window_start)}–${escapeHtml(s.shipment.time_window_end)}</p>
            ${late ? `<p style="margin:4px 0 0;font-size:12px;color:#b45309;font-weight:600">Expected ${Math.round(s.lateBy)} min after the window closes</p>` : ''}
          </div>`)
          .addTo(layer)
      })
      if (!hubsDrawn.has(v.plan.hub.id)) {
        hubsDrawn.add(v.plan.hub.id)
        L.marker([v.plan.hub.latitude, v.plan.hub.longitude], { icon: hubIcon(v.plan.hub.code, false), zIndexOffset: 300, interactive: false }).addTo(layer)
      }
    }
  }, [staticKey]) // keyed on content: `views` is a new array every tick

  useEffect(() => {
    const map = mapRef.current, trail = trailLayer.current
    if (!map || !trail) return
    trail.clearLayers()
    const seen = new Set<string>()
    for (const v of views) {
      seen.add(v.plan.id)
      const color = colors[v.plan.id]
      const focused = focusId === v.plan.id
      const faded = focusId !== null && !focused
      if (v.pathDone.length > 1) L.polyline(v.pathDone, { color, weight: focused ? 6 : 4, opacity: faded ? 0.2 : 0.9, lineCap: 'round', interactive: false }).addTo(trail)
      const moving = v.speedKmh > 0 && v.state !== 'ROUTE_BLOCKED'
      const iconColor = v.state === 'ROUTE_BLOCKED' ? '#dc2626' : color
      const iconKey = `${iconColor}|${moving}|${selectedId === v.plan.id}|${focused}`
      const existing = vehicles.current.get(v.plan.id)
      const icon = () => vehicleIcon(iconColor, v.plan.vehicle.plate_number, moving, selectedId === v.plan.id, focused)
      if (existing) {
        existing.marker.setLatLng(v.position)
        if (existing.iconKey !== iconKey) { existing.marker.setIcon(icon()); existing.iconKey = iconKey }
        existing.marker.setOpacity(faded ? 0.45 : 1)
      } else {
        const marker = L.marker(v.position, { icon: icon(), zIndexOffset: 1000 })
          .on('click', e => { L.DomEvent.stopPropagation(e); onSelectRef.current(v.plan.id) })
          .addTo(map)
        vehicles.current.set(v.plan.id, { marker, iconKey })
      }
    }
    for (const [id, entry] of vehicles.current) if (!seen.has(id)) { entry.marker.remove(); vehicles.current.delete(id) }
  })

  fitRef.current = () => {
    const map = mapRef.current
    if (!map || !views.length || !containerRef.current?.clientWidth) return
    const scoped = selectedId ? views.filter(v => v.plan.id === selectedId) : views
    const pts = scoped.flatMap(v => v.path)
    if (pts.length) map.flyToBounds(L.latLngBounds(pts), {
      paddingTopLeft: [insets.left + 40, insets.top + 40], paddingBottomRight: [insets.right + 40, insets.bottom + 40], maxZoom: 14, duration: 0.6,
    })
  }
  useEffect(() => fitRef.current(), [focusKey, selectedId])

  return <div ref={containerRef} className="absolute inset-0 z-0" />
}
