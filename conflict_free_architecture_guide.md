# Conflict-Free Architecture & Parallel Development Guide (50-50 Split)

**Project**: Enterprise AI Fleet Route Optimizer  
**Purpose**: Establishing a foolproof architectural blueprint that allows **two full-stack engineers** (Manthan Nimodiya & Abhayraj Jaiswal) to build simultaneously with a **true 50-50 GenAI & Full-Stack split** without git merge conflicts, blocked dependencies, or refactoring friction.  
**Last updated**: Nov 20, 2026 (all 16 weeks delivered by both tracks)

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

Every feature is encapsulated into dedicated domain files. **Manthan never touches Abhayraj's files, and Abhayraj never touches Manthan's files.** Files marked **[Shared]** are the exceptions; changes to them are kept small and coordinated (see Section 4).

### Complete Directory & File Ownership Map (as built)

```
fleet-route-opt/
│
├── backend/
│   ├── app/
│   │   ├── core/                        <-- SHARED CORE BASELINE
│   │   │   ├── config.py                # [Shared] Environment & settings (Pydantic Settings)
│   │   │   ├── database.py              # [Shared] SQLAlchemy 2.0 engine, sessions, startup migrations
│   │   │   ├── security.py              # [Abhayraj] Password hashing, JWT, require_roles guards
│   │   │   └── logging.py               # [Shared] Structured application logger
│   │   │
│   │   ├── models/                      <-- ORM MODELS
│   │   │   ├── base.py                  # [Shared] TimestampMixin
│   │   │   ├── fleet.py                 # [Manthan] Vehicle, Driver, Hub (Abhayraj added Driver.hazmat_endorsed)
│   │   │   ├── user.py                  # [Abhayraj] User model & Role enums
│   │   │   ├── shipment.py              # [Abhayraj] Shipment (+ hazard_class)
│   │   │   └── audit.py                 # [Abhayraj] Immutable AuditLog model
│   │   │
│   │   ├── schemas/                     <-- PYDANTIC DATA CONTRACTS
│   │   │   ├── analytics.py             # [Abhayraj] Executive KPI dashboard schemas
│   │   │   ├── fleet.py                 # [Manthan] Vehicle, Driver, Hub schemas
│   │   │   ├── route.py                 # [Manthan] Solver, resequencing, disruption, ETA, SLA, explain, reports
│   │   │   ├── rag.py                   # [Manthan] Policy query & citation schemas
│   │   │   ├── health.py                # [Shared] Health / readiness probes
│   │   │   ├── auth.py                  # [Abhayraj] Login, Token, User schemas
│   │   │   ├── shipment.py              # [Abhayraj] Shipment create/update & batch schemas
│   │   │   ├── audit.py                 # [Abhayraj] Audit query schemas
│   │   │   ├── transit.py               # [Abhayraj] FSM actions, driver manifest, offline sync
│   │   │   └── copilot.py               # [Abhayraj] Agent state, traces, guardrails, policy reports, proposal cards
│   │   │
│   │   ├── services/                    <-- BUSINESS LOGIC & ENGINES
│   │   │   ├── optimizer/               # [Manthan]
│   │   │   │   ├── distance_matrix.py   # Haversine & road-detour distance engine
│   │   │   │   ├── vrptw_solver.py      # Clarke-Wright Savings + 2-opt solver
│   │   │   │   ├── eta_engine.py        # Downstream ETA recalculation & SLA classes
│   │   │   │   ├── route_explainer.py   # RAG-grounded route explanations
│   │   │   │   └── mock_stubs.py        # Legacy Track A stubs (superseded; removal pending)
│   │   │   ├── rag/                     # [Manthan - RAG Lead]
│   │   │   │   ├── vector_store.py      # TF-IDF cosine similarity store
│   │   │   │   ├── embeddings.py        # Chunking & embedding pipeline
│   │   │   │   ├── knowledge_base.py    # Logistics SOP knowledge base
│   │   │   │   └── evaluation.py        # Retrieval benchmark (Recall@3, MRR)
│   │   │   ├── analytics/               # [Manthan] metrics.py, history.py, exports.py (CSV / PDF)
│   │   │   ├── copilot/                 # [Joint GenAI]
│   │   │   │   ├── optimization_agent.py# [Manthan] Disruption & solver tool-calling agent
│   │   │   │   ├── state_graph.py       # [Abhayraj] LangGraph StateGraph engine
│   │   │   │   ├── router_agent.py      # [Abhayraj] Intent classifier agent
│   │   │   │   ├── guardrails.py        # [Abhayraj] Zero-hallucination similarity guardrail
│   │   │   │   ├── policy_agent.py      # [Abhayraj] Compliance validator agent
│   │   │   └── proposal_service.py  # [Abhayraj] Proposal cards: route diff, impact, accept / reject
│   │   │   ├── transit_fsm.py           # [Abhayraj] In-transit FSM lifecycle engine
│   │   │   ├── executive_analytics.py   # [Abhayraj] Executive KPIs (built on Track A's metrics engine)
│   │   │   ├── batch_ingestion.py       # [Abhayraj] CSV / JSON batch order parser
│   │   │   └── audit_service.py         # [Abhayraj] Audit event recorder
│   │   │
│   │   ├── api/v1/                      <-- REST API ROUTERS
│   │   │   ├── router.py                # [Shared] Aggregates all routers via include_router
│   │   │   ├── health.py                # [Shared] /health, /ready
│   │   │   ├── fleet.py                 # [Manthan] /api/v1/fleet CRUD
│   │   │   ├── routes.py                # [Manthan] /api/v1/routes optimize, evaluate, disruption, recalculate, explain, sla-check
│   │   │   ├── rag.py                   # [Manthan] /api/v1/rag search & citations
│   │   │   ├── reports.py               # [Manthan] /api/v1/reports metrics, CSV & PDF exports
│   │   │   ├── auth.py                  # [Abhayraj] /api/v1/auth login, register, me
│   │   │   ├── shipments.py             # [Abhayraj] /api/v1/shipments CRUD & batch upload
│   │   │   ├── transit.py               # [Abhayraj] /api/v1/transit FSM actions, driver manifest, offline sync
│   │   │   ├── copilot.py               # [Abhayraj] /api/v1/copilot query, guardrails, policy validation, proposals
│   │   │   ├── analytics.py             # [Abhayraj] /api/v1/analytics executive KPI dashboard
│   │   │   └── audit.py                 # [Abhayraj] /api/v1/audit log query
│   │   │
│   │   └── main.py                      # [Shared] Application root entrypoint
│   │
│   ├── scripts/
│   │   ├── seed_demo_data.py            # [Shared] Demo users, hubs, fleet, shipments
│   │   ├── benchmark.py                 # [Manthan] PRD performance targets
│   │   └── docker_entrypoint.py         # [Manthan] Wait for DB, migrate, seed
│   ├── Dockerfile                       # [Manthan] Multi-stage backend image
│   │
│   └── tests/                           <-- INDEPENDENT TEST SUITES (200 tests)
│       ├── test_health.py, test_database_url.py                          # [Shared]
│       ├── test_fleet_crud.py, test_rag.py, test_distance_matrix.py,
│       │   test_vrptw_solver.py, test_route_operations.py,
│       │   test_reports.py, test_performance.py                         # [Manthan]
│       └── test_auth_rbac.py, test_shipments_audit.py, test_batch_ingestion.py,
│           test_copilot_router.py, test_transit_fsm.py, test_rag_guardrails.py,
│           test_policy_agent.py, test_mobile_driver_api.py,
│           test_action_proposals.py, test_executive_analytics.py        # [Abhayraj]
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # [Shared] App shell, navigation, header (integration hot spot)
│   │   ├── main.tsx                     # React 19 entrypoint
│   │   ├── index.css                    # [Shared] Tailwind CSS v4 design tokens
│   │   ├── components/
│   │   │   ├── map/                     # [Manthan] LeafletMap, NetworkMapSection, markers, tiles
│   │   │   ├── routes/                  # [Manthan] RoutePlannerSection, RoutePlanMap
│   │   │   ├── reports/                 # [Manthan] ReportsSection
│   │   │   ├── compliance/              # [Manthan] ComplianceInspector
│   │   │   ├── workflow/                # [Manthan] DispatchPlanner
│   │   │   ├── tracking/                # [Joint] TrackingMap, simulation, SlaAlerts [Manthan];
│   │   │   │                            #         FsmProgressBar [Abhayraj]; LiveTrackingSection [Shared]
│   │   │   ├── copilot/                 # [Abhayraj] CopilotCommandCenter, CopilotSlidingDrawer, ProposalCard
│   │   │   ├── analytics/               # [Abhayraj] ExecutiveDashboard
│   │   │   ├── driver/                  # [Abhayraj] MobileDriverCockpit
│   │   │   └── ErrorBoundary.tsx        # [Shared]
│   │   └── lib/
│   │       ├── types.ts                 # [Shared] TypeScript data contracts
│   │       ├── api.ts                   # [Shared] API base URL, auth token helper, health check
│   │       ├── geo.ts, routesApi.ts, ragApi.ts, reportsApi.ts   # [Manthan]
│   │       ├── copilotApi.ts, transitApi.ts, proposalsApi.ts, analyticsApi.ts   # [Abhayraj]
│   │       └── trackA_stubs.ts          # Legacy Track A stubs (superseded; removal pending)
│   │
│   └── vercel.json                      # Vercel Vite build & SPA rewrite config
│
├── docker-compose.yml                   # [Manthan] postgres:16-alpine + backend (frontend service: Track B Week 16)
│
└── milestones_tracker.md, weekly_work_log.md, team_work_split.md,
    implementation_plan_OJT.md            # [Shared] Planning docs (most frequent conflict source)
```

