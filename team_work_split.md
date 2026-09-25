# Balanced 50-50 Full-Stack & GenAI Allocation: AI Fleet Route Optimizer

**Project**: Enterprise AI Fleet Route Optimizer  
**Approach**: **True 50-50 GenAI & Full-Stack Engineering Split**  
Both engineers (Manthan Nimodiya & Abhayraj Jaiswal) hold equal, comprehensive 50-50 ownership across **GenAI / LLM Architecture (RAG & LangGraph)**, **Backend Algorithms & APIs**, and **Frontend Interfaces**.

---

## 1. High-Level 50-50 Track Overview

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

## 2. 4-Month (16-Week) Balanced 50-50 Roadmap

### Month 1: Foundation, Governance, Assets & Shipment Ingestion

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point |
| :--- | :--- | :--- | :--- |
| **Week 1** | **Backend Scaffolding & Health Probes**<br>• FastAPI structure & SQLAlchemy 2.0 dual engine<br>• Health & readiness probes (`/api/v1/health`, `/ready`)<br>• Base model mixin with UTC timestamps<br>• Automated health test suite | **Security Engine & Auth UI**<br>• Bcrypt password hashing & JWT token issuance<br>• RBAC middleware (`Admin`, `Manager`, `Dispatcher`, `Driver`)<br>• Responsive login/registration UI with role switcher<br>• `AuthContext` with secure token storage | **Sync 1**: Connect frontend to FastAPI backend, test role authentication, and verify route guards. *(Done)* |
| **Week 2** | **Fleet Asset Backend Models & APIs (US-002)**<br>• Models: `Vehicle` (capacity, volume), `Driver` (shifts), `Hub`<br>• RESTful CRUD APIs & `/overview` aggregation endpoint<br>• Relational integrity & check constraints test suite | **Fleet Management Workspace UI (US-002)**<br>• Asset Directory UI with tabbed tables<br>• Vehicle, Driver, Hub interactive creation modals<br>• Filter by status, search by name/plate/license<br>• Telemetry card redesign & cloud deployment | **Sync 2**: Manage full fleet lifecycle from the interactive UI, verify database constraints, and deploy live. *(Done)* |
| **Week 3** | **RAG Knowledge Base & Vector Store Engine (US-006)**<br>• Vector store embedding index with cosine similarity<br>• Ingest logistics SOPs, Hazmat ADR/DOT rules, driver rest-breaks, and WikiQA samples<br>• Vector store unit tests and retrieval benchmarks | **Shipment Ingestion & Audit Logging (US-002 & US-008)**<br>• `Shipment` database model & geocoding bounds check<br>• `AuditLog` database model & automated state interceptor<br>• Audit trail explorer UI with filtering and search | **Sync 3 (Active)**: Ingest shipments and verify semantic policy retrieval from the vector knowledge base with audit trail logging. |
| **Week 4** | **RAG Compliance Inspector Portal (US-006)**<br>• Dedicated Compliance & SOP search UI page<br>• Filter by policy category (Hazmat, Driver Rest, Cold Chain)<br>• Real-time semantic query search bar<br>• Source document citation preview cards | **Batch Order Uploader (Full Stack)**<br>• Batch order upload API (CSV & JSON format parser)<br>• Drag-and-drop file upload modal<br>• Visual delivery cluster preview on UI<br>• End-to-end Month 1 regression test suite | **Sync 4**: Upload 50-order CSV batch and perform live compliance queries against the vectorized knowledge base. |

---

