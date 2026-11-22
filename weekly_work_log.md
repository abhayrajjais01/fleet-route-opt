# Weekly Engineering Work Log: AI Fleet Route Optimizer

**Project**: Enterprise AI Fleet Route Optimizer (50-50 Plan)  
**Engineers**:
- **Manthan Nimodiya (Track A Lead)**: RAG Systems, Optimization Algorithms & Autonomous Routing
- **Abhayraj Jaiswal (Track B Lead)**: Multi-Agent Orchestration, Governance, Platform & Operations

---

### Week 1: Scaffolding, Security & Application Shell (Sep 1 – Sep 5, 2026)
- **Status**: `COMPLETED` ✅
- **Focus Area**: Dual-engine database setup, security infrastructure, role-based access control, and base UI shell.

#### Track A (Manthan Nimodiya):
1. **Modular FastAPI Architecture**: Built modular structure (`app/core`, `models`, `schemas`, `api/v1`).
2. **Dual Database Engine**: Configured SQLAlchemy 2.0 with SQLite development fallback and PostgreSQL production support.
3. **Health Probes**: Built `/api/v1/health` and `/api/v1/ready` probes with database ping checks.
4. **Automated Tests**: Implemented `backend/tests/test_health.py` (3/3 tests passed).

#### Track B (Abhayraj Jaiswal):
1. **Security & Cryptography**: Implemented `bcrypt` password hashing and signed JWT token handlers (`backend/app/core/security.py`).
2. **Role-Based Guards**: Built FastAPI dependency `require_roles([UserRole.ADMIN, ...])` restricting access by role.
3. **Command Center UI**: Built responsive UI with dark tactical command center theme and 1-click role switcher.
4. **Auth Tests**: Implemented `backend/tests/test_auth_rbac.py` (5/5 tests passed).

---

### Week 2: Fleet Assets Backend & Full-Stack Workspace (Sep 7 – Sep 11, 2026)
- **Status**: `COMPLETED` ✅
- **Focus Area**: Core logistics asset models (Vehicles, Drivers, Hubs), CRUD APIs, UI asset directory, database seeder, and cloud deployments.

#### Track A (Manthan Nimodiya):
1. **Relational Models (`backend/app/models/fleet.py`)**:
   - `Hub`: Coordinates, operating windows, facility capacity.
   - `Vehicle`: Payload capacity (kg), volumetric capacity (m3), fuel efficiency (km/L).
   - `Driver`: License categories, duty states, DOT daily driving shift restrictions (<=14h).
2. **RESTful APIs**: Implemented CRUD for `/api/v1/fleet/vehicles`, `drivers`, `hubs`, and aggregate `/overview`.
3. **Relational Tests**: Implemented `backend/tests/test_fleet_crud.py` (4/4 tests passed).

#### Track B (Abhayraj Jaiswal):
1. **JWT Auth Endpoints**: Built `/api/v1/auth/register`, `/login`, and `/me`.
2. **Fleet Management Workspace**: Tabbed directory UI with status badges and creation modals (`VehicleModal.tsx`, `DriverModal.tsx`, `HubModal.tsx`).
3. **Telemetry Redesign**: Built active metrics cards showing fleet utilization and operational alerts.
4. **Production Deployments**: Deployed backend on Render (PostgreSQL) and frontend on Vercel with SPA routing.

---

### Week 3: RAG Knowledge Base vs. Shipments & Audit (Sep 21 – Sep 25, 2026)
- **Status**: `COMPLETED` ✅
- **Focus Area**: RAG Vector Knowledge Base (SOP corpus, TF-IDF embeddings, retrieval benchmark) vs. Shipment Ingestion Domain & Immutable Forensic Audit Log.

#### Track A (Manthan Nimodiya):
1. **Curated Logistics Corpus (`backend/app/services/rag/corpus/`)**:
   - 8 versioned SOP documents across Hazmat transport (ADR, 49 CFR), Driver Hours of Service (FMCSA, Motor Transport Workers Act 1961), Cold Chain, and Vehicle Safety.
   - Section-aware chunking producing 41 citable reference chunks.
2. **TF-IDF Vector Store (`backend/app/services/rag/vector_store.py`)**:
   - In-memory vector store with cosine similarity ranking and category filters.
3. **RAG Endpoints (`backend/app/api/v1/rag.py`)**:
   - `/api/v1/rag/search`, `/categories`, `/documents`, `/documents/{id}`, `/stats`, `/benchmark`.
4. **Retrieval Benchmark (`backend/services/rag/evaluation.py`)**:
   - 33-question evaluation set achieving **Recall@3 = 1.00, MRR = 0.98, p95 latency < 1 ms**.
   - `backend/tests/test_rag.py` (22/22 tests passed).

#### Track B (Abhayraj Jaiswal):
1. **Shipment ORM Model (`backend/app/models/shipment.py`)**:
   - Geographic coordinates, weight (kg), volume (m3), delivery time windows `[open, close]`, priority, lifecycle states.
2. **Immutable Audit Trail (`backend/app/models/audit.py`, `services/audit_service.py`)**:
   - Append-only audit logger capturing actor ID, role, action type, timestamp, and serialized JSON state diffs.
3. **Shipments & Audit APIs**:
   - RESTful endpoints `/api/v1/shipments` and `/api/v1/audit`.
4. **Testing Suite**:
   - `backend/tests/test_shipments_audit.py` (5/5 tests passed).

---

