# Enterprise AI Fleet Route Optimizer: Complete Project Guide & Work Split

**Project**: Enterprise AI Fleet Route Optimizer  
**Timeline**: 4 Months (16 Weeks)  
**Engineering Split**: **True 50-50 Full-Stack & GenAI Division**  
**Engineers**:
- **Abhayraj Jaiswal (Track B Lead)**: Multi-Agent Orchestration, Governance, Platform & Operations
- **Manthan Nimodiya (Track A Lead)**: RAG Systems, Optimization Algorithms & Autonomous Routing

---

## 1. What is This Project in Plain English?

Modern supply chains and parcel couriers face a huge everyday challenge: **delivering hundreds of customer packages on time while dealing with traffic, vehicle breakdowns, driver fatigue regulations, and strict customer delivery windows.**

Traditional logistics software relies solely on old, rigid algorithms that crash or require manual intervention the moment something goes wrong (e.g., a truck breaks down or a driver gets stuck in traffic). On the other hand, purely AI-based chatbots often hallucinate and cannot do the precise mathematical routing needed to fit packages into trucks without exceeding weight limits.

### Our Solution
The **Enterprise AI Fleet Route Optimizer** bridges this gap by combining **two powerful worlds**:
1. **Deterministic Mathematics (DSA / VRPTW)**: Fast, mathematically guaranteed algorithms that calculate the shortest, cheapest routes while respecting vehicle weight limits and customer time windows.
2. **Generative Multi-Agent AI (LangGraph & RAG)**: An intelligent dispatch assistant that monitors live trips, understands natural language disruption reports, consults verified logistics SOPs and Hazmat compliance laws without hallucination, and proposes structured re-routing solutions with human-in-the-loop approval.

---

## 2. High-Level Architecture & End-to-End Workflow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AI FLEET ROUTE OPTIMIZER WORKFLOW                               │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  1. INGESTION & ASSETS (Weeks 1-3)                                                     │
│     [Distribution Hubs] + [Vehicles & Drivers] + [Customer Shipments]                  │
│                            │                                                           │
│                            ▼                                                           │
│  2. SPATIAL & ROUTE SOLVER (Weeks 5-8)                                                 │
│     Haversine Distance Matrix ➔ Clarke-Wright Savings + 2-Opt Local Search (VRPTW)      │
│     Outcome: Optimized color-coded route polylines plotted on Leaflet map canvas       │
│                            │                                                           │
│                            ▼                                                           │
│  3. DISPATCH COCKPIT & COPILOT (Weeks 9-12)                                            │
│     Dispatcher reviews route manifest. AI Copilot (LangGraph StateGraph) checks        │
│     driver rest break laws and Hazmat regulations via RAG Vector Store (WikiQA / SOPs) │
│                            │                                                           │
│                            ▼                                                           │
│  4. IN-TRANSIT TELEMETRY & EXECUTION (Weeks 6, 9, 10)                                  │
│     Mobile Driver View: Driver marks stops as ARRIVED ➔ DELIVERED ➔ COMPLETED          │
│     In-Transit FSM tracks real-time progress. If a delay occurs:                       │
│     AI Copilot dynamically recalculates downstream ETAs and proposes re-routes         │
│                            │                                                           │
│                            ▼                                                           │
│  5. GOVERNANCE & ANALYTICS (Weeks 3, 12-14)                                            │
│     Every single state change is recorded in an Immutable Audit Log.                   │
│     Executive KPI Dashboard displays On-Time In-Full (OTIF) % & Fleet Utilization      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Complete Summary of All Work Done Till Now (Weeks 1 to 4 — Month 1 100% COMPLETE)

Across the first 4 weeks (Month 1), the team established a rock-solid foundation, deployed the application live to the cloud, seeded demo data, built shipment ingestion & compliance systems, and achieved **100% passing automated regression tests (49/49 passed)**.

