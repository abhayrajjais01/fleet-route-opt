import React, { useState, useEffect, useMemo } from 'react'
import type { Driver, Hub, Shipment, Vehicle } from '../../lib/types'
import { arriveAtStop, deliverShipment, failDelivery, reportDelay as apiReportDelay } from '../../lib/transitApi'
import { API_V1 } from '../../lib/api'

interface MobileDriverCockpitProps {
  shipments: Shipment[]
  vehicle: Vehicle | null
  driver: Driver | null
  hub: Hub | null
  authToken: string | null
  onUpdateShipmentStatus: (shipmentId: number, newStatus: string) => void
  onClose?: () => void
}

interface QueuedAction {
  id: string
  actionType: 'ARRIVE' | 'DELIVER' | 'FAIL' | 'DELAY'
  shipmentId: number
  payload: any
  timestamp: string
  lastError?: string // set when the server rejected it on the last sync; kept for retry/review
}

// Subset of GET /transit/driver/manifest used by the cockpit
interface ServerManifest {
  driver_name: string
  vehicle_id: number | null
  vehicle_plate: string | null
  hub_code: string | null
  stops: Array<Pick<Shipment, 'tracking_number' | 'customer_name' | 'destination_address' | 'latitude' | 'longitude' | 'weight_kg' | 'volume_m3' | 'time_window_start' | 'time_window_end' | 'priority' | 'status'> & { shipment_id: number; sequence_index: number }>
}

const MANIFEST_CACHE_KEY = 'fleet_driver_manifest_cache'