### Week 4: RAG Compliance Inspector UI vs. Batch Order Ingestion (Sep 28 – Oct 2, 2026) — COMPLETED
- **Status**: `COMPLETED` ✅ (Month 1 is 100% Finished)
- **Focus Area**: Batch Order Ingestion Pipeline (CSV & JSON format parser), Template Generator, Delivery Cluster Preview, Codex Reviews Hardening, and Month 1 Full Regression Test Suite.

#### Track A (Manthan Nimodiya):
1. **Compliance & SOP Inspector (`frontend/src/components/compliance/ComplianceInspector.tsx`)**:
   - Replaced the hardcoded mock with live semantic search against `/api/v1/rag/search`.
   - Multi-select category filters with document counts; example query shortcuts.
   - Citation cards: best-match highlight, doc id + `§` section, version/effective date, similarity confidence meter (High / Medium / Weak bands calibrated on the benchmark), query terms highlighted in the excerpt.
   - SOP Library sidebar and full-document viewer that scrolls to and highlights the cited section.
   - Zero-hallucination UX: results are verbatim SOP text only; an empty result shows "No policy found in the verified knowledge base".
2. **Typed API Client (`frontend/src/lib/api.ts`, `frontend/src/lib/ragApi.ts`)**: TypeScript contracts mirroring `backend/app/schemas/rag.py`; `VITE_API_URL` override for the Render deployment.
3. **Bug Fix**: The header backend probe was calling `/health` instead of `/api/v1/health`, so the UI always showed "Local Fast Mode". It now correctly shows "API :8000 Online".
4. **Verification**: Typecheck and production build clean; manually verified search, filters, document viewer, empty state and offline banner against the running backend.

#### Track B (Abhayraj Jaiswal):
1. **High-Throughput Batch Ingestion Engine (`backend/app/services/batch_ingestion.py`)**:
   - Multi-format parser supporting multipart CSV uploads and JSON array payloads.
   - Row-level validation:
     - Finite float verification (`math.isfinite()`) preventing `NaN` and `Infinity` corruption.
     - Strict 24-hour clock validation (`^([01]\d|2[0-3]):([0-5]\d)$`) ensuring realistic delivery windows (`00:00` to `23:59`).
     - Coordinate bounds (-90 to +90 lat, -180 to +180 lng).
     - Strictly positive parcel weights and volumes.
     - Relational hub validation against registered fleet depots.
     - Duplicate tracking number detection.
   - Graceful partial failure reporting: imports all valid rows while returning detailed row-by-row error diagnostics for rejected rows.
   - Automatic batch audit logging recording imported shipments and forensic metadata.
2. **RESTful Batch Endpoints (`backend/app/api/v1/shipments.py`)**:
   - `GET /api/v1/shipments/batch/template`: Serves standard downloadable sample CSV template.
   - `POST /api/v1/shipments/batch/upload`: Multipart CSV parser endpoint.
   - `POST /api/v1/shipments/batch`: Bulk JSON ingestion accepting `List[Union[ShipmentCreate, Dict[str, Any]]]` for per-record validation.
3. **Frontend Batch Ingestion Modal & Delivery Cluster Preview (`frontend/src/App.tsx`)**:
   - Drag-and-drop batch upload modal with client-side preview.
   - Live **Delivery Cluster Preview** showing total weight, total volume, express count, and regional breakdown.
   - Direct integration with backend batch ingestion endpoints with role authentication tokens and row-level error reporting.
   - One-click template download button.
4. **Month 1 Full Regression Test Suite**:
   - 10 automated batch tests (`backend/tests/test_batch_ingestion.py`) covering CSV parsing, JSON ingestion, partial failure diagnostics, duplicate detection, finite number validation, clock window validation, and RBAC guards.
   - **49 / 49 automated backend tests passing (100%)**:
     - `test_auth_rbac.py` (5 passed)
     - `test_batch_ingestion.py` (10 passed)
     - `test_fleet_crud.py` (4 passed)
     - `test_health.py` (3 passed)
     - `test_rag.py` (22 passed)
     - `test_shipments_audit.py` (5 passed)

---

### Week 5: Spatial Graph & LangGraph Multi-Agent Router (Oct 5 – Oct 9, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Track A & Track B Delivered)
- **Focus Area**: Haversine Distance Matrix Engine & Leaflet Map Shell (US-003, US-004) vs. LangGraph StateGraph & Router Agent (US-005).

#### Track A (Manthan Nimodiya):
1. **Distance & Duration Engine (`backend/app/services/optimizer/distance_matrix.py`)**:
   - Haversine great-circle distance on a spherical Earth (mean radius 6371.0088 km); verified against reference values (1° latitude = 111.195 km, London–Paris 343.6 km).
   - Road detour (circuity) correction: 1.45× for short city hops falling to 1.18× for long highway legs, linearly interpolated between anchor distances.
   - Drive time from distance-dependent average speeds (20 km/h city → 56 km/h expressway), scaled down for box trucks and semi trucks.
   - Interpolation instead of stepped bands, so a longer leg can never get a shorter drive time (bug caught on the map, now covered by a regression test).
2. **Distance Matrix Generator & Cache**:
   - Fully vectorised NumPy all-pairs computation: 200 × 200 matrix in ~4 ms (well inside the < 5 s solver budget).
   - LRU cache keyed by rounded coordinates + vehicle type; cached matrices are read-only and a repeat request returns in < 1 ms.