### Month 2: Optimization & Map vs. Multi-Agent Router & FSM

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point |
| :--- | :--- | :--- | :--- |
| **Week 5** | **Spatial Graph & Distance Engine (US-004)**<br>• Haversine distance & travel duration engine<br>• Road detour correction factors & matrix generator<br>• Leaflet map integration with OpenStreetMap tiles<br>• Custom depot & delivery waypoint markers | **LangGraph Foundation & Router Agent (US-005)**<br>• LangGraph `StateGraph` definition with session state<br>• **Router Agent**: Natural language intent classification (breakdown, delay, policy query, re-route)<br>• Offline deterministic fallback agent (100% testable)<br>• Router agent unit tests | **Sync 5**: Plot waypoints on map while Router Agent correctly classifies dispatcher intent. |
| **Week 6** | **Deterministic VRPTW Solver Core (US-003)**<br>• Clarke-Wright Savings algorithm implementation<br>• 2-opt local search optimization heuristic<br>• Hard constraints: vehicle capacity & customer time windows<br>• Performance benchmark: <5s for 50 stops | **In-Transit FSM & Telemetry Tracking (US-008)**<br>• FSM lifecycle states (`UNASSIGNED` to `COMPLETED`)<br>• Driver action API (`ARRIVED`, `COMPLETED`, `FAILED`, `DELAYED`)<br>• Real-time trip status tracker with FSM progress bar<br>• Live vehicle position simulator on map | **Sync 6**: Test VRPTW solver with 50 stops while verifying live trip FSM state transitions. |
| **Week 7** | **Interactive Route Visualizer (US-004)**<br>• Color-coded vehicle route polylines rendering on map<br>• Sequenced stop pins (1, 2, 3...) with arrival ETA popups<br>• Split-view: live map on left, active route manifest on right<br>• Vehicle capacity percentage progress bars | **Zero-Hallucination Guardrails & Scoring (US-006)**<br>• Semantic similarity threshold guardrail in backend<br>• Fallback response: `"Policy not found in verified knowledge base"`<br>• Exact source citation attribution & confidence score API<br>• Visual confidence badge component in UI | **Sync 7**: Inspect generated multi-vehicle route on map with grounded policy citations. |
| **Week 8** | **Waypoint Resequencing Workspace (US-004)**<br>• Drag-and-drop stop reordering in route manifest<br>• Instant client-side & server-side ETA recalculation<br>• Time-window violation warning badges<br>• "Approve & Dispatch" workflow button | **Policy & Compliance Agent Integration (US-005)**<br>• **Policy Agent**: Connects to Manthan's RAG vector store to validate proposed routes against driver max driving hours and Hazmat rules<br>• Automated route compliance report modal in UI<br>• Flagging non-compliant routes before dispatch | **Sync 8**: Reorder stops via drag-and-drop, verify dynamic ETA updates, run policy check, and lock route to `DISPATCHED`. |

---

### Month 3: AI Copilot Disruption Solver vs. Driver Mobile & Analytics

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point |
| :--- | :--- | :--- | :--- |
| **Week 9** | **LangGraph Optimization Agent (US-005)**<br>• **Optimization Agent**: Interfaces with VRPTW solver via LLM tool-calling to solve routing disruptions<br>• Translates natural language breakdown reports into solver re-routing calls<br>• Unit test suite for optimization agent tool use | **Mobile Driver Interface (US-008)**<br>• Mobile-responsive Driver View for assigned trips<br>• Stop-by-stop navigation cards with contact metadata<br>• Single-tap action buttons (`Arrived`, `Delivered`, `Report Delay`)<br>• Driver offline indicator & trip completion summary | **Sync 9**: Complete simulated delivery from Driver View, then trigger AI Optimization Agent to re-route remaining stops. |
| **Week 10** | **Dynamic Downstream Recalculation Engine**<br>• Dynamic downstream ETA recalculation when delays occur<br>• Recalculate remaining stops without resetting completed stops<br>• Real-time ETA update notifications on dispatcher cockpit<br>• Route deviation logging in audit trail | **Copilot Drawer & Execution Traces (US-005)**<br>• AI Copilot sliding drawer UI<br>• Step-by-step agent execution trace generator<br>• Agent reasoning accordion component in Copilot drawer<br>• Message history and suggested quick prompts | **Sync 10**: Report a 45-minute delay on Stop 2, verify downstream ETAs shift, and observe Copilot trace reasoning. |
| **Week 11** | **RAG-Grounded Route Explanations & Summaries**<br>• LLM prompt pipeline explaining route decisions in plain language<br>• Generates executive trip dispatch rationale referencing SOPs<br>• Natural language turn-by-turn driver instructions | **Human-in-the-Loop Action Proposals (US-005)**<br>• Structured proposal payload: `{ proposal_id, changes, affected_stops, time_saved, violations }`<br>• Interactive proposal cards inside Copilot chat<br>• Visual diff highlighting affected stops<br>• "Approve Re-route" / "Decline" confirmation buttons | **Sync 11**: Ask Copilot why a stop was scheduled first; verify grounded natural language explanation with proposal cards. |
| **Week 12** | **Exception Handling & SLA Breach Detection**<br>• Real-time SLA breach detection when arrival exceeds window<br>• Visual alert toasts and sound effects in dispatcher UI<br>• Recovery state transitions (`ROUTE_BLOCKED`, `SLA_BREACHED`) | **Executive KPI Analytics Dashboard UI (US-007)**<br>• Executive dashboard page in UI<br>• High-impact metric KPI cards with trend indicators<br>• Interactive responsive charts (OTIF delivery rate, fuel burn)<br>• Fleet capacity utilization gauges | **Sync 12**: Simulate vehicle breakdown: Copilot proposes alternative re-route, dispatcher clicks "Approve", and map updates live. |

