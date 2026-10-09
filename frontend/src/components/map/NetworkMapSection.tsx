// ─── NETWORK MAP (US-004, Track A: Manthan Nimodiya) ──────────────────────────
// Week 5 spatial view: hubs and delivery waypoints on an OpenStreetMap canvas, with road-distance and
// drive-time estimates from the backend distance-matrix engine (/api/v1/routes/distance-matrix).
import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { routesApi, type DistanceMatrixResponse, type MatrixVehicleType } from '../../lib/routesApi'
import LeafletMap, { type MapHandle, type MapHub, type MapStop, type StopMetric } from './LeafletMap'
import { PRIORITY_COLOR } from './markers'

type ShipmentLike = Omit<MapStop, 'latitude' | 'longitude'> & { latitude?: number; longitude?: number }

const VEHICLES: { value: MatrixVehicleType; label: string }[] = [
  { value: 'VAN', label: 'Van' },
  { value: 'EV', label: 'EV' },
  { value: 'BOX_TRUCK', label: 'Box truck' },
  { value: 'SEMI_TRUCK', label: 'Semi truck' },
]

function formatMinutes(min: number): string {
  const m = Math.round(min)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export default function NetworkMapSection({ hubs, shipments }: { hubs: MapHub[]; shipments: ShipmentLike[] }) {
  const [selectedHubId, setSelectedHubId] = useState<number | null>(hubs[0]?.id ?? null)
  const [vehicle, setVehicle] = useState<MatrixVehicleType>('VAN')
  const [matrix, setMatrix] = useState<DistanceMatrixResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<MapHandle>(null)

  const stops: MapStop[] = useMemo(
    () => shipments.filter((s): s is MapStop => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)),
    [shipments],
  )
  const missingCoords = shipments.length - stops.length
  const selectedHub = hubs.find(h => h.id === selectedHubId) ?? null
  const hubStops = useMemo(() => (selectedHub ? stops.filter(s => s.hub_id === selectedHub.id) : []), [stops, selectedHub])

  // Points sent to the distance engine: hub first, then its stops (or every hub when viewing the whole network).
  const points = useMemo(() => {
    if (selectedHub) {
      return [
        { id: `hub-${selectedHub.id}`, latitude: selectedHub.latitude, longitude: selectedHub.longitude },
        ...hubStops.map(s => ({ id: `stop-${s.id}`, latitude: s.latitude, longitude: s.longitude })),
      ]
    }
    return hubs.map(h => ({ id: `hub-${h.id}`, latitude: h.latitude, longitude: h.longitude }))
  }, [selectedHub, hubStops, hubs])
  const pointsKey = JSON.stringify(points)

  useEffect(() => {
    if (points.length < 2) { setMatrix(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    routesApi.distanceMatrix(points, vehicle)
      .then(m => { if (!cancelled) { setMatrix(m); setOffline(false) } })
      .catch(e => {
        if (cancelled) return
        setMatrix(null)
        // fetch() rejects with a TypeError when the backend is unreachable
        if (e instanceof TypeError) setOffline(true)
        else setError((e as Error).message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // pointsKey captures every coordinate change; `points` itself is rebuilt each render.
  }, [pointsKey, vehicle])

  // Rank the selected hub's stops by road distance from the hub (row 0 of the matrix).
  const rows = useMemo(() => {
    if (!selectedHub || !matrix || matrix.ids[0] !== `hub-${selectedHub.id}`) return []
    return hubStops
      .map(s => {
        const j = matrix.ids.indexOf(`stop-${s.id}`)
        return j < 0 ? null : { stop: s, straightKm: matrix.straight_km[0][j], roadKm: matrix.distance_km[0][j], minutes: matrix.duration_min[0][j] }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.roadKm - b.roadKm)
  }, [matrix, hubStops, selectedHub])

  const metrics = useMemo(() => {
    const out: Record<number, StopMetric> = {}
    rows.forEach((r, i) => { out[r.stop.id] = { rank: i + 1, roadKm: r.roadKm, minutes: r.minutes } })
    return out
  }, [rows])

  const totalRoad = rows.reduce((sum, r) => sum + r.roadKm, 0)
  const totalStraight = rows.reduce((sum, r) => sum + r.straightKm, 0)

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Map ── */}
      <div className="flex-1 min-w-0 relative">
        <LeafletMap ref={mapRef} hubs={hubs} stops={stops} selectedHubId={selectedHubId} metrics={metrics} onSelectHub={setSelectedHubId} />
        <div className="absolute top-3 right-3 z-[400] bg-white/95 border border-slate-200 rounded-xl px-3 py-2 shadow-sm text-[10px] text-slate-600 space-y-1">
          <p className="font-semibold text-slate-500 uppercase tracking-wider">Legend</p>
          <p className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900 inline-block" />Distribution hub</p>
          {Object.entries(PRIORITY_COLOR).map(([p, c]) => <p key={p} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full inline-block" style={{ background: c }} />{p} stop</p>)}
          <p className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-slate-400 inline-block" />Hub → stop link</p>
        </div>
      </div>

      {/* ── Side panel ── */}
      <aside className="w-[340px] flex-shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Network Map</p>
            <p className="text-[11px] text-slate-400">{hubs.length} hubs · {stops.length} stops plotted{missingCoords > 0 && ` · ${missingCoords} without coordinates`}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setSelectedHubId(null)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${selectedHubId === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>All hubs</button>
            {hubs.map(h => (
              <button key={h.id} onClick={() => setSelectedHubId(h.id)} className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border font-mono transition-colors ${selectedHubId === h.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>{h.code}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vehicle</span>
            <select value={vehicle} onChange={e => setVehicle(e.target.value as MatrixVehicleType)} className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 bg-white outline-none">
              {VEHICLES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {offline && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 text-[11px] text-amber-800">
              Distance engine unreachable at <span className="font-mono">{API_BASE}</span>. The map still shows every hub and stop; start the backend for road distances and drive times.
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {loading && <p className="text-xs text-slate-400 flex items-center gap-2"><span className="w-3 h-3 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />Computing distance matrix…</p>}

          {selectedHub && (
            <>
              <button onClick={() => mapRef.current?.focusHub(selectedHub.id)} className="w-full text-left p-3 rounded-xl bg-slate-900 text-white">
                <p className="font-mono text-[10px] text-slate-400">{selectedHub.code} · origin</p>
                <p className="text-sm font-semibold">{selectedHub.name}</p>
                <p className="text-[11px] text-slate-300">{selectedHub.address}</p>
              </button>
              {rows.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-sm font-bold text-slate-800">{rows.length}</p><p className="text-[10px] text-slate-400">stops</p></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-sm font-bold text-slate-800">{totalRoad.toFixed(1)}</p><p className="text-[10px] text-slate-400">road km (out)</p></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="text-sm font-bold text-slate-800">{totalStraight > 0 ? (totalRoad / totalStraight).toFixed(2) : '—'}×</p><p className="text-[10px] text-slate-400">detour</p></div>
                </div>
              )}
              {hubStops.length === 0 && <p className="text-xs text-slate-400 p-2">No geocoded stops assigned to this hub yet.</p>}
              {rows.map((r, i) => (
                <button key={r.stop.id} onClick={() => mapRef.current?.focusStop(r.stop.id)} className="w-full text-left p-3 border border-slate-200 rounded-xl hover:border-violet-300 hover:bg-violet-50/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: PRIORITY_COLOR[r.stop.priority] ?? PRIORITY_COLOR.STANDARD }}>{i + 1}</span>
                    <span className="font-mono text-[11px] font-bold text-slate-700">{r.stop.tracking_number}</span>
                    <span className="ml-auto text-[10px] font-semibold" style={{ color: PRIORITY_COLOR[r.stop.priority] }}>{r.stop.priority}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 truncate">{r.stop.customer_name} · {r.stop.destination_address}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    <span className="font-semibold text-slate-800">{r.roadKm.toFixed(1)} km</span>
                    <span className="text-slate-400">({r.straightKm.toFixed(1)} km straight)</span>
                    <span className="ml-auto font-semibold text-violet-700">~{formatMinutes(r.minutes)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Window {r.stop.time_window_start}–{r.stop.time_window_end} · {r.stop.weight_kg} kg</p>
                </button>
              ))}
            </>
          )}

          {selectedHub === null && matrix && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Hub-to-hub road distance · drive time</p>
              <table className="w-full text-[11px]">
                <thead><tr><th />{matrix.ids.map(id => <th key={id} className="font-mono text-[10px] text-slate-400 font-semibold p-1">{hubs.find(h => `hub-${h.id}` === id)?.code.replace('HUB-', '')}</th>)}</tr></thead>
                <tbody>
                  {matrix.ids.map((rowId, i) => (
                    <tr key={rowId} className="border-t border-slate-100">
                      <td className="font-mono text-[10px] text-slate-400 font-semibold p-1">{hubs.find(h => `hub-${h.id}` === rowId)?.code.replace('HUB-', '')}</td>
                      {matrix.distance_km[i].map((km, j) => (
                        <td key={j} className="p-1 text-center">{i === j ? <span className="text-slate-300">—</span> : <><p className="font-semibold text-slate-700">{km.toFixed(0)} km</p><p className="text-[10px] text-violet-600">{formatMinutes(matrix.duration_min[i][j])}</p></>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {matrix && (
          <p className="px-4 py-2 border-t border-slate-200 text-[10px] font-mono text-slate-400">
            {matrix.ids.length}×{matrix.ids.length} matrix · {matrix.computed_ms.toFixed(2)} ms · cache {matrix.cache.hits} hit / {matrix.cache.misses} miss · haversine × detour factor
          </p>
        )}
      </aside>
    </div>
  )
}
