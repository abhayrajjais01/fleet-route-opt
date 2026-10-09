# Master Milestone Tracker: AI Fleet Route Optimizer (50-50 Plan)

**Team & Balanced 50-50 Full-Stack & GenAI Tracks**:
- **Track A Lead**: **Manthan Nimodiya** (*RAG Vector Store & Embeddings, VRPTW Solver, Leaflet Map, Optimization Agent, Resequencing, RAG Compliance UI*)
- **Track B Lead**: **Abhayraj Jaiswal** (*LangGraph Multi-Agent StateGraph, Router & Policy Agents, In-Transit FSM, RBAC Auth, Shipments & Batch Ingestion, Executive Dashboard*)

---

## Overall Progress Summary

| Metric | Status |
| :--- | :--- |
| **Overall Roadmap Progress** | **31.2% Completed** (Weeks 1–4 Done, Week 5 Track A & B Delivered) |
| **Current Active Month** | **Month 2: Optimization & Map vs. LangGraph Router & FSM** |
| **Current Active Week** | **Week 5: Spatial Graph & LangGraph Router (Oct 5 – Oct 9, 2026 — COMPLETED ✅)** |
| **Next Immediate Milestone** | **Month 2, Week 6: VRPTW Solver Core & In-Transit FSM (Oct 12 – Oct 16, 2026)** |

```
Overall Progress: [██████░░░░░░░░░░░░░░] 31.2% (Weeks 1–4 Done, Week 5 Track A & B Delivered: 5 / 16 Weeks)
Month 1 Progress: [████████████████████] 100.0% (Weeks 1, 2, 3, and 4 COMPLETED)
Month 2 Progress: [█████░░░░░░░░░░░░░░░] 25.0% (Week 5 Delivered, Week 6 Starting Next)
Month 3 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
Month 4 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
```

---

## 16-Week Master Schedule with 50-50 Balanced Tracks

| Month | Week | Milestone Title | Track A: Manthan Nimodiya (RAG & Solver) | Track B: Abhayraj Jaiswal (Agents & Platform) | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Month 1** | **Week 1** | Foundations & Shell | Backend Engine & DB Setup | Security, RBAC & Auth UI Shell | `COMPLETED` ✅ |
| | **Week 2** | Assets & Authentication | Fleet Asset Backend Models & APIs | Full-Stack RBAC Auth & Route Guards | `COMPLETED` ✅ |
| | **Week 3** | RAG Store & Shipments | RAG Knowledge Base & Vector Store | Shipment Ingestion & Audit Logging | `COMPLETED` ✅ |
| | **Week 4** | Compliance UI & Ingestion | RAG Compliance Inspector Search UI | Batch Order Uploader & Regression Tests| `COMPLETED` ✅ |
| **Month 2** | **Week 5** | Spatial Map & LangGraph | Haversine Matrix & Leaflet Map Shell| LangGraph StateGraph & Router Agent| `COMPLETED` ✅ |
| | **Week 6** | VRPTW Solver & FSM | Deterministic VRPTW Solver Core | In-Transit FSM & Telemetry Tracking| `PLANNED` |
| | **Week 7** | Map Polylines & Guardrails | Route Visualizer & Split Manifest | RAG Similarity Guardrails & Scores | `PLANNED` |
| | **Week 8** | Resequencing & Policy Agent | Drag-and-Drop Resequencing UI/API | Policy & Compliance Agent + RAG Check| `PLANNED` |
| **Month 3** | **Week 9** | Optimization Agent & Driver | LangGraph Optimization Agent (Solver Tool)| Mobile Driver View & Actions | `PLANNED` |
| | **Week 10** | Downstream ETAs & Copilot UI| Downstream Dynamic Recalculation | Copilot Sliding Drawer & Traces | `PLANNED` |
| | **Week 11** | RAG Route Explainer & Proposals| RAG Route Explanations & Summaries | Interactive Proposal Cards & Diff | `PLANNED` |
| | **Week 12** | SLA Alerts & KPI Dashboard | SLA Breach Alerts & Recovery FSM | Executive KPI Analytics Dashboard UI| `PLANNED` |
| **Month 4** | **Week 13** | Operational KPIs & Filter | Operational Metrics Calc Engine | Multi-Dimensional Analytics Filter | `PLANNED` |
| | **Week 14** | Data Export & Pipeline Polish| CSV / PDF Audit Export Generator | Security Audit & Agent Benchmarks | `PLANNED` |
| | **Week 15** | Performance & Stress Testing| Solver & Vector Indexing Benchmark (<5s)| Multi-Agent Exception Handling (<3s)| `PLANNED` |
| | **Week 16** | Containerization & Release | Backend Docker & Postgres Service | Frontend Docker, Compose & Walkthru| `PLANNED` |