3. **REST API (`backend/app/api/v1/routes.py`)**: `POST /api/v1/routes/distance-matrix` for 2–250 points, returning straight-line km, road km, drive minutes and cache stats. This is the cost input for the Week 6 VRPTW solver.
4. **Leaflet Map (`frontend/src/components/map/`)**:
   - OpenStreetMap tiles (free, no API key) via a small imperative Leaflet wrapper.
   - Custom SVG markers: dark hub tiles with the hub code, and teardrop stop pins coloured by priority (EXPRESS / HIGH / STANDARD / LOW) and numbered by distance from the hub.
   - Interactive popups (customer, address, time window, weight, status, road km and ETA from hub), with all user-supplied text HTML-escaped.
5. **Network Map Page**: hub selector, vehicle-type selector, stops ranked by road distance with drive times, detour ratio, hub-to-hub distance/time matrix, click-to-focus on the map, and an offline banner if the distance API is down.
6. **Fixes**: added coordinates to the frontend `Shipment` type and demo shipments, which also cleared the existing TypeScript errors in the batch upload code.
7. **Testing**: `backend/tests/test_distance_matrix.py` with 20 tests (accuracy, symmetry, triangle inequality, monotonic drive time, caching, performance, API validation).

#### Track B (Abhayraj Jaiswal):
1. **LangGraph StateGraph Multi-Agent Coordination Architecture (`backend/app/services/copilot/state_graph.py`)**:
   - Engineered dual execution engine supporting native compiled `langgraph.graph.StateGraph` and resilient deterministic fallback.
   - Structured `AgentState` managing session state, dispatcher context, candidate confidence scores, and immutable step trace logs.
   - 4-Node execution sequence:
     - `Node 1: input_parser`: Sanitizes query payload and initializes session ID.
     - `Node 2: router_intent_classifier`: Weighted semantic keyword parsing, pattern matching, and entity extraction.
     - `Node 3: handler_*`: Specialized conditional execution branch for breakdowns, traffic delays, compliance SOPs, and reroutes.
     - `Node 4: action_synthesizer`: Packages structured directive proposals, suggested actions, and calculates sub-millisecond latencies.
2. **Router Agent & High-Precision Entity Extraction (`backend/app/services/copilot/router_agent.py`)**:
   - Deterministic classification across 6 logistics categories:
     - `VEHICLE_BREAKDOWN`: Mechanical failure, engine smoke, flat tires, overheating, towing.
     - `TRAFFIC_DELAY`: Heavy congestion, bottleneck, road closures, flooding delays.
     - `POLICY_QUERY`: Driving limits, rest breaks, HOS, Hazmat placards, cold chain excursions.
     - `REROUTE_REQUEST`: Route bypass, detour, stop resequencing, what-if recalculation.
     - `GENERAL_INQUIRY`: Dispatcher copilot capabilities, fleet overview.
     - `OFF_TOPIC`: Conversational and non-logistics queries.
   - Entity extraction regex engine parsing:
     - Vehicle IDs (`V-101`, `VH-02`, etc.)
     - Stop/Shipment IDs (`Stop #4`, `Order SH-1002`)
     - Delay durations in minutes/hours (`45 minutes`, `1.5 hours` -> 90 mins)
     - Corridors/Locations (`NH-48`, `Eastern Express Highway`)
     - Operational Severity levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
     - Regulatory policy topics (`DRIVER_REST`, `HAZMAT`, `COLD_CHAIN`, `VEHICLE_SAFETY`)
3. **Real-Time RAG Knowledge Base Integration**:
   - Interconnected Router Agent `POLICY_QUERY` node with Track A's RAG knowledge base (`app/services/rag/knowledge_base.py`).
   - Automatically returns verified SOP citations (`SOP-DR-001`, `SOP-HZ-001`, `SOP-CC-001`), section excerpts, and confidence metrics without hallucinations.
4. **RESTful Copilot APIs (`backend/app/api/v1/copilot.py`)**:
   - `POST /api/v1/copilot/query`: Authenticated endpoint executing StateGraph workflows for dispatchers.
   - `GET /api/v1/copilot/intents`: Returns catalog of 6 supported intents, descriptions, and sample prompts.
   - `GET /api/v1/copilot/health`: System health reporting active graph engine and RAG index status.
5. **Frontend AI Copilot Command Center (`frontend/src/components/copilot/CopilotCommandCenter.tsx`)**:
   - Modern, responsive dispatcher console integrated with real-time FastAPI endpoints.
   - Interactive prompt input bar with scenario chips for emergency breakdowns, corridor delays, compliance SOPs, and reroutes.
   - Rich response rendering: color-coded intent badges, confidence meter progress bars, entity pill tags, and suggested action triggers.
   - Expandable **StateGraph Multi-Agent Execution Trace** accordion displaying node-by-node sequence and millisecond latencies.
6. **Automated Test Suite & Regression Verification**:
   - 16 comprehensive automated unit and integration tests (`backend/tests/test_copilot_router.py`) covering intent classification, entity extraction, confidence thresholds, RAG citation retrieval, execution trace validity, and RBAC authentication.
   - **Combined Test Suite: 122 / 122 automated backend tests passing (100% pass rate)**:
     - `test_distance_matrix.py` (20 passed)
     - `test_copilot_router.py` (16 passed)
     - `test_rag.py` (22 passed)
     - `test_batch_ingestion.py` (10 passed)
     - `test_auth_rbac.py` (5 passed)
     - `test_shipments_audit.py` (5 passed)
     - `test_fleet_crud.py` (4 passed)
     - `test_health.py` (3 passed)
     - `test_database_url.py` (7 passed)
   - Frontend production build (`pnpm run build`) passing with 0 errors.

---