---

### Month 4: Analytics, Hardening, Containerization & Release

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point |
| :--- | :--- | :--- | :--- |
| **Week 13** | **Operational Metrics Calculation Engine (US-007)**<br>• Metric calculators: On-Time In-Full (OTIF) %<br>• Average transit duration & route efficiency index<br>• Fuel burn index formula & cost per ton-kilometer<br>• Metric calculation unit tests | **Multi-Dimensional Analytics Filtering**<br>• Filter analytics by date range, vehicle type, driver, regional hub<br>• Route difficulty index filtering<br>• Summary statistics recalculation on filter changes<br>• Audit trail correlation with KPI performance | **Sync 13**: Run historical dispatch simulations and inspect live KPI chart rendering on the executive dashboard. |
| **Week 14** | **Data Export & Audit Reporting (US-007)**<br>• Automated CSV data export API for operational audits<br>• Printable PDF executive trip summary generator<br>• Export action buttons in analytics dashboard<br>• End-to-end data integrity validation | **AI Copilot & RAG Pipeline Optimization**<br>• Prompt engineering refinement for Copilot accuracy<br>• Citation grounding evaluation and fallback testing<br>• End-to-end conversation flow test suite<br>• Security audit (JWT refresh, SQL injection, CORS) | **Sync 14**: Filter analytics by regional hub and export comprehensive CSV/PDF reports matching filtered criteria. |
| **Week 15** | **Solver & Vector Store Performance Hardening**<br>• Benchmark solver performance (<5s for 50 stops guaranteed)<br>• Vector store indexing & embedding query latency optimization (<100ms)<br>• Map rendering optimization (virtualized stop lists)<br>• End-to-end stress testing under high stop counts | **Multi-Agent Architecture Polish & Stress Testing**<br>• LangGraph multi-agent execution latency reduction<br>• Multi-agent exception handling benchmark (<3s)<br>• End-to-end multi-turn conversation test suite<br>• Frontend performance audit | **Sync 15**: Run unified stress test: 50-stop VRPTW optimization under 5 seconds + multi-agent exception handling under 3 seconds. |
| **Week 16** | **Containerization & Backend Deployment**<br>• Multi-stage `Dockerfile` for FastAPI backend<br>• PostgreSQL container setup with schema auto-migration<br>• Docker volume persistence & healthcheck configuration<br>• API documentation (OpenAPI / Swagger polish) | **Frontend Containerization, CI/CD & Demo**<br>• Multi-stage `Dockerfile` for frontend<br>• Unified `docker-compose.yml` orchestrating all services<br>• Master `README.md` with architecture diagrams and setup guide<br>• End-to-end live demonstration script & walkthrough | **Sync 16**: Run `docker compose up`, spin up the entire platform from a clean machine, and execute full end-to-end demonstration. |

---

## 3. RACI Matrix (Equal 50-50 Balance)

| User Story / PRD Component | Manthan Nimodiya (Track A) | Abhayraj Jaiswal (Track B) |
| :--- | :---: | :---: |
| **US-001: Authentication & Role-Based Access Control** | **C** (API Integration) | **R / A** (Full Stack Auth & RBAC) |
| **US-002: Fleet Asset Management CRUD** | **R / A** (Backend Models & APIs) | **R / A** (Frontend UI & Modals) |
| **US-003: Deterministic VRPTW Optimization** | **R / A** (Solver & Spatial Graph) | **C** (Policy Agent Hooks) |
| **US-004: Interactive Map & Resequencing** | **R / A** (Leaflet Map & Resequencing) | **C** (Compliance Badging) |
| **US-005: Multi-Agent AI Dispatch Copilot (LangGraph)** | **R / A** (Optimization & Disruption Agent) | **R / A** (StateGraph, Router & Policy Agents) |
| **US-006: RAG Knowledge Base & Vector Store Engine** | **R / A** (Vector Store, Ingestion, Citations, UI) | **C** (Policy Agent RAG Integration) |
| **US-007: Operational Analytics & KPI Reporting** | **R / A** (Metric Calculations & CSV Engine) | **R / A** (Dashboard UI & Interactive Charts) |
| **US-008: Dynamic Telemetry & In-Transit FSM** | **C** (ETA Recalculations) | **R / A** (FSM, Mobile Driver View, Audit Log) |
| **DevOps & Containerization** | **R / A** (Backend & DB Containers) | **R / A** (Frontend & Compose Orchestration) |
