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

### Month 1: Foundation, Governance, Assets & Shipment Ingestion (100% COMPLETE)

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 1** | **Backend Scaffolding & Health Probes**<br>• FastAPI structure & SQLAlchemy 2.0 dual engine<br>• Health & readiness probes (`/api/v1/health`, `/ready`)<br>• Base model mixin with UTC timestamps<br>• Automated health test suite | **Security Engine & Auth UI**<br>• Bcrypt password hashing & JWT token issuance<br>• RBAC middleware (`Admin`, `Manager`, `Dispatcher`, `Driver`)<br>• Responsive login/registration UI with role switcher<br>• `AuthContext` with secure token storage | **Sync 1**: Connect frontend to FastAPI backend, test role authentication, and verify route guards. | `COMPLETED` ✅ |
| **Week 2** | **Fleet Asset Backend Models & APIs (US-001 & US-002)**<br>• Models: `Vehicle` (capacity, volume), `Driver` (shifts), `Hub`<br>• RESTful CRUD APIs & `/overview` aggregation endpoint<br>• Relational integrity & check constraints test suite | **Fleet Management Workspace UI (US-002)**<br>• Asset Directory UI with tabbed tables<br>• Vehicle, Driver, Hub interactive creation modals<br>• Filter by status, search by name/plate/license<br>• Telemetry card redesign & cloud deployment | **Sync 2**: Manage full fleet lifecycle from interactive UI, verify database constraints, and deploy live. | `COMPLETED` ✅ |
| **Week 3** | **RAG Knowledge Base & Vector Store Engine (US-006)**<br>• 8 SOPs across Hazmat, Driver Rest, Cold Chain, Safety (41 chunks)<br>• TF-IDF embeddings & in-memory cosine vector store<br>• Retrieval benchmark: Recall@3 1.00, MRR 0.98, p95 < 1ms | **Shipment Ingestion & Audit Logging (US-002 & US-008)**<br>• `Shipment` database model & geocoding bounds check<br>• `AuditLog` database model & automated state interceptor<br>• Audit trail explorer UI with filtering and search | **Sync 3**: Ingest shipments and verify semantic policy retrieval from the vector knowledge base with audit trail logging. | `COMPLETED` ✅ |
| **Week 4** | **RAG Compliance Inspector Portal (US-006)**<br>• Dedicated Compliance & SOP search UI page<br>• Real-time semantic query search bar<br>• Source document citation preview cards with confidence | **Batch Order Uploader & Regression Suite (US-002)**<br>• Batch order upload API (CSV & JSON format parser)<br>• Finite number validation & strict 24-hr clock checks<br>• Drag-and-drop batch upload modal with cluster preview<br>• Month 1 Full Regression Test Suite (49/49 passed) | **Sync 4**: Ingest multi-order batches and execute full regression test suite across backend and frontend. | `COMPLETED` ✅ |

---

