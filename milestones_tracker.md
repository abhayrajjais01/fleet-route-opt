# Master Milestone Tracker: AI Fleet Route Optimizer (50-50 Plan)

**Team & Balanced 50-50 Full-Stack & GenAI Tracks**:
- **Track A Lead**: **Manthan Nimodiya** (*RAG Vector Store & Embeddings, VRPTW Solver, Leaflet Map, Optimization Agent, Resequencing, RAG Compliance UI*)
- **Track B Lead**: **Abhayraj Jaiswal** (*LangGraph Multi-Agent StateGraph, Router & Policy Agents, In-Transit FSM, RBAC Auth, Shipments & Audit Log, Executive Dashboard*)

---

## Overall Progress Summary

| Metric | Status |
| :--- | :--- |
| **Overall Roadmap Progress** | **18.75% Completed** (Weeks 1 & 2 Done, Week 3 Active) |
| **Current Active Month** | **Month 1: Foundation, Governance, Assets & Shipment Ingestion** |
| **Current Active Week** | **Week 3: In Progress (Active: Sep 21 – Sep 25, 2026)** |
| **Next Immediate Milestone** | **Week 4: Batch Ingestion & RAG Inspector Portal (Sep 28 – Oct 2, 2026)** |

```
Overall Progress: [████░░░░░░░░░░░░░░░░] 18.75% (Weeks 1 & 2 Done, Week 3 Active)
Month 1 Progress: [██████████████░░░░░░] 65.0% (Weeks 1 & 2 Done, Week 3 In Progress)
Month 2 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
Month 3 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
Month 4 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
```

---

## 16-Week Master Schedule with 50-50 Balanced Tracks

| Month | Week | Milestone Title | Track A: Manthan Nimodiya (RAG & Solver) | Track B: Abhayraj Jaiswal (Agents & Platform) | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Month 1** | **Week 1** | Foundations & Shell | Backend Engine & DB Setup | Security, RBAC & Auth UI Shell | `COMPLETED` ✅ |
| | **Week 2** | Assets & Authentication | Fleet Asset Backend Models & APIs | Full-Stack RBAC Auth & Route Guards | `COMPLETED` ✅ |
| | **Week 3** | RAG Store & Shipments | RAG Knowledge Base & Vector Store | Shipment Ingestion & Audit Logging | `IN PROGRESS` ⏳ |
| | **Week 4** | Compliance UI & Ingestion | RAG Compliance Inspector Search UI | Batch Order Uploader & Regression Tests| `PLANNED` |
| **Month 2** | **Week 5** | Spatial Map & LangGraph | Haversine Matrix & Leaflet Map Shell| LangGraph StateGraph & Router Agent| `PLANNED` |
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
  - [x] Automated Auth/RBAC test suite (4/4 passed)

#### Week 2: Fleet Assets Backend & Full-Stack Auth (US-001 & US-002)
- **Status**: `COMPLETED` ✅
- **Manthan Nimodiya (Track A)**:
  - [x] Models: `Vehicle` (payload capacity, volume, fuel efficiency), `Driver` (shifts, licenses), `Hub` (lat/lng, address)
  - [x] RESTful CRUD APIs with validation: `/api/v1/fleet/vehicles`, `drivers`, `hubs`, `overview`
  - [x] Relational integrity tests, check constraints, and 100% passing test suite (11/11 tests passed)
- **Abhayraj Jaiswal (Track B)**:
  - [x] Complete JWT auth endpoints: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/me`
  - [x] Role-based route guards (Driver vs. Dispatcher vs. Fleet Manager vs. Admin views)
  - [x] Fleet management table UI with search, filter, and asset status badges
- **Week 2 Production Hardening Enhancements (Joint)**:
  - [x] Enterprise command center telemetry redesign with active metrics cards
  - [x] Automated database seeding script (`backend/scripts/seed_demo_data.py`) with 4 roles, 3 hubs, 4 vehicles, and 5 drivers
  - [x] Production cloud deployments: FastAPI backend on Render with PostgreSQL, Vite + React 19 frontend on Vercel with SPA routing

#### Week 3: RAG Knowledge Base & Vector Store vs. Shipments & Audit (US-006 & US-008)
- **Status**: `IN PROGRESS` ⏳ (Active: Sep 21 – Sep 25, 2026)
- **Manthan Nimodiya (Track A: RAG Lead)**:
  - [ ] Curate and chunk enterprise logistics SOPs, Hazmat ADR/DOT rules, driver rest-break mandates, and WikiQA samples
  - [ ] Vector embedding index with cosine similarity search (`backend/app/services/rag/vector_store.py`)
  - [ ] Semantic search retrieval service with category filtering (Hazmat, Driver Rest, Cold Chain)
  - [ ] Vector store unit test suite and retrieval benchmark tests (`backend/tests/test_rag.py`)
- **Abhayraj Jaiswal (Track B: Operations & Audit Lead)**:
  - [ ] `Shipment` database model (`backend/app/models/shipment.py`): coordinates, weight, volume, delivery time windows `[open, close]`, priority, status
  - [ ] `AuditLog` database model & automated state-change interceptor (`backend/app/models/audit.py`)
  - [ ] Pydantic validation schemas (`backend/app/schemas/shipment.py`, `backend/app/schemas/audit.py`)
  - [ ] RESTful Shipment CRUD API (`/api/v1/shipments`) & Audit query API (`/api/v1/audit`)
  - [ ] Frontend Shipment Management view & Audit Trail explorer UI
  - [ ] Automated test suite: `backend/tests/test_shipments_audit.py`