### Week 6: Deterministic VRPTW Solver Core vs. In-Transit FSM (Oct 12 – Oct 16, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Both Track A & Track B Delivered)
- **Focus Area**: Deterministic VRPTW Solver Core (Clarke-Wright Savings + 2-Opt) vs. In-Transit Finite State Machine (FSM), Driver Action API Endpoints, FSM Visual Stepper Component, Telemetry Synchronization, and Automated Regression Suite (US-003 & US-008).

#### Track A (Manthan Nimodiya):
1. **VRPTW Solver (`backend/app/services/optimizer/vrptw_solver.py`)**:
   - Clarke-Wright savings merges routes by largest saving `d(hub,i) + d(hub,j) − d(i,j)` while the merged route stays feasible.
   - Hard constraints never broken: payload, volume, time windows (early arrival waits), driver shift limit.
   - Best-fit assignment of routes to the real fleet; leftover stops re-inserted at the cheapest feasible position (or by earliest deadline); anything impossible is returned as unassigned with a reason.
   - 2-opt improvement using route cost = road km + 0.3 × route minutes, so the solver avoids long idle waits outside closed windows.
2. **API**: `POST /api/v1/routes/optimize` returns sequenced routes with arrival/service/departure times, utilisation, unassigned reasons, and the saving versus serving every stop separately.
3. **Results**: 50 stops on 5 trucks solved in milliseconds (PRD target < 5 s), ~80% less distance than separate trips.
4. **Frontend Integration**: Live Tracking orders each trip with the solver; nearest-neighbour remains as the offline fallback.
5. **Testing**: `backend/tests/test_vrptw_solver.py` (13 tests) re-simulating every route independently to verify capacity, windows, shift limit and that each stop is served exactly once.

#### Track B (Abhayraj Jaiswal):
1. **In-Transit Finite State Machine Service (`backend/app/services/transit_fsm.py`)**:
   - Engineered strict directional transition graph: `UNASSIGNED` ➔ `ASSIGNED` ➔ `IN_TRANSIT` ➔ `ARRIVED` ➔ `DELIVERED` (Terminal).
   - Structured failure handling: `ARRIVED` / `IN_TRANSIT` ➔ `FAILED` with standardized reason taxonomy (`CONSIGNEE_UNAVAILABLE`, `INCORRECT_ADDRESS`, `DAMAGED_PACKAGE`, `ACCESS_RESTRICTED`, `CUSTOMER_REFUSED`, `VEHICLE_ISSUE`, `OTHER`).
   - Redispatch loop: `FAILED` ➔ `UNASSIGNED` clearing vehicle assignment for re-clustering and re-dispatch.
   - Telemetry duty synchronization: departing shifts vehicle to `IN_TRANSIT` and driver to `ON_TRIP`; delivery handover checks completion and returns vehicle to `AVAILABLE` when all assigned consignments are delivered.
   - Automated forensic audit logging recording `STATUS_CHANGE` events with serialized before/after snapshots for every transition.
2. **RESTful Driver Action Endpoints (`backend/app/api/v1/transit.py`)**:
   - `POST /api/v1/transit/shipments/{id}/depart`: Depart order with assigned vehicle.
   - `POST /api/v1/transit/shipments/{id}/arrive`: Driver arrival check-in with GPS telemetry coordinates.
   - `POST /api/v1/transit/shipments/{id}/deliver`: Handover verification with consignee name and proof-of-delivery signature token.
   - `POST /api/v1/transit/shipments/{id}/fail`: Report delivery failure with failure reason and diagnostic incident notes.
   - `POST /api/v1/transit/shipments/{id}/delay`: Record transit delays (+15m, +30m, etc.) for SLA breach tracking.
   - `POST /api/v1/transit/shipments/{id}/redispatch`: Return failed shipment to unassigned queue (restricted to Dispatcher/Manager/Admin).
   - `GET /api/v1/transit/trips/{vehicle_id}/progress`: Multi-stop progress aggregation, current stop index, and completion percentage.
   - `GET /api/v1/transit/fsm/transitions`: Permissible FSM state transition rules dictionary.
3. **Pydantic Validation Schemas (`backend/app/schemas/transit.py`)**:
   - Strict typing across departure, arrival, delivery handover, failure diagnostics, delay reporting, and trip progress metrics.
4. **FSM Visual Progress Bar (`frontend/src/components/tracking/FsmProgressBar.tsx`)**:
   - 5-stage stepper with animated glowing pulse ring on active stop, vibrant emerald checkmarks on completed stops, and striking failure badges.
   - Compact mode for stop timelines and full-detail mode for active driver cockpit cards.
5. **Driver Action Cockpit & Modal Handlers (`frontend/src/components/tracking/LiveTrackingSection.tsx`, `transitApi.ts`)**:
   - Interactive Proof of Delivery Handover modal.
   - Delivery Failure Incident Reporting modal with standard reason selector.
   - Quick delay logger (+15m, +30m) with audit trail sync.
   - Seamless live API execution with graceful offline simulation fallback.
6. **Automated Pytest Suite (`backend/tests/test_transit_fsm.py` & `test_vrptw_solver.py`)**:
   - **Combined Full Suite**: **122 / 122 passed (100% pass rate)**.
   - Frontend production build (`pnpm run build`): **Built cleanly in 860ms with 0 errors**.

---

### Weeks 7–16 (Track A): Route Planner, Optimization Agent, Live ETAs, Reports & Release — delivered Nov 12, 2026
- **Status**: Track A `COMPLETED` ✅ (Weeks 7–10 on schedule; Weeks 11–16 delivered early). Track B Weeks 7–16 are logged below.
- **Focus Area**: Turning the Week 6 solver into a dispatcher workflow (plan → re-order → explain → approve → track), an agent that re-plans after disruptions, live SLA alerts, operational reporting, and a containerised backend.