### Month 2: Optimization & Map vs. Multi-Agent Router & FSM

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 5** | **Spatial Graph & Distance Engine (US-004)**<br>• Haversine distance & travel duration engine<br>• Road detour correction factors & matrix generator<br>• Leaflet map integration with OpenStreetMap tiles<br>• Custom depot & delivery waypoint markers | **LangGraph Foundation & Router Agent (US-005)**<br>• LangGraph `StateGraph` definition with session state<br>• **Router Agent**: Natural language intent classification (breakdown, delay, policy query, re-route)<br>• Offline deterministic fallback agent (100% testable)<br>• Router agent unit tests | **Sync 5**: Plot waypoints on map while Router Agent correctly classifies dispatcher intent. | `UPCOMING` |
| **Week 6** | **Deterministic VRPTW Solver Core (US-003)**<br>• Clarke-Wright Savings algorithm implementation<br>• 2-opt local search optimization heuristic<br>• Hard constraints: vehicle capacity & customer time windows<br>• Performance benchmark: <5s for 50 stops | **In-Transit FSM & Telemetry Tracking (US-008)**<br>• FSM lifecycle states (`UNASSIGNED` to `COMPLETED`)<br>• Driver action API (`ARRIVED`, `COMPLETED`, `FAILED`, `DELAYED`)<br>• Real-time trip status tracker with FSM progress bar<br>• Live vehicle position simulator on map | **Sync 6**: Test VRPTW solver with 50 stops while verifying live trip FSM state transitions. | `PLANNED` |
| **Week 7** | **Interactive Route Visualizer (US-004)**<br>• Color-coded vehicle route polylines rendering on map<br>• Sequenced stop pins (1, 2, 3...) with arrival ETA popups<br>• Split-view: live map on left, active route manifest on right<br>• Vehicle capacity percentage progress bars | **Zero-Hallucination Guardrails & Scoring (US-006)**<br>• Semantic similarity threshold guardrail in backend<br>• Fallback response: `"Policy not found in verified knowledge base"`<br>• Confidence score indicator (0–100%) on every answer<br>• SOP citation cards with document ID and excerpt | **Sync 7**: Render multi-vehicle routes on map and test AI Copilot queries against RAG guardrails. | `PLANNED` |
| **Week 8** | **Route Resequencing & What-If Workspace (US-007)**<br>• Drag-and-drop stop resequencing in route manifest<br>• Real-time recalculation of arrival ETAs and violations<br>• Visual alert badges for capacity & time window breaches<br>• Instant "Reset to AI Route" action button | **Policy & Compliance Agent (US-006)**<br>• **Policy Agent**: Validates routes against driver hours-of-service regulations and Hazmat transport laws<br>• LangGraph node routing: Intent → Policy Check → Output<br>• Automated violation detection with cited SOP rule<br>• Policy agent unit tests | **Sync 8**: Perform manual stop reordering in UI and verify that Policy Agent catches regulatory violations. | `PLANNED` |

---

### Month 3: Optimization Agent & Driver View vs. Copilot & Analytics

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 9** | **LangGraph Optimization Agent (US-005 & US-007)**<br>• **Optimization Agent**: Evaluates re-route feasibility<br>• Tool-calling integration: invokes deterministic VRPTW solver<br>• Generates structured disruption proposals<br>• Handles edge cases: vehicle breakdown, road closure | **Mobile Driver View & Action API (US-008)**<br>• Responsive mobile-first driver layout<br>• Today's stop manifest with customer contact & address<br>• Big-button action bar (`ARRIVED`, `DELIVERED`, `REPORT ISSUE`)<br>• Offline status caching in browser | **Sync 9**: Trigger a vehicle breakdown scenario and verify Optimization Agent generates a structured re-route proposal. | `PLANNED` |
| **Week 10** | **Downstream ETA Dynamic Recalculation (US-007)**<br>• Ripple-effect ETA recalculation when an upstream stop is delayed<br>• Automatic SLA breach risk scoring for remaining stops<br>• Delta calculation: original ETA vs. predicted ETA<br>• Visual delay indicators on dispatch timeline | **AI Copilot Sliding Drawer UI (US-005)**<br>• Sliding Copilot drawer accessible from any screen<br>• Natural language chat interface with quick-action prompt chips<br>• Visual execution trace showing agent routing reasoning<br>• Latency indicator for each AI response | **Sync 10**: Simulate a 45-minute delay on Stop 2 and verify downstream ETAs update in real-time. | `PLANNED` |
| **Week 11** | **RAG Route Explainer & Summarizer (US-006)**<br>• **Explainer Agent**: Generates natural language route summaries<br>• Explains why a specific sequence was chosen<br>• Summarizes trade-offs (distance vs. time window tightness)<br>• Formats summary for customer-facing communication | **Structured Action Proposals & Diff View (US-005)**<br>• Interactive proposal cards inside AI Copilot drawer<br>• Visual Diff: Current Route vs. Proposed Route<br>• Key metrics comparison table (total km, time, cost delta)<br>• One-click `"Accept Proposal"` and `"Reject"` buttons | **Sync 11**: Review an AI re-route proposal in the diff viewer, accept it, and verify the route updates on the live map. | `PLANNED` |
| **Week 12** | **SLA Breach Warning System & Notifications (US-007)**<br>• Predictive SLA breach alert engine<br>• Visual alert banners: yellow (at risk), red (imminent breach)<br>• Sound/toast notification on high-severity disruption<br>• Suggested recovery actions powered by Optimization Agent | **Executive KPI Analytics Dashboard (US-008)**<br>• Summary KPI cards: Total Deliveries, On-Time Rate %, Fleet Utilization %, Cost per Km<br>• Interactive charts: Daily delivery volume trends, SLA compliance rates<br>• Driver performance leaderboard<br>• Real-time stats auto-refresh | **Sync 12**: Validate end-to-end flow: delay triggers SLA alert, Copilot proposes fix, dispatcher approves, KPIs update. | `PLANNED` |

