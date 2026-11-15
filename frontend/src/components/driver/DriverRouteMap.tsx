// ─── DRIVER ROUTE MAP (mobile cockpit) ────────────────────────────────────────
// The driver follows the route the dispatcher approved, so the map shows exactly that plan:
// depot → numbered stops in sequence → depot. Completed legs fade, the leg to the current stop is
// highlighted, and the truck sits at its last known point (depot, last finished stop, or the stop it
// checked in at). Real GPS is opt-in ("my location"), never requested on load.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { escapeHtml, hubIcon, pinIcon, vehicleIcon } from '../map/markers'
import { addBasemap } from '../map/tiles'

export interface DriverMapStop {
  id: number
  seq: number
  name: string
  address: string
  lat: number
  lon: number
  window: string
  status: string
}

const DONE = '#16a34a'
const FAILED = '#dc2626'
const CURRENT = '#2563eb'
const PENDING = '#64748b'

export default function DriverRouteMap({ depot, stops, currentId, selectedId, plate, userPos, onSelect }: {
  depot: { lat: number; lon: number; code: string } | null
  stops: DriverMapStop[]
  currentId: number | null
  selectedId: number | null
  plate: string
  userPos: { lat: number; lon: number; accuracy: number } | null
  onSelect: (id: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fittedShape = useRef('')       // route geometry the view was last fitted to
  const lastPath = useRef<[number, number][]>([])
  const lastSelected = useRef<number | null>(null)

  // Fit once layout has settled (setTimeout, not rAF, so it also runs in background tabs); called whenever the route's shape changes (not on status updates).
  function fitRoute(force = false) {
    const path = lastPath.current
    if (!mapRef.current || path.length < 2 || !ref.current?.clientWidth) return
    const shape = JSON.stringify(path)
    if (!force && shape === fittedShape.current) return
    fittedShape.current = shape
    setTimeout(() => {
      const m = mapRef.current // the live map: in dev StrictMode the first instance is already gone
      if (!m) return
      m.invalidateSize()
      m.fitBounds(L.latLngBounds(path), { padding: [28, 28], maxZoom: 14 })
    }, 0)
  }

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView([19.07, 72.88], 11)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    addBasemap(map)
    layer.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // The cockpit can mount before it has a size; fit the route as soon as it does.
    const ro = new ResizeObserver(() => { map.invalidateSize(); fitRoute() })
    ro.observe(ref.current)
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; fittedShape.current = ''; lastSelected.current = null }
  }, [])

  const key = JSON.stringify([depot, stops.map(s => [s.id, s.status, s.lat, s.lon]), currentId, selectedId, userPos])
  useEffect(() => {
    const map = mapRef.current, g = layer.current
    if (!map || !g) return
    g.clearLayers()
    const pts = (s: DriverMapStop) => [s.lat, s.lon] as [number, number]
    const path: [number, number][] = [...(depot ? [[depot.lat, depot.lon] as [number, number]] : []), ...stops.map(pts), ...(depot ? [[depot.lat, depot.lon] as [number, number]] : [])]
    const curIdx = stops.findIndex(s => s.id === currentId)
    lastPath.current = path

    // Whole planned route, then the finished part faded and the leg to the current stop highlighted.
    if (path.length > 1) {
      L.polyline(path, { color: '#fff', weight: 7, opacity: 0.9, interactive: false }).addTo(g)
      L.polyline(path, { color: CURRENT, weight: 3.5, opacity: 0.55, lineCap: 'round', interactive: false }).addTo(g)
      const offset = depot ? 1 : 0
      if (curIdx > -1) {
        const done = path.slice(0, curIdx + offset)
        if (done.length > 1) L.polyline(done, { color: '#94a3b8', weight: 4, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(g)
        const legFrom = path[curIdx + offset - 1] ?? path[0]
        L.polyline([legFrom, pts(stops[curIdx])], { color: CURRENT, weight: 5, opacity: 1, dashArray: '8 8', lineCap: 'round', interactive: false }).addTo(g)
      }
    }

    if (depot) L.marker([depot.lat, depot.lon], { icon: hubIcon(depot.code, false), zIndexOffset: 500, interactive: false }).addTo(g)

    stops.forEach(s => {
      const isCur = s.id === currentId
      const color = s.status === 'DELIVERED' ? DONE : s.status === 'FAILED' ? FAILED : isCur ? CURRENT : PENDING
      if (s.id === selectedId) L.circleMarker(pts(s), { radius: 20, color: CURRENT, weight: 2, fillColor: CURRENT, fillOpacity: 0.12, interactive: false }).addTo(g)
      L.marker(pts(s), { icon: pinIcon(color, s.status === 'DELIVERED' ? '✓' : s.seq, s.status === 'DELIVERED' && s.id !== selectedId), zIndexOffset: isCur || s.id === selectedId ? 900 : 400 })
        .bindTooltip(`${s.seq}. ${escapeHtml(s.name)} · ${escapeHtml(s.window)}`, { direction: 'top', offset: [0, -34] })
        .on('click', () => onSelect(s.id))
        .addTo(g)
    })

    // Truck at its last known point on the plan.
    if (stops.length) {
      const cur = curIdx > -1 ? stops[curIdx] : null
      const lastDone = [...stops].reverse().find(s => s.status === 'DELIVERED' || s.status === 'FAILED')
      const at: [number, number] | null = cur?.status === 'ARRIVED' ? pts(cur) : lastDone ? pts(lastDone) : depot ? [depot.lat, depot.lon] : null
      if (at) L.marker(at, { icon: vehicleIcon(CURRENT, plate, !!cur && cur.status !== 'ARRIVED', false, false), zIndexOffset: 1000, interactive: false }).addTo(g)
    }

    if (userPos) {
      L.circle([userPos.lat, userPos.lon], { radius: Math.min(userPos.accuracy, 500), color: '#0ea5e9', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(g)
      L.circleMarker([userPos.lat, userPos.lon], { radius: 7, color: '#fff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1, interactive: false }).addTo(g)
    }

    fitRoute()
    // Only follow the selection when the driver actually picks a different stop.
    if (selectedId !== lastSelected.current) {
      const sel = lastSelected.current !== null ? stops.find(s => s.id === selectedId) : null
      lastSelected.current = selectedId
      if (sel) map.panTo(pts(sel), { animate: true })
    }
  }, [key])

  const recenter = () => fitRoute(true)

  useEffect(() => {
    if (userPos && mapRef.current) mapRef.current.setView([userPos.lat, userPos.lon], Math.max(mapRef.current.getZoom(), 14), { animate: true })
  }, [userPos?.lat, userPos?.lon])

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-0 z-0" />
      <button onClick={recenter} className="absolute top-2 left-2 z-[400] px-2.5 py-1 rounded-lg bg-white/95 text-slate-700 text-[11px] font-semibold shadow">
        Whole route
      </button>
    </div>
  )
}
