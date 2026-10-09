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
   - **Combined Test Suite: 99 / 99 automated backend tests passing (100% pass rate)**:
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