---

### Month 4: Polish, Testing, DevOps & Evaluation

| Week | Manthan Nimodiya (Track A: RAG & Core) | Abhayraj Jaiswal (Track B: Multi-Agent & Platform) | Weekly Integration Sync Point | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 13** | **Operational Cost Engine (US-003)**<br>• Fuel cost calculation based on vehicle efficiency & distance<br>• Driver overtime cost estimation based on shift duration<br>• Carbon footprint (CO2 emission) estimation per trip<br>• Cost comparison: original vs. AI-optimized routes | **Multi-Dimensional Analytics Filtering (US-008)**<br>• Filter analytics by date range, hub, vehicle type, priority<br>• Route efficiency scatter plot (planned vs. actual)<br>• Vehicle capacity utilization breakdown chart<br>• Export dashboard view as summary snapshot | **Sync 13**: Filter analytics by Mumbai Hub and verify cost and utilization calculations match raw trip logs. | `PLANNED` |
| **Week 14** | **Data Export & Audit Report Generator (US-008)**<br>• Export routes and shipments to CSV / Excel<br>• PDF Route Manifest generator with printable stop sheets<br>• Audit trail report exporter for regulatory compliance<br>• Customer delivery receipt generator | **Security Hardening & Multi-Agent Benchmarks**<br>• API rate limiting and request throttling middleware<br>• Input sanitization on all chat and search interfaces<br>• CORS and security headers hardening<br>• Multi-agent latency and token usage logging | **Sync 14**: Export a PDF route manifest and verify compliance audit trail contains full history. | `PLANNED` |
| **Week 15** | **Optimization & RAG Benchmark Suite**<br>• VRPTW solver scalability tests (10, 25, 50, 100 stops)<br>• RAG retrieval latency & accuracy benchmarks<br>• Solver memory profiling under load<br>• Optimization performance comparison table | **End-to-End Integration & Multi-Agent Stress Tests**<br>• End-to-end integration tests (ingestion → solve → track → complete)<br>• Multi-agent concurrency stress tests<br>• Frontend responsive layout testing<br>• Cross-browser testing and accessibility checks | **Sync 15**: Run full automated test suite (backend unit + agent + RAG + frontend integration) with 100% pass rate. | `PLANNED` |
| **Week 16** | **Backend Containerization & Production Release**<br>• Multi-stage Dockerfile for FastAPI backend<br>• Production Docker Compose: Backend + Frontend + PostgreSQL<br>• Environment variable configuration templates<br>• Production deployment documentation and runbook | **Frontend Containerization, Docs & Viva Walkthrough**<br>• Dockerfile for Vite/React frontend with Nginx reverse proxy<br>• Comprehensive project README with architecture diagrams<br>• API documentation (OpenAPI / Swagger)<br>• End-to-end video demonstration and viva presentation slides | **Sync 16**: Spin up entire platform with a single `docker compose up` command, seed demo data, and run live demo. | `PLANNED` |\n