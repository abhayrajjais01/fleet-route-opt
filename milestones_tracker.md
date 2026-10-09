# Master Milestone Tracker: AI Fleet Route Optimizer (50-50 Plan)

**Team & Balanced 50-50 Full-Stack & GenAI Tracks**:
- **Track A Lead**: **Manthan Nimodiya** (*RAG Vector Store & Embeddings, VRPTW Solver, Leaflet Map, Optimization Agent, Resequencing, RAG Compliance UI*)
- **Track B Lead**: **Abhayraj Jaiswal** (*LangGraph Multi-Agent StateGraph, Router & Policy Agents, In-Transit FSM, RBAC Auth, Shipments & Batch Ingestion, Executive Dashboard*)

---

## Overall Progress Summary

| Metric | Status |
| :--- | :--- |
| **Overall Roadmap Progress** | **25.0% Completed** (Month 1: Weeks 1, 2, 3, 4 Completed) |
| **Current Active Month** | **Month 1: Foundation, Governance, Assets & Shipment Ingestion (100% COMPLETE)** |
| **Current Active Week** | **Week 4: Completed (Ready for Month 2 Transition)** |
| **Next Immediate Milestone** | **Month 2, Week 5: Spatial Graph & LangGraph Router (Oct 5 – Oct 9, 2026)** |

```
Overall Progress: [█████░░░░░░░░░░░░░░░] 25.0% (Month 1 Completed: 4 / 16 Weeks Done)
Month 1 Progress: [████████████████████] 100.0% (Weeks 1, 2, 3, and 4 COMPLETED)
Month 2 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0% (Starting Next)
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
| **Month 2** | **Week 5** | Spatial Map & LangGraph | Haversine Matrix & Leaflet Map Shell| LangGraph StateGraph & Router Agent| `UPCOMING` |
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