### Platform Milestones Achieved:
1. **Core Backend & Dual Engine**:
   - Modular FastAPI architecture with structured logging.
   - Dual-engine SQLAlchemy 2.0 ORM: zero-config SQLite for local offline development + PostgreSQL for production.
   - System health and readiness probes (`/api/v1/health`, `/api/v1/ready`).
2. **Security, Auth & RBAC**:
   - `bcrypt` password hashing with PBKDF2 standard.
   - Signed JWT token issuance and role-based FastAPI route guards (`require_roles`).
   - 4 distinct operator privilege tiers: `ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`.
3. **Fleet Asset Management (US-001 & US-002)**:
   - Complete relational database models for `Hub` (origin depots), `Vehicle` (cargo payload & volume), and `Driver` (DOT driving shifts & licenses).
   - RESTful CRUD APIs with aggregated fleet overview metrics (`/api/v1/fleet/overview`).
   - Interactive Asset Management Workspace with real-time status badges and tabbed tables.
4. **Shipment Ingestion & Governance Audit Trail (US-002 & US-008)**:
   - Full `Shipment` database models and RESTful APIs (`/api/v1/shipments`) with delivery time window enforcement.
   - Append-only immutable `AuditLog` system (`/api/v1/audit`) capturing actor context, timestamps, and serialized JSON state diffs for forensic auditability.
5. **High-Throughput Batch Order Ingestion & Cluster Preview (Week 4)**:
   - Multi-format ingestion engine parsing CSV uploads and JSON payloads with row-level validation.
   - Downloadable RFC 4180 CSV template generator (`GET /api/v1/shipments/batch/template`).
   - Frontend drag-and-drop batch upload modal with real-time **Delivery Cluster Preview** (total weight, volume, priority breakdown).
   - Batch audit logging recording imported shipments and forensic metadata.
6. **Automated Seeder & Live Cloud Hosting**:
   - Automated seeder script (`backend/scripts/seed_demo_data.py`) populating 4 user accounts, 3 distribution hubs, 4 vehicles, 5 drivers, 5 shipments, and audit logs.
   - Production FastAPI backend deployed on **Render** (PostgreSQL).
   - Production frontend deployed on **Vercel** with Vite 8, React 19, and SPA rewrites (`vercel.json`).
7. **Regression Testing Verification**:
   - **24/24 tests passing cleanly (100%)** across health probes, authentication, fleet CRUD, shipment audit trails, and batch ingestion.

---

## 4. Work Done Separately: Detailed Breakdown

To ensure both engineers have an equal, balanced portfolio for university evaluation and technical vivas, the project is strictly divided 50-50 across Full-Stack and GenAI engineering.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI FLEET ROUTE OPTIMIZER (50-50 SPLIT)                 │
├──────────────────────────────────────┬──────────────────────────────────────┤
│     TRACK A: MANTHAN NIMODIYA        │     TRACK B: ABHAYRAJ JAISWAL        │
│     (RAG Systems, Solver & Routing)  │     (Multi-Agent, FSM & Analytics)   │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 🤖 GENAI & RAG (50%):                │ 🤖 GENAI & MULTI-AGENT (50%):        │
│ • Vector DB & Embedding Pipeline     │ • LangGraph StateGraph Architecture  │
│ • RAG Knowledge Base (SOPs, Hazmat,  │ • Router Agent (Intent Classifier)   │
│   Driver Rest Breaks, WikiQA)        │ • Policy & Compliance Agent          │
│ • Zero-Hallucination Guardrails &    │   (Evaluates labor laws & Hazmat)    │
│   Confidence Scoring Engine          │ • AI Copilot Sliding Drawer UI &     │
│ • LangGraph Optimization Agent       │   Execution Trace Reasoning View     │
│   (LLM tool-calling for disruptions) │ • Structured Action Proposals & Diff │
│                                      │                                      │
│ 🛠️ FULL-STACK & ALGORITHMS (50%):    │ 🛠️ FULL-STACK & PLATFORM (50%):      │
│ • Deterministic VRPTW Solver (DSA)   │ • RBAC Auth Engine & JWT Security    │
│ • Haversine Distance Matrix Engine   │ • In-Transit FSM & Driver Telemetry  │
│ • Interactive Leaflet Map Polylines  │ • Mobile Driver View & Action API    │
│ • Drag-and-Drop Route Resequencing   │ • Executive KPI Analytics Dashboard  │
│ • Compliance Inspector Search UI     │ • Immutable Audit Logging System     │
│ • Fleet Models, Schemas & CRUD APIs  │ • DevOps, Containerization & CI/CD   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