---

## Detailed Weekly Deliverables Verification

### Month 1: Foundation, Governance, Assets & Shipment Ingestion

#### Week 1: Scaffolding, Security & Application Shell
- **Status**: `COMPLETED` ✅
- **Manthan Nimodiya (Track A)**:
  - [x] FastAPI modular directory structure configuration
  - [x] SQLAlchemy 2.0 ORM engine with SQLite fallback and PostgreSQL readiness
  - [x] Health probe endpoints (`/api/v1/health` and `/api/v1/ready`)
  - [x] Automated test suite verifying health and readiness (3/3 passed)
- **Abhayraj Jaiswal (Track B)**:
  - [x] Password hashing with `bcrypt` & JWT signed token generator
  - [x] Role-based FastAPI dependency guards (`require_roles([...])`)
  - [x] Responsive login & registration UI with quick role-switcher and `AuthContext`
  - [x] Automated Auth/RBAC test suite (5/5 passed)

#### Week 2: Fleet Assets Backend & Full-Stack Auth (US-001 & US-002)
- **Status**: `COMPLETED` ✅
- **Manthan Nimodiya (Track A)**:
  - [x] Models: `Vehicle` (payload capacity, volume, fuel efficiency), `Driver` (shifts, licenses), `Hub` (lat/lng, address)
  - [x] RESTful CRUD APIs with validation: `/api/v1/fleet/vehicles`, `drivers`, `hubs`, `overview`
  - [x] Relational integrity tests, check constraints, and 100% passing test suite (4/4 passed)
