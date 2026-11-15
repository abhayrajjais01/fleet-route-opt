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
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <LeafletMap ref={mapRef} hubs={hubs} stops={stops} selectedHubId={selectedHubId} metrics={metrics} onSelectHub={setSelectedHubId}
          fitPadding={{ topLeft: [60, 60], bottomRight: [420, 60] }} />
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-16 z-[400] rounded-xl bg-white/95 backdrop-blur shadow-md ring-1 ring-slate-900/5 px-3 py-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900" />Hub</span>
        {Object.entries(PRIORITY_COLOR).map(([p, c]) => <span key={p} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{p.charAt(0) + p.slice(1).toLowerCase()}</span>)}
      </div>

      {/* Panel */}
      <div className="absolute top-4 right-4 bottom-4 w-[360px] z-[400] rounded-2xl bg-white shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[{ id: null as number | null, label: 'All hubs' }, ...hubs.map(h => ({ id: h.id as number | null, label: h.name.split(' ').slice(0, 2).join(' ') }))].map(o => (
              <button key={String(o.id)} onClick={() => setSelectedHubId(o.id)} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${selectedHubId === o.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{o.label}</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">Drive times for</span>
            <select value={vehicle} onChange={e => setVehicle(e.target.value as MatrixVehicleType)} className="border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-800 bg-white outline-none">
              {VEHICLES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {offline && <p className="mx-2 mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Distance engine offline at <span className="font-mono">{API_BASE}</span>. The map still shows every hub and stop.</p>}
          {error && <p className="mx-2 text-sm text-red-600">{error}</p>}
          {loading && <p className="mx-2 text-sm text-slate-400">Measuring distances…</p>}

          {selectedHub && (
            <>
              <button onClick={() => mapRef.current?.focusHub(selectedHub.id)} className="w-full text-left mx-0 px-2 pb-3">
                <p className="text-base font-semibold text-slate-900">{selectedHub.name}</p>
                <p className="text-sm text-slate-500">{selectedHub.address}</p>
                {rows.length > 0 && <p className="text-sm text-slate-600 mt-2">{rows.length} stops · {totalRoad.toFixed(0)} km of driving out · roads add {Math.round(((totalStraight > 0 ? totalRoad / totalStraight : 1) - 1) * 100)}% over straight lines</p>}
              </button>
              {hubStops.length === 0 && <p className="px-2 text-sm text-slate-400">No stops with a location at this hub yet.</p>}
              {rows.map((r, i) => (
                <button key={r.stop.id} onClick={() => mapRef.current?.focusStop(r.stop.id)} className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50">
                  <span className="w-7 h-7 rounded-full text-xs font-semibold text-white flex items-center justify-center flex-shrink-0" style={{ background: PRIORITY_COLOR[r.stop.priority] ?? PRIORITY_COLOR.STANDARD }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{r.stop.customer_name}</p>
                    <p className="text-xs text-slate-500 truncate">{r.stop.destination_address}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-slate-900 tabular-nums">{formatMinutes(r.minutes)}</p>
                    <p className="text-xs text-slate-500 tabular-nums">{r.roadKm.toFixed(1)} km</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {selectedHub === null && matrix && (
            <div className="px-2">
              <p className="text-sm text-slate-500 mb-3">Driving between hubs</p>
              <div className="space-y-2">
                {matrix.ids.flatMap((a, i) => matrix.ids.slice(i + 1).map((b, k) => {
                  const j = i + 1 + k
                  const ha = hubs.find(h => `hub-${h.id}` === a), hb = hubs.find(h => `hub-${h.id}` === b)
                  return (
                    <div key={a + b} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                      <p className="text-sm text-slate-800 flex-1">{ha?.name.split(' ')[0]} <span className="text-slate-400">↔</span> {hb?.name.split(' ')[0]}</p>
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900 tabular-nums">{formatMinutes(matrix.duration_min[i][j])}</p>
                        <p className="text-xs text-slate-500 tabular-nums">{matrix.distance_km[i][j].toFixed(0)} km</p>
                      </div>
                    </div>
                  )
                }))}
              </div>
            </div>
          )}
        </div>
        {matrix && <p className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400" title={`${matrix.ids.length}×${matrix.ids.length} matrix in ${matrix.computed_ms.toFixed(2)} ms · cache ${matrix.cache.hits} hits / ${matrix.cache.misses} misses`}>Road distance = straight line × detour factor · estimated drive times</p>}
      </div>
    </div>
  )
}
