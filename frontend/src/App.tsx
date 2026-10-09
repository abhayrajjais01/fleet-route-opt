import { useState, useRef, useEffect } from 'react'
import { API_BASE, checkApiHealth } from './lib/api'
import ComplianceInspector from './components/compliance/ComplianceInspector'
import LiveTrackingSection from './components/tracking/LiveTrackingSection'
import DispatchPlanner, { type DispatchDecision } from './components/workflow/DispatchPlanner'
import NetworkMapSection from './components/map/NetworkMapSection'
import type { UserRole, VehicleType, VehicleStatus, DriverStatus, LicenseType, ShipmentStatus, ShipmentPriority, AuditAction, AdminSection, Vehicle, Driver, Hub, Shipment, User, AuditEntry } from './lib/types'

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface CopilotMsg { id: string; sender: 'user' | 'assistant'; content: string; timestamp: string; trace?: string; proposal?: { title: string; description: string; status: 'PROPOSED' | 'APPROVED' | 'REJECTED' } }

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const INIT_HUBS: Hub[] = [
  { id: 1, name: 'Mumbai Central Depot', code: 'HUB-MUM-01', address: 'Plot 45, MIDC, Andheri East, Mumbai', latitude: 19.1136, longitude: 72.8697, contact_phone: '+91-22-2820-1100', operating_hours: '06:00–22:00' },
  { id: 2, name: 'Navi Mumbai Distribution Center', code: 'HUB-NV-02', address: 'Sector 19, Vashi, Navi Mumbai', latitude: 19.076, longitude: 72.9986, contact_phone: '+91-22-2780-4400', operating_hours: '05:00–23:00' },
  { id: 3, name: 'Pune Regional Gateway', code: 'HUB-PNQ-03', address: 'Phase 2, Hinjawadi, Pune', latitude: 18.5913, longitude: 73.7389, contact_phone: '+91-20-6710-2200', operating_hours: '06:00–22:00' },
]
const INIT_VEHICLES: Vehicle[] = [
  { id: 1, name: 'Alpha Prime Van', plate_number: 'MH-02-EE-1001', vehicle_type: 'VAN', max_payload_kg: 1500, max_volume_m3: 12, fuel_efficiency_kpl: 14.2, current_status: 'IN_TRANSIT', assigned_hub_id: 1, fuel_pct: 82 },
  { id: 2, name: 'Heavy Box Carrier', plate_number: 'MH-04-AB-2045', vehicle_type: 'BOX_TRUCK', max_payload_kg: 3500, max_volume_m3: 24.5, fuel_efficiency_kpl: 8.5, current_status: 'IN_TRANSIT', assigned_hub_id: 1, fuel_pct: 54 },
  { id: 3, name: 'Eco Cargo Electric', plate_number: 'MH-01-EV-8822', vehicle_type: 'EV', max_payload_kg: 950, max_volume_m3: 8, fuel_efficiency_kpl: 18, current_status: 'IN_TRANSIT', assigned_hub_id: 2, fuel_pct: 67 },
  { id: 4, name: 'Interstate Hauler', plate_number: 'MH-12-QQ-4001', vehicle_type: 'SEMI_TRUCK', max_payload_kg: 8500, max_volume_m3: 55, fuel_efficiency_kpl: 5.8, current_status: 'MAINTENANCE', assigned_hub_id: 3, fuel_pct: 28 },
  { id: 5, name: 'Metro Box Truck', plate_number: 'MH-43-BX-3310', vehicle_type: 'BOX_TRUCK', max_payload_kg: 2500, max_volume_m3: 18, fuel_efficiency_kpl: 9.2, current_status: 'AVAILABLE', assigned_hub_id: 2, fuel_pct: 74 },
]
const INIT_DRIVERS: Driver[] = [
  { id: 1, full_name: 'Rajesh Kumar', license_number: 'DL-14-2021-9988', license_type: 'COMMERCIAL', phone_number: '+91-98200-11223', status: 'ON_TRIP', max_driving_hours_per_day: 8, assigned_hub_id: 1, current_vehicle_id: 1, rating: 4.8 },
  { id: 2, full_name: 'Vikramjit Singh', license_number: 'MH04-2015-88319', license_type: 'CLASS_A', phone_number: '+91-98700-44556', status: 'ON_TRIP', max_driving_hours_per_day: 10, assigned_hub_id: 1, current_vehicle_id: 2, rating: 4.6 },
  { id: 3, full_name: 'Amit Patil', license_number: 'MH01-2020-55441', license_type: 'CLASS_B', phone_number: '+91-99600-77889', status: 'RESTING', max_driving_hours_per_day: 8, assigned_hub_id: 2, current_vehicle_id: null, rating: 4.4 },
  { id: 4, full_name: 'Suresh Reddy', license_number: 'KA01-2019-33441', license_type: 'COMMERCIAL', phone_number: '+91-98450-99887', status: 'OFF_DUTY', max_driving_hours_per_day: 9, assigned_hub_id: 3, current_vehicle_id: null, rating: 4.7 },
  { id: 5, full_name: 'Priya Mehta', license_number: 'GJ01-2022-12345', license_type: 'CLASS_B', phone_number: '+91-97200-55678', status: 'ON_TRIP', max_driving_hours_per_day: 8, assigned_hub_id: 2, current_vehicle_id: 3, rating: 4.9 },
  { id: 6, full_name: 'Neha Kulkarni', license_number: 'MH43-2018-77120', license_type: 'COMMERCIAL', phone_number: '+91-98190-33445', status: 'ON_DUTY', max_driving_hours_per_day: 9, assigned_hub_id: 2, current_vehicle_id: null, rating: 4.7 },
]
const INIT_SHIPMENTS: Shipment[] = [
  { id: 1, tracking_number: 'SHP-001-MUM', customer_name: 'Reliance Industries', destination_address: 'BKC, Mumbai', weight_kg: 450, volume_m3: 3.2, time_window_start: '09:00', time_window_end: '12:00', priority: 'HIGH', status: 'IN_TRANSIT', hub_id: 1, latitude: 19.066, longitude: 72.865, assigned_vehicle_id: 2 },
  { id: 2, tracking_number: 'SHP-002-MUM', customer_name: 'TCS Logistics', destination_address: 'Powai, Mumbai', weight_kg: 180, volume_m3: 1.5, time_window_start: '10:00', time_window_end: '14:00', priority: 'STANDARD', status: 'ASSIGNED', hub_id: 1, latitude: 19.1176, longitude: 72.906, assigned_vehicle_id: 1 },
  { id: 3, tracking_number: 'SHP-003-NV', customer_name: 'Flipkart Supply Chain', destination_address: 'Belapur, Navi Mumbai', weight_kg: 920, volume_m3: 7.8, time_window_start: '08:00', time_window_end: '11:00', priority: 'EXPRESS', status: 'UNASSIGNED', hub_id: 2, latitude: 19.0235, longitude: 73.04 },
  { id: 4, tracking_number: 'SHP-004-PNQ', customer_name: 'Amazon India', destination_address: 'Kothrud, Pune', weight_kg: 640, volume_m3: 5.1, time_window_start: '11:00', time_window_end: '15:00', priority: 'STANDARD', status: 'DELIVERED', hub_id: 3, latitude: 18.5074, longitude: 73.8077 },
  { id: 5, tracking_number: 'SHP-005-MUM', customer_name: 'HDFC Bank', destination_address: 'Nariman Point, Mumbai', weight_kg: 120, volume_m3: 0.8, time_window_start: '09:30', time_window_end: '11:00', priority: 'EXPRESS', status: 'IN_TRANSIT', hub_id: 1, latitude: 18.9256, longitude: 72.8242, assigned_vehicle_id: 2 },
  { id: 6, tracking_number: 'SHP-006-NV', customer_name: 'Reliance Retail', destination_address: 'Nerul, Navi Mumbai', weight_kg: 260, volume_m3: 1.9, time_window_start: '09:00', time_window_end: '12:00', priority: 'STANDARD', status: 'IN_TRANSIT', hub_id: 2, latitude: 19.033, longitude: 73.0297, assigned_vehicle_id: 3 },
  { id: 7, tracking_number: 'SHP-007-NV', customer_name: 'DMart Logistics', destination_address: 'Kharghar, Navi Mumbai', weight_kg: 310, volume_m3: 2.4, time_window_start: '09:30', time_window_end: '10:15', priority: 'HIGH', status: 'ASSIGNED', hub_id: 2, latitude: 19.0473, longitude: 73.0699, assigned_vehicle_id: 3 },
  { id: 8, tracking_number: 'SHP-008-NV', customer_name: 'Godrej Appliances', destination_address: 'Airoli, Navi Mumbai', weight_kg: 180, volume_m3: 1.2, time_window_start: '11:00', time_window_end: '15:00', priority: 'STANDARD', status: 'ASSIGNED', hub_id: 2, latitude: 19.159, longitude: 72.9986, assigned_vehicle_id: 3 },
  { id: 9, tracking_number: 'SHP-009-MUM', customer_name: 'Myntra Fulfilment', destination_address: 'Bandra West, Mumbai', weight_kg: 140, volume_m3: 1.1, time_window_start: '09:00', time_window_end: '12:30', priority: 'HIGH', status: 'IN_TRANSIT', hub_id: 1, latitude: 19.0596, longitude: 72.8295, assigned_vehicle_id: 1 },
  { id: 10, tracking_number: 'SHP-010-MUM', customer_name: 'Tata CLiQ', destination_address: 'Lower Parel, Mumbai', weight_kg: 220, volume_m3: 1.6, time_window_start: '10:00', time_window_end: '13:00', priority: 'STANDARD', status: 'ASSIGNED', hub_id: 1, latitude: 18.998, longitude: 72.83, assigned_vehicle_id: 2 },
  { id: 11, tracking_number: 'SHP-011-MUM', customer_name: 'Nykaa Warehouse', destination_address: 'Ghatkopar, Mumbai', weight_kg: 160, volume_m3: 1, time_window_start: '11:30', time_window_end: '16:00', priority: 'LOW', status: 'ASSIGNED', hub_id: 1, latitude: 19.086, longitude: 72.9081, assigned_vehicle_id: 1 },
]
const INIT_USERS: User[] = [
  { id: 1, email: 'admin@fleetops.in', full_name: 'Abhayraj Jaiswal', role: 'ADMIN', is_active: true },
  { id: 2, email: 'manager@fleetops.in', full_name: 'Kavita Sharma', role: 'FLEET_MANAGER', is_active: true },
  { id: 3, email: 'dispatch@fleetops.in', full_name: 'Manthan Nimodiya', role: 'DISPATCHER', is_active: true },
  { id: 4, email: 'rajesh@fleetops.in', full_name: 'Rajesh Kumar', role: 'DRIVER', is_active: true },
]
const INIT_AUDIT: AuditEntry[] = [
  { id: 1, timestamp: '2026-09-22 12:41:03', actor_name: 'Abhayraj Jaiswal', action_type: 'DISPATCH_APPROVED', entity_type: 'ROUTE', entity_id: 42, details: 'Route R-42 dispatched from Mumbai Central Depot' },
  { id: 2, timestamp: '2026-09-22 12:29:17', actor_name: 'Kavita Sharma', action_type: 'STATUS_CHANGE', entity_type: 'VEHICLE', entity_id: 4, details: 'Vehicle MH-12-QQ-4001 → MAINTENANCE' },
  { id: 3, timestamp: '2026-09-22 12:17:55', actor_name: 'Manthan Nimodiya', action_type: 'STATUS_CHANGE', entity_type: 'SHIPMENT', entity_id: 4, details: 'SHP-004-PNQ status → DELIVERED' },
  { id: 4, timestamp: '2026-09-22 11:58:40', actor_name: 'Copilot AI', action_type: 'COPILOT_OVERRIDE', entity_type: 'ROUTE', entity_id: 17, details: 'AI suggested reroute due to NH-48 congestion' },
]

