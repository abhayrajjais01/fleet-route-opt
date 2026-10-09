// ─── LIVE TRACKING MAP ────────────────────────────────────────────────────────
// Static layer (planned routes, stops, hubs) is rebuilt only when routes or stop states change; the dynamic
// layer (vehicles, driven path) updates every clock tick by moving existing markers instead of recreating them.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { escapeHtml, hubIcon, stopIcon, vehicleIcon } from '../map/markers'
import { clock } from '../../lib/geo'
import type { StopState, TripView } from './simulation'

const STOP_COLOR: Record<StopState, string> = {
  PENDING: '#94a3b8', NEXT: '#2563eb', ARRIVED: '#7c3aed', DELIVERED: '#16a34a', FAILED: '#dc2626', BLOCKED: '#f59e0b',
}
const PRIORITY_FOR_STATE: Record<StopState, string> = { PENDING: 'LOW', NEXT: 'STANDARD', ARRIVED: 'STANDARD', DELIVERED: 'STANDARD', FAILED: 'EXPRESS', BLOCKED: 'HIGH' }

export default function TrackingMap({ views, colors, selectedId, onSelect, focusKey }: {
  views: TripView[]
  colors: Record<string, string>
  selectedId: string | null
  onSelect: (id: string) => void
  focusKey: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const staticLayer = useRef<L.LayerGroup | null>(null)
  const trailLayer = useRef<L.LayerGroup | null>(null)
  const vehicles = useRef(new Map<string, { marker: L.Marker; iconKey: string }>())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const fitRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true }).setView([19.07, 72.9], 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)
    staticLayer.current = L.layerGroup().addTo(map)
    trailLayer.current = L.layerGroup().addTo(map)
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

  // Static layer: routes, stops, hubs.
  const staticKey = JSON.stringify([selectedId, views.map(v => [v.plan.id, v.stops.map(s => s.state + (s.late ? '!' : ''))])])
  useEffect(() => {
    const layer = staticLayer.current
    if (!layer) return
    layer.clearLayers()
    const hubsDrawn = new Set<number>()
    for (const v of views) {
      const color = colors[v.plan.id]
      const dim = selectedId !== null && selectedId !== v.plan.id
      L.polyline(v.path, { color, weight: 3, opacity: dim ? 0.15 : 0.45, dashArray: '2 8', lineCap: 'round' }).addTo(layer)
      v.stops.forEach((s, i) => {
        const late = s.late && s.state !== 'DELIVERED' && s.state !== 'FAILED'
        L.marker([s.shipment.latitude!, s.shipment.longitude!], { icon: stopIcon(PRIORITY_FOR_STATE[s.state], i + 1, dim), zIndexOffset: 200 })
          .bindPopup(`<div style="font-family:'DM Sans',sans-serif;min-width:190px">
            <p style="margin:0;font:700 11px 'JetBrains Mono',monospace">${escapeHtml(s.shipment.tracking_number)} · stop ${i + 1}</p>
            <p style="margin:2px 0;font-weight:700">${escapeHtml(s.shipment.customer_name)}</p>
            <p style="margin:0;font-size:12px;color:#475569">${escapeHtml(s.shipment.destination_address)}</p>
            <p style="margin:6px 0 0;font-size:11px"><b style="color:${STOP_COLOR[s.state]}">${s.state}</b> · ETA ${Number.isFinite(s.eta) ? clock(s.eta) : '—'} · window ${escapeHtml(s.shipment.time_window_start)}–${escapeHtml(s.shipment.time_window_end)}</p>
            ${late ? `<p style="margin:4px 0 0;font-size:11px;color:#b45309;font-weight:700">⚠ SLA risk: ${Math.round(s.lateBy)} min past window</p>` : ''}
          </div>`)
          .addTo(layer)
        if (late) L.circleMarker([s.shipment.latitude!, s.shipment.longitude!], { radius: 18, color: '#f59e0b', weight: 2, fillOpacity: 0.08, opacity: dim ? 0.3 : 0.9 }).addTo(layer)
      })
      if (!hubsDrawn.has(v.plan.hub.id)) {
        hubsDrawn.add(v.plan.hub.id)
        L.marker([v.plan.hub.latitude, v.plan.hub.longitude], { icon: hubIcon(v.plan.hub.code, false), zIndexOffset: 300 }).addTo(layer)
      }
    }
    // Keyed on staticKey (route ids + stop states), not on `views`, which is a new array every tick.
  }, [staticKey])

  // Dynamic layer: vehicle markers + driven trail, every tick.
  useEffect(() => {
    const map = mapRef.current, trail = trailLayer.current
    if (!map || !trail) return
    trail.clearLayers()
    const seen = new Set<string>()
    for (const v of views) {
      seen.add(v.plan.id)
      const color = colors[v.plan.id]
      const dim = selectedId !== null && selectedId !== v.plan.id
      if (v.pathDone.length > 1) L.polyline(v.pathDone, { color, weight: 5, opacity: dim ? 0.25 : 0.9, lineCap: 'round' }).addTo(trail)
      const moving = v.speedKmh > 0 && v.state !== 'ROUTE_BLOCKED'
      const iconColor = v.state === 'ROUTE_BLOCKED' ? '#dc2626' : color
      const iconKey = `${iconColor}|${moving}|${selectedId === v.plan.id}`
      const existing = vehicles.current.get(v.plan.id)
      if (existing) {
        existing.marker.setLatLng(v.position)
        if (existing.iconKey !== iconKey) { existing.marker.setIcon(vehicleIcon(iconColor, v.plan.vehicle.plate_number, moving, selectedId === v.plan.id)); existing.iconKey = iconKey }
        existing.marker.setOpacity(dim ? 0.5 : 1)
      } else {
        const marker = L.marker(v.position, { icon: vehicleIcon(iconColor, v.plan.vehicle.plate_number, moving, selectedId === v.plan.id), zIndexOffset: 1000 })
          .on('click', () => onSelectRef.current(v.plan.id))
          .addTo(map)
        vehicles.current.set(v.plan.id, { marker, iconKey })
      }
    }
    for (const [id, entry] of vehicles.current) if (!seen.has(id)) { entry.marker.remove(); vehicles.current.delete(id) }
  })

  // Re-fit when the set of trips or the selection changes.
  fitRef.current = () => {
    const map = mapRef.current
    if (!map || !views.length || !containerRef.current?.clientWidth) return
    const scoped = selectedId ? views.filter(v => v.plan.id === selectedId) : views
    const pts = scoped.flatMap(v => v.path)
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14 })
  }
  useEffect(() => fitRef.current(), [focusKey, selectedId])

  return <div ref={containerRef} className="w-full h-full z-0" />
}