### A. Work Done by ABHAYRAJ JAISWAL (Track B Lead)

Abhayraj owns the **Security Architecture, Governance & Audit Trail, Shipment Ingestion & Batch Pipeline, and the upcoming Multi-Agent Orchestration Engine (LangGraph)**.

#### 1. Full-Stack RBAC Authentication & Security Engine (`Week 1`)
- **Backend**: Implemented `backend/app/core/security.py` using `bcrypt` password hashing and signed JWT token issuance (`pyjwt`).
- **Authorization Middleware**: Created FastAPI security dependency `require_roles([UserRole.ADMIN, ...])` enforcing access control across API routes.
- **Frontend Auth & Portal**: Created `frontend/src/lib/authContext.tsx` with role switching, token storage, and responsive login interface with quick 1-click role switcher for viva demonstrations.
- **Testing**: Built `backend/tests/test_auth_rbac.py` verifying token generation, password verification, and unauthorized route rejections (5/5 passed).

#### 2. Fleet Management Workspace UI & Telemetry Redesign (`Week 2`)
- **Asset Directory UI**: Created interactive tabbed tables for Vehicles, Drivers, and Distribution Hubs.
- **Interactive Modals**: Built `VehicleModal.tsx`, `DriverModal.tsx`, and `HubModal.tsx` with client-side form validation and status badges.
- **Enterprise Command Center**: Redesigned UI with active telemetry KPI cards showing live fleet metrics, network status, and operational alerts.
- **Vercel Cloud Deployment**: Fixed and deployed the Vite 8 + React 19 SPA build with `frontend/vercel.json` routing configuration.

#### 3. Shipment Ingestion Domain & Validation (`Week 3`)
- **ORM Model (`backend/app/models/shipment.py`)**: Built `Shipment` database entity enforcing delivery time windows (`time_window_start`, `time_window_end`), cargo weight (kg), spatial volume (m3), priority rankings (`LOW`, `STANDARD`, `HIGH`, `EXPRESS`), and lifecycle states (`UNASSIGNED` to `DELIVERED`).
- **SQL Constraints**: Enforced geographic coordinate validity (-90 to +90 lat, -180 to +180 lng) and strictly positive cargo weights/volumes.
- **Pydantic Validation (`backend/app/schemas/shipment.py`)**: Built validation schemas ensuring window closing times never precede opening times.
- **Shipments REST API (`backend/app/api/v1/shipments.py`)**: Implemented `GET`, `POST`, `PATCH /status`, and `DELETE` with role protection and hub foreign key checks.

#### 4. Immutable Compliance Audit Trail System (`Week 3`)
- **ORM Model (`backend/app/models/audit.py`)**: Built append-only `AuditLog` entity capturing actor ID, actor role, timestamp, action type (`ASSET_CREATED`, `STATUS_CHANGE`, `ROUTE_MODIFIED`, `COPILOT_OVERRIDE`), and serialized before/after JSON states.
- **Audit Helper Service (`backend/app/services/audit_service.py`)**: Built automated `record_audit_event()` utility ensuring all asset creations and state transitions are logged.
- **Audit REST API (`backend/app/api/v1/audit.py`)**: Built paginated query endpoint with filters for entity type, action type, and actor role.
- **Testing (`backend/tests/test_shipments_audit.py`)**: Built 5 comprehensive tests verifying coordinate validation, role access guards, and automatic audit creation on shipment status updates (5/5 passed).

