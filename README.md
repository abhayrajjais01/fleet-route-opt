# AI Fleet Route Optimizer

An enterprise-grade, end-to-end AI solution for Fleet Route Optimization addressing operational efficiency, dynamic rerouting, regulatory compliance, and dispatch automation in the Logistics sector. The platform integrates deterministic graph optimization algorithms (DSA / VRPTW) with multi-agent generative AI (LangGraph) and RAG (Lewis et al., 2020 / WikiQA) grounded in verified logistics SOPs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/Tests-49%2F49%20Passed%20(100%25)-brightgreen.svg)]()
[![RAG Benchmark](https://img.shields.io/badge/RAG%20Eval-Recall%403%201.00%20%7C%20MRR%200.98-success.svg)]()
[![Render](https://img.shields.io/badge/Render-Backend%20Live-brightgreen.svg)](https://fleet-route-opt.onrender.com)
[![Vercel](https://img.shields.io/badge/Vercel-Frontend%20Live-black.svg)](https://fleet-route-opt.vercel.app)

---

## 50-50 Balanced Engineering Division

The project is strictly split across two balanced engineering tracks covering both GenAI and Full-Stack development:

- **Track A (Manthan Nimodiya)**:
  - *GenAI / LLM*: Vector DB & Embeddings, RAG Knowledge Base (Logistics SOPs, Hazmat ADR/DOT, Driver Rest Mandates, WikiQA), Zero-Hallucination Guardrails, Confidence Scoring, LangGraph Optimization Agent.
  - *Full-Stack / Core*: Deterministic VRPTW Solver Core, Haversine Distance Matrix, Leaflet Map Polylines, Resequencing Workspace, Compliance Inspector Search UI, Fleet Models & CRUD APIs.

- **Track B (Abhayraj Jaiswal)**:
  - *GenAI / LLM*: LangGraph Multi-Agent StateGraph Architecture, Router Agent (Intent Classifier), Policy & Compliance Agent, AI Copilot Sliding Drawer UI & Execution Trace View, Structured Action Proposals.
  - *Full-Stack / Core*: Security & RBAC Auth Engine (JWT), In-Transit FSM & Telemetry Tracking, Mobile Driver View, Executive KPI Analytics Dashboard, Batch Order Ingestion Pipeline (CSV/JSON), Immutable Audit Logging.

---

## 16-Week Roadmap & Delivery Status

```
Overall Progress: [██████░░░░░░░░░░░░░░] 31.2% (Month 1 Done, Week 5 Track A & B Delivered: 5 / 16 Weeks Done)
Month 1 Progress: [████████████████████] 100.0% (Weeks 1, 2, 3, and 4 COMPLETED)
Month 2 Progress: [█████░░░░░░░░░░░░░░░] 25.0% (Week 5 Delivered, Week 6 Starting Next)
Month 3 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
Month 4 Progress: [░░░░░░░░░░░░░░░░░░░░] 0.0%
```

| Milestone | Scope & Deliverables | Track A (Manthan Nimodiya) | Track B (Abhayraj Jaiswal) | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 1** | **Foundations, Security & App Shell** | FastAPI Core, DB Engine, Health Probes | RBAC Auth, JWT Security, Command Center UI Shell | `COMPLETED` ✅ |
| **Week 2** | **Fleet Asset Management (US-001 & US-002)** | Fleet CRUD APIs, DB Models, Constraints | Interactive Fleet Workspace UI, Modals, Telemetry Cards | `COMPLETED` ✅ |
| **Week 3** | **RAG Knowledge Base & Shipment Engine** | Vector Store Engine & RAG Ingestion (US-006) | Shipment Models, APIs & Immutable Audit Log (US-002 & US-008) | `COMPLETED` ✅ |
| **Week 4** | **Batch Ingestion & Compliance UI** | RAG Compliance Inspector Search UI | Batch Order Uploader (CSV/JSON), Cluster Preview & Regression Tests | `COMPLETED` ✅ |
| **Week 5** | **Spatial Map & LangGraph Foundation** | Haversine Matrix & Leaflet Map Shell | LangGraph StateGraph & Router Agent (Intent Classifier) | `COMPLETED` ✅ |

- **Automated Backend Test Suite**: `python -m pytest` → **97 / 97 PASSED (100%)**
- **RAG Retrieval Benchmark**: `python -m app.services.rag.evaluation` → **Recall@3 1.00 · MRR 0.98 · p95 < 1 ms** (WikiQA-style eval set)
- **Database Seeder**: `python scripts/seed_demo_data.py` → **Pre-loads 4 roles, 3 hubs, 4 vehicles, 5 drivers, 5 shipments, and audit logs**
- **Live Deployments**:
  - Backend API: [https://fleet-route-opt.onrender.com](https://fleet-route-opt.onrender.com) (FastAPI + PostgreSQL)
  - Frontend Web App: [https://fleet-route-opt.vercel.app](https://fleet-route-opt.vercel.app) (Vite + React 19 SPA)

---

## Architecture Overview

```
                                  +------------------------------------+
                                  |    Dispatch Operations Frontend    |
                                  |    React 19 + TypeScript + Vite    |
                                  +-----------------+------------------+
                                                    |  REST / JWT
                                                    v
                                  +------------------------------------+
                                  |         FastAPI Gateway            |
                                  |     Role-Based Access Control      |
                                  +--------+------------------+--------+
                                           |                  |
                    +----------------------+                  +----------------------+
                    |                                                                |
                    v                                                                v
     +------------------------------+                                 +------------------------------+
     |     Deterministic Core       |                                 |       Multi-Agent AI         |
     |                              |                                 |                              |
     | - VRPTW Solver (Clarke-      |                                 | - LangGraph StateGraph       |
     |   Wright + 2-opt Heuristic)  |                                 | - Router Agent (Intent)      |
     | - Haversine Distance Engine  |                                 | - Policy & Compliance Agent  |
     | - PostgreSQL / SQLAlchemy    |                                 | - Optimization Agent (Tools) |
     | - In-Transit FSM Lifecycle   |                                 | - Zero-Hallucination Guard   |
     +------------------------------+                                 +--------------+---------------+
                                                                                     |
                                                                                     v
                                                                      +------------------------------+
                                                                      |      RAG Knowledge Base      |
                                                                      |                              |
                                                                      | - Vector Store (Embeddings)  |
                                                                      | - Logistics SOPs & Hazmat    |
                                                                      | - Driver Rest Break Rules    |
                                                                      | - Citation & Scoring Engine  |
                                                                      +------------------------------+
```

---

## Directory Structure

```
fleet-route-opt/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py                  # [Track B] JWT authentication & role-based access
│   │   │   ├── fleet.py                 # [Track A] Vehicle, Driver, Hub CRUD & capacity
│   │   │   ├── health.py                # [Track A] Health & readiness probes
│   │   │   ├── rag.py                   # [Track A] Semantic policy search & benchmark
│   │   │   ├── shipments.py             # [Track B] Shipment CRUD & batch ingestion
│   │   │   ├── audit.py                 # [Track B] Immutable audit trail query API
│   │   │   └── router.py                # Central API router aggregator
│   │   ├── core/                        # Security, configuration, database engines
│   │   ├── models/                      # SQLAlchemy 2.0 ORM models
│   │   ├── schemas/                     # Pydantic v2 validation models
│   │   └── services/
│   │       ├── audit_service.py         # Forensic state diff audit logger
│   │       ├── batch_ingestion.py       # High-throughput CSV/JSON parser
│   │       └── rag/                     # Vector store, corpus, embeddings, evaluation
│   ├── scripts/
│   │   └── seed_demo_data.py            # Automated database seeder
│   └── tests/                           # Pytest automated test suites (76/76 passed)
│       ├── test_health.py               # Probe validation (3 tests)
│       ├── test_auth_rbac.py            # JWT & RBAC tests (5 tests)
│       ├── test_fleet_crud.py           # Fleet asset CRUD tests (4 tests)
│       ├── test_shipments_audit.py      # Shipment & audit trail tests (5 tests)
│       ├── test_batch_ingestion.py      # Batch CSV/JSON ingestion tests (10 tests)
│       └── test_rag.py                  # RAG vector store & eval tests (22 tests)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Unified dispatch cockpit & command center
│   │   ├── main.tsx                     # Vite React 19 entrypoint
│   │   └── index.css                    # Design system styling & Tailwind utilities
│   └── package.json                     # Frontend dependencies
├── milestones_tracker.md                # 16-Week master progress tracker (Month 1: 100%)
├── weekly_work_log.md                   # Chronological weekly engineering work log
├── complete_project_overview_and_work_split.md # Comprehensive 50-50 viva presentation guide
└── team_work_split.md                   # 50-50 full-stack & GenAI engineering split
```

---

## Quickstart & Local Setup

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # On Linux/macOS: source venv/bin/activate
pip install -r requirements.txt

# Run database seeder
python scripts/seed_demo_data.py

# Run all 49 regression tests
python -m pytest

# Run RAG retrieval benchmark
python -m app.services.rag.evaluation

# Start development server
uvicorn app.main:app --reload --port 8000
```
Interactive Swagger documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup
```bash
cd frontend
pnpm install  # or npm install
pnpm run build
pnpm run dev
```
Dispatch Cockpit: [http://localhost:5173](http://localhost:5173)

---

## Demo Accounts (Instant Role Switching)

| Role | Email | Password | Primary Console View |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@fleetopt.io` | `password123` | Full System Access & User Governance |
| **Fleet Manager** | `manager@fleetopt.io` | `password123` | Fleet Assets, Vehicles, Hubs & Drivers |
| **Dispatcher** | `dispatch@fleetopt.io` | `password123` | Active Shipments, Batch Ingestion & Map |
| **Driver** | `driver@fleetopt.io` | `password123` | Mobile Cockpit & Telemetry Updates |\n