#### Track A (Manthan Nimodiya):
1. **Week 7: Route visualizer & split manifest** (`frontend/src/components/routes/`)
   - New **Route Planner** page: choose hub, departure time, orders and vehicles, then optimize.
   - Colour-coded polylines and numbered pins per vehicle (`RoutePlanMap.tsx`); hovering a manifest fades the other routes.
   - Manifest per vehicle with driver, capacity bar, km, duration, return time and per-stop ETA/window; headline km vs separate trips.
2. **Week 8: Drag-and-drop resequencing**
   - Drag stops within or between vehicles (▲/▼ buttons as a keyboard fallback). ETAs update instantly in the browser and are confirmed by `POST /api/v1/routes/evaluate`.
   - Violation badges for late stops, over-capacity and over-shift routes.
   - **Approve & dispatch** assigns the shipments, sets vehicles IN_TRANSIT and drivers ON_TRIP, and Live Tracking follows the approved order (`route_sequence`).
3. **Week 9: Optimization Agent** (`backend/app/services/copilot/optimization_agent.py`)
   - Tool-calling agent with three JSON-schema tools: `reassign_stops`, `apply_delay`, `reoptimize_route`.
   - Deterministic planner by default (Router Agent intent + breakdown/delay parsing); optional Claude planner when `ANTHROPIC_API_KEY` is set and the `anthropic` package is installed.
   - Breakdown handling: cheapest feasible insertion into the other vehicles, then spare vehicles at the hub; anything impossible is reported by stop name with the reason.
   - `POST /api/v1/routes/disruption` returns a proposal the dispatcher approves or declines (UI: "What if it breaks down?" and "Ask the optimization agent").
4. **Week 10: Downstream ETA recalculation** (`backend/app/services/optimizer/eta_engine.py`)
   - Completed stops keep their actual times; a delay shifts the next stop and later stops absorb it where they were waiting for a window to open.
   - `POST /api/v1/routes/recalculate`; Live Tracking shows an "ETAs updated" toast.
5. **Week 11: RAG route explanations** (`backend/app/services/optimizer/route_explainer.py`)
   - Route summary, a reason for every stop, and driver instructions (direction, km, minutes, arrival and hand-over times).
   - Built only from computed ETAs plus SOP clauses retrieved from the RAG store, with citations. `POST /api/v1/routes/explain`.
6. **Week 12: SLA breach detection & alerts**
   - SLA classes ON_TIME / AT_RISK (15 min margin) / PREDICTED_BREACH / SLA_BREACHED / FAILED; trip states ROUTE_BLOCKED and ROUTE_PROPOSED.
   - `POST /api/v1/routes/sla-check` (worst first); Live Tracking toasts for predicted breach, breach and blocked route, with an optional alert tone (`SlaAlerts.tsx`).
7. **Week 13: Operational metrics engine** (`backend/app/services/analytics/`)
   - OTIF, on-time %, SLA breaches, transit time, route efficiency, fuel burn, cost per tonne-km, utilisation; by hub and vehicle type.
   - 30 days of dispatch history replayed through the real solver and ETA engine (seeded, repeatable).
   - `GET /api/v1/reports/metrics` with days / hub / vehicle type / driver / fuel price / driver cost filters; **Reports** page with KPI tiles and an OTIF-by-day chart.
8. **Week 14: Exports**: `GET /api/v1/reports/export.csv` and `GET /api/v1/reports/summary.pdf` (ReportLab), wired to export buttons that respect the filters.
9. **Week 15: Benchmarks & hardening**: `python -m scripts.benchmark` (all PRD targets pass: VRPTW 50 stops ≈ 3 ms vs < 5 s; RAG search < 1 ms vs < 100 ms; agent re-route ≈ 5–17 ms vs < 3 s); composite indexes on vehicles and drivers; `test_performance.py`.
10. **Week 16: Backend Docker & Postgres**: multi-stage `backend/Dockerfile` (non-root, healthcheck), `docker-compose.yml` with `postgres:16-alpine`, entrypoint that waits for the DB, creates tables, migrates and seeds; OpenAPI tags and descriptions at `/docs`.
11. **Fixes found while integrating with Week 6 Track B**
   - Live Tracking crashed because `TrackingMap` was missing the `insets` prop; the shipment status map was missing `ARRIVED`. Both fixed.
   - Driver actions on trips dispatched from the browser were rejected by the server FSM (shipment still UNASSIGNED there) and silently did nothing. Server sync is now best-effort: the simulation always updates and a server rejection is shown as a notice.
12. **Testing**: `test_route_operations.py` (27), `test_reports.py` (8), `test_performance.py` (3). **Full suite: 164 / 164 passed**; frontend `tsc` 0 errors, `pnpm build` clean; flows verified in the browser (optimize, re-order, breakdown proposal, explain, dispatch, delay → ETA and SLA toasts, reports filters and exports, driver role).

---

### Week 7: Map Polylines & Guardrails (Oct 19 – Oct 23, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: Interactive Route Polylines visualizer & Split Manifest view on Leaflet canvas vs. Zero-Hallucination Guardrails & RAG Similarity confidence scoring (US-004 & US-006).