#### 5. High-Throughput Batch Order Ingestion & Regression Testing (`Week 4`)
- **Batch Ingestion Engine (`backend/app/services/batch_ingestion.py`)**: Multi-format parser supporting CSV file uploads and JSON arrays with header normalization, coordinate boundary checks, delivery window verification, and partial-failure row diagnostics.
- **Downloadable CSV Template (`backend/app/api/v1/shipments.py`)**: RFC 4180 standard sample generator (`GET /api/v1/shipments/batch/template`) with realistic multi-city delivery data.
- **Batch REST Endpoints**: `POST /api/v1/shipments/batch/upload` and `POST /api/v1/shipments/batch` guarded by role authorizations.
- **Frontend Batch Modal & Cluster Preview (`frontend/src/App.tsx`)**: Drag-and-drop file uploader with live client-side parsing, dynamic metrics (payload weight, volume, express count), and 1-click template download.
- **Month 1 Full Regression Test Suite (`backend/tests/test_batch_ingestion.py`)**: 7 comprehensive tests covering CSV parsing, JSON ingestion, partial failure diagnostics, duplicate detection, and security guards. **Total suite: 49/49 tests passed (100%)**.

---

### B. Work Done by MANTHAN NIMODIYA (Track A Lead)

Manthan owns the **Backend Scaffolding, Fleet Database Layer, VRPTW Mathematical Solver, and the RAG Vector Knowledge Base**.

#### 1. Backend Core & Database Scaffolding (`Week 1`)
- **FastAPI Core Setup**: Initialized modular backend directory structure, configuration loader (`pydantic-settings`), and structured application logging.
- **Dual Database Layer**: Configured SQLAlchemy 2.0 engine supporting seamless SQLite zero-config development and PostgreSQL production connectivity.
- **Base Mixin**: Created `TimestampMixin` (`backend/app/models/base.py`) providing automatic UTC timestamps (`created_at`, `updated_at`).
- **Health Probes**: Built connection check endpoints (`/api/v1/health` and `/api/v1/ready`) with database ping checks.

#### 2. Fleet Asset Models & RESTful CRUD APIs (`Week 2`)
- **Database Models (`backend/app/models/fleet.py`)**:
  - `Hub`: Logistics facilities with spatial coordinates and operating hours.
  - `Vehicle`: Physical transport units with payload (kg), volumetric capacity (m3), fuel efficiency (km/L), and availability states.
  - `Driver`: Certified commercial operators with license classes, duty states, and daily DOT driving hour constraints (<= 14 hrs/day).
- **RESTful Endpoints (`backend/app/api/v1/fleet.py`)**:
  - Implemented CRUD endpoints for `/api/v1/fleet/vehicles`, `drivers`, and `hubs`.
  - Implemented `/api/v1/fleet/overview` returning real-time aggregated fleet capacity and active vehicle ratios.
- **Testing**: Built `backend/tests/test_fleet_crud.py` verifying relational integrity and check constraints (4/4 passed).

#### 3. Database Seeder Script (`backend/scripts/seed_demo_data.py`)
- Created automated database seeding utility populating 4 operator accounts, 3 distribution hubs, 4 vehicles, and 5 licensed drivers for rapid viva testing.

#### 4. Interactive Workflow Canvas & Node Graph (`Week 2/3`)
- Built `frontend/src/App.tsx` featuring an interactive node canvas visualizer, live backend probing, and role-based permissions switcher.

#### 5. RAG Vector Knowledge Base (`Week 3`)
- **Curated corpus (`backend/app/services/rag/corpus/`)**: 8 versioned SOPs across Hazmat, Driver Rest, Cold Chain, Vehicle Safety and Operations, citing 49 CFR, ADR, CMVR, the Motor Transport Workers Act 1961, EU 561/2006 and FMCSA.
- **Pipeline**: section-aware chunking (41 citable chunks) → TF-IDF unigram + bigram embeddings → in-memory cosine-similarity vector store with category filters.
- **API Endpoints**: `/api/v1/rag/search`, `/categories`, `/documents`, `/documents/{id}`, `/stats`, `/benchmark`.
- **WikiQA-style benchmark**: Recall@3 1.00, MRR 0.98, p95 latency < 1 ms; off-topic questions score 0 (basis for the Week 7 guardrail threshold). `backend/tests/test_rag.py`: 22 tests.

