# Conflict-Free Architecture & Parallel Development Guide (50-50 Split)

**Project**: Enterprise AI Fleet Route Optimizer  
**Purpose**: Establishing a foolproof architectural blueprint that allows **two full-stack engineers** (Manthan Nimodiya & Abhayraj Jaiswal) to build simultaneously with a **true 50-50 GenAI & Full-Stack split** without git merge conflicts, blocked dependencies, or refactoring friction.

---

## 1. The Core Problem & The Architectural Solution

When two engineers work simultaneously on a single codebase, friction typically arises in three areas:
1. **File Overlaps & Merge Conflicts**: Both developers modifying the same router file, package configuration, or database setup at the same time.
2. **Dependency Deadlocks (Waiting Blocks)**: Developer A cannot test their UI because Developer B hasn't finished the API endpoint yet.
3. **Naming & Schema Drift**: Developer A expects `{ "orderId": 12 }` while Developer B sends `{ "order_id": "12" }`.

### The Solution: The 4 Conflict-Free Pillars

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 CONFLICT-FREE PARALLEL ENGINEERING SYSTEM                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. DOMAIN ISOLATION       │ Each engineer owns distinct file boundaries.  │
│  2. CONTRACT-FIRST DESIGN  │ Data contracts (Schemas & Types) agreed early. │
│  3. SHARED CORE BASELINE   │ Core plumbing built once; never touched twice.│
│  4. ASYNC DECOUPLING       │ Work against mock contracts without waiting.  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Pillar 1: Domain-Driven File & Directory Isolation (50-50 Plan)

Every feature is encapsulated into dedicated domain files. **Manthan never touches Abhayraj's files, and Abhayraj never touches Manthan's files.**

### Complete Directory & File Ownership Map