#### Track B (Abhayraj Jaiswal):
1. **Zero-Hallucination Guardrail Engine (`backend/app/services/copilot/guardrails.py`)**:
   - Semantic similarity threshold evaluator (`evaluate_rag_guardrail`) enforcing a calibrated `DEFAULT_GUARDRAIL_THRESHOLD = 0.18`.
   - Strict zero-hallucination fallback text: `"Policy not found in verified knowledge base"` whenever top similarity score < threshold.
   - Calibrated confidence scoring (0–100%) mapping cosine similarity cleanly to human-interpretable percentage certainty.
   - Formatted SOP citation cards with document ID, section number, heading, and text excerpt.
2. **StateGraph Integration (`backend/app/services/copilot/state_graph.py`)**:
   - Integrated guardrail evaluation into `POLICY_QUERY` handler.
   - Appended dedicated `rag_similarity_guardrail` step to multi-agent execution trace with verified status, similarity score, and citation count.
3. **RESTful Guardrails Endpoint (`backend/app/api/v1/copilot.py`)**:
   - `POST /api/v1/copilot/guardrails/evaluate`: Testing endpoint for real-time similarity scoring and threshold verification.
4. **Automated Unit Tests (`backend/tests/test_rag_guardrails.py`)**:
   - 5 comprehensive tests verifying score normalization, in-domain SOP passes, out-of-domain query rejections, REST endpoint validation, and execution trace auditing.

---

### Week 8: Resequencing & Policy Agent (Oct 26 – Oct 30, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: Drag-and-Drop Route Resequencing UI and recalculation API vs. Policy & Compliance Agent integrating labor laws and Hazmat verification (US-006 & US-007).

#### Track B (Abhayraj Jaiswal):
1. **Policy & Compliance Agent (`backend/app/services/copilot/policy_agent.py`)**:
   - Multi-regulatory automated route validation engine (`PolicyComplianceAgent.evaluate_manifest`).
   - **Driver Hours of Service (HOS)**: Flags a route longer than the driver's certified daily limit (`max_driving_hours_per_day`, default 8 h) and any route over 5 h without the mandatory 30-minute break, per the Motor Transport Workers Act 1961 (`SOP-DR-001 §2`).
   - **Vehicle Payload & Volumetric Capacity**: Detects vehicle overload violations against certified gross vehicle limits per `SOP-VS-001 §1`.
   - **Hazardous Materials (Hazmat)**: Hazmat cargo is identified by its UN `hazard_class`; the driver must have a verified `hazmat_endorsed` qualification (`SOP-HZ-001 §2`), and Class 3 / Class 8 goods may not be co-loaded (`SOP-HZ-001 §5`).
   - **Incomplete manifests**: unknown vehicle, driver or shipment IDs are rejected (HTTP 422); with no driver the result is marked incomplete and never compliant.
   - **Cold Chain Holdover**: Flags temperature-sensitive consignments on routes longer than the 4-hour passive holdover window per `SOP-CC-001 §5`.
2. **RESTful Policy Validation Endpoint (`backend/app/api/v1/copilot.py`)**:
   - `POST /api/v1/copilot/policy/validate-route`: Dispatcher-authenticated endpoint returning overall compliance score (0–100%), violation severity breakdown (LOW / MEDIUM / HIGH / CRITICAL), and cited SOP rules.
3. **Automated Unit Tests (`backend/tests/test_policy_agent.py`)**:
   - 12 tests: compliant manifests, HOS, overload, hazmat classification and endorsement, incompatible co-loading, cold chain, unresolved IDs, missing driver, and the REST endpoint.

---

### Week 9: Optimization Agent & Driver Mobile View (Nov 2 – Nov 6, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: LangGraph Optimization Agent (Solver Tool) vs. Mobile Driver View & Offline Sync Action API (US-005 & US-008).

#### Track B (Abhayraj Jaiswal):
1. **Mobile Driver Cockpit (`frontend/src/components/driver/MobileDriverCockpit.tsx`)**:
   - Mobile-first responsive layout tailored for driver handhelds and tablets.
   - Today's sequenced stop manifest with customer contact, phone dialer shortcut, address, and package details.
   - Large, thumb-friendly driver action bar (`ARRIVED`, `DELIVERED`, `REPORT ISSUE / DELAY / FAIL`).
   - LocalStorage offline action queue storing driver transitions when disconnected in rural or poor-connectivity zones.
   - Automatic background replay sync on network reconnection with visual online/offline status pill; actions the server rejects stay in the queue with the error shown.
2. **Backend Mobile Transit Endpoints (`backend/app/api/v1/transit.py`)**:
   - `GET /api/v1/transit/driver/manifest`: Returns the signed-in driver's own vehicle, depot, shipments and sync token (resolved via the account link; 403 if no driver record matches, never another driver's data). The cockpit loads it and caches it for offline use.
   - `POST /api/v1/transit/driver/offline-sync`: Batch-replays queued client actions (`ARRIVE`, `DELIVER`, `FAIL`, `DELAY`) with per-action atomic error isolation and audit log sync.
3. **Automated Unit Tests (`backend/tests/test_mobile_driver_api.py`)**:
   - 6 tests: manifest retrieval, no fallback to another driver's manifest, ARRIVE/DELIVER and FAIL/DELAY replay, and partial-failure isolation.

---

### Week 10: Downstream ETAs & Copilot Sliding Drawer UI (Nov 9 – Nov 13, 2026) — COMPLETED ✅
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: Downstream ETA Dynamic Recalculation vs. AI Copilot Sliding Drawer UI & Execution Traces (US-005 & US-007).

