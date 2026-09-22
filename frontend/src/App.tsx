import { useState, useRef, useEffect, useCallback } from 'react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
type UserRole = 'ADMIN' | 'FLEET_MANAGER' | 'DISPATCHER' | 'DRIVER'
type VehicleType = 'VAN' | 'BOX_TRUCK' | 'SEMI_TRUCK' | 'EV'
type VehicleStatus = 'AVAILABLE' | 'IN_TRANSIT' | 'MAINTENANCE' | 'DECOMMISSIONED'
type DriverStatus = 'ON_DUTY' | 'OFF_DUTY' | 'ON_TRIP' | 'RESTING'
type LicenseType = 'CLASS_A' | 'CLASS_B' | 'COMMERCIAL'
type ShipmentStatus = 'UNASSIGNED' | 'CLUSTERED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
type ShipmentPriority = 'LOW' | 'STANDARD' | 'HIGH' | 'EXPRESS'
type AuditAction = 'ROUTE_MODIFIED' | 'STATUS_CHANGE' | 'COPILOT_OVERRIDE' | 'DISPATCH_APPROVED' | 'ASSET_CREATED' | 'ASSET_DELETED'
type AdminSection = 'dashboard' | 'fleet' | 'shipments' | 'workflow' | 'tracking' | 'compliance' | 'audit' | 'users'
type NodeStatus = 'ok' | 'warning' | 'error' | 'pending'
type WorkflowPhase = 'analyzing' | 'canvas' | 'route'