export default function MobileDriverCockpit({
  shipments,
  vehicle,
  driver,
  hub,
  authToken,
  onUpdateShipmentStatus,
  onClose,
}: MobileDriverCockpitProps) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [offlineQueue, setOfflineQueue] = useState<QueuedAction[]>(() => {
    try {
      const saved = localStorage.getItem('fleet_driver_offline_queue')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [activeTab, setActiveTab] = useState<'manifest' | 'cockpit' | 'queue'>('cockpit')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // The signed-in driver's manifest from the server (cached for offline use); null in local demo mode
  const [manifest, setManifest] = useState<ServerManifest | null>(() => {
    try {
      const saved = localStorage.getItem(MANIFEST_CACHE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  // Status changes made on this device, applied on top of the server manifest
  const [localStatus, setLocalStatus] = useState<Record<number, Shipment['status']>>({})

  useEffect(() => {
    if (!authToken) return
    let cancelled = false
    fetch(`${API_V1}/transit/driver/manifest`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(res => (res.ok ? res.json() : null))
      .then((data: ServerManifest | null) => {
        if (cancelled || !data) return
        setManifest(data)
        setLocalStatus({})
        try { localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(data)) } catch { /* storage unavailable */ }
      })
      .catch(() => { /* offline: keep the cached manifest */ })
    return () => { cancelled = true }
  }, [authToken])

  function updateStatus(id: number, status: Shipment['status']) {
    setLocalStatus(prev => ({ ...prev, [id]: status }))
    onUpdateShipmentStatus(id, status)
  }

  const driverName = manifest?.driver_name ?? driver?.full_name ?? null
  const vehiclePlate = manifest?.vehicle_plate ?? vehicle?.plate_number ?? null
  const hubCode = manifest?.hub_code ?? hub?.code ?? null

  // Delivery Modal
  const [deliverModalStop, setDeliverModalStop] = useState<Shipment | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [signatureOtp, setSignatureOtp] = useState('')

  // Fail Modal
  const [failModalStop, setFailModalStop] = useState<Shipment | null>(null)
  const [failReason, setFailReason] = useState('CONSIGNEE_UNAVAILABLE')
  const [failNotes, setFailNotes] = useState('')

  // Save queue to local storage
  useEffect(() => {
    try {
      localStorage.setItem('fleet_driver_offline_queue', JSON.stringify(offlineQueue))
    } catch (e) {
      console.error('Failed to persist offline queue:', e)
    }
  }, [offlineQueue])

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncOfflineQueue()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [offlineQueue, authToken])

  // Driver stops for assigned vehicle
  const assignedStops = useMemo<Shipment[]>(() => {
    if (manifest) {
      return [...manifest.stops]
        .sort((a, b) => a.sequence_index - b.sequence_index)
        .map(st => ({
          ...st,
          id: st.shipment_id,
          hub_id: 0,
          assigned_vehicle_id: manifest.vehicle_id,
          status: localStatus[st.shipment_id] ?? st.status,
        }))
    }
    if (!vehicle) return []
    return shipments
      .filter(s => s.assigned_vehicle_id === vehicle.id)
      .sort((a, b) => a.time_window_start.localeCompare(b.time_window_start))
  }, [manifest, localStatus, shipments, vehicle])

  const nextStop = assignedStops.find(s => s.status === 'ASSIGNED' || s.status === 'IN_TRANSIT' || s.status === 'ARRIVED') ?? null
  const completedCount = assignedStops.filter(s => s.status === 'DELIVERED').length
  const progressPct = assignedStops.length > 0 ? Math.round((completedCount / assignedStops.length) * 100) : 0

  // Batch sync offline queue to backend
  async function syncOfflineQueue() {
    if (offlineQueue.length === 0 || !authToken) return
    const sent = offlineQueue
    setActionLoading(true)
    try {
      const res = await fetch(`${API_V1}/transit/driver/offline-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          actions: sent.map(a => ({
            action_id: a.id,
            action_type: a.actionType,
            shipment_id: a.shipmentId,
            client_timestamp: a.timestamp,
            payload: a.payload,
          })),
        }),
      })

      if (res.ok) {
        const data: { applied_count: number; failed_count: number; results: Array<{ action_id: string; success: boolean; error?: string | null }> } = await res.json()
        const outcome = new Map(data.results.map(r => [r.action_id, r]))
        const sentIds = new Set(sent.map(a => a.id))
        // Remove only what the server applied; rejected actions stay queued with their error.
        // Actions queued while this request was in flight are left untouched.
        setOfflineQueue(prev => prev.flatMap(a => {
          if (!sentIds.has(a.id)) return [a]
          const r = outcome.get(a.id)
          if (r?.success) return []
          return [{ ...a, lastError: r?.error ?? 'Not processed by server' }]
        }))
        if (data.failed_count > 0) {
          const firstError = data.results.find(r => !r.success)?.error
          setActionMessage({
            type: 'error',
            text: `Synced ${data.applied_count}; ${data.failed_count} action(s) were rejected and kept in the queue${firstError ? `: ${firstError}` : ''}`,
          })
        } else {
          setActionMessage({ type: 'success', text: `Synced ${data.applied_count} offline actions successfully!` })
        }
      }
    } catch (err: any) {
      console.error('Offline sync error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  // Handle Arrive
  async function handleArrive(s: Shipment) {
    setActionLoading(true)
    setActionMessage(null)
    const lat = s.latitude || 19.0760
    const lng = s.longitude || 72.8777

    if (isOnline && authToken) {
      try {
        await arriveAtStop(s.id, lat, lng, 'Driver checked in on mobile', authToken)
        updateStatus(s.id, 'ARRIVED')
        setActionMessage({ type: 'success', text: `Checked in at ${s.customer_name}!` })
      } catch (err: any) {
        queueOfflineAction('ARRIVE', s.id, { latitude: lat, longitude: lng, notes: 'Queued arrive' })
        updateStatus(s.id, 'ARRIVED')
      }
    } else {
      queueOfflineAction('ARRIVE', s.id, { latitude: lat, longitude: lng, notes: 'Queued arrive' })
      updateStatus(s.id, 'ARRIVED')
    }
    setActionLoading(false)
  }

  // Handle Confirm Delivery
  async function handleConfirmDelivery() {
    if (!deliverModalStop) return
    const s = deliverModalStop
    setActionLoading(true)
    const recipient = recipientName.trim() || s.customer_name
    const sig = signatureOtp.trim() || 'OTP-VERIFIED'

    if (isOnline && authToken) {
      try {
        await deliverShipment(s.id, recipient, sig, 'Handed over on mobile cockpit', authToken)
        updateStatus(s.id, 'DELIVERED')
        setActionMessage({ type: 'success', text: `Delivered to ${recipient}!` })
      } catch (err: any) {
        queueOfflineAction('DELIVER', s.id, { recipient_name: recipient, signature_text: sig })
        updateStatus(s.id, 'DELIVERED')
      }
    } else {
      queueOfflineAction('DELIVER', s.id, { recipient_name: recipient, signature_text: sig })
      updateStatus(s.id, 'DELIVERED')
    }

    setDeliverModalStop(null)
    setRecipientName('')
    setSignatureOtp('')
    setActionLoading(false)
  }

  // Handle Confirm Failure
  async function handleConfirmFailure() {
    if (!failModalStop) return
    const s = failModalStop
    setActionLoading(true)

    if (isOnline && authToken) {
      try {
        await failDelivery(s.id, failReason as any, failNotes || 'Mobile reported issue', authToken)
        updateStatus(s.id, 'FAILED')
        setActionMessage({ type: 'error', text: `Marked stop failed: ${failReason}` })
      } catch (err: any) {
        queueOfflineAction('FAIL', s.id, { reason_code: failReason, notes: failNotes })
        updateStatus(s.id, 'FAILED')
      }
    } else {
      queueOfflineAction('FAIL', s.id, { reason_code: failReason, notes: failNotes })
      updateStatus(s.id, 'FAILED')
    }

    setFailModalStop(null)
    setFailNotes('')
    setActionLoading(false)
  }

  // Handle Delay
  async function handleReportDelay(s: Shipment, minutes: number, reason: string) {
    setActionLoading(true)
    if (isOnline && authToken) {
      try {
        await apiReportDelay(s.id, minutes, reason, authToken)
        setActionMessage({ type: 'success', text: `+${minutes} min delay reported (${reason})` })
      } catch (err: any) {
        queueOfflineAction('DELAY', s.id, { delay_minutes: minutes, reason })
      }
    } else {
      queueOfflineAction('DELAY', s.id, { delay_minutes: minutes, reason })
    }
    setActionLoading(false)
  }

  function queueOfflineAction(actionType: 'ARRIVE' | 'DELIVER' | 'FAIL' | 'DELAY', shipmentId: number, payload: any) {
    const item: QueuedAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      actionType,
      shipmentId,
      payload,
      timestamp: new Date().toISOString(),
    }
    setOfflineQueue(prev => [...prev, item])
    setActionMessage({
      type: 'success',
      text: `Action saved offline. Queued (${offlineQueue.length + 1} pending).`,
    })
  }

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 min-h-screen text-slate-100 flex flex-col font-sans select-none pb-20">
      {/* ── Top Header Bar ── */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
            {driverName ? driverName.slice(0, 2).toUpperCase() : 'DR'}
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
              {driverName || 'Driver'}
              <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            </h1>
            <p className="text-[11px] text-slate-400">
              {vehiclePlate || 'No vehicle'} · {hubCode || '—'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {offlineQueue.length > 0 && (
            <button
              onClick={syncOfflineQueue}
              disabled={actionLoading}
              title={offlineQueue.filter(a => a.lastError).map(a => `${a.actionType} #${a.shipmentId}: ${a.lastError}`).join('\n') || 'Tap to sync now'}
              className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-semibold flex items-center gap-1"
            >
              <span>⚡</span> {offlineQueue.length} queued
              {offlineQueue.some(a => a.lastError) && <span className="text-rose-300">· {offlineQueue.filter(a => a.lastError).length} rejected</span>}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              ✕
            </button>
          )}
        </div>
      </header>

      {/* ── Network & Notification Banner ── */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-300 flex items-center justify-between">
          <span>📡 Offline Mode Active — Actions will queue & auto-sync.</span>
          <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/30">Local Cache</span>
        </div>
      )}

      {actionMessage && (
        <div
          className={`px-4 py-2 text-xs border-b flex items-center justify-between ${
            actionMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Trip Progress Bar ── */}
      <div className="px-4 py-3 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-400">Shift Progress:</span>
          <span className="ml-1.5 font-bold text-white">{completedCount} of {assignedStops.length} stops</span>
        </div>
        <div className="w-28 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* ── Main View Content ── */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Cockpit Card for Next Stop */}
        {nextStop ? (
          <div className="rounded-2xl bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700 p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Current Active Stop
              </span>
              <span className="font-mono text-xs text-amber-400 font-semibold">
                Window: {nextStop.time_window_start} – {nextStop.time_window_end}
              </span>
            </div>

            <h2 className="text-lg font-bold text-white leading-tight">{nextStop.customer_name}</h2>
            <p className="text-xs text-slate-300 mt-1 flex items-start gap-1.5">
              <span>📍</span> {nextStop.destination_address}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
              <div>
                <span className="block text-[10px] text-slate-500">Weight & Vol</span>
                <span className="font-semibold text-slate-200">{nextStop.weight_kg} kg · {nextStop.volume_m3} m³</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500">Tracking #</span>
                <span className="font-mono text-slate-200">{nextStop.tracking_number}</span>
              </div>
            </div>

            {/* Consignee Phone Call */}
            <div className="mt-3">
              <a
                href="tel:+919820011223"
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-xs font-semibold text-blue-300 border border-slate-600 transition-colors"
              >
                <span>📞</span> Call Consignee (+91-98200-11223)
              </a>
            </div>

            {/* Big Action Buttons */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {nextStop.status !== 'ARRIVED' ? (
                <button
                  onClick={() => handleArrive(nextStop)}
                  disabled={actionLoading}
                  className="col-span-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-900/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
                >
                  <span>📍</span> Gate Check-In (ARRIVED)
                </button>
              ) : (
                <button
                  onClick={() => setDeliverModalStop(nextStop)}
                  disabled={actionLoading}
                  className="col-span-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
                >
                  <span>✓</span> Confirm Handover (DELIVER)
                </button>
              )}

              <button
                onClick={() => handleReportDelay(nextStop, 15, 'Traffic congestion on road')}
                disabled={actionLoading}
                className="py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold active:scale-[0.98] transition-transform"
              >
                ⏱ +15m Delay
              </button>

              <button
                onClick={() => setFailModalStop(nextStop)}
                disabled={actionLoading}
                className="py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold active:scale-[0.98] transition-transform"
              >
                ⚠ Report Issue
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-800/40 border border-slate-700 p-6 text-center">
            <span className="text-3xl">🎉</span>
            <h3 className="text-sm font-bold text-white mt-2">All Assigned Stops Completed</h3>
            <p className="text-xs text-slate-400 mt-1">
              You have completed all scheduled deliveries. You may return to {hubCode || 'the depot'}.
            </p>
          </div>
        )}

        {/* ── Today's Stop Manifest List ── */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
            Today's Stops ({assignedStops.length})
          </h3>

          <div className="space-y-2">
            {assignedStops.map((stop, i) => {
              const isCurrent = stop.id === nextStop?.id
              return (
                <div
                  key={stop.id}
                  className={`rounded-xl border p-3 flex items-center justify-between text-xs transition-colors ${
                    isCurrent
                      ? 'bg-slate-800 border-blue-500/50 shadow-md'
                      : stop.status === 'DELIVERED'
                      ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                      : 'bg-slate-800/30 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-slate-700/80 flex items-center justify-center font-bold text-[11px] text-slate-300">
                      {i + 1}
                    </span>
                    <div>
                      <p className={`font-semibold ${stop.status === 'DELIVERED' ? 'line-through text-slate-500' : 'text-white'}`}>
                        {stop.customer_name}
                      </p>
                      <p className="text-[11px] text-slate-400">{stop.destination_address.slice(0, 24)}...</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        stop.status === 'DELIVERED'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : stop.status === 'ARRIVED'
                          ? 'bg-purple-500/20 text-purple-400'
                          : stop.status === 'FAILED'
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {stop.status}
                    </span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">{stop.time_window_start}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Handover Delivery Modal ── */}
      {deliverModalStop && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white">Confirm Consignee Handover</h3>
            <p className="text-xs text-slate-400 mt-0.5">{deliverModalStop.customer_name} · {deliverModalStop.tracking_number}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Recipient Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  placeholder={deliverModalStop.customer_name}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Delivery OTP / Signature Token</label>
                <input
                  type="text"
                  value={signatureOtp}
                  onChange={e => setSignatureOtp(e.target.value)}
                  placeholder="e.g. OTP-4829 or Signed by security"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setDeliverModalStop(null)}
                className="py-2.5 rounded-xl bg-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelivery}
                disabled={actionLoading}
                className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Confirm Delivered
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Failure Reporting Modal ── */}
      {failModalStop && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white">Report Delivery Issue</h3>
            <p className="text-xs text-slate-400 mt-0.5">{failModalStop.customer_name}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Failure Reason</label>
                <select
                  value={failReason}
                  onChange={e => setFailReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                >
                  <option value="CONSIGNEE_UNAVAILABLE">Consignee Unavailable / Door Locked</option>
                  <option value="INCORRECT_ADDRESS">Address Not Found / Incorrect</option>
                  <option value="CUSTOMER_REFUSED">Customer Refused Consignment</option>
                  <option value="ACCESS_RESTRICTED">Gated Access Denied / Security Hold</option>
                  <option value="DAMAGED_PACKAGE">Damaged in Transit</option>
                  <option value="OTHER">Other Issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Forensic Notes</label>
                <textarea
                  value={failNotes}
                  onChange={e => setFailNotes(e.target.value)}
                  rows={2}
                  placeholder="Details of call attempt or gate denial..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setFailModalStop(null)}
                className="py-2.5 rounded-xl bg-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmFailure}
                disabled={actionLoading}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Submit Incident
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