#### 6. RAG Compliance Inspector UI (`Week 4`)
- `frontend/src/components/compliance/ComplianceInspector.tsx`: live semantic search, category filters, citation cards with confidence meters and highlighted terms, SOP library and document viewer that jumps to the cited section.
- Fixed the header backend health probe (`/api/v1/health`) and added a `VITE_API_URL` override for deployed builds.

---

## 5. What Comes Next in the Roadmap?

### Current Status:
- **Month 1 (Weeks 1, 2, 3, 4)**: **100% COMPLETED** ✅
- **Month 2 Week 5**: **COMPLETED** ✅ (31.2% of overall 16-week roadmap delivered).
  - **Manthan (Track A)**: Haversine Distance Matrix Engine & Leaflet Map Shell (`feat/manthan-week5`).
  - **Abhayraj (Track B)**: LangGraph Multi-Agent StateGraph Architecture, Router Agent (Intent Classifier & Entity Extractor), RAG Policy Delegation, and AI Copilot Command Center UI (`feat/abhayraj-week5`).

### Upcoming in Month 2 (Optimization & Multi-Agent AI):
- **Week 5 (Oct 5 – Oct 9, 2026)**: **COMPLETED** ✅
  - **Manthan (Track A)**: Haversine Distance Matrix & Leaflet Map Shell. *(Delivered: `/api/v1/routes/distance-matrix` with detour-corrected road km & drive times, LRU cache, Leaflet Network Map with custom SVG hub/stop markers, and 20 automated tests.)*
  - **Abhayraj (Track B)**: LangGraph Multi-Agent StateGraph Architecture & Router Agent Intent Classifier. *(Delivered: Router Agent with 6 logistics intents, structured entity extraction, RAG policy citation delegation, CopilotCommandCenter UI, `/api/v1/copilot/*` endpoints, and 16 automated tests.)*
- **Week 6 (Oct 12 – Oct 16, 2026)**:
  - **Manthan (Track A)**: Deterministic VRPTW Solver Core with Clarke-Wright Savings algorithm.
  - **Abhayraj (Track B)**: In-Transit Finite State Machine (FSM) & Real-time Driver Telemetry tracking.
- **Week 7 (Oct 19 – Oct 23, 2026)**:
  - **Manthan (Track A)**: Interactive Route Polylines visualizer & Split Manifest view on Leaflet canvas.
  - **Abhayraj (Track B)**: Zero-Hallucination Guardrails & RAG Similarity confidence scoring.
- **Week 8 (Oct 26 – Oct 30, 2026)**:
  - **Manthan (Track A)**: Drag-and-Drop Route Resequencing UI and recalculation API.
  - **Abhayraj (Track B)**: Policy & Compliance Agent integrating labor laws and Hazmat verification.

---

## 6. Key Viva & Presentation Talking Points

When presenting this project to professors, evaluators, or industry panels:
1. **Explain the Hybrid Architecture**: "We do not rely solely on an LLM for routing because language models cannot guarantee capacity constraints. Instead, we use deterministic graph algorithms (VRPTW) for mathematical guarantees and multi-agent GenAI (LangGraph + RAG) for natural language disruption handling and regulatory compliance."
2. **Highlight the 50-50 Split**: "Abhayraj built the security engine, shipment & batch ingestion pipeline, and immutable governance audit trail, and leads the LangGraph multi-agent orchestration. Manthan built the fleet asset engine, spatial models, and leads the deterministic VRPTW solver and RAG vector store."
3. **Showcase Enterprise Engineering Standards**: Point to **24/24 automated passing tests (100%)**, dual SQLite/PostgreSQL database engines, live cloud hosting on Render and Vercel, high-throughput CSV/JSON batch processing, and immutable before/after state diff auditing.