interface Vehicle { id: number; name: string; plate_number: string; vehicle_type: VehicleType; max_payload_kg: number; max_volume_m3: number; fuel_efficiency_kpl: number; current_status: VehicleStatus; assigned_hub_id: number; fuel_pct: number }
interface Driver { id: number; full_name: string; license_number: string; license_type: LicenseType; phone_number: string; status: DriverStatus; max_driving_hours_per_day: number; assigned_hub_id: number; current_vehicle_id: number | null; rating: number }
interface Hub { id: number; name: string; code: string; address: string; latitude: number; longitude: number; contact_phone: string; operating_hours: string }
interface Shipment { id: number; tracking_number: string; customer_name: string; destination_address: string; weight_kg: number; volume_m3: number; time_window_start: string; time_window_end: string; priority: ShipmentPriority; status: ShipmentStatus; hub_id: number }
interface User { id: number; email: string; full_name: string; role: UserRole; is_active: boolean }
interface AuditEntry { id: number; timestamp: string; actor_name: string; action_type: AuditAction; entity_type: string; entity_id: number; details: string }
interface CopilotMsg { id: string; sender: 'user' | 'assistant'; content: string; timestamp: string; trace?: string; proposal?: { title: string; description: string; status: 'PROPOSED' | 'APPROVED' | 'REJECTED' } }
interface WFNode { id: string; type: 'shipment' | 'hub' | 'driver' | 'vehicle' | 'stop' | 'destination' | 'return'; label: string; sublabel: string; status: NodeStatus; data: any; x: number; y: number }
interface WFEdge { from: string; to: string; label?: string }

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const INIT_HUBS: Hub[] = [
  { id: 1, name: 'Mumbai Central Depot', code: 'HUB-MUM-01', address: 'Plot 45, MIDC, Andheri East, Mumbai', latitude: 19.1136, longitude: 72.8697, contact_phone: '+91-22-2820-1100', operating_hours: '06:00–22:00' },
  { id: 2, name: 'Navi Mumbai Distribution Center', code: 'HUB-NV-02', address: 'Sector 19, Vashi, Navi Mumbai', latitude: 19.076, longitude: 72.9986, contact_phone: '+91-22-2780-4400', operating_hours: '05:00–23:00' },
  { id: 3, name: 'Pune Regional Gateway', code: 'HUB-PNQ-03', address: 'Phase 2, Hinjawadi, Pune', latitude: 18.5913, longitude: 73.7389, contact_phone: '+91-20-6710-2200', operating_hours: '06:00–22:00' },
]
const INIT_VEHICLES: Vehicle[] = [
  { id: 1, name: 'Alpha Prime Van', plate_number: 'MH-02-EE-1001', vehicle_type: 'VAN', max_payload_kg: 1500, max_volume_m3: 12, fuel_efficiency_kpl: 14.2, current_status: 'AVAILABLE', assigned_hub_id: 1, fuel_pct: 82 },
  { id: 2, name: 'Heavy Box Carrier', plate_number: 'MH-04-AB-2045', vehicle_type: 'BOX_TRUCK', max_payload_kg: 3500, max_volume_m3: 24.5, fuel_efficiency_kpl: 8.5, current_status: 'IN_TRANSIT', assigned_hub_id: 1, fuel_pct: 54 },
  { id: 3, name: 'Eco Cargo Electric', plate_number: 'MH-01-EV-8822', vehicle_type: 'EV', max_payload_kg: 950, max_volume_m3: 8, fuel_efficiency_kpl: 18, current_status: 'AVAILABLE', assigned_hub_id: 2, fuel_pct: 67 },
  { id: 4, name: 'Interstate Hauler', plate_number: 'MH-12-QQ-4001', vehicle_type: 'SEMI_TRUCK', max_payload_kg: 8500, max_volume_m3: 55, fuel_efficiency_kpl: 5.8, current_status: 'MAINTENANCE', assigned_hub_id: 3, fuel_pct: 28 },
]
const INIT_DRIVERS: Driver[] = [
  { id: 1, full_name: 'Rajesh Kumar', license_number: 'DL-14-2021-9988', license_type: 'COMMERCIAL', phone_number: '+91-98200-11223', status: 'ON_DUTY', max_driving_hours_per_day: 8, assigned_hub_id: 1, current_vehicle_id: null, rating: 4.8 },
  { id: 2, full_name: 'Vikramjit Singh', license_number: 'MH04-2015-88319', license_type: 'CLASS_A', phone_number: '+91-98700-44556', status: 'ON_TRIP', max_driving_hours_per_day: 10, assigned_hub_id: 1, current_vehicle_id: 2, rating: 4.6 },
  { id: 3, full_name: 'Amit Patil', license_number: 'MH01-2020-55441', license_type: 'CLASS_B', phone_number: '+91-99600-77889', status: 'RESTING', max_driving_hours_per_day: 8, assigned_hub_id: 2, current_vehicle_id: null, rating: 4.4 },
  { id: 4, full_name: 'Suresh Reddy', license_number: 'KA01-2019-33441', license_type: 'COMMERCIAL', phone_number: '+91-98450-99887', status: 'OFF_DUTY', max_driving_hours_per_day: 9, assigned_hub_id: 3, current_vehicle_id: null, rating: 4.7 },
  { id: 5, full_name: 'Priya Mehta', license_number: 'GJ01-2022-12345', license_type: 'CLASS_B', phone_number: '+91-97200-55678', status: 'ON_DUTY', max_driving_hours_per_day: 8, assigned_hub_id: 2, current_vehicle_id: 3, rating: 4.9 },
]
const INIT_SHIPMENTS: Shipment[] = [
  { id: 1, tracking_number: 'SHP-001-MUM', customer_name: 'Reliance Industries', destination_address: 'BKC, Mumbai', weight_kg: 450, volume_m3: 3.2, time_window_start: '09:00', time_window_end: '12:00', priority: 'HIGH', status: 'IN_TRANSIT', hub_id: 1 },
  { id: 2, tracking_number: 'SHP-002-MUM', customer_name: 'TCS Logistics', destination_address: 'Powai, Mumbai', weight_kg: 180, volume_m3: 1.5, time_window_start: '10:00', time_window_end: '14:00', priority: 'STANDARD', status: 'ASSIGNED', hub_id: 1 },
  { id: 3, tracking_number: 'SHP-003-NV', customer_name: 'Flipkart Supply Chain', destination_address: 'Belapur, Navi Mumbai', weight_kg: 920, volume_m3: 7.8, time_window_start: '08:00', time_window_end: '11:00', priority: 'EXPRESS', status: 'UNASSIGNED', hub_id: 2 },
  { id: 4, tracking_number: 'SHP-004-PNQ', customer_name: 'Amazon India', destination_address: 'Kothrud, Pune', weight_kg: 640, volume_m3: 5.1, time_window_start: '11:00', time_window_end: '15:00', priority: 'STANDARD', status: 'DELIVERED', hub_id: 3 },
  { id: 5, tracking_number: 'SHP-005-MUM', customer_name: 'HDFC Bank', destination_address: 'Nariman Point, Mumbai', weight_kg: 120, volume_m3: 0.8, time_window_start: '09:30', time_window_end: '11:00', priority: 'EXPRESS', status: 'IN_TRANSIT', hub_id: 1 },
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

// ─── API CLIENT HELPER (FastAPI at http://localhost:8000) ─────────────────────
const API_BASE = 'http://localhost:8000'
async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// ─── WORKFLOW GENERATOR ───────────────────────────────────────────────────────
const NODE_W = 152, NODE_H = 68

function buildWorkflow(shipment: Shipment, vehicles: Vehicle[], drivers: Driver[], hubs: Hub[]): { nodes: WFNode[]; edges: WFEdge[]; analysis: string; risks: string[] } {
  const hub = hubs.find(h => h.id === shipment.hub_id) ?? hubs[0]
  const availVehicles = vehicles.filter(v => v.current_status === 'AVAILABLE' && v.assigned_hub_id === hub.id)
  const bestVehicle = availVehicles.find(v => v.max_payload_kg >= shipment.weight_kg) ?? availVehicles[0] ?? null
  const availDrivers = drivers.filter(d => (d.status === 'ON_DUTY' || d.status === 'RESTING') && d.assigned_hub_id === hub.id && d.current_vehicle_id === null)
  const bestDriver = availDrivers[0] ?? null

  const payloadOk = bestVehicle ? bestVehicle.max_payload_kg >= shipment.weight_kg : false
  const licenseOk = bestDriver ? (shipment.weight_kg > 1000 ? bestDriver.license_type !== 'CLASS_B' : true) : false

  const risks: string[] = []
  if (!bestVehicle) risks.push('No available vehicle at this hub — consider reassigning to HUB-NV-02')
  else if (!payloadOk) risks.push(`Payload ${shipment.weight_kg}kg exceeds ${bestVehicle.name} capacity (${bestVehicle.max_payload_kg}kg) — upgrade vehicle`)
  if (!bestDriver) risks.push('No available driver at hub — call back resting driver or reassign')
  else if (!licenseOk) risks.push(`Shipment weight requires CLASS_A license — ${bestDriver.full_name} holds ${bestDriver.license_type}`)
  if (bestVehicle && bestVehicle.fuel_pct < 30) risks.push(`Vehicle fuel at ${bestVehicle.fuel_pct}% — refuel before dispatch`)
  if (shipment.priority === 'EXPRESS' && availDrivers.length < 2) risks.push('EXPRESS priority — recommend dedicated driver with no other stops')

  const analysis = risks.length === 0
    ? `✓ Optimal workflow found. ${bestVehicle?.name} (${bestVehicle?.plate_number}) + ${bestDriver?.full_name} is the best match for this ${shipment.weight_kg}kg ${shipment.priority} shipment. ETA within ${shipment.time_window_start}–${shipment.time_window_end} window is achievable with +18% VRPTW route efficiency. No compliance violations detected.`
    : `⚠ Workflow generated with ${risks.length} flag${risks.length > 1 ? 's' : ''}. Review and resolve before dispatching. Copilot recommends addressing risks below before approval.`

  const nodes: WFNode[] = [
    { id: 'shipment', type: 'shipment', label: shipment.tracking_number, sublabel: `${shipment.weight_kg}kg · ${shipment.priority}`, status: 'ok', data: shipment, x: 30, y: 130 },
    { id: 'hub', type: 'hub', label: hub.name.split(' ').slice(0, 2).join(' '), sublabel: hub.code, status: 'ok', data: hub, x: 240, y: 130 },
    { id: 'driver', type: 'driver', label: bestDriver ? bestDriver.full_name : 'No Driver', sublabel: bestDriver ? bestDriver.license_type : 'UNAVAILABLE', status: bestDriver ? (licenseOk ? 'ok' : 'warning') : 'error', data: bestDriver, x: 450, y: 55 },
    { id: 'vehicle', type: 'vehicle', label: bestVehicle ? bestVehicle.name : 'No Vehicle', sublabel: bestVehicle ? bestVehicle.plate_number : 'UNAVAILABLE', status: bestVehicle ? (payloadOk ? (bestVehicle.fuel_pct < 30 ? 'warning' : 'ok') : 'warning') : 'error', data: bestVehicle, x: 450, y: 205 },
    { id: 'stop', type: 'stop', label: 'Hub Pickup', sublabel: hub.address.split(',')[0], status: 'ok', data: hub, x: 660, y: 130 },
    { id: 'destination', type: 'destination', label: 'Delivery Point', sublabel: shipment.destination_address.split(',')[0], status: 'ok', data: shipment, x: 870, y: 130 },
    { id: 'return', type: 'return', label: 'Return to Hub', sublabel: hub.code, status: 'ok', data: hub, x: 1080, y: 130 },
  ]
  const edges: WFEdge[] = [
    { from: 'shipment', to: 'hub' },
    { from: 'hub', to: 'driver' },
    { from: 'hub', to: 'vehicle' },
    { from: 'driver', to: 'stop' },
    { from: 'vehicle', to: 'stop' },
    { from: 'stop', to: 'destination', label: 'VRPTW route' },
    { from: 'destination', to: 'return' },
  ]
  return { nodes, edges, analysis, risks }
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

// ─── WORKFLOW CANVAS (Interactive n8n-style Drag & Reposition) ────────────────
const NODE_ICONS: Record<string, string> = {
  shipment: '📦', hub: '🏭', driver: '👤', vehicle: '🚛', stop: '📍', destination: '🎯', return: '↩',
}
const NODE_STATUS_STYLE: Record<NodeStatus, { border: string; bg: string; glow: string }> = {
  ok: { border: '#22c55e', bg: '#f0fdf4', glow: '0 0 0 3px #22c55e22' },
  warning: { border: '#f59e0b', bg: '#fffbeb', glow: '0 0 0 3px #f59e0b22' },
  error: { border: '#ef4444', bg: '#fef2f2', glow: '0 0 0 3px #ef444422' },
  pending: { border: '#94a3b8', bg: '#f8fafc', glow: 'none' },
}

function WorkflowCanvas({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onNodeChange,
  onNodesMove,
  vehicles,
  drivers,
  hubs,
}: {
  nodes: WFNode[];
  edges: WFEdge[];
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  onNodeChange: (id: string, data: any) => void;
  onNodesMove: (updatedNodes: WFNode[]) => void;
  vehicles: Vehicle[];
  drivers: Driver[];
  hubs: Hub[];
}) {
  const CANVAS_W = 1270, CANVAS_H = 340
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLDivElement>(null)

  // Compute bezier path between nodes
  function edgePath(fromId: string, toId: string) {
    const fn = nodes.find(n => n.id === fromId)
    const tn = nodes.find(n => n.id === toId)
    if (!fn || !tn) return ''
    const x0 = fn.x + NODE_W, y0 = fn.y + NODE_H / 2
    const x1 = tn.x, y1 = tn.y + NODE_H / 2
    const cx = (x0 + x1) / 2
    return `M ${x0} ${y0} C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`
  }

  const handleMouseDown = (e: React.MouseEvent, node: WFNode) => {
    e.stopPropagation()
    onSelectNode(node.id)
    setDraggingId(node.id)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left - node.x,
        y: e.clientY - rect.top - node.y,
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const newX = Math.max(10, Math.min(CANVAS_W - NODE_W - 10, e.clientX - rect.left - dragOffset.x))
    const newY = Math.max(10, Math.min(CANVAS_H - NODE_H - 10, e.clientY - rect.top - dragOffset.y))

    onNodesMove(
      nodes.map((n) => (n.id === draggingId ? { ...n, x: newX, y: newY } : n))
    )
  }

  const handleMouseUp = () => {
    setDraggingId(null)
  }

  const selNode = nodes.find(n => n.id === selectedNode)

  return (
    <div className="flex gap-0 h-full overflow-hidden">
      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={() => onSelectNode(null)}
        className="flex-1 overflow-auto bg-[#fafafa] relative cursor-crosshair"
        style={{ backgroundImage: 'radial-gradient(circle, #e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      >
        <svg width={CANVAS_W} height={CANVAS_H} className="absolute top-0 left-0 pointer-events-none" style={{ zIndex: 0 }}>
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L7,3.5 z" fill="#94a3b8" />
            </marker>
          </defs>
          {edges.map(e => (
            <g key={e.from + e.to}>
              <path d={edgePath(e.from, e.to)} fill="none" stroke="#cbd5e1" strokeWidth="2" markerEnd="url(#arrow)" />
              {e.label && (() => {
                const fn = nodes.find(n => n.id === e.from)
                const tn = nodes.find(n => n.id === e.to)
                if (!fn || !tn) return null
                const mx = (fn.x + NODE_W + tn.x) / 2
                const my = (fn.y + NODE_H / 2 + tn.y + NODE_H / 2) / 2 - 8
                return <text x={mx} y={my} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="DM Sans">{e.label}</text>
              })()}
            </g>
          ))}
        </svg>
        <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H, zIndex: 1 }}>
          {nodes.map(n => {
            const style = NODE_STATUS_STYLE[n.status]
            const isSelected = selectedNode === n.id
            return (
              <div
                key={n.id}
                onMouseDown={(e) => handleMouseDown(e, n)}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectNode(isSelected ? null : n.id)
                }}
                className="absolute cursor-grab active:cursor-grabbing select-none transition-transform hover:scale-105"
                style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
              >
                <div
                  className="h-full rounded-xl border-2 flex flex-col justify-center px-3 gap-0.5 transition-all"
                  style={{
                    borderColor: isSelected ? '#2563eb' : style.border,
                    background: isSelected ? '#eff6ff' : style.bg,
                    boxShadow: isSelected ? '0 0 0 3px #2563eb33' : style.glow,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{NODE_ICONS[n.type]}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{n.type}</span>
                    {n.status === 'error' && <span className="ml-auto text-red-500 text-xs font-bold">⚠</span>}
                    {n.status === 'warning' && <span className="ml-auto text-amber-500 text-xs font-bold">!</span>}
                    {n.status === 'ok' && <span className="ml-auto text-emerald-500 text-xs font-bold">✓</span>}
                  </div>
                  <p className="text-xs font-bold text-slate-800 truncate">{n.label}</p>
                  <p className="text-[10px] text-slate-500 truncate font-mono">{n.sublabel}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Node detail panel */}
      <div className="w-64 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-y-auto">
        {!selNode ? (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div>
              <p className="text-2xl mb-2">👆</p>
              <p className="text-xs font-semibold text-slate-500">Drag or click any node to inspect / reassign</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{selNode.type} Detail</p>
              <p className="font-bold text-slate-800">{selNode.label}</p>
              <p className="text-xs text-slate-500 font-mono">{selNode.sublabel}</p>
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${selNode.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : selNode.status === 'warning' ? 'bg-amber-50 text-amber-700' : selNode.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
                  {selNode.status === 'ok' ? '✓ Clear' : selNode.status === 'warning' ? '! Warning' : selNode.status === 'error' ? '⚠ Error' : '… Pending'}
                </span>
              </div>
            </div>

            {/* Reassign controls */}
            {selNode.type === 'driver' && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Reassign Driver</p>
                {drivers.filter(d => d.status === 'ON_DUTY' || d.status === 'RESTING').map(d => (
                  <button key={d.id} onClick={() => onNodeChange(selNode.id, d)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${selNode.data?.id === d.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-semibold text-slate-800">{d.full_name}</p>
                    <p className="text-slate-400 font-mono">{d.license_type} · ★ {d.rating}</p>
                  </button>
                ))}
              </div>
            )}
            {selNode.type === 'vehicle' && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Reassign Vehicle</p>
                {vehicles.filter(v => v.current_status === 'AVAILABLE').map(v => (
                  <button key={v.id} onClick={() => onNodeChange(selNode.id, v)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${selNode.data?.id === v.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-semibold text-slate-800">{v.name}</p>
                    <p className="text-slate-400 font-mono">{v.plate_number} · {v.max_payload_kg}kg</p>
                    <div className="mt-1"><Bar pct={v.fuel_pct} /></div>
                  </button>
                ))}
              </div>
            )}
            {selNode.type === 'hub' && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Switch Hub</p>
                {hubs.map(h => (
                  <button key={h.id} onClick={() => onNodeChange(selNode.id, h)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors ${selNode.data?.id === h.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <p className="font-semibold text-slate-800">{h.name}</p>
                    <p className="text-slate-400 font-mono">{h.code} · {h.operating_hours}</p>
                  </button>
                ))}
              </div>
            )}
            {(selNode.type === 'shipment' || selNode.type === 'destination' || selNode.type === 'stop' || selNode.type === 'return') && selNode.data && (
              <div className="space-y-2 text-xs">
                {Object.entries(selNode.data).filter(([k]) => !['id', 'hub_id', 'current_vehicle_id', 'user_id', 'created_at', 'updated_at'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-400 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-slate-700 font-mono text-right truncate max-w-[120px]">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ROUTE MAP VIEW ───────────────────────────────────────────────────────────
function RouteMapView({ shipment, nodes, onComplete }: { shipment: Shipment; nodes: WFNode[]; onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'hub' | 'transit' | 'delivery' | 'return'>('hub')
  const [elapsed, setElapsed] = useState(0)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    const start = Date.now()
    const duration = 18000 // 18s animation
    function tick() {
      const pct = Math.min((Date.now() - start) / duration * 100, 100)
      setProgress(pct)
      setElapsed(Math.floor((Date.now() - start) / 1000))
      if (pct < 15) setPhase('hub')
      else if (pct < 75) setPhase('transit')
      else if (pct < 92) setPhase('delivery')
      else setPhase('return')
      if (pct < 100) animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  const hub = nodes.find(n => n.type === 'hub')?.data
  const driver = nodes.find(n => n.type === 'driver')?.data
  const vehicle = nodes.find(n => n.type === 'vehicle')?.data

  // Route points: Hub → Stop → Destination (SVG viewBox 0 0 560 360)
  const routePoints = { hub: { x: 180, y: 120 }, stop: { x: 300, y: 200 }, dest: { x: 420, y: 140 }, ret: { x: 180, y: 120 } }

  // Compute position along route
  function getMarkerPos() {
    const p = progress / 100
    if (p < 0.3) {
      const t = p / 0.3
      return { x: routePoints.hub.x + (routePoints.stop.x - routePoints.hub.x) * t, y: routePoints.hub.y + (routePoints.stop.y - routePoints.hub.y) * t }
    } else if (p < 0.7) {
      const t = (p - 0.3) / 0.4
      return { x: routePoints.stop.x + (routePoints.dest.x - routePoints.stop.x) * t, y: routePoints.stop.y + (routePoints.dest.y - routePoints.stop.y) * t }
    } else {
      const t = (p - 0.7) / 0.3
      return { x: routePoints.dest.x + (routePoints.ret.x - routePoints.dest.x) * t, y: routePoints.dest.y + (routePoints.ret.y - routePoints.dest.y) * t }
    }
  }

  const markerPos = getMarkerPos()
  const totalDist = 48.4
  const distTravelled = (totalDist * progress / 100).toFixed(1)
  const etaMins = Math.max(0, Math.floor((100 - progress) / 100 * 42))

  const phaseLabels: Record<string, string> = { hub: 'Loading at Hub', transit: 'En Route', delivery: 'At Delivery Point', return: 'Returning to Hub' }
  const phaseColors: Record<string, string> = { hub: '#d97706', transit: '#2563eb', delivery: '#16a34a', return: '#7c3aed' }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Status bar */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: phaseColors[phase] }} />
          <span className="text-sm font-bold text-slate-800">{phaseLabels[phase]}</span>
        </div>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: phaseColors[phase] }} />
        </div>
        <span className="font-mono text-sm font-bold text-slate-700">{progress.toFixed(0)}%</span>
        <div className="flex gap-4 text-xs font-mono text-slate-500">
          <span>{distTravelled} / {totalDist} km</span>
          <span>ETA {etaMins}m</span>
          <span>{elapsed}s elapsed</span>
        </div>
        {progress >= 100 && (
          <button onClick={onComplete} className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors">Complete ✓</button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 bg-slate-50 relative overflow-hidden">
          <svg viewBox="0 0 560 360" className="w-full h-full">
            <rect width="560" height="360" fill="#f1f5f9" />
            {/* Grid */}
            {Array.from({ length: 12 }).map((_, i) => (
              <g key={i}>
                <line x1={i * 50} y1="0" x2={i * 50} y2="360" stroke="#e2e8f0" strokeWidth="0.5" />
                <line x1="0" y1={i * 32} x2="560" y2={i * 32} stroke="#e2e8f0" strokeWidth="0.5" />
              </g>
            ))}
            {/* Roads */}
            <path d="M 100 280 Q 180 120 300 200 Q 380 250 420 140 Q 440 80 480 100" stroke="#e2e8f0" strokeWidth="8" fill="none" strokeLinecap="round" />
            <path d="M 100 280 Q 180 120 300 200 Q 380 250 420 140 Q 440 80 480 100" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round" />

            {/* Completed route */}
            {progress > 0 && (
              <path d={`M ${routePoints.hub.x} ${routePoints.hub.y} L ${routePoints.stop.x} ${routePoints.stop.y} L ${routePoints.dest.x} ${routePoints.dest.y}`}
                stroke="#3b82f6" strokeWidth="3" fill="none" strokeLinecap="round"
                strokeDasharray="1000" strokeDashoffset={1000 - progress * 7} />
            )}
            {/* Remaining route */}
            <path d={`M ${routePoints.hub.x} ${routePoints.hub.y} L ${routePoints.stop.x} ${routePoints.stop.y} L ${routePoints.dest.x} ${routePoints.dest.y} L ${routePoints.ret.x} ${routePoints.ret.y}`}
              stroke="#cbd5e1" strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="6 4" />

            {/* Hub marker */}
            <rect x={routePoints.hub.x - 14} y={routePoints.hub.y - 14} width="28" height="28" rx="6" fill="#d97706" />
            <text x={routePoints.hub.x} y={routePoints.hub.y + 5} textAnchor="middle" fontSize="14">🏭</text>
            <text x={routePoints.hub.x} y={routePoints.hub.y + 28} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="DM Sans">Hub</text>

            {/* Stop */}
            <circle cx={routePoints.stop.x} cy={routePoints.stop.y} r="10" fill="#7c3aed" />
            <text x={routePoints.stop.x} y={routePoints.stop.y + 4} textAnchor="middle" fontSize="10">📍</text>
            <text x={routePoints.stop.x} y={routePoints.stop.y + 22} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="DM Sans">Pickup</text>

            {/* Destination */}
            <circle cx={routePoints.dest.x} cy={routePoints.dest.y} r="12" fill={progress >= 75 ? '#16a34a' : '#94a3b8'} />
            <text x={routePoints.dest.x} y={routePoints.dest.y + 5} textAnchor="middle" fontSize="12">🎯</text>
            <text x={routePoints.dest.x} y={routePoints.dest.y + 26} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="DM Sans">{shipment.destination_address.split(',')[0]}</text>

            {/* Moving vehicle marker */}
            <circle cx={markerPos.x} cy={markerPos.y} r="16" fill="#2563eb" opacity="0.15" />
            <circle cx={markerPos.x} cy={markerPos.y} r="9" fill="#2563eb" />
            <text x={markerPos.x} y={markerPos.y + 4} textAnchor="middle" fontSize="10">🚛</text>

            {/* Info label near vehicle */}
            {vehicle && (
              <g>
                <rect x={markerPos.x - 40} y={markerPos.y - 32} width="80" height="18" rx="4" fill="white" stroke="#e2e8f0" strokeWidth="1" />
                <text x={markerPos.x} y={markerPos.y - 20} textAnchor="middle" fontSize="8.5" fill="#374151" fontFamily="DM Sans" fontWeight="600">{vehicle.plate_number}</text>
              </g>
            )}
          </svg>
        </div>

        {/* Side info panel */}
        <div className="w-56 border-l border-slate-200 bg-white flex flex-col p-4 gap-4 overflow-y-auto">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Shipment</p>
            <p className="font-mono text-sm font-bold text-blue-700">{shipment.tracking_number}</p>
            <p className="text-xs text-slate-600">{shipment.customer_name}</p>
            <p className="text-xs text-slate-400">{shipment.destination_address}</p>
            <div className="mt-1"><Badge s={shipment.priority} /></div>
          </div>
          {driver && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Driver</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{driver.full_name.split(' ').map((n: string) => n[0]).join('')}</div>
                <div><p className="text-xs font-semibold text-slate-800">{driver.full_name}</p><p className="text-[10px] text-slate-400">★ {driver.rating}</p></div>
              </div>
            </div>
          )}
          {vehicle && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Vehicle</p>
              <p className="text-xs font-semibold text-slate-800">{vehicle.name}</p>
              <p className="font-mono text-[10px] text-slate-400">{vehicle.plate_number}</p>
              <div className="mt-1.5"><Bar pct={vehicle.fuel_pct} /></div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Route Progress</p>
            {[
              { label: 'Hub Dispatch', done: progress > 5 },
              { label: 'Pickup Stop', done: progress > 30 },
              { label: 'En Route', done: progress > 45 },
              { label: 'Delivery', done: progress > 80 },
              { label: 'Return', done: progress >= 100 },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${s.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{s.done ? '✓' : i + 1}</span>
                <span className={`text-xs ${s.done ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WORKFLOW SECTION ─────────────────────────────────────────────────────────
function WorkflowSection({ shipment, vehicles, drivers, hubs, addAudit, onDone }: {
  shipment: Shipment; vehicles: Vehicle[]; drivers: Driver[]; hubs: Hub[]
  addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void; onDone: () => void
}) {
  const [phase, setPhase] = useState<WorkflowPhase>('analyzing')
  const [nodes, setNodes] = useState<WFNode[]>([])
  const [edges, setEdges] = useState<WFEdge[]>([])
  const [analysis, setAnalysis] = useState('')
  const [risks, setRisks] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [retriggerLoading, setRetriggerLoading] = useState(false)

  function runAnalysis(ns: WFNode[] = [], es: WFEdge[] = []) {
    const result = buildWorkflow(shipment, vehicles, drivers, hubs)
    if (ns.length > 0) {
      // Merge overridden nodes and preserve user dragged positions
      result.nodes = result.nodes.map(n => {
        const override = ns.find(x => x.id === n.id)
        return override ? { ...n, ...override, x: override.x, y: override.y } : n
      })
    }
    setNodes(result.nodes)
    setEdges(result.edges)
    setAnalysis(result.analysis)
    setRisks(result.risks)
    setPhase('canvas')
  }

  useEffect(() => {
    const t = setTimeout(() => runAnalysis(), 2200)
    return () => clearTimeout(t)
  }, [])

  function handleRetrigger() {
    setRetriggerLoading(true)
    setPhase('analyzing')
    setTimeout(() => { runAnalysis(nodes, edges); setRetriggerLoading(false) }, 1800)
  }

  function handleNodeChange(id: string, data: any) {
    setNodes(prev => prev.map(n => {
      if (n.id !== id) return n
      const newLabel = data.full_name ?? data.name ?? n.label
      const newSub = data.plate_number ?? data.license_type ?? data.code ?? n.sublabel
      return { ...n, label: newLabel, sublabel: newSub, data, status: 'ok' }
    }))
  }

  function handleNodesMove(updatedNodes: WFNode[]) {
    setNodes(updatedNodes)
  }

  function handleApprove() {
    addAudit({ actor_name: 'Abhayraj Jaiswal', action_type: 'DISPATCH_APPROVED', entity_type: 'SHIPMENT', entity_id: shipment.id, details: `Workflow approved for ${shipment.tracking_number} — dispatched` })
    setPhase('route')
  }

  if (phase === 'route') {
    return <RouteMapView shipment={shipment} nodes={nodes} onComplete={onDone} />
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">AI</div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-800">Copilot Workflow — <span className="font-mono text-blue-700">{shipment.tracking_number}</span></p>
          <p className="text-[10px] text-slate-400">AI-generated dispatch plan · {shipment.customer_name} · {shipment.weight_kg}kg · {shipment.priority}</p>
        </div>
        <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-600">← Back to Shipments</button>
      </div>

      {phase === 'analyzing' ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-violet-100" />
              <div className="absolute inset-0 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">🤖</div>
            </div>
            <div>
              <p className="font-bold text-slate-800">Copilot Analyzing…</p>
              <p className="text-xs text-slate-400 mt-1">Running VRPTW solver · Checking driver compliance · Matching vehicle capacity · Validating time windows</p>
            </div>
            <div className="flex gap-2 justify-center">
              {['RouterAgent', 'OptimizationAgent', 'PolicyAgent'].map((a, i) => (
                <span key={a} className="text-[10px] font-mono px-2 py-1 bg-violet-50 border border-violet-200 text-violet-700 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.3}s` }}>{a}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* AI analysis banner */}
          <div className={`flex-shrink-0 flex items-start gap-3 px-5 py-3 border-b border-slate-200 ${risks.length === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <span className="text-lg">{risks.length === 0 ? '✅' : '⚠️'}</span>
            <div className="flex-1">
              <p className="text-xs text-slate-700 leading-relaxed">{analysis}</p>
              {risks.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {risks.map((r, i) => <li key={i} className="text-[11px] text-amber-800 flex gap-1.5"><span>•</span>{r}</li>)}
                </ul>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={handleRetrigger} disabled={retriggerLoading} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
                {retriggerLoading ? <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" /> : '↺'} Re-analyze
              </button>
              <button onClick={handleApprove} disabled={risks.some(r => r.includes('No '))} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed">
                ✓ Approve & Dispatch
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-hidden">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              onNodeChange={handleNodeChange}
              onNodesMove={handleNodesMove}
              vehicles={vehicles}
              drivers={drivers}
              hubs={hubs}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── COPILOT DASHBOARD (Main Page) ────────────────────────────────────────────
function CopilotDashboard({ vehicles, drivers, shipments, hubs, audit, setSection }: {
  vehicles: Vehicle[]; drivers: Driver[]; shipments: Shipment[]; hubs: Hub[]; audit: AuditEntry[]
  setSection: (s: AdminSection) => void
}) {
  const [messages, setMessages] = useState<CopilotMsg[]>([
    { id: '0', sender: 'assistant', content: 'Good morning, Commander. I\'m your Fleet AI Copilot. Here\'s what needs your attention right now:\n\n• **3 shipments** are active — 1 EXPRESS at risk of SLA breach\n• **Vehicle MH-12-QQ-4001** is in maintenance, 2 routes affected\n• **SHP-003-NV** (920kg, Flipkart) is UNASSIGNED — add it to Shipments and I\'ll generate the workflow\n\nAsk me anything or use the quick actions below.', timestamp: '12:00' },
  ])
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

  const statBar = [
    { label: 'Vehicles Active', value: vehicles.filter(v => v.current_status !== 'AVAILABLE' && v.current_status !== 'DECOMMISSIONED').length, color: '#2563eb' },
    { label: 'In Transit', value: shipments.filter(s => s.status === 'IN_TRANSIT').length, color: '#7c3aed' },
    { label: 'Unassigned', value: shipments.filter(s => s.status === 'UNASSIGNED').length, color: '#dc2626' },
    { label: 'Drivers On Duty', value: drivers.filter(d => d.status === 'ON_DUTY' || d.status === 'ON_TRIP').length, color: '#15803d' },
    { label: 'OTIF Rate', value: '99.2%', color: '#15803d' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stat bar */}
      <div className="flex-shrink-0 flex items-center gap-0 border-b border-slate-200 bg-white">
        {statBar.map((s, i) => (
          <div key={s.label} className={`flex-1 flex flex-col items-center justify-center py-2.5 ${i < statBar.length - 1 ? 'border-r border-slate-200' : ''}`}>
            <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-slate-400">{s.label}</p>
          </div>
        ))}
        <button onClick={() => setSection('shipments')} className="flex-shrink-0 flex items-center gap-2 mx-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors">
          + New Shipment
        </button>
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
function ShipmentsSection({ shipments, setShipments, hubs, addAudit, onTriggerWorkflow }: {
  shipments: Shipment[]; setShipments: (s: Shipment[]) => void
  hubs: Hub[]; addAudit: (a: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  onTriggerWorkflow: (s: Shipment) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<Shipment | null>(null)
  const blank: Omit<Shipment, 'id'> = { tracking_number: '', customer_name: '', destination_address: '', weight_kg: 100, volume_m3: 1, time_window_start: '09:00', time_window_end: '12:00', priority: 'STANDARD', status: 'UNASSIGNED', hub_id: 1 }
  const [form, setForm] = useState(blank)
  const [justAdded, setJustAdded] = useState<number | null>(null)

  const filt = shipments.filter(s => {
    const q = search.toLowerCase()
    return (statusFilter === 'ALL' || s.status === statusFilter) && (s.tracking_number.toLowerCase().includes(q) || s.customer_name.toLowerCase().includes(q))
  })

  function save() {
    if (modal === 'add') {
      const ns: Shipment = { ...form, id: Date.now() }
      setShipments([...shipments, ns])
      addAudit({ actor_name: 'Admin', action_type: 'ASSET_CREATED', entity_type: 'SHIPMENT', entity_id: ns.id, details: `New shipment: ${ns.tracking_number} — AI workflow auto-triggered` })
      setJustAdded(ns.id)
      setModal(null); setForm(blank)
      setTimeout(() => onTriggerWorkflow(ns), 400)
    } else if (modal === 'edit' && editTarget) {
      setShipments(shipments.map(s => s.id === editTarget.id ? { ...s, ...form } : s))
      setModal(null); setForm(blank)
    }
  }

  function advanceFSM(s: Shipment) {
    const next: Record<ShipmentStatus, ShipmentStatus> = { UNASSIGNED: 'CLUSTERED', CLUSTERED: 'ASSIGNED', ASSIGNED: 'IN_TRANSIT', IN_TRANSIT: 'DELIVERED', DELIVERED: 'DELIVERED', FAILED: 'FAILED' }
    setShipments(shipments.map(x => x.id === s.id ? { ...x, status: next[x.status] } : x))
    addAudit({ actor_name: 'Admin', action_type: 'STATUS_CHANGE', entity_type: 'SHIPMENT', entity_id: s.id, details: `${s.tracking_number}: ${s.status} → ${next[s.status]}` })
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 mt-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="text-xs outline-none w-36 text-slate-600 placeholder-slate-400" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none bg-white">
            <option value="ALL">All Status</option>
            {['UNASSIGNED', 'CLUSTERED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={() => { setForm(blank); setModal('add') }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm shadow-blue-200">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Shipment → AI Workflow
        </button>
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

      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? '+ New Shipment — Copilot will auto-analyze' : 'Edit Shipment'} onClose={() => setModal(null)}>
          <div className="space-y-3">
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

// ─── COMPLIANCE ───────────────────────────────────────────────────────────────
function ComplianceSection() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ answer: string; confidence: number; citations: { doc: string; section: string; excerpt: string; score: number }[] } | null>(null)
  const sops = [
    { id: 'SOP-001', title: 'Hazardous Materials Transport Policy', category: 'Safety' },
    { id: 'SOP-002', title: 'Driver Hours of Service Regulations', category: 'Compliance' },
    { id: 'SOP-003', title: 'Vehicle Maintenance Schedule', category: 'Operations' },
    { id: 'SOP-004', title: 'Shipment Insurance & Liability', category: 'Legal' },
    { id: 'SOP-005', title: 'Route Deviation & Exception Handling', category: 'Operations' },
  ]
  const responses: Record<string, typeof result> = {
    hazmat: { answer: 'HAZMAT loads >1000kg require Class A CDL and vehicle certification. Driver must carry Form 7B and emergency response guide. Fire extinguisher and spill kit mandatory.', confidence: 0.94, citations: [{ doc: 'SOP-001', section: '§3.2', excerpt: 'All HAZMAT loads exceeding 1000kg require Class A CDL and vehicle certification under MV Act §44.', score: 0.94 }, { doc: 'SOP-001', section: '§5.1', excerpt: 'Driver must carry Form 7B and emergency response guide during HAZMAT transport.', score: 0.88 }] },
    hours: { answer: 'Maximum 10 driving hours/day, mandatory 30-min break after 5h. Weekly limit 60h. Violations trigger automatic suspension.', confidence: 0.97, citations: [{ doc: 'SOP-002', section: '§2.1', excerpt: 'No driver shall operate a vehicle for more than 10 hours per day.', score: 0.97 }] },
    default: { answer: 'Policy found. Review relevant SOP documents for complete guidelines. Consult Fleet Manager for specific case applications.', confidence: 0.78, citations: [{ doc: 'SOP-003', section: '§1.0', excerpt: 'All fleet operations must comply with applicable transport regulations.', score: 0.78 }] },
  }
  function search() {
    if (!query.trim()) return
    setLoading(true); setResult(null)
    setTimeout(() => {
      const key = query.toLowerCase().includes('hazmat') || query.toLowerCase().includes('dangerous') ? 'hazmat' : query.toLowerCase().includes('hours') || query.toLowerCase().includes('driving') ? 'hours' : 'default'
      setResult(responses[key]!)
      setLoading(false)
    }, 1200)
  }
  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div><p className="text-base font-bold text-slate-800">Compliance & SOP Knowledge Base</p><p className="text-xs text-slate-400 mt-0.5">RAG-powered regulatory search · zero-hallucination guardrails</p></div>
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Ask about HAZMAT, driver hours, vehicle standards…" className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-violet-400 transition" />
        <button onClick={search} disabled={!query.trim() || loading} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-100 text-white text-sm font-semibold rounded-xl transition-colors">Search SOPs</button>
      </div>
      <div className="grid grid-cols-2 gap-3">{['HAZMAT transport requirements', 'Driver hours of service limits'].map(q => <button key={q} onClick={() => setQuery(q)} className="text-left p-3 border border-slate-200 rounded-xl text-xs text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors">🔍 {q}</button>)}</div>
      {loading && <div className="flex items-center gap-3 text-sm text-slate-500"><span className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />Searching vector store…</div>}
      {result && (
        <div className="space-y-4">
          <div className="border border-violet-200 bg-violet-50 rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-violet-700">Answer</span><span className="text-[10px] font-mono px-2 py-0.5 bg-violet-100 text-violet-600 rounded-full">confidence {(result.confidence * 100).toFixed(0)}%</span><span className="text-[10px] text-emerald-600 font-semibold">✓ Grounded</span></div><p className="text-sm text-slate-800">{result.answer}</p></div>
          <div>{result.citations.map((c, i) => <div key={i} className="border border-slate-200 rounded-xl p-3 mb-2"><div className="flex items-center gap-2 mb-1"><span className="font-mono text-xs font-bold text-slate-700">{c.doc}</span><span className="text-xs text-slate-400">{c.section}</span><span className="ml-auto text-[10px] font-mono text-slate-400">sim {(c.score * 100).toFixed(0)}%</span></div><p className="text-xs text-slate-600 italic">"{c.excerpt}"</p></div>)}</div>
        </div>
      )}
      <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">SOP Library</p>{sops.map(s => <div key={s.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-xl mb-2 hover:border-slate-300 transition-colors"><div><p className="text-sm font-medium text-slate-800">{s.title}</p><p className="text-[10px] font-mono text-slate-400">{s.id} · {s.category}</p></div><button className="text-xs text-blue-600 font-medium">View →</button></div>)}</div>
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

// ─── TRACKING SECTION ─────────────────────────────────────────────────────────
function TrackingSection({
  vehicles,
  drivers,
  activeRole,
}: {
  vehicles: Vehicle[];
  drivers: Driver[];
  activeRole: UserRole;
}) {
  const [sel, setSel] = useState<number | null>(1)
  const [driverFsmState, setDriverFsmState] = useState<'EN_ROUTE' | 'ARRIVED' | 'DELIVERED' | 'DELAYED'>('EN_ROUTE')
  const active = vehicles.filter(v => v.current_status === 'IN_TRANSIT' || v.current_status === 'AVAILABLE')
  const positions: Record<number, { x: number; y: number }> = { 1: { x: 190, y: 115 }, 2: { x: 345, y: 295 }, 3: { x: 150, y: 315 }, 4: { x: 220, y: 220 } }
  const vcol: Record<VehicleStatus, string> = { AVAILABLE: '#22c55e', IN_TRANSIT: '#3b82f6', MAINTENANCE: '#f97316', DECOMMISSIONED: '#9ca3af' }
  const selV = vehicles.find(v => v.id === sel)
  const selD = drivers.find(d => d.current_vehicle_id === sel)

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 relative bg-slate-50 overflow-hidden">
        <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-600 font-medium">{active.length} vehicles tracked</span>
        </div>
        <svg viewBox="0 0 560 360" className="w-full h-full">
          <rect width="560" height="360" fill="#f8fafc" />
          {Array.from({ length: 10 }).map((_, i) => <g key={i}><line x1={i * 62} y1="0" x2={i * 62} y2="360" stroke="#e2e8f0" strokeWidth="0.5" /><line x1="0" y1={i * 40} x2="560" y2={i * 40} stroke="#e2e8f0" strokeWidth="0.5" /></g>)}
          <path d="M80 60 L460 60 L480 180 L440 310 L320 400 L200 395 L100 300 L75 180 Z" stroke="#cbd5e1" strokeWidth="1.5" fill="#f1f5f9" />
          {[{ x: 190, y: 115, n: 'Mumbai' }, { x: 150, y: 315, n: 'Navi Mumbai' }, { x: 345, y: 295, n: 'Pune' }, { x: 220, y: 220, n: 'Thane' }, { x: 400, y: 160, n: 'Nashik' }].map(c => <g key={c.n}><circle cx={c.x} cy={c.y} r="4" fill="#94a3b8" /><text x={c.x + 7} y={c.y + 4} fill="#64748b" fontSize="9" fontFamily="DM Sans">{c.n}</text></g>)}
          <path d="M190 115 L220 220 L345 295" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.4" />
          {active.map(v => {
            const pos = positions[v.id]
            if (!pos) return null
            const isS = sel === v.id
            const col = vcol[v.current_status]
            return (
              <g key={v.id} className="cursor-pointer" onClick={() => setSel(s => s === v.id ? null : v.id)}>
                {isS && <circle cx={pos.x} cy={pos.y} r="18" fill={col} opacity="0.12" />}
                <circle cx={pos.x} cy={pos.y} r={isS ? 9 : 7} fill={isS ? col : 'white'} stroke={col} strokeWidth="2.5" />
                {v.current_status === 'IN_TRANSIT' && <circle cx={pos.x} cy={pos.y} r="7" fill="none" stroke={col} strokeWidth="1" opacity="0.4"><animate attributeName="r" values="7;16;7" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" /></circle>}
                {isS && <text x={pos.x} y={pos.y - 18} textAnchor="middle" fill={col} fontSize="9" fontWeight="700" fontFamily="DM Sans" style={{ filter: 'drop-shadow(0 1px 0 white)' }}>{v.plate_number}</text>}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="w-64 border-l border-slate-200 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {activeRole === 'DRIVER' ? 'Driver Cockpit' : 'Live Telemetry'}
          </p>
          <span className="text-[10px] font-mono text-emerald-600 font-bold">● Active</span>
        </div>

        {activeRole === 'DRIVER' ? (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-1">
              <p className="text-[10px] font-bold text-blue-600 uppercase">Assigned Driver</p>
              <p className="font-bold text-slate-800 text-sm">Rajesh Kumar</p>
              <p className="text-xs text-slate-500">Vehicle: Alpha Prime Van (MH-02-EE-1001)</p>
              <div className="pt-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                  Shift: 7.5 hrs remaining (≤10h)
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase">1-Tap Delivery FSM Action</p>
              <button
                onClick={() => setDriverFsmState('ARRIVED')}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition ${
                  driverFsmState === 'ARRIVED' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                1. Mark Arrived at Destination
              </button>
              <button
                onClick={() => setDriverFsmState('DELIVERED')}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition ${
                  driverFsmState === 'DELIVERED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                2. Confirm e-POD Signature
              </button>
              <button
                onClick={() => setDriverFsmState('DELAYED')}
                className={`w-full py-2 px-3 rounded-lg text-xs font-bold border transition ${
                  driverFsmState === 'DELAYED' ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                3. Report Road Delay
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {active.map(v => (
              <button key={v.id} onClick={() => setSel(s => s === v.id ? null : v.id)} className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-50 ${sel === v.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}>
                <div className="flex items-center justify-between mb-1"><span className="font-mono text-xs font-bold text-slate-700">{v.plate_number}</span><Badge s={v.current_status} /></div>
                <p className="text-xs text-slate-500">{v.name}</p>
                <div className="mt-1.5"><Bar pct={v.fuel_pct} /></div>
              </button>
            ))}
          </div>
        )}

        {selV && activeRole !== 'DRIVER' && (
          <div className="border-t-2 border-blue-200 bg-blue-50 p-4 space-y-1.5">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Selected</p>
            <p className="font-mono text-sm font-bold text-slate-800">{selV.plate_number}</p>
            <p className="text-xs text-slate-600">{selV.name}</p>
            {selD && <p className="text-xs text-slate-500">Driver: <span className="font-medium text-slate-700">{selD.full_name}</span></p>}
            <p className="text-xs text-slate-500">Fuel: <span className="font-medium">{selV.fuel_pct}%</span> · {selV.fuel_efficiency_kpl} kpl</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
const ALL_NAV: { id: AdminSection; label: string; path: string; roles: UserRole[] }[] = [
  { id: 'dashboard', label: 'AI Command', path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER'] },
  { id: 'shipments', label: 'Shipments', path: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', roles: ['ADMIN', 'DISPATCHER'] },
  { id: 'workflow', label: 'Workflow', path: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', roles: ['ADMIN', 'DISPATCHER'] },
  { id: 'fleet', label: 'Fleet Assets', path: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8z', roles: ['ADMIN', 'FLEET_MANAGER'] },
  { id: 'tracking', label: 'Live Tracking', path: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER'] },
  { id: 'compliance', label: 'Compliance', path: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', roles: ['ADMIN', 'FLEET_MANAGER', 'DISPATCHER'] },
  { id: 'audit', label: 'Audit Log', path: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2', roles: ['ADMIN', 'FLEET_MANAGER'] },
  { id: 'users', label: 'Users', path: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', roles: ['ADMIN'] },
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
    <div className="h-screen flex flex-col bg-white overflow-hidden" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Top bar */}
      <header className="flex-shrink-0 h-12 border-b border-slate-200 flex items-center px-4 gap-3 bg-white z-20">
        <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center"><svg viewBox="0 0 16 16" fill="white" className="w-3.5 h-3.5"><path d="M2 5h9v6H2zm9 1h2l2 2v3h-4V6z" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="12.5" cy="12.5" r="1.5" /></svg></div>
          <span className="font-bold text-sm text-slate-800">FleetOps</span>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
            activeRole === 'ADMIN' ? 'bg-red-100 text-red-700' :
            activeRole === 'FLEET_MANAGER' ? 'bg-purple-100 text-purple-700' :
            activeRole === 'DISPATCHER' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {activeRole}
          </span>
        </div>
        <div className="flex-1 text-xs text-slate-400 font-mono hidden sm:flex items-center gap-2">
          <span>fleet-route-opt · VRPTW + LangGraph Copilot</span>
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-slate-200">
            <span className={`w-1.5 h-1.5 rounded-full ${isBackendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
            {isBackendOnline ? 'API :8000 Online' : 'Local Fast Mode'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {unassigned > 0 && (
            <button onClick={() => setSection('shipments')} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold rounded-lg animate-pulse">
              ⚠ {unassigned} unassigned shipment{unassigned > 1 ? 's' : ''}
            </button>
          )}

          {/* Persona Role Switcher Pill */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {(['ADMIN', 'FLEET_MANAGER', 'DISPATCHER', 'DRIVER'] as UserRole[]).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setActiveRole(r)
                  if (r === 'DRIVER') setSection('tracking')
                  else if (r === 'DISPATCHER' && section === 'users') setSection('shipments')
                }}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition ${
                  activeRole === r ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {r.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 rounded-lg px-2.5 py-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${currentUser.badgeColor}`}>
              {currentUser.initials}
            </div>
            <span className="text-xs font-semibold text-slate-700">{currentUser.name}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-48 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white z-10">
            <nav className="flex-1 py-2 overflow-y-auto">
              {filteredNav.map(item => (
                <button key={item.id} onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${section === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 flex-shrink-0"><path d={item.path} /></svg>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {item.id === 'shipments' && unassigned > 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{unassigned}</span>}
                  {item.id === 'workflow' && workflowShipment && <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
                  {section === item.id && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-slate-100 space-y-1">
              <div className="flex justify-between text-[11px]"><span className="text-slate-400">VRPTW</span><span className="text-blue-600 font-mono font-medium">Ready</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-slate-400">AI Copilot</span><span className="text-violet-600 font-mono font-medium">● Online</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-slate-400">RAG</span><span className="text-emerald-600 font-mono font-medium">Grounded</span></div>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-hidden bg-slate-50/30">
          {section === 'dashboard' && <CopilotDashboard vehicles={vehicles} drivers={drivers} shipments={shipments} hubs={hubs} audit={audit} setSection={setSection} />}
          {section === 'shipments' && <ShipmentsSection shipments={shipments} setShipments={setShipments} hubs={hubs} addAudit={addAudit} onTriggerWorkflow={triggerWorkflow} />}
          {section === 'workflow' && workflowShipment
            ? <WorkflowSection shipment={workflowShipment} vehicles={vehicles} drivers={drivers} hubs={hubs} addAudit={addAudit} onDone={() => setSection('shipments')} />
            : section === 'workflow' && (
              <div className="flex items-center justify-center h-full text-center p-10">
                <div><p className="text-4xl mb-4">🤖</p><p className="font-bold text-slate-700 text-lg">No active workflow</p><p className="text-sm text-slate-400 mt-1">Add a new shipment or click "AI Workflow" on any existing shipment to begin.</p><button onClick={() => setSection('shipments')} className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">Go to Shipments →</button></div>
              </div>
            )}
          {section === 'fleet' && <FleetSection vehicles={vehicles} setVehicles={setVehicles} drivers={drivers} setDrivers={setDrivers} hubs={hubs} setHubs={setHubs} addAudit={addAudit} />}
          {section === 'tracking' && <TrackingSection vehicles={vehicles} drivers={drivers} activeRole={activeRole} />}
          {section === 'compliance' && <ComplianceSection />}
          {section === 'audit' && <AuditSection entries={audit} />}
          {section === 'users' && <UsersSection users={users} setUsers={setUsers} />}
        </main>
      </div>
    </div>
  )
}