// ─── API CLIENT HELPER (base URL & health probe live in lib/api.ts) ──────────
const DEMO_CREDENTIALS: Record<UserRole, { email: string; pass: string }> = {
  ADMIN: { email: 'admin@fleetopt.io', pass: 'password123' },
  FLEET_MANAGER: { email: 'manager@fleetopt.io', pass: 'password123' },
  DISPATCHER: { email: 'dispatch@fleetopt.io', pass: 'password123' },
  DRIVER: { email: 'driver@fleetopt.io', pass: 'password123' },
}

async function fetchAuthToken(role: UserRole = 'ADMIN'): Promise<string | null> {
  try {
    const creds = DEMO_CREDENTIALS[role] || DEMO_CREDENTIALS.ADMIN
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.pass }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
}

// ─── STATUS STYLING ───────────────────────────────────────────────────────────
const SC: Record<string, { bg: string; text: string; dot: string }> = {
  AVAILABLE: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' }, IN_TRANSIT: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  MAINTENANCE: { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' }, DECOMMISSIONED: { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af' },
  ON_DUTY: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' }, OFF_DUTY: { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af' },
  ON_TRIP: { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' }, RESTING: { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' },
  UNASSIGNED: { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' }, CLUSTERED: { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' },
  ASSIGNED: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' }, DELIVERED: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  FAILED: { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' },
  EXPRESS: { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' }, HIGH: { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  STANDARD: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' }, LOW: { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af' },
  ADMIN: { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444' }, FLEET_MANAGER: { bg: '#f5f3ff', text: '#6d28d9', dot: '#8b5cf6' },
  DISPATCHER: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' }, DRIVER: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
}

function Badge({ s }: { s: string }) {
  const c = SC[s] ?? { bg: '#f9fafb', text: '#6b7280', dot: '#9ca3af' }
  return <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.text}22` }} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"><span style={{ background: c.dot }} className="w-1.5 h-1.5 rounded-full" />{s.replace(/_/g, ' ')}</span>
}
function Bar({ pct }: { pct: number }) {
  const c = pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
  return <div className="flex items-center gap-2"><div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: c }} /></div><span className="font-mono text-[10px] text-slate-400 w-7">{pct}%</span></div>
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200"><p className="font-bold text-slate-800">{title}</p><button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button></div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition"
const selCls = inputCls + " bg-white"
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>{children}</div>
}

// ─── COPILOT DASHBOARD (Main Page) ────────────────────────────────────────────
function CopilotDashboard({ vehicles, drivers, shipments, hubs, audit, setSection }: {
  vehicles: Vehicle[]; drivers: Driver[]; shipments: Shipment[]; hubs: Hub[]; audit: AuditEntry[]
  setSection: (s: AdminSection) => void
}) {
  // Opening briefing is computed from live data so it never goes stale.
  const [messages, setMessages] = useState<CopilotMsg[]>(() => {
    const active = shipments.filter(s => s.status === 'IN_TRANSIT' || s.status === 'ASSIGNED')
    const express = active.filter(s => s.priority === 'EXPRESS')
    const unassigned = shipments.filter(s => s.status === 'UNASSIGNED')
    const maintenance = vehicles.filter(v => v.current_status === 'MAINTENANCE')
    const lines = [
      `• **${active.length} shipments** are dispatched${express.length ? `, ${express.length} of them EXPRESS` : ''}`,
      ...maintenance.map(v => `• **${v.plate_number}** (${v.name}) is in maintenance`),
      ...unassigned.map(s => `• **${s.tracking_number}** (${s.weight_kg} kg, ${s.customer_name}) is UNASSIGNED: open the Dispatch Planner to plan it`),
    ]
    return [{ id: '0', sender: 'assistant', content: `Good morning. I'm your Fleet AI Copilot. Here's what needs your attention right now:\n\n${lines.join('\n')}\n\nAsk me anything or use the quick actions below.`, timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const quickActions = [
    { label: '📦 Show unassigned shipments', q: 'Which shipments are unassigned?' },
    { label: '🚛 Fleet availability', q: 'What vehicles are available right now?' },
    { label: '👤 Driver status', q: 'Which drivers are on duty?' },
    { label: '⚡ Optimize all routes', q: 'Run VRPTW optimizer for all hubs' },
    { label: '⚠️ Check SLA risks', q: 'Any shipments at risk of missing their time window?' },
    { label: '📊 Today\'s KPIs', q: 'Give me a performance summary for today' },
  ]

  function buildResponse(q: string): string {
    const ql = q.toLowerCase()
    const avail = vehicles.filter(v => v.current_status === 'AVAILABLE')
    const onDuty = drivers.filter(d => d.status === 'ON_DUTY' || d.status === 'ON_TRIP')
    const unassigned = shipments.filter(s => s.status === 'UNASSIGNED')
    const inTransit = shipments.filter(s => s.status === 'IN_TRANSIT')

    if (ql.includes('unassigned') || ql.includes('pending')) {
      if (unassigned.length === 0) return '✅ All shipments are currently assigned or in transit. No action needed.'
      return `**${unassigned.length} unassigned shipment${unassigned.length > 1 ? 's' : ''}** need dispatch:\n\n${unassigned.map(s => `• **${s.tracking_number}** — ${s.customer_name}, ${s.weight_kg}kg, ${s.priority} priority`).join('\n')}\n\nGo to **Shipments** and click "AI Workflow" on any to auto-generate a dispatch plan.`
    }
    if (ql.includes('vehicle') || ql.includes('fleet') || ql.includes('available')) {
      return `**Fleet Status Right Now:**\n\n✅ Available (${avail.length}): ${avail.map(v => `${v.name} (${v.plate_number})`).join(', ') || 'None'}\n🔵 In Transit: ${vehicles.filter(v => v.current_status === 'IN_TRANSIT').map(v => v.plate_number).join(', ') || 'None'}\n🔴 Maintenance: ${vehicles.filter(v => v.current_status === 'MAINTENANCE').map(v => v.plate_number).join(', ') || 'None'}\n\nTotal capacity available: **${avail.reduce((s, v) => s + v.max_payload_kg, 0).toLocaleString()} kg**`
    }
    if (ql.includes('driver')) {
      return `**Driver Status:**\n\n🟢 On Duty / On Trip (${onDuty.length}): ${onDuty.map(d => d.full_name).join(', ')}\n🟡 Resting: ${drivers.filter(d => d.status === 'RESTING').map(d => d.full_name).join(', ') || 'None'}\n⚫ Off Duty: ${drivers.filter(d => d.status === 'OFF_DUTY').map(d => d.full_name).join(', ') || 'None'}\n\n**Recommendation:** ${drivers.filter(d => d.status === 'RESTING').length > 0 ? `${drivers.find(d => d.status === 'RESTING')?.full_name} is resting and can be reassigned in ~1h.` : 'All available drivers are active.'}`
    }
    if (ql.includes('sla') || ql.includes('risk') || ql.includes('window')) {
      const express = shipments.filter(s => s.priority === 'EXPRESS' && s.status !== 'DELIVERED')
      return express.length > 0
        ? `**⚠ SLA Risk Report:**\n\n${express.map(s => `• **${s.tracking_number}** (${s.customer_name}) — EXPRESS, window ${s.time_window_start}–${s.time_window_end}, status: ${s.status}`).join('\n')}\n\nRecommend immediate VRPTW re-optimization for express shipments. Go to Shipments → AI Workflow to trigger.`
        : '✅ **No SLA risks detected.** All express shipments are on track for delivery within their time windows.'
    }
    if (ql.includes('optim') || ql.includes('vrptw') || ql.includes('route')) {
      return `**VRPTW Optimization Report:**\n\n• Running Clarke-Wright Savings + 2-opt for ${hubs.length} hubs\n• **${avail.length} vehicles** eligible for dispatch\n• **${unassigned.length} shipments** need routing\n\nEstimated gain vs greedy: **+18.4%** distance reduction, **+₹2,400/week** fuel savings.\n\nGo to **Shipments** and click "AI Workflow" per shipment to trigger the optimizer with full node canvas.`
    }
    if (ql.includes('kpi') || ql.includes('summary') || ql.includes('performance')) {
      const otif = 99.2
      return `**Today's KPIs — 22 Sep 2026:**\n\n📦 Shipments in transit: **${inTransit.length}**\n✅ Delivered today: **${shipments.filter(s => s.status === 'DELIVERED').length}**\n🚛 Fleet utilization: **${Math.round((vehicles.filter(v => v.current_status !== 'AVAILABLE').length / vehicles.length) * 100)}%**\n⏱ OTIF rate: **${otif}%**\n🤖 AI compliance checks: **All passed**\n⛽ Avg fuel efficiency: **${(vehicles.reduce((s, v) => s + v.fuel_efficiency_kpl, 0) / vehicles.length).toFixed(1)} kpl**\n\nFleet is performing above target. ${unassigned.length > 0 ? `${unassigned.length} shipment${unassigned.length > 1 ? 's' : ''} still need dispatch.` : 'All shipments dispatched.'}`
    }
    return `I've analyzed your fleet data. You have **${avail.length} available vehicles**, **${onDuty.length} drivers on duty**, and **${unassigned.length} shipments** awaiting assignment. Would you like me to run the VRPTW optimizer or check compliance for any specific shipment?`
  }

  function send(text: string) {
    if (!text.trim() || loading) return
    const uid = Date.now().toString()
    setMessages(p => [...p, { id: uid, sender: 'user', content: text, timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }])
    setInput(''); setLoading(true)
    setTimeout(() => {
      const aid = (Date.now() + 1).toString()
      setMessages(p => [...p, { id: aid, sender: 'assistant', content: buildResponse(text), timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), trace: `RouterAgent → classified: ${text.split(' ').slice(0, 3).join('_').toLowerCase()} (0.91 confidence)` }])
      setLoading(false)
    }, 1100)
  }

  const operational = vehicles.filter(v => v.current_status !== 'DECOMMISSIONED')
  const onTrip = vehicles.filter(v => v.current_status === 'IN_TRANSIT').length
  const statBar = [
    { label: 'Vehicles on trip', value: `${onTrip}/${operational.length}`, sub: `${vehicles.filter(v => v.current_status === 'MAINTENANCE').length} in maintenance`, color: '#4f46e5', bg: '#eef2ff' },
    { label: 'Shipments dispatched', value: shipments.filter(s => s.status === 'IN_TRANSIT' || s.status === 'ASSIGNED').length, sub: `${shipments.filter(s => s.status === 'IN_TRANSIT').length} in transit`, color: '#7c3aed', bg: '#f5f3ff' },
    { label: 'Unassigned', value: shipments.filter(s => s.status === 'UNASSIGNED').length, sub: 'need a plan', color: '#dc2626', bg: '#fef2f2' },
    { label: 'Drivers on duty', value: drivers.filter(d => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length, sub: `of ${drivers.length} registered`, color: '#059669', bg: '#ecfdf5' },
    { label: 'Fleet utilisation', value: `${operational.length ? Math.round((onTrip / operational.length) * 100) : 0}%`, sub: 'vehicles on trip', color: '#0891b2', bg: '#ecfeff' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stat bar */}
      <div className="flex-shrink-0 flex flex-wrap items-stretch gap-3 px-5 py-4 border-b border-slate-200 bg-white">
        {statBar.map(s => (
          <div key={s.label} className="flex-1 basis-[170px] min-w-0 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /></span>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 truncate">{s.label}</p>
              <p className="text-xl font-bold text-slate-900 leading-tight tabular-nums">{s.value}</p>
              <p className="text-[10px] text-slate-400 truncate">{s.sub}</p>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2 justify-center">
          <button onClick={() => setSection('workflow')} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg shadow-sm">Plan dispatch</button>
          <button onClick={() => setSection('shipments')} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg">+ New shipment</button>
        </div>
      </div>

      {/* Copilot chat */}
      <div className="flex flex-1 overflow-hidden">
        {/* Recent activity sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Shipments</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {shipments.filter(s => s.status !== 'DELIVERED').map(s => (
              <div key={s.id} className="px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-default">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono text-[10px] font-bold text-blue-700">{s.tracking_number}</span>
                  <Badge s={s.status} />
                </div>
                <p className="text-[11px] text-slate-600 truncate">{s.customer_name}</p>
                <p className="text-[10px] text-slate-400">{s.weight_kg}kg · <span style={{ color: SC[s.priority]?.text ?? '#374151' }}>{s.priority}</span></p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-slate-100">
            <button onClick={() => setSection('audit')} className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors">View audit log →</button>
          </div>
        </div>

        {/* Main chat */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map(m => (
              <div key={m.id} className={`flex gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${m.sender === 'assistant' ? 'bg-violet-100 text-violet-700' : 'bg-blue-600 text-white'}`}>
                  {m.sender === 'assistant' ? 'AI' : 'AJ'}
                </div>
                <div className="max-w-[75%] space-y-1.5">
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${m.sender === 'assistant' ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm' : 'bg-blue-600 text-white rounded-tr-sm'}`}>
                    {m.content.split('**').map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>)}
                  </div>
                  {m.trace && <p className="text-[10px] font-mono text-slate-400 px-1">{m.trace}</p>}
                  <p className="text-[10px] text-slate-400 px-1">{m.timestamp}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">AI</div>
                <div className="px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-tl-sm shadow-sm flex gap-2 items-center">
                  {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          <div className="flex-shrink-0 px-6 py-2 flex gap-2 flex-wrap border-t border-slate-200 bg-white">
            {quickActions.map(a => (
              <button key={a.q} onClick={() => send(a.q)} className="text-[11px] px-3 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-colors">{a.label}</button>
            ))}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 px-6 pb-4 pt-2 bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(input)}
              placeholder="Ask about fleet status, shipments, compliance, routes…"
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition bg-slate-50" />
            <button onClick={() => send(input)} disabled={!input.trim() || loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold transition-colors">Send</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FLEET SECTION ────────────────────────────────────────────────────────────
function FleetSection({ vehicles, setVehicles, drivers, setDrivers, hubs, setHubs, addAudit }: {
  vehicles: Vehicle[]; setVehicles: (v: Vehicle[]) => void
  drivers: Driver[]; setDrivers: (d: Driver[]) => void
  hubs: Hub[]; setHubs: (h: Hub[]) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
}) {
  const [tab, setTab] = useState<'vehicles' | 'drivers' | 'hubs'>('vehicles')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'add-v' | 'edit-v' | 'add-d' | 'edit-d' | 'add-h' | 'edit-h' | null>(null)
  const [editTarget, setEditTarget] = useState<any>(null)

  const blankV = { name: '', plate_number: '', vehicle_type: 'VAN' as VehicleType, max_payload_kg: 1000, max_volume_m3: 10, fuel_efficiency_kpl: 12, current_status: 'AVAILABLE' as VehicleStatus, assigned_hub_id: 1, fuel_pct: 80 }
  const blankD = { full_name: '', license_number: '', license_type: 'CLASS_B' as LicenseType, phone_number: '', status: 'OFF_DUTY' as DriverStatus, max_driving_hours_per_day: 8, assigned_hub_id: 1, current_vehicle_id: null as number | null, rating: 4.5 }
  const blankH = { name: '', code: '', address: '', latitude: 19.1, longitude: 72.8, contact_phone: '', operating_hours: '06:00–22:00' }
  const [vf, setVf] = useState(blankV)
  const [df, setDf] = useState(blankD)
  const [hf, setHf] = useState(blankH)

  const q = search.toLowerCase()
  const filtV = vehicles.filter(v => v.name.toLowerCase().includes(q) || v.plate_number.toLowerCase().includes(q))
  const filtD = drivers.filter(d => d.full_name.toLowerCase().includes(q) || d.license_number.toLowerCase().includes(q))
  const filtH = hubs.filter(h => h.name.toLowerCase().includes(q) || h.code.toLowerCase().includes(q))

  function saveVehicle() {
    if (modal === 'add-v') { const nv = { ...vf, id: Date.now() }; setVehicles([...vehicles, nv]); addAudit({ actor_name: 'Admin', action_type: 'ASSET_CREATED', entity_type: 'VEHICLE', entity_id: nv.id, details: `Vehicle registered: ${nv.plate_number}` }) }
    else if (modal === 'edit-v') { setVehicles(vehicles.map(v => v.id === editTarget.id ? { ...v, ...vf } : v)) }
    setModal(null); setVf(blankV)
  }
  function saveDriver() {
    if (modal === 'add-d') { setDrivers([...drivers, { ...df, id: Date.now() }]) }
    else if (modal === 'edit-d') { setDrivers(drivers.map(d => d.id === editTarget.id ? { ...d, ...df } : d)) }
    setModal(null); setDf(blankD)
  }
  function saveHub() {
    if (modal === 'add-h') { setHubs([...hubs, { ...hf, id: Date.now() }]) }
    else if (modal === 'edit-h') { setHubs(hubs.map(h => h.id === editTarget.id ? { ...h, ...hf } : h)) }
    setModal(null); setHf(blankH)
  }

  const tabCls = (t: string) => `px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-4 gap-3 p-5 pb-0 flex-shrink-0">
        {[
          { label: 'Total Vehicles', value: vehicles.length, sub: `${vehicles.filter(v => v.current_status === 'AVAILABLE').length} available`, color: '#2563eb' },
          { label: 'In Transit', value: vehicles.filter(v => v.current_status === 'IN_TRANSIT').length, sub: 'currently active', color: '#7c3aed' },
          { label: 'Total Drivers', value: drivers.length, sub: `${drivers.filter(d => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length} on duty`, color: '#15803d' },
          { label: 'Hubs', value: hubs.length, sub: 'all operational', color: '#d97706' },
        ].map(k => (
          <div key={k.label} className="border border-slate-200 rounded-xl p-4 bg-white">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
            <p className="text-2xl font-black" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-5 pt-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex gap-1">
          {(['vehicles', 'drivers', 'hubs'] as const).map(t => <button key={t} onClick={() => { setTab(t); setSearch('') }} className={tabCls(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="text-xs outline-none w-32 text-slate-600 placeholder-slate-400" />
          </div>
          <button onClick={() => { if (tab === 'vehicles') { setVf(blankV); setModal('add-v') } else if (tab === 'drivers') { setDf(blankD); setModal('add-d') } else { setHf(blankH); setModal('add-h') } }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add {tab.slice(0, -1).charAt(0).toUpperCase() + tab.slice(1, -1)}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'vehicles' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-200">{['ID', 'Name', 'Plate', 'Type', 'Status', 'Payload', 'Fuel Eff.', 'Hub', 'Fuel', ''].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtV.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 group">
                  <td className="px-4 py-3 font-mono text-slate-400">V{v.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{v.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{v.plate_number}</td>
                  <td className="px-4 py-3 text-slate-500">{v.vehicle_type}</td>
                  <td className="px-4 py-3"><Badge s={v.current_status} /></td>
                  <td className="px-4 py-3 font-mono text-slate-600">{v.max_payload_kg}kg</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{v.fuel_efficiency_kpl} kpl</td>
                  <td className="px-4 py-3 text-slate-500">{hubs.find(h => h.id === v.assigned_hub_id)?.code ?? '—'}</td>
                  <td className="px-4 py-3 w-28"><Bar pct={v.fuel_pct} /></td>
                  <td className="px-4 py-3"><div className="flex gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setEditTarget(v); setVf({ name: v.name, plate_number: v.plate_number, vehicle_type: v.vehicle_type, max_payload_kg: v.max_payload_kg, max_volume_m3: v.max_volume_m3, fuel_efficiency_kpl: v.fuel_efficiency_kpl, current_status: v.current_status, assigned_hub_id: v.assigned_hub_id, fuel_pct: v.fuel_pct }); setModal('edit-v') }} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => { setVehicles(vehicles.filter(x => x.id !== v.id)); addAudit({ actor_name: 'Admin', action_type: 'ASSET_DELETED', entity_type: 'VEHICLE', entity_id: v.id, details: `Vehicle ${v.plate_number} removed` }) }} className="text-red-500 hover:text-red-700 font-medium">Del</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'drivers' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-200">{['ID', 'Name', 'License', 'Type', 'Phone', 'Status', 'Rating', 'Hub', ''].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtD.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 group">
                  <td className="px-4 py-3 font-mono text-slate-400">D{d.id}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{d.full_name}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{d.license_number}</td>
                  <td className="px-4 py-3 text-slate-500">{d.license_type}</td>
                  <td className="px-4 py-3 text-slate-500">{d.phone_number}</td>
                  <td className="px-4 py-3"><Badge s={d.status} /></td>
                  <td className="px-4 py-3 font-mono text-slate-600">★ {d.rating}</td>
                  <td className="px-4 py-3 text-slate-500">{hubs.find(h => h.id === d.assigned_hub_id)?.code ?? '—'}</td>
                  <td className="px-4 py-3"><div className="flex gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setEditTarget(d); setDf({ full_name: d.full_name, license_number: d.license_number, license_type: d.license_type, phone_number: d.phone_number, status: d.status, max_driving_hours_per_day: d.max_driving_hours_per_day, assigned_hub_id: d.assigned_hub_id, current_vehicle_id: d.current_vehicle_id, rating: d.rating }); setModal('edit-d') }} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => setDrivers(drivers.filter(x => x.id !== d.id))} className="text-red-500 hover:text-red-700 font-medium">Del</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'hubs' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50"><tr className="border-b border-slate-200">{['Code', 'Name', 'Address', 'Phone', 'Hours', ''].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filtH.map(h => (
                <tr key={h.id} className="hover:bg-slate-50 group">
                  <td className="px-4 py-3 font-mono font-medium text-blue-700">{h.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{h.name}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{h.address}</td>
                  <td className="px-4 py-3 text-slate-500">{h.contact_phone}</td>
                  <td className="px-4 py-3 text-slate-500">{h.operating_hours}</td>
                  <td className="px-4 py-3"><div className="flex gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setEditTarget(h); setHf({ name: h.name, code: h.code, address: h.address, latitude: h.latitude, longitude: h.longitude, contact_phone: h.contact_phone, operating_hours: h.operating_hours }); setModal('edit-h') }} className="text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                    <button onClick={() => setHubs(hubs.filter(x => x.id !== h.id))} className="text-red-500 hover:text-red-700 font-medium">Del</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'add-v' || modal === 'edit-v') && (
        <Modal title={modal === 'add-v' ? 'Add Vehicle' : 'Edit Vehicle'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Name"><input className={inputCls} value={vf.name} onChange={e => setVf(p => ({ ...p, name: e.target.value }))} /></Field><Field label="Plate"><input className={inputCls} value={vf.plate_number} onChange={e => setVf(p => ({ ...p, plate_number: e.target.value }))} /></Field></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><select className={selCls} value={vf.vehicle_type} onChange={e => setVf(p => ({ ...p, vehicle_type: e.target.value as VehicleType }))}>{['VAN', 'BOX_TRUCK', 'SEMI_TRUCK', 'EV'].map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Status"><select className={selCls} value={vf.current_status} onChange={e => setVf(p => ({ ...p, current_status: e.target.value as VehicleStatus }))}>{['AVAILABLE', 'IN_TRANSIT', 'MAINTENANCE', 'DECOMMISSIONED'].map(s => <option key={s} value={s}>{s}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-3 gap-3"><Field label="Payload (kg)"><input type="number" className={inputCls} value={vf.max_payload_kg} onChange={e => setVf(p => ({ ...p, max_payload_kg: +e.target.value }))} /></Field><Field label="Volume (m³)"><input type="number" className={inputCls} value={vf.max_volume_m3} onChange={e => setVf(p => ({ ...p, max_volume_m3: +e.target.value }))} /></Field><Field label="Fuel Eff."><input type="number" className={inputCls} value={vf.fuel_efficiency_kpl} onChange={e => setVf(p => ({ ...p, fuel_efficiency_kpl: +e.target.value }))} /></Field></div>
            <Field label="Hub"><select className={selCls} value={vf.assigned_hub_id} onChange={e => setVf(p => ({ ...p, assigned_hub_id: +e.target.value }))}>{hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button><button onClick={saveVehicle} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">Save</button></div>
          </div>
        </Modal>
      )}
      {(modal === 'add-d' || modal === 'edit-d') && (
        <Modal title={modal === 'add-d' ? 'Add Driver' : 'Edit Driver'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Name"><input className={inputCls} value={df.full_name} onChange={e => setDf(p => ({ ...p, full_name: e.target.value }))} /></Field><Field label="Phone"><input className={inputCls} value={df.phone_number} onChange={e => setDf(p => ({ ...p, phone_number: e.target.value }))} /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="License No."><input className={inputCls} value={df.license_number} onChange={e => setDf(p => ({ ...p, license_number: e.target.value }))} /></Field>
              <Field label="License Type"><select className={selCls} value={df.license_type} onChange={e => setDf(p => ({ ...p, license_type: e.target.value as LicenseType }))}>{['CLASS_A', 'CLASS_B', 'COMMERCIAL'].map(t => <option key={t} value={t}>{t}</option>)}</select></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Status"><select className={selCls} value={df.status} onChange={e => setDf(p => ({ ...p, status: e.target.value as DriverStatus }))}>{['ON_DUTY', 'OFF_DUTY', 'ON_TRIP', 'RESTING'].map(s => <option key={s} value={s}>{s}</option>)}</select></Field><Field label="Max Hours/Day"><input type="number" className={inputCls} value={df.max_driving_hours_per_day} onChange={e => setDf(p => ({ ...p, max_driving_hours_per_day: +e.target.value }))} /></Field></div>
            <Field label="Hub"><select className={selCls} value={df.assigned_hub_id} onChange={e => setDf(p => ({ ...p, assigned_hub_id: +e.target.value }))}>{hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button><button onClick={saveDriver} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">Save</button></div>
          </div>
        </Modal>
      )}
      {(modal === 'add-h' || modal === 'edit-h') && (
        <Modal title={modal === 'add-h' ? 'Add Hub' : 'Edit Hub'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Hub Name"><input className={inputCls} value={hf.name} onChange={e => setHf(p => ({ ...p, name: e.target.value }))} /></Field><Field label="Hub Code"><input className={inputCls} value={hf.code} onChange={e => setHf(p => ({ ...p, code: e.target.value }))} /></Field></div>
            <Field label="Address"><input className={inputCls} value={hf.address} onChange={e => setHf(p => ({ ...p, address: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Latitude"><input type="number" className={inputCls} value={hf.latitude} onChange={e => setHf(p => ({ ...p, latitude: +e.target.value }))} /></Field><Field label="Longitude"><input type="number" className={inputCls} value={hf.longitude} onChange={e => setHf(p => ({ ...p, longitude: +e.target.value }))} /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className={inputCls} value={hf.contact_phone} onChange={e => setHf(p => ({ ...p, contact_phone: e.target.value }))} /></Field><Field label="Hours"><input className={inputCls} value={hf.operating_hours} onChange={e => setHf(p => ({ ...p, operating_hours: e.target.value }))} /></Field></div>
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button><button onClick={saveHub} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">Save</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── SHIPMENTS SECTION ────────────────────────────────────────────────────────
function ShipmentsSection({ shipments, setShipments, hubs, addAudit, onTriggerWorkflow, activeRole }: {
  shipments: Shipment[]; setShipments: React.Dispatch<React.SetStateAction<Shipment[]>>
  hubs: Hub[]; addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onTriggerWorkflow: (s: Shipment) => void
  activeRole?: UserRole
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [batchModal, setBatchModal] = useState(false)
  const [batchPreview, setBatchPreview] = useState<Shipment[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [batchSuccessMsg, setBatchSuccessMsg] = useState('')
  const [editTarget, setEditTarget] = useState<Shipment | null>(null)
  const blank: Omit<Shipment, 'id'> = { tracking_number: '', customer_name: '', destination_address: '', weight_kg: 100, volume_m3: 1, time_window_start: '09:00', time_window_end: '12:00', priority: 'STANDARD', status: 'UNASSIGNED', hub_id: 1 }
  const [form, setForm] = useState(blank)
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const filt = shipments.filter(s => {
    const q = search.toLowerCase()
    return (statusFilter === 'ALL' || s.status === statusFilter) && (s.tracking_number.toLowerCase().includes(q) || s.customer_name.toLowerCase().includes(q))
  })

  const [formError, setFormError] = useState('')

  function save() {
    setFormError('')
    const norm = form.tracking_number.trim().toUpperCase()
    if (!norm) {
      setFormError('Tracking number cannot be empty.')
      return
    }

    if (modal === 'add') {
      const isDuplicate = shipments.some(s => s.tracking_number.trim().toUpperCase() === norm)
      if (isDuplicate) {
        setFormError(`Tracking number "${form.tracking_number.trim()}" already exists in the fleet roster. Duplicate order IDs are not allowed.`)
        return
      }
      const ns: Shipment = { ...form, tracking_number: form.tracking_number.trim(), id: Date.now() }
      setShipments([...shipments, ns])
      addAudit({ actor_name: activeRole || 'Admin', action_type: 'ASSET_CREATED', entity_type: 'SHIPMENT', entity_id: ns.id, details: `New shipment: ${ns.tracking_number} — AI workflow auto-triggered` })
      setJustAdded(ns.id)
      setModal(null); setForm(blank)
      setTimeout(() => onTriggerWorkflow(ns), 400)
    } else if (modal === 'edit' && editTarget) {
      const isDuplicate = shipments.some(s => s.id !== editTarget.id && s.tracking_number.trim().toUpperCase() === norm)
      if (isDuplicate) {
        setFormError(`Tracking number "${form.tracking_number.trim()}" is already assigned to another shipment.`)
        return
      }
      setShipments(shipments.map(s => s.id === editTarget.id ? { ...s, ...form, tracking_number: form.tracking_number.trim() } : s))
      setModal(null); setForm(blank)
    }
  }

  function advanceFSM(s: Shipment) {
    const next: Record<ShipmentStatus, ShipmentStatus> = { UNASSIGNED: 'CLUSTERED', CLUSTERED: 'ASSIGNED', ASSIGNED: 'IN_TRANSIT', IN_TRANSIT: 'DELIVERED', DELIVERED: 'DELIVERED', FAILED: 'FAILED' }
    setShipments(shipments.map(x => x.id === s.id ? { ...x, status: next[x.status] } : x))
    addAudit({ actor_name: 'Admin', action_type: 'STATUS_CHANGE', entity_type: 'SHIPMENT', entity_id: s.id, details: `${s.tracking_number}: ${s.status} → ${next[s.status]}` })
  }

  const [batchFile, setBatchFile] = useState<File | null>(null)
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false)

  async function downloadCsvTemplate() {
    try {
      const token = await fetchAuthToken(activeRole || 'ADMIN')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`${API_BASE}/api/v1/shipments/batch/template`, { headers })
      if (res.ok) {
        const text = await res.text()
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'shipments_batch_template.csv'
        a.click()
        URL.revokeObjectURL(url)
        return
      }
    } catch {
      // Fallback to client template if server unreachable
    }
    const csvContent = "tracking_number,customer_name,destination_address,latitude,longitude,weight_kg,volume_m3,time_window_start,time_window_end,priority,hub_id\n" +
      "SHP-CSV-001,Reliance Retail Hub,Bandra Kurla Complex Mumbai,19.0657,72.8687,250.0,2.1,09:00,13:00,HIGH,1\n" +
      "SHP-CSV-002,Tata Digital Logistics,Hiranandani Business Park Powai Mumbai,19.1176,72.9060,110.5,0.9,10:00,15:00,STANDARD,1\n" +
      "SHP-CSV-003,Flipkart Supply Chain,Sector 11 CBD Belapur Navi Mumbai,19.0144,73.0380,520.0,4.2,08:30,12:00,EXPRESS,1\n" +
      "SHP-CSV-004,Infosys Technologies Ltd,Electronics City Phase 1 Bengaluru,12.8452,77.6602,340.0,2.8,11:00,16:00,STANDARD,2\n" +
      "SHP-CSV-005,Amazon India Fulfillment,Okhla Phase II New Delhi,28.5320,77.2710,185.0,1.4,09:00,12:30,EXPRESS,3"
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_shipments_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleBatchFile(file: File) {
    setBatchFile(file)
    setBatchErrors([])
    setBatchSuccessMsg('')
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) return

      const existingTrackingSet = new Set(shipments.map(s => s.tracking_number.trim().toUpperCase()))
      const batchSeenSet = new Set<string>()
      const detectedErrors: string[] = []

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed)) {
            const parsedRows: Shipment[] = []
            parsed.forEach((x, i) => {
              const rowNum = i + 1
              const tracking = (x.tracking_number || '').trim()
              if (!tracking) {
                detectedErrors.push(`Record #${rowNum}: Missing tracking_number.`)
                return
              }
              const upper = tracking.toUpperCase()
              if (batchSeenSet.has(upper)) {
                detectedErrors.push(`Record #${rowNum}: Duplicate tracking_number "${tracking}" within JSON batch file.`)
                return
              }
              if (existingTrackingSet.has(upper)) {
                detectedErrors.push(`Record #${rowNum}: Order "${tracking}" already exists in the active fleet roster.`)
                return
              }
              batchSeenSet.add(upper)
              parsedRows.push({ ...blank, ...x, tracking_number: tracking, id: Date.now() + i })
            })
            setBatchPreview(parsedRows)
            if (detectedErrors.length > 0) {
              setBatchErrors(detectedErrors)
            }
          } else {
            setBatchErrors(['JSON file must contain an array of shipment objects.'])
          }
        } catch {
          setBatchErrors(['Invalid JSON file structure.'])
        }
      } else {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
        if (lines.length <= 1) {
          setBatchErrors(['CSV file has no data rows.'])
          return
        }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        const parsedRows: Shipment[] = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim())
          if (cols.length < 5) continue
          const rowObj: any = {}
          headers.forEach((h, idx) => { rowObj[h] = cols[idx] ?? '' })
          const tracking = (rowObj.tracking_number || `SHP-BATCH-${i}`).trim()
          const upper = tracking.toUpperCase()

          if (batchSeenSet.has(upper)) {
            detectedErrors.push(`Row ${i + 1}: Duplicate tracking_number "${tracking}" within CSV file.`)
            continue
          }
          if (existingTrackingSet.has(upper)) {
            detectedErrors.push(`Row ${i + 1}: Order "${tracking}" already exists in active fleet roster.`)
            continue
          }
          batchSeenSet.add(upper)

          const customer = rowObj.customer_name || `Customer ${i}`
          const addr = rowObj.destination_address || 'Central Depot Delivery Area'
          const lat = parseFloat(rowObj.latitude) || 19.0760
          const lng = parseFloat(rowObj.longitude) || 72.8777
          const weight = parseFloat(rowObj.weight_kg) || 100
          const volume = parseFloat(rowObj.volume_m3) || 1.0
          const hubId = parseInt(rowObj.hub_id) || 1
          const prio = (['LOW', 'STANDARD', 'HIGH', 'EXPRESS'].includes(rowObj.priority?.toUpperCase()) ? rowObj.priority.toUpperCase() : 'STANDARD') as ShipmentPriority
          parsedRows.push({
            id: Date.now() + i,
            tracking_number: tracking,
            customer_name: customer,
            destination_address: addr,
            latitude: lat,
            longitude: lng,
            weight_kg: weight,
            volume_m3: volume,
            time_window_start: rowObj.time_window_start || '09:00',
            time_window_end: rowObj.time_window_end || '17:00',
            priority: prio,
            status: 'UNASSIGNED',
            hub_id: hubId,
          })
        }
        setBatchPreview(parsedRows)
        if (detectedErrors.length > 0) {
          setBatchErrors(detectedErrors)
        }
      }
    }
    reader.readAsText(file)
  }

  async function commitBatch() {
    if (batchPreview.length === 0) return
    setIsSubmittingBatch(true)
    setBatchErrors([])
    setBatchSuccessMsg('')

    // Extra safeguard: Filter out any items that already exist in active shipments
    const currentTrackingSet = new Set(shipments.map(s => s.tracking_number.trim().toUpperCase()))
    const uniqueBatch = batchPreview.filter(p => !currentTrackingSet.has(p.tracking_number.trim().toUpperCase()))

    if (uniqueBatch.length === 0) {
      setBatchErrors([
        'All orders in this batch already exist in the active fleet roster. Ingestion stopped to prevent duplicate couriers.',
      ])
      setIsSubmittingBatch(false)
      return
    }

    let importedList: Shipment[] = []
    let apiErrorList: string[] = []
    let isServerPersisted = false

    try {
      const token = await fetchAuthToken(activeRole || 'ADMIN')
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

      // Always send the validated uniqueBatch via JSON endpoint to guarantee duplicate prevention
      const payload = {
        shipments: uniqueBatch.map(item => ({
          tracking_number: item.tracking_number,
          customer_name: item.customer_name,
          destination_address: item.destination_address,
          latitude: item.latitude ?? 19.0760,
          longitude: item.longitude ?? 72.8777,
          weight_kg: item.weight_kg,
          volume_m3: item.volume_m3,
          time_window_start: item.time_window_start,
          time_window_end: item.time_window_end,
          priority: item.priority,
          hub_id: item.hub_id || 1,
        })),
      }
      const res = await fetch(`${API_BASE}/api/v1/shipments/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        isServerPersisted = true
        const data = await res.json()
        if (data.created_shipments && data.created_shipments.length > 0) {
          importedList = data.created_shipments
        }
        if (data.errors && data.errors.length > 0) {
          apiErrorList = data.errors.map((e: any) => `Row ${e.row}${e.tracking_number ? ` (${e.tracking_number})` : ''}: ${e.reason}`)
        }
      }
    } catch (e) {
      console.warn('Backend batch endpoint unreachable, applying client-side deduplication:', e)
    }

    if (apiErrorList.length > 0 && importedList.length === 0) {
      setBatchErrors(apiErrorList)
      setIsSubmittingBatch(false)
      return
    }

    const finalAdditions = importedList.length > 0 ? importedList : uniqueBatch

    // Strict deduplication when merging into shipments state
    setShipments(prev => {
      const existing = new Set(prev.map(s => s.tracking_number.trim().toUpperCase()))
      const reallyNew = finalAdditions.filter(s => !existing.has(s.tracking_number.trim().toUpperCase()))
      return [...prev, ...reallyNew]
    })

    if (apiErrorList.length > 0) {
      setBatchErrors(apiErrorList)
    }

    const skippedDuplicatesCount = batchPreview.length - uniqueBatch.length

    addAudit({
      actor_name: activeRole || 'Admin',
      action_type: 'ASSET_CREATED',
      entity_type: 'SHIPMENT_BATCH',
      entity_id: Date.now(),
      details: `Batch imported ${finalAdditions.length} orders${skippedDuplicatesCount > 0 ? ` (${skippedDuplicatesCount} duplicates skipped)` : ''} (${isServerPersisted ? 'Server DB Persisted' : 'Client Mode'})`,
    })

    setBatchSuccessMsg(
      `Successfully committed ${finalAdditions.length} new orders${isServerPersisted ? ' to Database' : ''}!${skippedDuplicatesCount > 0 ? ` (${skippedDuplicatesCount} duplicate tracking numbers skipped)` : ''}`
    )

    if (apiErrorList.length === 0) {
      setTimeout(() => {
        setBatchModal(false)
        setBatchPreview([])
        setBatchFile(null)
        setBatchSuccessMsg('')
        setBatchErrors([])
        setIsSubmittingBatch(false)
      }, 1400)
    } else {
      setIsSubmittingBatch(false)
    }
  }

  // Detect duplicate tracking numbers in active roster
  const trackingCountMap = shipments.reduce((acc, s) => {
    const k = s.tracking_number.trim().toUpperCase()
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const duplicateKeys = Object.keys(trackingCountMap).filter(k => trackingCountMap[k] > 1)

  function handleDeduplicateRoster() {
    const seen = new Set<string>()
    const cleaned: Shipment[] = []
    shipments.forEach(s => {
      const k = s.tracking_number.trim().toUpperCase()
      if (!seen.has(k)) {
        seen.add(k)
        cleaned.push(s)
      }
    })
    setShipments(cleaned)
    addAudit({
      actor_name: activeRole || 'Admin',
      action_type: 'STATUS_CHANGE',
      entity_type: 'SHIPMENT',
      entity_id: Date.now(),
      details: `Deduplicated shipment roster: removed ${shipments.length - cleaned.length} duplicate entries.`,
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-4 gap-3 p-5 pb-0 flex-shrink-0">
        {(['UNASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'] as ShipmentStatus[]).map(s => (
          <div key={s} className="border border-slate-200 rounded-xl p-4 bg-white">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{s.replace(/_/g, ' ')}</p>
            <p className="text-2xl font-black" style={{ color: (SC[s] ?? { text: '#374151' }).text }}>{shipments.filter(x => x.status === s).length}</p>
          </div>
        ))}
      </div>
      {duplicateKeys.length > 0 && (
        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 font-bold text-xs">⚠️ Duplicate Tracking Numbers Detected:</span>
            <span className="text-xs text-amber-900">
              {duplicateKeys.length} courier ID{duplicateKeys.length > 1 ? 's' : ''} duplicated ({duplicateKeys.join(', ')}).
            </span>
          </div>
          <button
            onClick={handleDeduplicateRoster}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
          >
            Deduplicate Roster (Remove Duplicates)
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 mt-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="text-xs outline-none w-36 text-slate-600 placeholder-slate-400" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none bg-white">
            <option value="ALL">All Status</option>
            {['UNASSIGNED', 'CLUSTERED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setBatchModal(true); setBatchPreview([]); setBatchErrors([]); setBatchSuccessMsg('') }} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors shadow-sm shadow-emerald-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Batch Ingestion (CSV / JSON)
          </button>
          <button onClick={() => { setForm(blank); setModal('add') }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm shadow-blue-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            New Shipment → AI Workflow
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10"><tr className="border-b border-slate-200">{['Tracking #', 'Customer', 'Destination', 'Weight', 'Priority', 'Window', 'Status', 'Hub', ''].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filt.map(s => (
              <tr key={s.id} className={`hover:bg-slate-50 group transition-colors ${justAdded === s.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 font-mono font-bold text-blue-700">{s.tracking_number}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{s.customer_name}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[150px] truncate">{s.destination_address}</td>
                <td className="px-4 py-3 font-mono text-slate-600">{s.weight_kg}kg</td>
                <td className="px-4 py-3"><Badge s={s.priority} /></td>
                <td className="px-4 py-3 font-mono text-slate-500">{s.time_window_start}–{s.time_window_end}</td>
                <td className="px-4 py-3"><Badge s={s.status} /></td>
                <td className="px-4 py-3 text-slate-500">{hubs.find(h => h.id === s.hub_id)?.code ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onTriggerWorkflow(s)} className="text-violet-600 hover:text-violet-800 font-bold text-[11px] whitespace-nowrap">🤖 AI Workflow</button>
                    {s.status !== 'DELIVERED' && s.status !== 'FAILED' && <button onClick={() => advanceFSM(s)} className="text-emerald-600 hover:text-emerald-800 font-medium">→</button>}
                    <button onClick={() => { setEditTarget(s); setForm({ tracking_number: s.tracking_number, customer_name: s.customer_name, destination_address: s.destination_address, weight_kg: s.weight_kg, volume_m3: s.volume_m3, time_window_start: s.time_window_start, time_window_end: s.time_window_end, priority: s.priority, status: s.status, hub_id: s.hub_id }); setModal('edit') }} className="text-blue-600 font-medium">Edit</button>
                    <button onClick={() => setShipments(shipments.filter(x => x.id !== s.id))} className="text-red-500 font-medium">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {batchModal && (
        <Modal title="📦 Batch Order Ingestion (CSV / JSON) — US-002" onClose={() => setBatchModal(false)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <p className="text-xs font-bold text-slate-800">CSV Specification & Template</p>
                <p className="text-[11px] text-slate-500">Includes columns: tracking_number, customer_name, destination_address, weight_kg, priority, hub_id.</p>
              </div>
              <button onClick={downloadCsvTemplate} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-blue-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Template
              </button>
            </div>

            <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-emerald-50/30 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-slate-400 mx-auto mb-2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>
              <p className="text-xs font-semibold text-slate-700">Drag & drop your CSV or JSON file here</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Supports multi-order consignments up to 100 records</p>
              <input type="file" accept=".csv,.json" onChange={e => { if (e.target.files?.[0]) handleBatchFile(e.target.files[0]) }} className="mt-3 text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700" />
            </div>

            {batchErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <p className="font-bold mb-1">Validation Errors:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  {batchErrors.map((err, idx) => <li key={idx}>{err}</li>)}
                </ul>
              </div>
            )}

            {batchSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 text-center">
                ✓ {batchSuccessMsg}
              </div>
            )}

            {batchPreview.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-800">Delivery Cluster Preview</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {batchPreview.length} Ready to Ingest
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 py-1 text-center">
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400">Total Payload</p>
                    <p className="text-sm font-bold text-slate-700">{batchPreview.reduce((acc, x) => acc + x.weight_kg, 0).toFixed(1)} kg</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400">Total Volume</p>
                    <p className="text-sm font-bold text-slate-700">{batchPreview.reduce((acc, x) => acc + x.volume_m3, 0).toFixed(1)} m³</p>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400">Express Priority</p>
                    <p className="text-sm font-bold text-amber-600">{batchPreview.filter(x => x.priority === 'EXPRESS' || x.priority === 'HIGH').length} Orders</p>
                  </div>
                </div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border-t border-slate-100 pt-1">
                  {batchPreview.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-1.5 text-[11px]">
                      <span className="font-mono font-bold text-blue-700">{p.tracking_number}</span>
                      <span className="text-slate-600 truncate max-w-[140px]">{p.customer_name}</span>
                      <span className="text-slate-400">{p.weight_kg}kg</span>
                      <Badge s={p.priority} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setBatchModal(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
              <button
                onClick={commitBatch}
                disabled={batchPreview.length === 0 || isSubmittingBatch || batchPreview.every(p => shipments.some(s => s.tracking_number.trim().toUpperCase() === p.tracking_number.trim().toUpperCase()))}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs text-white rounded-lg font-bold transition shadow-sm ${
                  batchPreview.length > 0 && !isSubmittingBatch && !batchPreview.every(p => shipments.some(s => s.tracking_number.trim().toUpperCase() === p.tracking_number.trim().toUpperCase()))
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {isSubmittingBatch && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {isSubmittingBatch
                  ? 'Submitting to API…'
                  : batchPreview.every(p => shipments.some(s => s.tracking_number.trim().toUpperCase() === p.tracking_number.trim().toUpperCase()))
                  ? 'All Orders are Duplicates (Cannot Ingest)'
                  : `Ingest & Commit (${batchPreview.filter(p => !shipments.some(s => s.tracking_number.trim().toUpperCase() === p.tracking_number.trim().toUpperCase())).length} New Orders)`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? '+ New Shipment — Copilot will auto-analyze' : 'Edit Shipment'} onClose={() => { setModal(null); setFormError('') }}>
          <div className="space-y-3">
            {formError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold">
                ⚠️ {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3"><Field label="Tracking #"><input className={inputCls} value={form.tracking_number} onChange={e => setForm(p => ({ ...p, tracking_number: e.target.value }))} placeholder="SHP-XXX-HUB" /></Field><Field label="Customer"><input className={inputCls} value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))} /></Field></div>
            <Field label="Destination Address"><input className={inputCls} value={form.destination_address} onChange={e => setForm(p => ({ ...p, destination_address: e.target.value }))} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Weight (kg)"><input type="number" className={inputCls} value={form.weight_kg} onChange={e => setForm(p => ({ ...p, weight_kg: +e.target.value }))} /></Field>
              <Field label="Volume (m³)"><input type="number" className={inputCls} value={form.volume_m3} onChange={e => setForm(p => ({ ...p, volume_m3: +e.target.value }))} /></Field>
              <Field label="Priority"><select className={selCls} value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as ShipmentPriority }))}>{['EXPRESS', 'HIGH', 'STANDARD', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3"><Field label="Window Start"><input className={inputCls} value={form.time_window_start} onChange={e => setForm(p => ({ ...p, time_window_start: e.target.value }))} /></Field><Field label="Window End"><input className={inputCls} value={form.time_window_end} onChange={e => setForm(p => ({ ...p, time_window_end: e.target.value }))} /></Field></div>
            <Field label="Hub"><select className={selCls} value={form.hub_id} onChange={e => setForm(p => ({ ...p, hub_id: +e.target.value }))}>{hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            {modal === 'add' && <p className="text-[11px] text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">🤖 After saving, Copilot will automatically generate a workflow — driver, vehicle, route, and compliance checks.</p>}
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button><button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg font-semibold">{modal === 'add' ? 'Save & Analyze →' : 'Save'}</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
function AuditSection({ entries }: { entries: AuditEntry[] }) {
  const [filter, setFilter] = useState('ALL')
  const filt = entries.filter(e => filter === 'ALL' || e.action_type === filter)
  const actionColor: Record<string, string> = { ROUTE_MODIFIED: '#2563eb', STATUS_CHANGE: '#7c3aed', COPILOT_OVERRIDE: '#d97706', DISPATCH_APPROVED: '#15803d', ASSET_CREATED: '#0891b2', ASSET_DELETED: '#dc2626' }
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div><p className="text-sm font-bold text-slate-800">Immutable Audit Trail</p><p className="text-xs text-slate-400">{entries.length} entries · append-only</p></div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none text-slate-600 bg-white">
          <option value="ALL">All Types</option>
          {['ROUTE_MODIFIED', 'STATUS_CHANGE', 'COPILOT_OVERRIDE', 'DISPATCH_APPROVED', 'ASSET_CREATED', 'ASSET_DELETED'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10"><tr className="border-b border-slate-200">{['#', 'Timestamp', 'Actor', 'Action', 'Entity', 'Details'].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filt.map(e => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-400">#{e.id}</td>
                <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{e.timestamp}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{e.actor_name}</td>
                <td className="px-4 py-3"><span style={{ color: actionColor[e.action_type] ?? '#374151' }} className="font-semibold">{e.action_type.replace(/_/g, ' ')}</span></td>
                <td className="px-4 py-3 font-mono text-slate-500">{e.entity_type} #{e.entity_id}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs">{e.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function UsersSection({ users, setUsers }: { users: User[]; setUsers: (u: User[]) => void }) {
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const blank: Omit<User, 'id'> = { email: '', full_name: '', role: 'DRIVER', is_active: true }
  const [form, setForm] = useState(blank)
  function save() {
    if (modal === 'add') { setUsers([...users, { ...form, id: Date.now() }]) }
    else if (modal === 'edit' && editTarget) { setUsers(users.map(u => u.id === editTarget.id ? { ...u, ...form } : u)) }
    setModal(null); setForm(blank)
  }
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
        <div><p className="text-sm font-bold text-slate-800">User Management</p><p className="text-xs text-slate-400">RBAC — Admin, Fleet Manager, Dispatcher, Driver</p></div>
        <button onClick={() => { setForm(blank); setModal('add') }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Add User</button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 z-10"><tr className="border-b border-slate-200">{['ID', 'Name', 'Email', 'Role', 'Status', ''].map(h => <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-2.5">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-50 group">
                <td className="px-5 py-3 font-mono text-slate-400">U{u.id}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{u.full_name}</td>
                <td className="px-5 py-3 font-mono text-slate-500">{u.email}</td>
                <td className="px-5 py-3"><Badge s={u.role} /></td>
                <td className="px-5 py-3"><span className={`text-xs font-semibold ${u.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>{u.is_active ? '● Active' : '○ Inactive'}</span></td>
                <td className="px-5 py-3"><div className="flex gap-3 opacity-0 group-hover:opacity-100">
                  <button onClick={() => { setEditTarget(u); setForm({ email: u.email, full_name: u.full_name, role: u.role, is_active: u.is_active }); setModal('edit') }} className="text-blue-600 font-medium">Edit</button>
                  <button onClick={() => setUsers(users.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x))} className="text-amber-600 font-medium">{u.is_active ? 'Deactivate' : 'Activate'}</button>
                  {u.role !== 'ADMIN' && <button onClick={() => setUsers(users.filter(x => x.id !== u.id))} className="text-red-500 font-medium">Remove</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add User' : 'Edit User'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Full Name"><input className={inputCls} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></Field><Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></Field></div>
            <Field label="Role"><select className={selCls} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}>{['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER'].map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}</select></Field>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} /><span className="text-sm text-slate-600">Active account</span></label>
            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600">Cancel</button><button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">Save</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
const ALL_NAV: { id: AdminSection; label: string; group: 'Operations' | 'Assets & policy' | 'Governance'; path: string; roles: UserRole[] }[] = [
  { id: 'dashboard', label: 'AI Command', group: 'Operations', path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER'] },
  { id: 'shipments', label: 'Shipments', group: 'Operations', path: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', roles: ['ADMIN', 'DISPATCHER'] },
  { id: 'workflow', label: 'Dispatch Planner', group: 'Operations', path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', roles: ['ADMIN', 'DISPATCHER'] },
  { id: 'tracking', label: 'Live Tracking', group: 'Operations', path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER'] },
  { id: 'map', label: 'Network Map', group: 'Operations', path: 'M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER'] },
  { id: 'fleet', label: 'Fleet Assets', group: 'Assets & policy', path: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8z', roles: ['ADMIN', 'FLEET_MANAGER'] },
  { id: 'compliance', label: 'Compliance', group: 'Assets & policy', path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER'] },
  { id: 'audit', label: 'Audit Log', group: 'Governance', path: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', roles: ['ADMIN', 'FLEET_MANAGER'] },
  { id: 'users', label: 'Users', group: 'Governance', path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', roles: ['ADMIN'] },
]

export default function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('ADMIN')
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null)

  const [hubs, setHubs] = useState<Hub[]>(INIT_HUBS)
  const [vehicles, setVehicles] = useState<Vehicle[]>(INIT_VEHICLES)
  const [drivers, setDrivers] = useState<Driver[]>(INIT_DRIVERS)
  const [shipments, setShipments] = useState<Shipment[]>(INIT_SHIPMENTS)
  const [users, setUsers] = useState<User[]>(INIT_USERS)
  const [audit, setAudit] = useState<AuditEntry[]>(INIT_AUDIT)
  const [workflowShipment, setWorkflowShipment] = useState<Shipment | null>(null)

  // Live Backend Probing
  useEffect(() => {
    checkApiHealth().then((ok) => setIsBackendOnline(ok))
    const interval = setInterval(() => {
      checkApiHealth().then((ok) => setIsBackendOnline(ok))
    }, 20000)
    return () => clearInterval(interval)
  }, [])

  function addAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
    const now = new Date()
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    setAudit(prev => [{ ...entry, id: Date.now(), timestamp: ts }, ...prev])
  }

  // Dispatch Planner approval: lock the plan onto the shipment, vehicle and driver (Live Tracking picks it up).
  function dispatch(d: DispatchDecision) {
    setShipments(prev => prev.map(s => s.id === d.shipmentId ? { ...s, status: 'ASSIGNED', assigned_vehicle_id: d.vehicleId, dispatch_time: d.departure } : s))
    setVehicles(prev => prev.map(v => v.id === d.vehicleId ? { ...v, current_status: 'IN_TRANSIT' } : v))
    setDrivers(prev => prev.map(dr => dr.id === d.driverId ? { ...dr, status: 'ON_TRIP', current_vehicle_id: d.vehicleId } : dr))
  }

  function triggerWorkflow(s: Shipment) {
    setWorkflowShipment(s)
    setSection('workflow')
  }

  const unassigned = shipments.filter(s => s.status === 'UNASSIGNED').length

  // Filter navigation items by active role
  const filteredNav = ALL_NAV.filter(item => item.roles.includes(activeRole))

  const roleUserNames: Record<UserRole, { name: string; email: string; initials: string; badgeColor: string }> = {
    ADMIN: { name: 'Abhayraj Jaiswal', email: 'admin@fleetops.in', initials: 'AJ', badgeColor: 'bg-red-600 text-white' },
    FLEET_MANAGER: { name: 'Kavita Sharma', email: 'manager@fleetops.in', initials: 'KS', badgeColor: 'bg-purple-600 text-white' },
    DISPATCHER: { name: 'Manthan Nimodiya', email: 'dispatch@fleetops.in', initials: 'MN', badgeColor: 'bg-blue-600 text-white' },
    DRIVER: { name: 'Rajesh Kumar', email: 'rajesh@fleetops.in', initials: 'RK', badgeColor: 'bg-emerald-600 text-white' },
  }

  const currentUser = roleUserNames[activeRole]

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 text-slate-900" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-60 flex-shrink-0 flex flex-col bg-slate-950 text-slate-300">
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5" width="18" height="18"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-white">FleetOps</p>
              <p className="text-[10px] text-slate-500">AI Route Optimizer</p>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {(['Operations', 'Assets & policy', 'Governance'] as const).map(group => {
              const items = filteredNav.filter(n => n.group === group)
              if (!items.length) return null
              return (
                <div key={group}>
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group}</p>
                  {items.map(item => {
                    const on = section === item.id
                    return (
                      <button key={item.id} onClick={() => setSection(item.id)}
                        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${on ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}>
                        {on && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-violet-500" />}
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><path d={item.path} /></svg>
                        <span className="text-[13px] font-medium flex-1">{item.label}</span>
                        {item.id === 'shipments' && unassigned > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-red-500/90 text-white">{unassigned}</span>}
                        {item.id === 'tracking' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>
          <div className="m-3 p-3 rounded-xl bg-white/5 space-y-1.5">
            {[
              { k: 'Backend API', v: isBackendOnline ? 'Online' : 'Offline', ok: !!isBackendOnline },
              { k: 'Distance engine', v: isBackendOnline ? 'Ready' : 'Estimate', ok: !!isBackendOnline },
              { k: 'RAG knowledge base', v: isBackendOnline ? 'Grounded' : 'Offline', ok: !!isBackendOnline },
            ].map(r => (
              <div key={r.k} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{r.k}</span>
                <span className={`flex items-center gap-1.5 font-medium ${r.ok ? 'text-emerald-400' : 'text-amber-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />{r.v}</span>
              </div>
            ))}
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 bg-white border-b border-slate-200 flex items-center gap-3 px-4">
          <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Toggle sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
          <div className="min-w-0 whitespace-nowrap">
            <p className="text-sm font-semibold text-slate-900 leading-tight">{ALL_NAV.find(n => n.id === section)?.label}</p>
            <p className="text-[11px] text-slate-400 leading-tight">{ALL_NAV.find(n => n.id === section)?.group} · Mumbai–Pune network</p>
          </div>
          <div className="flex-1" />
          {unassigned > 0 && activeRole !== 'DRIVER' && (
            <button onClick={() => setSection('workflow')} className="hidden xl:flex whitespace-nowrap items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{unassigned} unassigned · plan now
            </button>
          )}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
            {(['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setActiveRole(r)
                  if (r === 'DRIVER') setSection('tracking')
                  else if (!ALL_NAV.find(n => n.id === section)?.roles.includes(r)) setSection(ALL_NAV.find(n => n.roles.includes(r))!.id)
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition ${activeRole === r ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${currentUser.badgeColor}`}>{currentUser.initials}</div>
            <div className="hidden xl:block leading-tight whitespace-nowrap">
              <p className="text-xs font-semibold text-slate-800">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400">{activeRole.replace('_', ' ').toLowerCase()}</p>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {section === 'dashboard' && <CopilotDashboard vehicles={vehicles} drivers={drivers} shipments={shipments} hubs={hubs} audit={audit} setSection={setSection} />}
          {section === 'shipments' && <ShipmentsSection shipments={shipments} setShipments={setShipments} hubs={hubs} addAudit={addAudit} onTriggerWorkflow={triggerWorkflow} activeRole={activeRole} />}
          {section === 'workflow' && <DispatchPlanner shipments={shipments} hubs={hubs} vehicles={vehicles} drivers={drivers} initialShipmentId={workflowShipment?.id ?? null} onDispatch={dispatch} addAudit={addAudit} onOpenTracking={() => setSection('tracking')} />}
          {section === 'fleet' && <FleetSection vehicles={vehicles} setVehicles={setVehicles} drivers={drivers} setDrivers={setDrivers} hubs={hubs} setHubs={setHubs} addAudit={addAudit} />}
          {section === 'map' && <NetworkMapSection hubs={hubs} shipments={shipments} />}
          {/* Kept mounted so the simulation clock and reported events survive page switches */}
          <div className={section === 'tracking' ? 'h-full' : 'hidden'}>
            <LiveTrackingSection hubs={hubs} vehicles={vehicles} drivers={drivers} shipments={shipments} activeRole={activeRole} driverId={1} addAudit={addAudit} />
          </div>
          {section === 'compliance' && <ComplianceInspector />}
          {section === 'audit' && <AuditSection entries={audit} />}
          {section === 'users' && <UsersSection users={users} setUsers={setUsers} />}
        </main>
      </div>
    </div>
  )
}