- **Abhayraj Jaiswal (Track B)**:
  - [x] Complete JWT auth endpoints: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/me`
  - [x] Role-based route guards (Driver vs. Dispatcher vs. Fleet Manager vs. Admin views)
  - [x] Fleet management table UI with search, filter, and asset status badges
- **Week 2 Production Hardening Enhancements (Joint)**:
  - [x] Enterprise command center telemetry redesign with active metrics cards
  - [x] Automated database seeding script (`backend/scripts/seed_demo_data.py`) with 4 roles, 3 hubs, 4 vehicles, and 5 drivers
  - [x] Production cloud deployments: FastAPI backend on Render with PostgreSQL, Vite + React 19 frontend on Vercel with SPA routing

#### Week 3: RAG Knowledge Base vs. Shipments & Audit (US-006 & US-008)
- **Status**: `COMPLETED` ✅ (Sep 21 – Sep 25, 2026)
- **Manthan Nimodiya (Track A: RAG Lead)**:
  - [x] Curate and chunk enterprise logistics SOPs, Hazmat ADR/DOT rules, driver rest-break mandates, and WikiQA-style samples (8 SOPs, 5 categories, 41 section-level chunks in `backend/app/services/rag/corpus/`)
  - [x] Semantic search retrieval service with category filtering (Hazmat, Driver Rest, Cold Chain, Vehicle Safety, Operations) exposed at `/api/v1/rag/*`
  - [x] Vector store unit test suite and retrieval benchmark tests (`backend/tests/test_rag.py`: 22 tests; Recall@3 = 1.0, MRR = 0.98, p95 latency < 1 ms; 39/39 full suite passing)
- **Abhayraj Jaiswal (Track B: Operations & Audit Lead)**:
  - [x] `Shipment` database model (`backend/app/models/shipment.py`): coordinates, weight, volume, delivery time windows `[open, close]`, priority, status
  - [x] `AuditLog` database model & automated state-change interceptor (`backend/app/models/audit.py`, `audit_service.py`)
  - [x] Pydantic validation schemas (`backend/app/schemas/shipment.py`, `backend/app/schemas/audit.py`)
  - [x] RESTful Shipment CRUD API (`/api/v1/shipments`) & Audit query API (`/api/v1/audit`)
  - [x] Automated test suite: `backend/tests/test_shipments_audit.py` (5/5 passed)

#### Week 4: RAG Compliance Inspector Portal vs. Batch Ingestion (US-002, US-006, US-008)
- **Status**: `COMPLETED` ✅ (Sep 28 – Oct 2, 2026)
- **Manthan Nimodiya (Track A)**:
  - [x] Compliance & SOP Inspector page (`frontend/src/components/compliance/ComplianceInspector.tsx`) wired to the live `/api/v1/rag` API
  - [x] Real-time semantic query search bar with example queries and highlighted matching terms
  - [x] Multi-select category filters (Hazmat, Driver Rest, Cold Chain, Vehicle Safety, Operations)
  - [x] Source citation cards with doc id, § section, version and similarity confidence meter; SOP library and full-document viewer that jumps to the cited section
  - [x] "No policy found in the verified knowledge base" empty state and backend-offline banner
- **Abhayraj Jaiswal (Track B)**:
  - [x] High-throughput Batch Order Ingestion API (`POST /api/v1/shipments/batch/upload` & `POST /api/v1/shipments/batch`)
  - [x] RFC 4180 standard CSV template generator endpoint (`GET /api/v1/shipments/batch/template`)
  - [x] Multi-format CSV and JSON parser with row-level diagnostics, coordinate checks, finite number validation, and bulk insertion
  - [x] Automatic batch audit trail recording
  - [x] Frontend Drag-and-Drop Batch Upload modal with live Delivery Cluster Preview, template downloader, and API integration
  - [x] Month 1 Full Regression Test Suite (`backend/tests/test_batch_ingestion.py` — 10/10 passed, **49/49 Full Suite Passing**)
### Month 2: Optimization & Map vs. LangGraph Router & FSM

#### Week 5: Spatial Graph & LangGraph Multi-Agent Router (US-003, US-004, US-005)
- **Status**: `COMPLETED` ✅ (Oct 5 – Oct 9, 2026; Track A & Track B Delivered)
- **Manthan Nimodiya (Track A: RAG & Solver Lead)**:
  - [x] Haversine distance & travel duration engine with road detour (circuity) correction (`backend/app/services/optimizer/distance_matrix.py`)
  - [x] Vectorised multi-point distance matrix generator with LRU caching (200 × 200 matrix in ~4 ms, cached repeat in < 1 ms)
  - [x] `POST /api/v1/routes/distance-matrix` returning straight-line km, road km and vehicle-specific drive minutes
  - [x] Leaflet map integration with OpenStreetMap tiles, no API key (`frontend/src/components/map/LeafletMap.tsx`)
  - [x] Custom SVG markers for hubs and priority-coloured delivery waypoints with interactive popups (`markers.ts`)
  - [x] Network Map page: per-hub stop ranking by road distance & drive time, hub-to-hub matrix, vehicle-type selector
  - [x] `backend/tests/test_distance_matrix.py` (20 tests passed)
- **Abhayraj Jaiswal (Track B: Multi-Agent & Platform Lead)**:
  - [x] LangGraph `StateGraph` foundation with session state, immutable execution tracing, and dual execution engine (`backend/app/services/copilot/state_graph.py`)
  - [x] High-precision **Router Agent** (`backend/app/services/copilot/router_agent.py`) classifying natural language queries across 6 categories: `VEHICLE_BREAKDOWN`, `TRAFFIC_DELAY`, `POLICY_QUERY`, `REROUTE_REQUEST`, `GENERAL_INQUIRY`, `OFF_TOPIC`
  - [x] High-precision Entity Extraction: Vehicle IDs (`V-101`), Stop IDs (`Stop #4`), Delay durations (`45 mins`, `1.5 hours`), Corridors/Locations (`NH-48`, `Eastern Express`), Severity (`LOW` to `CRITICAL`), and Regulatory topics
  - [x] Zero-Dependency & Zero-Hallucination Deterministic Fallback Engine guaranteeing 100% offline testability (sub-millisecond execution, zero API keys required)
  - [x] Real-time RAG Knowledge Base delegation for `POLICY_QUERY` intent retrieving verified SOP citations and section excerpts from logistics manuals
  - [x] RESTful Copilot APIs: `POST /api/v1/copilot/query`, `GET /api/v1/copilot/intents`, `GET /api/v1/copilot/health` with full RBAC authentication
  - [x] Automated Router & StateGraph Test Suite (`backend/tests/test_copilot_router.py`: 16/16 passed, **92/92 combined test suite passing**)
  - [x] Frontend AI Copilot Command Center (`frontend/src/components/copilot/CopilotCommandCenter.tsx`) with real-time query bar, colored intent badges, confidence meter, entity chips, suggested action trigger, and interactive StateGraph multi-agent execution trace accordion
