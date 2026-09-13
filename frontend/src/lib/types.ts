// ============================================================================
// AI FLEET ROUTE OPTIMIZER: MASTER DATA CONTRACTS (TYPESCRIPT)
// Shared across Track A (Manthan Nimodiya) and Track B (Abhayraj Jaiswal)
// ============================================================================

// ----------------------------------------------------------------------------
// 1. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (US-001)
// ----------------------------------------------------------------------------
export type UserRole = 'ADMIN' | 'FLEET_MANAGER' | 'DISPATCHER' | 'DRIVER';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginPayload {
  email: string;
  password: string;
}

// ----------------------------------------------------------------------------
// 2. FLEET ASSET MANAGEMENT (US-002)
// ----------------------------------------------------------------------------
export type VehicleStatus = 'IDLE' | 'ASSIGNED' | 'IN_TRANSIT' | 'MAINTENANCE';

export interface Vehicle {
  id: number;
  plate_number: string;
  vehicle_type: 'LIGHT_VAN' | 'MEDIUM_TRUCK' | 'HEAVY_FREIGHT';
  max_payload_kg: number;
  max_volume_m3: number;
  fuel_efficiency_km_per_l: number;
  current_status: VehicleStatus;
  current_hub_id?: number;
}

export type DriverStatus = 'OFF_DUTY' | 'AVAILABLE' | 'DRIVING' | 'RESTING';

export interface Driver {
  id: number;
  full_name: string;
  license_number: string;
  shift_start: string; // e.g. "08:00"
  shift_end: string;   // e.g. "17:00"
  max_driving_hours_per_day: number;
  current_status: DriverStatus;
  current_vehicle_id?: number;
}

export interface Hub {
  id: number;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  address: string;
  capacity_vehicles: number;
}

// ----------------------------------------------------------------------------
// 3. SHIPMENTS & ORDER INGESTION (US-002)
// ----------------------------------------------------------------------------
export type ShipmentStatus = 'UNASSIGNED' | 'CLUSTERED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';

export interface Shipment {
  id: number;
  tracking_number: string;
  customer_name: string;
  destination_address: string;
  latitude: number;
  longitude: number;
  weight_kg: number;
  volume_m3: number;
  time_window_start: string; // ISO or "09:00"
  time_window_end: string;   // ISO or "12:00"
  priority: 'LOW' | 'STANDARD' | 'HIGH' | 'EXPRESS';
  status: ShipmentStatus;
  hub_id: number;
}

export interface ShipmentBatch {
  batch_id: string;
  total_orders: number;
  total_weight_kg: number;
  total_volume_m3: number;
  orders: Shipment[];
}

// ----------------------------------------------------------------------------
// 4. ROUTE OPTIMIZATION (DSA & VRPTW) (US-003 & US-004)
// ----------------------------------------------------------------------------
export type RouteState =
  | 'UNASSIGNED'
  | 'CLUSTERED'
  | 'OPTIMIZING'
  | 'ROUTE_PROPOSED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'OPTIMIZATION_FAILED'
  | 'ROUTE_BLOCKED'
  | 'SLA_BREACHED';

export type StopStatus = 'PENDING' | 'ARRIVED' | 'COMPLETED' | 'FAILED' | 'DELAYED';

export interface RouteStop {
  id: number;
  stop_number: number;
  shipment_id: number;
  location_name: string;
  latitude: number;
  longitude: number;
  planned_arrival: string;
  actual_arrival?: string;
  payload_drop_kg: number;
  time_window_start: string;
  time_window_end: string;
  status: StopStatus;
  time_window_violation: boolean;
}

export interface Route {
  id: number;
  route_code: string;
  vehicle_id: number;
  vehicle?: Vehicle;
  driver_id: number;
  driver?: Driver;
  hub_id: number;
  hub?: Hub;
  total_distance_km: number;
  estimated_duration_minutes: number;
  total_payload_kg: number;
  capacity_utilization_pct: number;
  status: RouteState;
  stops: RouteStop[];
  color_code?: string;
}

export interface OptimizationRequest {
  hub_id: number;
  shipment_ids: number[];
  vehicle_ids: number[];
  solver_timeout_seconds?: number;
}

export interface OptimizationResult {
  execution_time_seconds: number;
  total_routes: number;
  total_distance_km: number;
  unassigned_shipment_ids: number[];
  routes: Route[];
}

// ----------------------------------------------------------------------------
// 5. IN-TRANSIT TELEMETRY & DRIVER ACTIONS (US-008)
// ----------------------------------------------------------------------------
export interface DriverStatusUpdatePayload {
  stop_id: number;
  action: 'ARRIVED' | 'COMPLETED' | 'FAILED' | 'DELAYED';
  reason?: string;
  latitude?: number;
  longitude?: number;
}

export interface TelemetryUpdate {
  vehicle_id: number;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  battery_or_fuel_pct: number;
  last_updated: string;
}

// ----------------------------------------------------------------------------
// 6. MULTI-AGENT AI COPILOT (LANGGRAPH) (US-005)
// ----------------------------------------------------------------------------
export interface AgentTrace {
  agent_name: 'RouterAgent' | 'OptimizationAgent' | 'PolicyComplianceAgent';
  intent?: string;
  reasoning: string;
  execution_time_ms: number;
}

export interface ActionProposal {
  proposal_id: string;
  title: string;
  description: string;
  affected_vehicle_ids: number[];
  affected_stop_ids: number[];
  eta_delta_minutes: number;
  violations_prevented: string[];
  requires_confirmation: boolean;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  traces?: AgentTrace[];
  proposal?: ActionProposal;
  citations?: PolicyCitation[];
}

// ----------------------------------------------------------------------------
// 7. RAG KNOWLEDGE & COMPLIANCE (US-006)
// ----------------------------------------------------------------------------
export interface PolicyCitation {
  document_id: string;
  document_title: string;
  section: string;
  excerpt: string;
  similarity_score: number;
}

export interface ComplianceQueryResult {
  query: string;
  answer: string;
  is_grounded: boolean;
  confidence_score: number;
  citations: PolicyCitation[];
}

// ----------------------------------------------------------------------------
// 8. OPERATIONAL ANALYTICS & KPIS (US-007)
// ----------------------------------------------------------------------------
export interface OperationalKpiOverview {
  otif_delivery_rate_pct: number;
  average_transit_duration_minutes: number;
  total_fuel_burn_liters: number;
  cost_per_ton_km: number;
  fleet_utilization_pct: number;
  sla_breach_count: number;
  total_completed_deliveries: number;
}

export interface MetricTrendPoint {
  date: string;
  otif_rate: number;
  fuel_burn: number;
  cost_index: number;
}

// ----------------------------------------------------------------------------
// 9. IMMUTABLE AUDIT TRAIL (US-008)
// ----------------------------------------------------------------------------
export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actor_id: number;
  actor_name: string;
  action_type: 'ROUTE_MODIFIED' | 'STATUS_CHANGE' | 'COPILOT_OVERRIDE' | 'DISPATCH_APPROVED';
  entity_type: 'ROUTE' | 'STOP' | 'SHIPMENT' | 'VEHICLE';
  entity_id: number;
  deviation_reason?: string;
  details: Record<string, any>;
}