---

## 3. Pillar 2: Contract-First Design (Eliminating Dependency Deadlocks)

1. **Agree on Schemas Early**: Pydantic schemas (Backend) and TypeScript interfaces (Frontend) are written first.
2. **Identical Data Shapes**:
   - Manthan's RAG Vector Engine outputs `PolicyCitationResponse` matching frontend `PolicyCitation`.
   - Manthan's VRPTW Solver outputs `RouteStopResponse` matching frontend `RouteStop`.
   - Abhayraj's Copilot Agent calls Manthan's solver via structured JSON tool contracts.
   - Abhayraj's Shipment API outputs `ShipmentResponse` matching frontend `Shipment`.
   - Abhayraj's driver manifest (`DriverMobileManifestResponse`) carries the same stop fields as `Shipment`, so the mobile cockpit renders server and local data the same way.

---

## 4. Integration Lessons (Weeks 7–10 Merge, PR #24)

Track A delivered Weeks 7–16 on `main` while Track B built Weeks 7–10 on `feat/abhayraj-week7-10`. Domain isolation held for backend services and APIs, which merged without conflicts. The conflicts were all in shared files:

| Conflict | Cause | Resolution / rule going forward |
| :--- | :--- | :--- |
| `frontend/src/App.tsx` | Track A redesigned the app shell and header while Track B added the Copilot drawer and the driver view toggle | Kept the new shell and re-added Track B features inside it. **Rule**: mount feature components in `App.tsx` with a one-line change; put the UI in your own component file. |
| `LiveTrackingSection.tsx` | Both tracks fixed the same `insets` map crash | Kept one memoised fix. **Rule**: announce hotfixes to shared files before pushing. |
| `milestones_tracker.md`, `weekly_work_log.md` | Both tracks rewrote the same summary rows and week sections | **Rule**: each track edits only its own subsection; summary rows are updated by whoever merges last. |
| Mock stubs vs. real Track A code | Track B's Weeks 7–10 relied on Track A mock stubs, which Track A's real code superseded | Delete `mock_stubs.py` / `trackA_stubs.ts` once nothing imports them. **Rule**: stubs live only until the real contract lands. |