```
fleet-route-opt/
│
├── backend/
│   ├── app/
│   │   ├── core/                        <-- SHARED CORE BASELINE (Established once)
│   │   │   ├── config.py                # Environment & settings (Pydantic Settings)
│   │   │   ├── database.py              # SQLAlchemy 2.0 engine, sessions, connectivity
│   │   │   ├── security.py              # [Abhayraj] Password hashing & JWT token generators
│   │   │   └── logging.py               # Structured application logger
│   │   │
│   │   ├── models/                      <-- ORM MODELS (Separated by domain)
│   │   │   ├── base.py                  # [Shared] TimestampMixin, Base
│   │   │   ├── fleet.py                 # [Manthan] Vehicle, Driver, Hub models
│   │   │   ├── route.py                 # [Manthan] Route, RouteStop models
│   │   │   ├── user.py                  # [Abhayraj] User model & Role enums
│   │   │   ├── shipment.py              # [Abhayraj] Shipment, Order models
│   │   │   └── audit.py                 # [Abhayraj] Immutable AuditLog model
│   │   │
│   │   ├── schemas/                     <-- PYDANTIC DATA CONTRACTS
│   │   │   ├── fleet.py                 # [Manthan] Vehicle, Driver, Hub schemas
│   │   │   ├── route.py                 # [Manthan] VRPTW solver request/response schemas
│   │   │   ├── rag.py                   # [Manthan] Policy query & citation schemas
│   │   │   ├── auth.py                  # [Abhayraj] Login, Token, User schemas
│   │   │   ├── shipment.py              # [Abhayraj] Shipment create/update schemas
│   │   │   ├── copilot.py               # [Abhayraj] Chat, Proposal, Trace schemas
│   │   │   └── analytics.py             # [Abhayraj] OTIF, KPI, summary schemas
│   │   │
│   │   ├── services/                    <-- BUSINESS LOGIC & ENGINES
│   │   │   ├── optimizer/               # [Manthan]
│   │   │   │   ├── distance_matrix.py   # Haversine & geodesic distance engine
│   │   │   │   ├── vrptw_solver.py      # Clarke-Wright Savings + 2-opt solver
│   │   │   │   └── clustering.py        # Geographic order clustering
│   │   │   ├── rag/                     # [Manthan - RAG Lead]
│   │   │   │   ├── vector_store.py      # In-memory / PgVector cosine similarity store
│   │   │   │   ├── embeddings.py        # Document chunking & embedding pipeline
│   │   │   │   └── knowledge_base.py    # Logistics SOPs & Hazmat knowledge
│   │   │   ├── copilot/                 # [Joint GenAI]
│   │   │   │   ├── optimization_agent.py# [Manthan] Disruption & Solver tool-calling agent
│   │   │   │   ├── graph.py             # [Abhayraj] LangGraph StateGraph engine
│   │   │   │   ├── router_agent.py      # [Abhayraj] Intent classifier agent
│   │   │   │   └── policy_agent.py      # [Abhayraj] Compliance validator agent
│   │   │   └── state_machine.py         # [Abhayraj] In-transit FSM lifecycle engine
│   │   │
│   │   ├── api/v1/                      <-- REST API ROUTERS
│   │   │   ├── router.py                # [Shared] Aggregates all routers via include_router
│   │   │   ├── health.py                # [Shared] System probes (/health, /ready)
│   │   │   ├── fleet.py                 # [Manthan] /api/v1/fleet CRUD
│   │   │   ├── routes.py                # [Manthan] /api/v1/routes optimization & resequencing
│   │   │   ├── rag.py                   # [Manthan] /api/v1/rag compliance search & citations
│   │   │   ├── auth.py                  # [Abhayraj] /api/v1/auth login, register, me
│   │   │   ├── shipments.py             # [Abhayraj] /api/v1/shipments CRUD & batch upload
│   │   │   ├── tracking.py              # [Abhayraj] /api/v1/tracking telemetry & driver actions
│   │   │   ├── copilot.py               # [Abhayraj] /api/v1/copilot chat & proposals
│   │   │   ├── audit.py                 # [Abhayraj] /api/v1/audit log query
│   │   │   └── analytics.py             # [Abhayraj] /api/v1/analytics KPIs & exports
│   │   │
│   │   └── main.py                      # [Shared] Application root entrypoint
│   │
│   └── tests/                           <-- INDEPENDENT TEST SUITES
│       ├── test_health.py               # [Shared]
│       ├── test_fleet_crud.py           # [Manthan]
│       ├── test_vrptw_solver.py         # [Manthan] Solver hard constraints & speed
│       ├── test_rag.py                  # [Manthan] Vector retrieval & citations
│       ├── test_auth_rbac.py            # [Abhayraj] JWT token issuance & route guards
│       ├── test_shipments_audit.py      # [Abhayraj] Shipment models & audit trail
│       ├── test_fsm.py                  # [Abhayraj] State transitions & driver actions
│       └── test_copilot.py              # [Abhayraj] Multi-agent routing & proposals
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # [Unified / Active Canvas Shell]
│   │   ├── main.tsx                     # React 19 entrypoint
│   │   ├── index.css                    # Tailwind CSS v4 design tokens
│   │   └── lib/
│   │       ├── types.ts                 # Shared TypeScript data contracts
│   │       ├── api.ts                   # Fetch/Axios API client
│   │       └── authContext.tsx          # Auth state management
│   │
│   └── vercel.json                      # Vercel Vite build & SPA rewrite config
```

---

## 3. Pillar 2: Contract-First Design (Eliminating Dependency Deadlocks)

1. **Agree on Schemas Early**: Pydantic schemas (Backend) and TypeScript interfaces (Frontend) are written first.
2. **Identical Data Shapes**:
   - Manthan's RAG Vector Engine outputs `PolicyCitationResponse` matching frontend `PolicyCitation`.
   - Manthan's VRPTW Solver outputs `RouteStopResponse` matching frontend `RouteStop`.
   - Abhayraj's Copilot Agent calls Manthan's solver via structured JSON tool contracts.
   - Abhayraj's Shipment API outputs `ShipmentResponse` matching frontend `Shipment`.

---

## 4. Summary Checklist for Month 1, Week 3 Active Phase

- [x] Weeks 1 & 2 completed, verified, and deployed live (FastAPI, SQLite/Postgres dual engine, Fleet Models & CRUD APIs, Vercel/Render hosting).
- [ ] **Track A (Manthan)**: Build `backend/app/services/rag/vector_store.py`, embeddings pipeline, and `backend/tests/test_rag.py`.
- [ ] **Track B (Abhayraj)**: Build `backend/app/models/shipment.py`, `backend/app/models/audit.py`, schemas, `/api/v1/shipments`, `/api/v1/audit`, and `backend/tests/test_shipments_audit.py`.