#### Track B (Abhayraj Jaiswal):
1. **AI Copilot Sliding Drawer Component (`frontend/src/components/copilot/CopilotSlidingDrawer.tsx`)**:
   - Floating AI Copilot trigger pill in bottom-right corner, accessible from any screen across the application.
   - Sliding right-side drawer with backdrop blur and smooth CSS slide-in animation.
   - One-tap quick prompt chips for common operational inquiries (e.g. "Check driver rest break rules", "Validate route compliance", "Show delayed shipments").
   - Multi-agent execution trace inspector displaying individual sub-agent nodes, reasoning actions, and execution latencies.
   - Live AI response latency indicator (ms) and calibrated confidence score meter (0–100%).
   - Zero-hallucination verification badges with expandable SOP citations.
2. **App Shell Integration (`frontend/src/App.tsx`)**:
   - Mounted `<CopilotSlidingDrawer />` across all views with dynamic role passing.
   - Driver header toggle between *My stops* (mobile cockpit) and *Map* (Live Tracking).
3. **Tracking Map Crash Hotfix**:
   - Resolved undefined `insets.left` map crash on Driver profile and added `'ARRIVED'` transition to `advanceFSM` (commit `fbbe588`).
4. **Integration with Track A Weeks 7–16 (PR #24, Nov 12)**:
   - Merged `main` (Track A delivery + UI redesign) into the Track B branch; the cockpit, driver view toggle and Copilot drawer were re-fitted into the new app shell.
   - Addressed all 10 Codex review findings: driver manifest identity, offline FAIL/DELAY replay, hazmat classification / endorsement / segregation, unresolved manifest references, cockpit sync host, rejected-action retention, and loading the server manifest in the cockpit.
   - New `drivers.hazmat_endorsed` and `shipments.hazard_class` columns, added to existing databases by the startup migration; the demo driver login is linked to its driver record in the seed script.
5. **Verification & Testing**:
   - **Full Backend Pytest Suite**: **187 / 187 passed**.
   - **Frontend**: `tsc` 0 errors, production build clean; driver *My stops* and *Map* views checked in the browser.

---

### Week 11: Route Explainer vs. Structured Action Proposals & Diff View (Nov 16 – Nov 20, 2026) — COMPLETED ✅ (early, Nov 15)
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: Turning the Optimization Agent's re-route proposals into decision cards in the AI Copilot drawer: what changes, what it costs, and one-click accept / reject (US-005 & US-006).

#### Track B (Abhayraj Jaiswal):
1. **Proposal Service (`backend/app/services/copilot/proposal_service.py`)**:
   - Runs on top of Track A's Optimization Agent; never re-plans itself, so every number comes from the solver and ETA engine.
   - Per-vehicle route diff: each stop marked `SAME`, `MOVED`, `ADDED`, `REMOVED` or `COMPLETED`, with its position and ETA on both sides, where a removed stop goes and where an added stop comes from. For delays, each stop also carries its originally planned ETA.
   - Vehicle status: `OUT_OF_SERVICE`, `CHANGED`, `NEW_VEHICLE` (spare), `RESEQUENCED`, `UNCHANGED`; changed vehicles listed first.
   - Impact summary per vehicle and in total: km, driving minutes, operating cost (fuel by vehicle class + driver time, the same ₹95/L and ₹250/h assumptions as Reports) and minutes late. "Current" means what happens if the dispatcher rejects, including the reported delay.
   - Thread-safe, bounded in-memory registry; each proposal can be decided once.
2. **REST API (`backend/app/api/v1/copilot.py`)**:
   - `POST /api/v1/copilot/proposals`: same request contract as `/routes/disruption`; returns the card (201). Vague messages get a 422 with guidance.
   - `GET /api/v1/copilot/proposals/{id}` and `POST /api/v1/copilot/proposals/{id}/decision` (`ACCEPT` / `REJECT`, optional note); a second decision returns 409; each decision is written to the audit log as `COPILOT_OVERRIDE` with before/after routes. ADMIN, FLEET_MANAGER and DISPATCHER only.
3. **Proposal Cards in the Copilot Drawer (`ProposalCard.tsx`, `CopilotSlidingDrawer.tsx`, `lib/proposalsApi.ts`)**:
   - When the Router Agent sees a breakdown, delay or re-route request, the drawer builds the request from the live plan (vehicles on the road at the named vehicle's hub, in their current order) and shows the card under the reply.
   - Impact table (current → proposed → change, green when better), side-by-side route diff with colour-coded additions, removals and moves, an "unassigned" warning, and Accept / Reject buttons.
   - Accepting re-assigns and re-sequences shipments (and puts a broken-down vehicle into maintenance), so Live Tracking follows the new plan immediately.
   - Quick-prompt chips now include a breakdown and a delay for a vehicle that is actually on the road.
4. **Router Agent fix**: "broke down", "accident", "crashed", "out of service" and "won't start" now classify as `VEHICLE_BREAKDOWN` (they previously fell through to `GENERAL_INQUIRY`, so the drawer never offered a proposal).
5. **Tests**: `backend/tests/test_action_proposals.py` (8): breakdown and delay diffs, impact totals and cost model, create → accept → audit, reject / 404 / 409 / role checks, router phrasing.

---

### Week 12: SLA Alerts vs. Executive KPI Analytics Dashboard (Nov 23 – Nov 27, 2026) — COMPLETED ✅ (early, Nov 15)
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: An executive view of delivery performance, cost and driver efficiency that stays current as trips progress (US-007 & US-008).

#### Track B (Abhayraj Jaiswal):
1. **Executive Analytics Service (`backend/app/services/executive_analytics.py`)**:
   - Reuses Track A's metrics engine and simulated dispatch history, so the executive view, Reports and the CSV/PDF exports always agree.
   - KPI cards (on-time %, OTIF %, deliveries, total cost, cost per delivery, fleet utilisation, total km, failed %) with the change against the previous period of the same length, and whether up is good.
   - Daily volume by outcome (on time / late / failed, every day in the range), SLA compliance by hour of arrival, and a driver efficiency table (on-time %, stops per driving hour, km per stop, cost per delivery, load used) ranked by on-time rate.
2. **REST API (`backend/app/api/v1/analytics.py`, `backend/app/schemas/analytics.py`)**:
   - `GET /api/v1/analytics/executive?date_from&date_to&hub&vehicle_type`: default last 30 days ending yesterday, max 90 days (422 otherwise). Includes a live snapshot of shipment and vehicle states from the database. ADMIN and FLEET_MANAGER only.
3. **Executive KPIs Page (`frontend/src/components/analytics/ExecutiveDashboard.tsx`, `lib/analyticsApi.ts`)**:
   - New *Insights → Executive KPIs* page for administrators and fleet managers.
   - One filter row: last 7 / 30 / 90 days or a custom range, hub, vehicle type.
   - Hero on-time delivery rate (with failed deliveries), six KPI tiles with coloured change vs the previous period.
   - Stacked daily-volume chart and SLA-by-hour chart: hover tooltips, keyboard focus, a Chart / Table toggle on each, and a colour palette checked for colour-blind safety.
   - Driver efficiency table with an on-time meter per driver.
   - Real-time: the "Right now" strip reads the live plan and changes with every trip event; the charts refetch on trip events (debounced) and every minute, keeping the previous render visible while loading.
4. **Tests**: `backend/tests/test_executive_analytics.py` (5): date-range rules, KPIs vs the metrics engine and previous period, breakdowns adding up, filters, endpoint roles and validation.
5. **Verification**: **200 / 200 backend tests passing**; frontend `tsc` 0 errors and production build clean; proposal accept flow and the dashboard (filters, tooltips, table views, tablet layout) checked in the browser against the running backend.

---

### Weeks 13–16 (Track B): Analytics Filters, Security Audit, Stress Tests & Release (Nov 30 – Dec 25, 2026) — COMPLETED ✅ (early, Nov 20)
- **Status**: `COMPLETED` ✅ (Track B; Track A is covered in the Weeks 7–16 entry above)
- **Focus Area**: Finish the executive analytics, harden the API for a real deployment, prove the copilot holds its latency target under load, and ship the whole platform as one `docker compose up`.

#### Track B (Abhayraj Jaiswal):
1. **Week 13: Multi-dimensional analytics filtering (US-008)**
   - Executive KPIs gain driver and priority filters (with date range, hub, vehicle type). A priority filter narrows stop-level figures; the page says that distance and cost still cover whole trips.
   - Delivery density heatmap: attempts per ~2 km square on a Leaflet map with the validated sequential palette, hover for on-time %, table view. It opens on the busiest hub, because at network zoom a 2 km square is a few pixels.
   - Every view downloads as CSV, and *PDF summary* prints KPIs with change, weekly volume, weakest hours and driver ranking, all for the filters on screen.
2. **Week 14: Security audit and hardening** (`documentation/SECURITY_AUDIT.md`)
   - Found and fixed: anyone could register as ADMIN; fleet create / edit / delete had no authentication; fleet changes were not audited; demo accounts with a published password could be created on any deployment; CORS trusted every `*.vercel.app` site; anonymous callers could trigger paid LLM planning.
   - Added per-client rate limits, security headers and CSP, a 10 MB body limit, input sanitisation at the schema boundary, and spreadsheet-safe exports.
   - Audit compliance report (sequence, snapshot and coverage checks) with CSV / PDF export and a pass / fail panel on the Audit Log page.
   - Copilot telemetry: latency per agent node and LLM token usage per request, summarised at `GET /copilot/telemetry`.
3. **Week 15: Stress tests, regression and frontend performance** (`documentation/PERFORMANCE.md`)
   - `scripts/benchmark_copilot.py`: worst p95 15.9 ms across every intent, proposals and 50 concurrent dispatchers (target < 3 s), guarded in CI.
   - `test_e2e_regression.py`: one operating day through the public API, US-001 to US-008. It surfaced the missing fleet audit entries above.
   - Sections are lazy-loaded (entry script 662 → 340 kB); the sidebar becomes a drawer on tablets and phones; the Command Center stacks on phones; the page finally has a real title and `lang`.
   - Fixed: the Dispatcher role signed in with an email the seed never creates, so it had no backend token.
4. **Week 16: Frontend container, CI and documentation**
   - `frontend/Dockerfile` + `nginx.conf`: unprivileged Nginx serving the build and proxying `/api` and `/docs`, so the browser uses one origin. Compose now runs db + backend + frontend; the backend port is bound to localhost.
   - `.github/workflows/ci.yml`: tests and benchmark, frontend type-check and build, Docker build and smoke test.
   - `documentation/`: User Manual, API Reference generated from OpenAPI (roles per endpoint), Security Audit, Performance. README updated with deployment and request-flow diagrams.
5. **Verification**: **236 / 236 backend tests passing**; frontend `tsc` 0 errors and production build clean; dashboard filters, heatmap, exports, audit compliance panel and the phone layout checked in the browser against the running backend. `docker compose config` validates; the images were not built locally (Docker daemon not running), so the CI Docker job is their first build.

