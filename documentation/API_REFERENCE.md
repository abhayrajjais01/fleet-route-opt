# API Reference

Generated from the FastAPI OpenAPI schema by `python -m scripts.export_api_reference` (Week 16, Track B).
The interactive version is at **`/docs`** (Swagger UI) and **`/redoc`** on any running backend.

## Conventions

- **Base URL**: `/api/v1`. Behind the Docker stack's Nginx the same paths are served from the frontend origin
  (`http://localhost:8080/api/v1`).
- **Authentication**: `POST /api/v1/auth/login` with `{"email", "password"}` returns `access_token`; send it as
  `Authorization: Bearer <token>`. Tokens last 24 hours (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Roles**: `ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`. The *Roles* line of each endpoint lists who may call it;
  "signed in" means any role, "public" means no token is needed. Other callers get `401` (no / bad token) or `403`.
- **Errors**: JSON `{"detail": "..."}`. Validation errors (`422`) carry a list of `{loc, msg}` objects.
- **Rate limits** (per client, per minute): login / register 10, AI agents (copilot, disruption, RAG search) 60,
  CSV / PDF exports 20, everything else 600. Over the limit: `429` with `Retry-After`. Every response carries
  `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
- **Request size**: bodies over 10 MB get `413`.
- **Text input** is cleaned at the boundary (Unicode normalised, control / invisible characters and HTML tags
  removed); see `app/core/sanitize.py`.

## Endpoints

- [Root](#root)
- [Health & System](#health--system)
- [Fleet Asset Management](#fleet-asset-management)
- [RAG Compliance Engine](#rag-compliance-engine)
- [Route Optimization (VRPTW)](#route-optimization-vrptw)
- [Operational Reports & Exports](#operational-reports--exports)
- [Authentication & RBAC](#authentication--rbac)
- [Shipment Orders & Ingestion](#shipment-orders--ingestion)
- [Immutable Audit Trail](#immutable-audit-trail)
- [LangGraph AI Copilot](#langgraph-ai-copilot)
- [In-Transit FSM & Telemetry Tracking](#in-transit-fsm--telemetry-tracking)
- [Executive KPI Analytics](#executive-kpi-analytics)
- [User Management](#user-management)

## Root

### `GET /`

Root

- **Roles**: public
- **Responses**: 200

## Health & System

Liveness and readiness probes used by Docker, Render and the frontend status pill.

### `GET /api/v1/health`

System Health & Database Connectivity Check

- **Roles**: public
- **Responses**: 200

### `GET /api/v1/ready`

Readiness Probe

- **Roles**: public
- **Responses**: 200

## Fleet Asset Management

Hubs, vehicles and drivers: the constraints every route is planned against.

### `GET /api/v1/fleet/overview`

Get high-level fleet metrics

- **Roles**: signed in
- **Responses**: 200

### `GET /api/v1/fleet/hubs`

List all hubs

- **Roles**: signed in
- **Parameters**: `skip` (query, integer, optional); `limit` (query, integer, optional)
- **Responses**: 200, 422

### `POST /api/v1/fleet/hubs`

Create a new hub

- **Roles**: ADMIN, FLEET_MANAGER
- **Body**: application/json `HubCreate`: `name`*, `code`*, `address`*, `latitude`*, `longitude`*, `contact_phone`*, `operating_hours` (`*` = required)
- **Responses**: 201, 422

### `GET /api/v1/fleet/hubs/{hub_id}`

Get hub by ID

- **Roles**: signed in
- **Parameters**: `hub_id` (path, integer, required)
- **Responses**: 200, 422

### `PUT /api/v1/fleet/hubs/{hub_id}`

Update hub

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `hub_id` (path, integer, required)
- **Body**: application/json `HubUpdate`: `name`, `address`, `latitude`, `longitude`, `contact_phone`, `operating_hours` (`*` = required)
- **Responses**: 200, 422

### `DELETE /api/v1/fleet/hubs/{hub_id}`

Delete hub

- **Roles**: ADMIN
- **Parameters**: `hub_id` (path, integer, required)
- **Responses**: 204, 422

### `GET /api/v1/fleet/vehicles`

List vehicles with filters

- **Roles**: signed in
- **Parameters**: `status` (query, value, optional); `type` (query, value, optional); `hub_id` (query, integer, optional); `skip` (query, integer, optional); `limit` (query, integer, optional)
- **Responses**: 200, 422

### `POST /api/v1/fleet/vehicles`

Create vehicle

- **Roles**: ADMIN, FLEET_MANAGER
- **Body**: application/json `VehicleCreate`: `name`*, `plate_number`*, `vehicle_type`, `max_payload_kg`*, `max_volume_m3`*, `fuel_efficiency_kpl`, `current_status`, `assigned_hub_id`*, `current_latitude`, `current_longitude` (`*` = required)
- **Responses**: 201, 422

### `GET /api/v1/fleet/vehicles/{vehicle_id}`

Get vehicle by ID

- **Roles**: signed in
- **Parameters**: `vehicle_id` (path, integer, required)
- **Responses**: 200, 422

### `PUT /api/v1/fleet/vehicles/{vehicle_id}`

Update vehicle

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `vehicle_id` (path, integer, required)
- **Body**: application/json `VehicleUpdate`: `name`, `plate_number`, `vehicle_type`, `max_payload_kg`, `max_volume_m3`, `fuel_efficiency_kpl`, `current_status`, `assigned_hub_id`, `current_latitude`, `current_longitude` (`*` = required)
- **Responses**: 200, 422

### `DELETE /api/v1/fleet/vehicles/{vehicle_id}`

Delete vehicle

- **Roles**: ADMIN
- **Parameters**: `vehicle_id` (path, integer, required)
- **Responses**: 204, 422

### `GET /api/v1/fleet/drivers`

List drivers with filters

- **Roles**: signed in
- **Parameters**: `status` (query, value, optional); `hub_id` (query, integer, optional); `skip` (query, integer, optional); `limit` (query, integer, optional)
- **Responses**: 200, 422

### `POST /api/v1/fleet/drivers`

Create driver

- **Roles**: ADMIN, FLEET_MANAGER
- **Body**: application/json `DriverCreate`: `full_name`*, `license_number`*, `license_type`, `phone_number`*, `status`, `max_driving_hours_per_day`, `hazmat_endorsed`, `assigned_hub_id`*, `user_id`, `current_vehicle_id` (`*` = required)
- **Responses**: 201, 422

### `GET /api/v1/fleet/drivers/{driver_id}`

Get driver by ID

- **Roles**: signed in
- **Parameters**: `driver_id` (path, integer, required)
- **Responses**: 200, 422

### `PUT /api/v1/fleet/drivers/{driver_id}`

Update driver

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `driver_id` (path, integer, required)
- **Body**: application/json `DriverUpdate`: `full_name`, `license_type`, `phone_number`, `status`, `max_driving_hours_per_day`, `hazmat_endorsed`, `assigned_hub_id`, `current_vehicle_id` (`*` = required)
- **Responses**: 200, 422

### `DELETE /api/v1/fleet/drivers/{driver_id}`

Delete driver

- **Roles**: ADMIN
- **Parameters**: `driver_id` (path, integer, required)
- **Responses**: 204, 422

## RAG Compliance Engine

Search the verified SOP knowledge base. Every result is a cited, verbatim passage.

### `POST /api/v1/rag/search`

Semantic search over SOPs & regulations

- **Roles**: public
- **Body**: application/json `PolicySearchRequest`: `query`*, `top_k`, `categories`, `min_score` (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/rag/categories`

List knowledge base categories

- **Roles**: public
- **Responses**: 200

### `GET /api/v1/rag/documents`

List SOP documents

- **Roles**: public
- **Parameters**: `category` (query, string, optional): Filter by category code, e.g. HAZMAT
- **Responses**: 200, 422

### `GET /api/v1/rag/documents/{doc_id}`

Get a full SOP document

- **Roles**: public
- **Parameters**: `doc_id` (path, string, required)
- **Responses**: 200, 422

### `GET /api/v1/rag/stats`

Vector index statistics

- **Roles**: public
- **Responses**: 200

### `GET /api/v1/rag/benchmark`

Run the retrieval benchmark

- **Roles**: public
- **Responses**: 200

## Route Optimization (VRPTW)

Distance matrix, VRPTW solver, resequencing evaluation, downstream ETAs, SLA checks, route explanations and the disruption-handling Optimization Agent.

### `POST /api/v1/routes/distance-matrix`

Compute distance & duration matrix

- **Roles**: public
- **Body**: application/json `DistanceMatrixRequest`: `points`*, `vehicle_type` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/road-path`

Road geometry, distance and time for a stop sequence

- **Roles**: public
- **Body**: application/json `RoadPathRequest`: `points`*, `vehicle_type` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/optimize`

Solve VRPTW for a batch of stops

- **Roles**: public
- **Body**: application/json `OptimizeRequest`: `hub`*, `stops`*, `vehicles`*, `departure` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/evaluate`

Time a dispatcher-chosen stop order

- **Roles**: public
- **Body**: application/json `EvaluateRequest`: `hub`*, `vehicle`*, `stops`*, `departure` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/recalculate`

Recalculate downstream ETAs

- **Roles**: public
- **Body**: application/json `RecalculateRequest`: `hub`*, `vehicle`*, `stops`*, `departure`, `now`, `completed`, `failed`, `delay_min`, `current_position`, `previous_etas`, `blocked` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/sla-check`

SLA alerts across live routes

- **Roles**: public
- **Body**: application/json `SlaCheckRequest`: `routes`* (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/explain`

Explain a route in plain language

- **Roles**: public
- **Body**: application/json `ExplainRequest`: `hub`*, `vehicle`*, `stops`*, `departure`, `hub_name`, `separate_trips_km` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/manifest.pdf`

Printable route manifest (driver stop sheet)

- **Roles**: signed in
- **Body**: application/json `ManifestRequest`: `hub`*, `vehicle`*, `stops`*, `departure`, `hub_name`, `separate_trips_km`, `service_date` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/receipt.pdf`

Customer delivery receipt (proof of delivery)

- **Roles**: signed in
- **Body**: application/json `ReceiptRequest`: `tracking_number`*, `customer_name`*, `address`, `service_date`, `delivered_at`*, `recipient`*, `verified_by`, `weight_kg`*, `vehicle`*, `driver`, `hub`*, `in_full`, `notes` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/routes/disruption`

Turn a disruption report into a re-route proposal

- **Roles**: public
- **Body**: application/json `DisruptionRequest`: `message`*, `hub`*, `routes`*, `spare_vehicles`, `now`, `use_llm` (`*` = required)
- **Responses**: 200, 422

## Operational Reports & Exports

OTIF, transit, efficiency, fuel and cost KPIs with CSV and PDF exports.

### `GET /api/v1/reports/metrics`

Operational KPIs with breakdowns

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `days` (query, integer, optional): Number of past days; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name; `fuel_price` (query, number, optional): Fuel price per litre (₹); `driver_cost` (query, number, optional): Driver cost per hour (₹)
- **Responses**: 200, 422

### `GET /api/v1/reports/export.csv`

CSV export of every delivery attempt

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `days` (query, integer, optional): Number of past days; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name
- **Responses**: 200, 422

### `GET /api/v1/reports/export.xlsx`

Excel export: deliveries, KPIs and per-hub sheets

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `days` (query, integer, optional): Number of past days; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name; `fuel_price` (query, number, optional): Fuel price per litre (₹); `driver_cost` (query, number, optional): Driver cost per hour (₹)
- **Responses**: 200, 422

### `GET /api/v1/reports/summary.pdf`

Printable executive trip summary

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `days` (query, integer, optional): Number of past days; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name; `fuel_price` (query, number, optional): Fuel price per litre (₹); `driver_cost` (query, number, optional): Driver cost per hour (₹)
- **Responses**: 200, 422

## Authentication & RBAC

JWT login and role-based access control.

### `POST /api/v1/auth/register`

Register New User

- **Roles**: public
- **Body**: application/json `UserCreate`: `email`*, `full_name`*, `role`, `is_active`, `password`* (`*` = required)
- **Responses**: 201, 422

### `POST /api/v1/auth/login`

User Login

- **Roles**: public
- **Body**: application/json `LoginRequest`: `email`*, `password`* (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/auth/me`

Current User Profile

- **Roles**: signed in
- **Responses**: 200

### `POST /api/v1/auth/refresh`

Refresh Access Token

- **Roles**: signed in
- **Responses**: 200

### `POST /api/v1/auth/change-password`

Change Your Password

- **Roles**: signed in
- **Body**: application/json `ChangePasswordRequest`: `current_password`*, `new_password`* (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/auth/forgot-password`

Ask for a Password Reset

- **Roles**: public
- **Body**: application/json `ForgotPasswordRequest`: `email`* (`*` = required)
- **Responses**: 202, 422

### `POST /api/v1/auth/seed-demo-users`

Seed Demo Roles for Testing

- **Roles**: public
- **Responses**: 200

## Shipment Orders & Ingestion

Shipment CRUD and CSV/JSON batch ingestion.

### `GET /api/v1/shipments/batch/template`

Download Shipments Csv Template

- **Roles**: signed in
- **Responses**: 200

### `POST /api/v1/shipments/batch/upload`

Upload Shipments Csv

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: multipart/form-data `Body_upload_shipments_csv_api_v1_shipments_batch_upload_post`: `file`* (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/shipments/batch`

Batch Create Shipments Json

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `BatchShipmentJSONRequest`: `shipments`* (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/shipments`

List Shipments

- **Roles**: signed in
- **Parameters**: `hub_id` (query, integer, optional): Filter by origin hub ID; `status` (query, value, optional): Filter by shipment status; `priority` (query, value, optional): Filter by priority; `search` (query, string, optional): Free text: tracking number, customer or address; `skip` (query, integer, optional); `limit` (query, integer, optional)
- **Responses**: 200, 422

### `POST /api/v1/shipments`

Create Shipment

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `ShipmentCreate`: `tracking_number`*, `customer_name`*, `destination_address`*, `latitude`*, `longitude`*, `weight_kg`*, `volume_m3`*, `time_window_start`, `time_window_end`, `priority`, `hazard_class`, `status`, `hub_id`*, `assigned_vehicle_id` (`*` = required)
- **Responses**: 201, 422

### `POST /api/v1/shipments/plan`

Save a dispatch or re-route

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `PlanChange`: `reason`*, `shipments`*, `vehicles`, `drivers` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/shipments/{shipment_id}/delivery-code`

Show or reissue the customer's delivery code

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `shipment_id` (path, integer, required); `reissue` (query, boolean, optional): Replace the code and clear failed attempts
- **Responses**: 200, 422

### `PATCH /api/v1/shipments/{shipment_id}`

Edit order details

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `ShipmentUpdate`: `tracking_number`, `hub_id`, `hazard_class`, `customer_name`, `destination_address`, `latitude`, `longitude`, `weight_kg`, `volume_m3`, `time_window_start`, `time_window_end`, `priority` (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/shipments/{shipment_id}`

Get Shipment

- **Roles**: signed in
- **Parameters**: `shipment_id` (path, integer, required)
- **Responses**: 200, 422

### `DELETE /api/v1/shipments/{shipment_id}`

Delete Shipment

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `shipment_id` (path, integer, required)
- **Responses**: 204, 422

### `PATCH /api/v1/shipments/{shipment_id}/status`

Update Shipment Status

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `ShipmentStatusUpdate`: `status`*, `notes` (`*` = required)
- **Responses**: 200, 422

## Immutable Audit Trail

Append-only log of every state change and override.

### `GET /api/v1/audit`

List Audit Logs

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `entity_type` (query, string, optional): Filter by entity type (e.g. Shipment, Vehicle); `action_type` (query, value, optional): Filter by audit action type; `actor_role` (query, string, optional): Filter by actor role; `skip` (query, integer, optional); `limit` (query, integer, optional)
- **Responses**: 200, 422

### `GET /api/v1/audit/report`

Audit trail compliance report with integrity checks

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `date_from` (query, string, optional): First day (YYYY-MM-DD, UTC); `date_to` (query, string, optional): Last day (YYYY-MM-DD, UTC); `action_type` (query, value, optional): Only this action type; `entity_type` (query, string, optional): Only this entity type, e.g. Shipment; `actor_role` (query, string, optional): Only this actor role, e.g. DISPATCHER
- **Responses**: 200, 422

### `GET /api/v1/audit/export.csv`

Audit trail as CSV

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `date_from` (query, string, optional): First day (YYYY-MM-DD, UTC); `date_to` (query, string, optional): Last day (YYYY-MM-DD, UTC); `action_type` (query, value, optional): Only this action type; `entity_type` (query, string, optional): Only this entity type, e.g. Shipment; `actor_role` (query, string, optional): Only this actor role, e.g. DISPATCHER
- **Responses**: 200, 422

### `GET /api/v1/audit/report.pdf`

Printable audit trail compliance report

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `date_from` (query, string, optional): First day (YYYY-MM-DD, UTC); `date_to` (query, string, optional): Last day (YYYY-MM-DD, UTC); `action_type` (query, value, optional): Only this action type; `entity_type` (query, string, optional): Only this entity type, e.g. Shipment; `actor_role` (query, string, optional): Only this actor role, e.g. DISPATCHER
- **Responses**: 200, 422

## LangGraph AI Copilot

Multi-agent StateGraph copilot for dispatcher questions.

### `POST /api/v1/copilot/query`

Execute Natural Language Dispatcher Query via StateGraph

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `CopilotQueryRequest`: `query`*, `session_id`, `context` (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/copilot/intents`

Get Supported Copilot Intent Catalog

- **Roles**: public
- **Responses**: 200

### `GET /api/v1/copilot/health`

Copilot Agent System Health & Graph Engine Status

- **Roles**: public
- **Responses**: 200

### `POST /api/v1/copilot/guardrails/evaluate`

Evaluate Policy Query against Zero-Hallucination Guardrails (US-006, Week 7)

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `CopilotQueryRequest`: `query`*, `session_id`, `context` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/copilot/policy/validate-route`

Evaluate Route Manifest Compliance via Policy Agent (US-006, Week 8)

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `RouteComplianceRequest`: `vehicle_id`*, `driver_id`, `shipment_ids`, `estimated_duration_minutes` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/copilot/proposals`

Create a structured re-route proposal with a route diff (US-005, Week 11)

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Body**: application/json `DisruptionRequest`: `message`*, `hub`*, `routes`*, `spare_vehicles`, `now`, `use_llm` (`*` = required)
- **Responses**: 201, 422

### `GET /api/v1/copilot/proposals/{card_id}`

Get a proposal card and its decision status

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `card_id` (path, string, required)
- **Responses**: 200, 422

### `POST /api/v1/copilot/proposals/{card_id}/decision`

Accept or reject a proposal (recorded in the audit log)

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `card_id` (path, string, required)
- **Body**: application/json `ProposalDecisionRequest`: `decision`*, `note` (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/copilot/telemetry`

Copilot latency and LLM token usage (Week 14)

- **Roles**: ADMIN, FLEET_MANAGER
- **Responses**: 200

## In-Transit FSM & Telemetry Tracking

Shipment lifecycle state machine and driver actions.

### `POST /api/v1/transit/shipments/{shipment_id}/depart`

Driver / Dispatcher marks shipment departed in-transit

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitDepartRequest`: `vehicle_id`, `notes` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/transit/shipments/{shipment_id}/arrive`

Driver check-in arrival at delivery stop

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitArriveRequest`: `latitude`, `longitude`, `notes` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/transit/shipments/{shipment_id}/deliver`

Confirm successful parcel delivery handover

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitDeliverRequest`: `recipient_name`*, `delivery_code`, `signature`, `notes` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/transit/shipments/{shipment_id}/fail`

Report delivery failure attempt with reason code

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitFailRequest`: `reason_code`*, `notes`* (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/transit/shipments/{shipment_id}/delay`

Report en-route traffic or mechanical delay

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER, DRIVER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitDelayRequest`: `delay_minutes`*, `reason`* (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/transit/shipments/{shipment_id}/redispatch`

Return failed parcel to unassigned queue for re-routing

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `shipment_id` (path, integer, required)
- **Body**: application/json `TransitRedispatchRequest`: `notes` (`*` = required)
- **Responses**: 200, 422

### `GET /api/v1/transit/trips/{vehicle_id}/progress`

Get real-time trip progress, stop statuses, and FSM metrics

- **Roles**: signed in
- **Parameters**: `vehicle_id` (path, integer, required)
- **Responses**: 200, 422

### `GET /api/v1/transit/fsm/transitions`

Get permissible FSM state transition rules

- **Roles**: signed in
- **Responses**: 200

### `GET /api/v1/transit/driver/manifest`

Get Mobile Driver Daily Manifest (US-008, Week 9)

- **Roles**: signed in
- **Parameters**: `driver_id` (query, integer, optional)
- **Responses**: 200, 422

### `GET /api/v1/transit/shipments/{shipment_id}/proof`

Proof of delivery

- **Roles**: ADMIN, FLEET_MANAGER, DISPATCHER
- **Parameters**: `shipment_id` (path, integer, required)
- **Responses**: 200, 422

### `POST /api/v1/transit/driver/offline-sync`

Batch Synchronize Driver Offline Actions (US-008, Week 9)

- **Roles**: DRIVER, ADMIN, DISPATCHER
- **Body**: application/json `DriverOfflineSyncRequest`: `actions`* (`*` = required)
- **Responses**: 200, 422

## Executive KPI Analytics

### `GET /api/v1/analytics/executive`

Executive KPI dashboard (US-008)

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `date_from` (query, string, optional): First day (YYYY-MM-DD); default 30 days before date_to; `date_to` (query, string, optional): Last day (YYYY-MM-DD); default yesterday; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name, e.g. Rajesh Kumar; `priority` (query, string, optional): EXPRESS, HIGH, STANDARD or LOW
- **Responses**: 200, 422

### `GET /api/v1/analytics/executive/export.csv`

One dashboard view as CSV

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `section` (query, string, optional): One of: kpis, daily, hours, drivers, density; `date_from` (query, string, optional): First day (YYYY-MM-DD); default 30 days before date_to; `date_to` (query, string, optional): Last day (YYYY-MM-DD); default yesterday; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name, e.g. Rajesh Kumar; `priority` (query, string, optional): EXPRESS, HIGH, STANDARD or LOW
- **Responses**: 200, 422

### `GET /api/v1/analytics/executive/summary.pdf`

Printable executive KPI summary

- **Roles**: ADMIN, FLEET_MANAGER
- **Parameters**: `date_from` (query, string, optional): First day (YYYY-MM-DD); default 30 days before date_to; `date_to` (query, string, optional): Last day (YYYY-MM-DD); default yesterday; `hub` (query, string, optional): Hub code, e.g. HUB-MUM-01; `vehicle_type` (query, string, optional): VAN, EV, BOX_TRUCK or SEMI_TRUCK; `driver` (query, string, optional): Driver full name, e.g. Rajesh Kumar; `priority` (query, string, optional): EXPRESS, HIGH, STANDARD or LOW
- **Responses**: 200, 422

## User Management

### `GET /api/v1/users`

List accounts with their driver profiles

- **Roles**: ADMIN
- **Responses**: 200

### `POST /api/v1/users`

Create an account

- **Roles**: ADMIN
- **Body**: application/json `ManagedUserCreate`: `email`*, `full_name`*, `role`, `is_active`, `password`*, `driver`, `driver_id` (`*` = required)
- **Responses**: 201, 422

### `GET /api/v1/users/unlinked-drivers`

Driver profiles without a login

- **Roles**: ADMIN
- **Responses**: 200

### `PATCH /api/v1/users/{user_id}`

Rename, change role, activate or deactivate

- **Roles**: ADMIN
- **Parameters**: `user_id` (path, integer, required)
- **Body**: application/json `ManagedUserUpdate`: `full_name`, `role`, `is_active` (`*` = required)
- **Responses**: 200, 422

### `POST /api/v1/users/{user_id}/reset-password`

Issue a temporary password

- **Roles**: ADMIN
- **Parameters**: `user_id` (path, integer, required)
- **Responses**: 200, 422

### `PUT /api/v1/users/{user_id}/driver`

Link or unlink a driver profile

- **Roles**: ADMIN
- **Parameters**: `user_id` (path, integer, required)
- **Body**: application/json `DriverLinkRequest`: `driver_id` (`*` = required)
- **Responses**: 200, 422

---
90 endpoints.
