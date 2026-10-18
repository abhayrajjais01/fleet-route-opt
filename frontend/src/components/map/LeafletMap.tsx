// ─── LEAFLET MAP (US-004, Track A: Manthan Nimodiya) ──────────────────────────
// Thin imperative wrapper around Leaflet with OpenStreetMap tiles (free, no API key).
// Draws distribution hubs, delivery waypoints and dashed hub→stop links for the selected hub.
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { PRIORITY_COLOR, escapeHtml, hubIcon, stopIcon } from './markers'
import { addBasemap } from './tiles'

export interface MapHub { id: number; name: string; code: string; address: string; latitude: number; longitude: number; operating_hours?: string }
export interface MapStop {
  id: number
  tracking_number: string
  customer_name: string
  destination_address: string
  latitude: number
  longitude: number
  priority: string
  status: string
  hub_id: number
  weight_kg: number
  time_window_start: string
  time_window_end: string
}
export interface StopMetric { rank: number; roadKm: number; minutes: number }
export interface MapHandle { focusStop: (id: number) => void; focusHub: (id: number) => void }


function hubPopup(h: MapHub, stopCount: number): string {
  return `<div style="font-family:'DM Sans',sans-serif;min-width:190px">
    <p style="margin:0;font:600 10px 'JetBrains Mono',monospace;color:#64748b">${escapeHtml(h.code)} · DISTRIBUTION HUB</p>
    <p style="margin:2px 0 4px;font-weight:700;color:#0f172a">${escapeHtml(h.name)}</p>
    <p style="margin:0;color:#475569;font-size:12px">${escapeHtml(h.address)}</p>
    <p style="margin:6px 0 0;color:#475569;font-size:11px">🕒 ${escapeHtml(h.operating_hours ?? '—')} · 📦 ${stopCount} stop${stopCount === 1 ? '' : 's'}</p>
    <p style="margin:2px 0 0;color:#94a3b8;font:10px 'JetBrains Mono',monospace">${h.latitude.toFixed(4)}, ${h.longitude.toFixed(4)}</p>
  </div>`
}

function stopPopup(s: MapStop, metric?: StopMetric): string {
  const color = PRIORITY_COLOR[s.priority] ?? PRIORITY_COLOR.STANDARD
  const eta = metric
    ? `<p style="margin:6px 0 0;padding:4px 6px;border-radius:6px;background:#f5f3ff;color:#5b21b6;font-size:11px">From hub: <b>${metric.roadKm.toFixed(1)} km</b> by road · ~<b>${Math.round(metric.minutes)} min</b></p>`
    : ''
  return `<div style="font-family:'DM Sans',sans-serif;min-width:200px">
    <p style="margin:0;display:flex;gap:6px;align-items:center">
      <span style="font:700 11px 'JetBrains Mono',monospace;color:#0f172a">${escapeHtml(s.tracking_number)}</span>
      <span style="padding:1px 5px;border-radius:4px;background:${color}1a;color:${color};font-size:9px;font-weight:700">${escapeHtml(s.priority)}</span>
    </p>
    <p style="margin:2px 0 4px;font-weight:700;color:#0f172a">${escapeHtml(s.customer_name)}</p>
    <p style="margin:0;color:#475569;font-size:12px">${escapeHtml(s.destination_address)}</p>
    <p style="margin:6px 0 0;color:#475569;font-size:11px">⏱ ${escapeHtml(s.time_window_start)}–${escapeHtml(s.time_window_end)} · ⚖ ${s.weight_kg} kg · ${escapeHtml(s.status.replace(/_/g, ' '))}</p>
    ${eta}
  </div>`
}

