# Weekly Work Log: AI Fleet Route Optimizer (50-50 Plan)

This document serves as our ongoing project journal. It tracks everything we build week-by-week, explained in clear, plain English, highlighting what was accomplished, why design decisions were made, what files were created, and how everything was tested.

---

## Table of Contents
- [Project Baseline & Setup](#project-baseline--setup)
- [Month 1: Foundation, Governance, Assets & Shipment Ingestion](#month-1-foundation-governance-assets--shipment-ingestion)
  - [Week 1: Scaffolding, Security & Application Shell (Completed)](#week-1-scaffolding-security--application-shell)
  - [Week 2: Fleet Assets & Full-Stack RBAC Auth (Completed)](#week-2-fleet-assets--full-stack-rbac-auth)
  - [Week 3: RAG Knowledge Base vs. Shipments & Audit (In Progress)](#week-3-rag-knowledge-base-vs-shipments--audit)
  - [Week 4: RAG Compliance Inspector UI vs. Batch Ingestion (Upcoming)](#week-4-rag-compliance-inspector-ui-vs-batch-ingestion)
- [Month 2: Optimization & Map vs. LangGraph Router & FSM (Weeks 5–8)](#month-2-optimization--map-vs-langgraph-router--fsm)
- [Month 3: AI Copilot Disruption Solver vs. Driver Mobile & Analytics (Weeks 9–12)](#month-3-ai-copilot-disruption-solver-vs-driver-mobile--analytics)
- [Month 4: Analytics, Hardening, Containerization & Release (Weeks 13–16)](#month-4-analytics-hardening-containerization--release)

---

## Project Baseline & Setup
- **Status**: `COMPLETED` ✅
- **Authors & Balanced 50-50 Roles**:
  - **Track A Lead**: **Manthan Nimodiya** — *RAG Vector Store & Embeddings, VRPTW Solver, Leaflet Map, Optimization Agent, Resequencing, RAG Compliance UI*
  - **Track B Lead**: **Abhayraj Jaiswal** — *LangGraph Multi-Agent StateGraph, Router & Policy Agents, In-Transit FSM, RBAC Auth, Shipments & Audit Log, Executive Dashboard*
- **Roadmap & Architecture Artifacts**:
  - `conflict_free_architecture_guide.md`
  - `team_work_split.md`
  - `milestones_tracker.md`
  - `implementation_plan_OJT`

---

## Month 1: Foundation, Governance, Assets & Shipment Ingestion

### Week 1: Scaffolding, Security & Application Shell (Sep 1 – Sep 5, 2026)
- **Status**: `COMPLETED` ✅
- **Focus Area**: Modular FastAPI Architecture, SQLAlchemy 2.0 Dual Engine, Bcrypt/JWT Security & Tactical UI Shell.

#### Detailed Accomplishments:
1. **FastAPI & Dual Database Layer (Track A: Manthan Nimodiya)**:
   - Initialized FastAPI backend structure with modular config (`pydantic-settings`).
   - Configured SQLAlchemy 2.0 engine with seamless SQLite zero-config development fallback and PostgreSQL production support.
   - Built connection probes and health check endpoints (`/api/v1/health` and `/api/v1/ready`).
   - Created `TimestampMixin` for automatic UTC-aware timestamp tracking across all database entities.
2. **Security & RBAC Engine (Track B: Abhayraj Jaiswal)**:
   - Implemented password hashing using `bcrypt` and signed JWT access token generator (`pyjwt`).
   - Created `User` database model with `UserRole` enums (`ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`).
   - Created security dependency `require_roles([...])` to enforce role guards on protected API routes.
3. **Frontend Shell & Contract Baseline**:
   - Built UI shell with TypeScript, dark tactical command center theme.
   - Created `frontend/src/lib/types.ts` defining all shared TypeScript data contracts.
   - Created `frontend/src/lib/authContext.tsx` with role switching and token storage.
   - Created login portal with 1-click role switcher for quick viva demonstration.
4. **Testing**:
   - Automated Pytest suite (`test_health.py`, `test_auth_rbac.py`) passing with 100% success.

---

### Week 2: Fleet Assets Backend & Full-Stack Workspace (Sep 7 – Sep 11, 2026)
- **Status**: `COMPLETED` ✅
- **Focus Area**: Fleet Asset Models (Hubs, Vehicles, Drivers), Relational Constraints, RESTful CRUD APIs & Fleet Management Workspace (US-002).

#### Detailed Accomplishments:
1. **Fleet Asset Models & Schema Design (Track A: Manthan Nimodiya)**:
   - Implemented `Hub` model for distribution depots with geocoordinates (latitude/longitude check constraints) and operating hours.
   - Implemented `Vehicle` model with payload capacity, cargo volume, fuel efficiency (km/l), and status enums (`AVAILABLE`, `IN_TRANSIT`, `MAINTENANCE`, `DECOMMISSIONED`).
   - Implemented `Driver` model with commercial license validation, max driving hours constraints (<= 14 hrs/day), and duty status.
   - Created Pydantic v2 schemas (`HubCreate`, `VehicleCreate`, `DriverCreate`, `FleetOverviewResponse`) with strict data validation.
2. **RESTful Fleet CRUD Endpoints (Track A: Manthan Nimodiya)**:
   - Built comprehensive endpoints for `/api/v1/fleet/hubs`, `/api/v1/fleet/vehicles`, and `/api/v1/fleet/drivers`.
   - Built `/api/v1/fleet/overview` returning real-time aggregated metrics (total vehicles, on-duty drivers, total fleet payload capacity).
   - Integrated role authorization checks allowing only Admins and Fleet Managers to modify core assets.
3. **Fleet Management Workspace UI (Track B: Abhayraj Jaiswal)**:
   - Built Asset Directory UI with dynamic tab switching (Vehicles, Drivers, Hubs).
   - Built interactive creation modals: `VehicleModal.tsx`, `DriverModal.tsx`, `HubModal.tsx`.
   - Built `AssetTable.tsx` with status badges, capacity meters, and action buttons.
4. **Week 2 Wrap-up & Production Hardening Enhancements (Joint)**:
   - **Command Center Telemetry Redesign**: Upgraded UI to enterprise grade with active telemetry KPIs, fleet status cards, and live system status indicators.
   - **Database Seeder Script (`backend/scripts/seed_demo_data.py`)**: Built an automated database seeder populating 4 role accounts (`admin@fleetopt.io`, `manager@fleetopt.io`, `dispatcher@fleetopt.io`, `driver@fleetopt.io`), 3 regional distribution hubs, 4 multi-type vehicles, and 5 licensed drivers.
   - **Cloud Deployments**:
     - Deployed live FastAPI backend on **Render** backed by PostgreSQL.
     - Deployed live frontend on **Vercel** with Vite 8 + React 19 and SPA rewrites (`vercel.json`).
5. **Integration Testing**:
   - Built and executed `backend/tests/test_fleet_crud.py`.
   - Verified 4/4 tests passing cleanly across Auth, RBAC, Hub CRUD, Vehicle validation, and Fleet overview aggregations.

---

### Week 3: RAG Knowledge Base vs. Shipments & Audit (Sep 21 – Sep 25, 2026) — IN PROGRESS
- **Status**: `IN PROGRESS` ⏳ (Track B Delivered, Track A In Progress)
- **Focus Area**: RAG Vector Store & Cosine Similarity vs. Shipment Data Models, REST Endpoints & Immutable Audit Logging (US-002, US-006, US-008).

#### Accomplishments Delivered (Track B: Abhayraj Jaiswal):
1. **Shipment Domain Architecture (`backend/app/models/shipment.py`)**:
   - Built `Shipment` ORM model supporting delivery time windows `[time_window_start, time_window_end]`, cargo weight (kg), volume (m3), priority rankings (`LOW`, `STANDARD`, `HIGH`, `EXPRESS`), status lifecycle (`UNASSIGNED`, `CLUSTERED`, `ASSIGNED`, `IN_TRANSIT`, `DELIVERED`, `FAILED`), and origin hub foreign key.
   - Enforced SQL constraints for geocoordinate validation and positive cargo values.
2. **Pydantic v2 Schemas (`backend/app/schemas/shipment.py`)**:
   - Enforced client-server contracts ensuring time window closing cannot precede opening time.
3. **Immutable Audit Logging System (`backend/app/models/audit.py`, `backend/app/services/audit_service.py`)**:
   - Built `AuditLog` ORM model and automated event helper recording actor name, role, action type (`ASSET_CREATED`, `STATUS_CHANGE`, `ROUTE_MODIFIED`, `COPILOT_OVERRIDE`, `DISPATCH_APPROVED`), and serialized before/after JSON states.
4. **RESTful APIs (`backend/app/api/v1/shipments.py` & `backend/app/api/v1/audit.py`)**:
   - Exposed `GET`, `POST`, `PATCH /status`, and `DELETE` endpoints for Shipments with RBAC protection.
   - Exposed `GET /api/v1/audit` for paginated compliance history inspection.
5. **Database Seeder & Test Suite**:
   - Updated `backend/scripts/seed_demo_data.py` to seed 5 realistic customer orders and audit logs.
   - Built `backend/tests/test_shipments_audit.py` with 5 automated test cases.
   - **Full test suite passing: 17/17 (100%)**.

#### Track A Focus (Manthan Nimodiya - Active):
- Constructing Vector Store indexing engine (`backend/app/services/rag/vector_store.py`) with cosine similarity search.
- Curating logistics SOPs, Hazmat ADR/DOT rules, and driver rest mandates.
- Automated vector store retrieval unit tests and benchmarking (`backend/tests/test_rag.py`).

---

### Week 4: RAG Compliance Inspector UI vs. Batch Ingestion (Upcoming)
- **Track A (Manthan Nimodiya)**: Compliance Inspector search UI with citation badges and live RAG querying.
- **Track B (Abhayraj Jaiswal)**: CSV/JSON Batch shipment uploader API & modal, visual cluster previews, Month 1 regression test suite.

---

*(Future weekly progress logs will be appended here as subsequent milestones are executed)*