Schema additions that cross ownership lines (Abhayraj adding `Driver.hazmat_endorsed` to Manthan's `models/fleet.py`) are additive columns only, registered in `core/database.py` so existing databases are migrated on startup.

Weeks 13–16 (Track B) touched these Track A files, each change small and additive:

| File | Change | Why |
|---|---|---|
| `services/analytics/metrics.py`, `history.py` | `StopRecord.latitude / longitude` (optional) | Delivery density heatmap |
| `api/v1/fleet.py` | RBAC on every endpoint, audit entries for changes | Security audit findings 2 and 3 |
| `api/v1/routes.py` | Anonymous `/routes/disruption` never calls the LLM | Security audit finding 7 |
| `services/copilot/optimization_agent.py` | One `record_llm_usage` call after the Claude request | Token telemetry |
| `scripts/docker_entrypoint.py` | `--no-server-header` | Security headers |
| `docker-compose.yml` | Frontend service, `TRUST_PROXY_HEADERS`, backend port bound to localhost | Week 16 |
| `components/copilot/CopilotCommandCenter.tsx` | Responsive classes only | Phone layout |
| `tests/test_fleet_crud.py` | Authenticated client fixture | Fleet endpoints now need a token |

Shared test helper: `tests/conftest.py::auth_headers(client, email, role)` creates a user with any role through a bootstrap admin, since only admins may assign privileged roles.

---

## 5. Status Checklist (Nov 20, 2026)

- [x] Month 1 (Weeks 1–4): foundation, auth, fleet assets, RAG store, shipments, audit, batch ingestion.
- [x] Month 2 (Weeks 5–8): distance engine, Leaflet map, VRPTW solver, route planner & resequencing **vs.** LangGraph router, in-transit FSM, guardrails, policy agent.
- [x] Weeks 9–10: optimization agent & downstream ETAs **vs.** mobile driver cockpit with offline sync & Copilot sliding drawer (PR #24).
- [x] Weeks 11–12: route explainer & SLA alerts **vs.** action proposal cards with route diff & executive KPI dashboard (Track B delivered early, Nov 15).
- [x] **Track A (Manthan)**: Weeks 11–16 delivered early (route explainer, SLA alerts, metrics & reports, CSV/PDF exports, benchmarks, backend Docker + Postgres).
- [x] **Track B (Abhayraj)**, Weeks 13–16: analytics filters & exports, security hardening & agent telemetry, copilot benchmark & end-to-end regression, frontend Docker, CI & documentation (Nov 20).
- [ ] Cleanup: remove the superseded Track A mock stubs (`mock_stubs.py`, `trackA_stubs.ts`) and the test that exercises them.