export default function LeafletMap({ hubs, stops, selectedHubId, metrics, onSelectHub, fitPadding, ref }: {
  hubs: MapHub[]
  stops: MapStop[]
  selectedHubId: number | null
  metrics: Record<number, StopMetric>
  onSelectHub: (id: number) => void
  fitPadding?: { topLeft: [number, number]; bottomRight: [number, number] } // keep routes clear of floating panels
  ref?: Ref<MapHandle>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<{ hubs: Map<number, L.Marker>; stops: Map<number, L.Marker> }>({ hubs: new Map(), stops: new Map() })
  const onSelectHubRef = useRef(onSelectHub)
  onSelectHubRef.current = onSelectHub

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = L.map(containerRef.current, { zoomControl: false }).setView([19.07, 72.88], 10)
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    addBasemap(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // Leaflet measures its container once; re-measure whenever the flex layout resizes it.
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(containerRef.current)
    return () => { observer.disconnect(); map.remove(); mapRef.current = null }
  }, [])

  // Redraw markers whenever data, selection or metrics change.
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current = { hubs: new Map(), stops: new Map() }

    const selectedHub = hubs.find(h => h.id === selectedHubId) ?? null
    for (const s of stops) {
      const inScope = !selectedHub || s.hub_id === selectedHub.id
      if (selectedHub && inScope) {
        L.polyline([[selectedHub.latitude, selectedHub.longitude], [s.latitude, s.longitude]], {
          color: PRIORITY_COLOR[s.priority] ?? PRIORITY_COLOR.STANDARD, weight: 2, opacity: 0.55, dashArray: '6 6',
        }).addTo(layer)
      }
      const label = inScope && metrics[s.id] ? metrics[s.id].rank : null
      const marker = L.marker([s.latitude, s.longitude], { icon: stopIcon(s.priority, label, !inScope), zIndexOffset: inScope ? 500 : 0 })
        .bindPopup(stopPopup(s, inScope ? metrics[s.id] : undefined))
        .addTo(layer)
      markersRef.current.stops.set(s.id, marker)
    }
    for (const h of hubs) {
      const count = stops.filter(s => s.hub_id === h.id).length
      const marker = L.marker([h.latitude, h.longitude], { icon: hubIcon(h.code, h.id === selectedHubId), zIndexOffset: 1000 })
        .bindPopup(hubPopup(h, count))
        .on('click', () => onSelectHubRef.current(h.id))
        .addTo(layer)
      markersRef.current.hubs.set(h.id, marker)
    }
  }, [hubs, stops, selectedHubId, metrics])

  // Fit the viewport to the selected hub's network (or everything) when the selection changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const scoped = selectedHubId === null ? stops : stops.filter(s => s.hub_id === selectedHubId)
    const scopedHubs = selectedHubId === null ? hubs : hubs.filter(h => h.id === selectedHubId)
    const pts: L.LatLngExpression[] = [...scopedHubs.map(h => [h.latitude, h.longitude] as [number, number]), ...scoped.map(s => [s.latitude, s.longitude] as [number, number])]
    if (pts.length === 1) map.setView(pts[0], 13)
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), fitPadding ? { paddingTopLeft: fitPadding.topLeft, paddingBottomRight: fitPadding.bottomRight, maxZoom: 13 } : { padding: [48, 48], maxZoom: 14 })
    // Deliberately keyed on counts, not array identity, so editing a stop does not reset the user's zoom.
  }, [selectedHubId, hubs.length, stops.length])

  useImperativeHandle(ref, () => ({
    focusStop: id => {
      const m = markersRef.current.stops.get(id)
      if (m && mapRef.current) { mapRef.current.flyTo(m.getLatLng(), Math.max(mapRef.current.getZoom(), 14), { duration: 0.6 }); m.openPopup() }
    },
    focusHub: id => {
      const m = markersRef.current.hubs.get(id)
      if (m && mapRef.current) { mapRef.current.flyTo(m.getLatLng(), Math.max(mapRef.current.getZoom(), 12), { duration: 0.6 }); m.openPopup() }
    },
  }), [])

  return <div ref={containerRef} className="w-full h-full z-0" />
}
