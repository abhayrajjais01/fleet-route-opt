# AI Fleet Route Optimizer

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Vite](https://img.shields.io/badge/Vite-8.3.0-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![React](https://img.shields.io/badge/React-19.3.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.14+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00.svg)](https://www.sqlalchemy.org)
[![Tests](https://img.shields.io/badge/Tests-17%2F17%20Passed%20(100%25)-brightgreen.svg)](https://github.com/abhayrajjais01/fleet-route-opt)
[![Render](https://img.shields.io/badge/Backend-Render-46E3B7.svg?logo=render&logoColor=white)](https://fleet-route-opt.onrender.com)
[![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000.svg?logo=vercel&logoColor=white)](https://fleet-route-opt.vercel.app)

An enterprise-grade AI solution for Fleet Route Optimization that addresses critical operational efficiency, multi-stop routing complexity (Vehicle Routing Problem with Time Windows — VRPTW), dynamic disruption handling, and dispatch automation in the Logistics and Supply Chain sector.

The platform fuses **deterministic graph optimization algorithms (DSA / VRPTW)** with **multi-agent generative AI (LangGraph)** and **Retrieval-Augmented Generation (RAG)** grounded in enterprise logistics SOPs and transport compliance regulations.

---

## Authors & 50-50 Engineering Leads

- **Manthan Nimodiya** — *Track A Lead: RAG Systems, Vector Store, VRPTW Solver, Routing & Map Operations*
- **Abhayraj Jaiswal** — *Track B Lead: Multi-Agent Architecture, Governance & Audit Trail, Shipment Ingestion, FSM Telemetry & Platform*

For complete weekly details and evaluation guides:
- [complete_project_overview_and_work_split.md](complete_project_overview_and_work_split.md): Plain English project overview and full breakdown of work done by each engineer.
- [team_work_split.md](team_work_split.md): 50-50 balanced RACI matrix & 16-week engineering roadmap.
- [milestones_tracker.md](milestones_tracker.md): Master live progress tracker across all 16 weeks.
- [weekly_work_log.md](weekly_work_log.md): Weekly chronological project journal.
- [conflict_free_architecture_guide.md](conflict_free_architecture_guide.md): Domain file isolation and parallel engineering protocol.

---

## Live Roadmap & Milestone Status

| Milestone | Scope & Deliverables | Track A (Manthan Nimodiya) | Track B (Abhayraj Jaiswal) | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Week 1** | **Foundations, Security & App Shell** | FastAPI Core, DB Engine, Health Probes | RBAC Auth, JWT Security, Command Center UI Shell | `COMPLETED` ✅ |
| **Week 2** | **Fleet Asset Management (US-002)** | Fleet CRUD APIs, DB Models, Constraints | Interactive Fleet Workspace UI, Modals, Telemetry Cards | `COMPLETED` ✅ |
| **Week 3** | **RAG Knowledge Base & Shipment Engine** | Vector Store Engine & RAG Ingestion (US-006) | Shipment Models, APIs & Immutable Audit Log (US-002 & US-008) | `IN PROGRESS` ⏳ *(Track B Done)* |
| **Week 4** | **Batch Ingestion & RAG Inspector** | RAG Compliance Inspector Search UI | Batch Order Uploader & Month 1 Regression Tests | `PLANNED` |

- **Automated Backend Test Suite**: `python -m pytest` → **17 / 17 PASSED (100%)**
- **Database Seeder**: `python scripts/seed_demo_data.py` → **Pre-loads 4 roles, 3 hubs, 4 vehicles, 5 drivers, 5 shipments, and audit logs**
- **Live Deployments**:
  - Backend API: [https://fleet-route-opt.onrender.com](https://fleet-route-opt.onrender.com) (FastAPI + PostgreSQL)
  - Frontend Web App: [https://fleet-route-opt.vercel.app](https://fleet-route-opt.vercel.app) (Vite + React 19 SPA)

---

## Architecture & System Workflow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AI FLEET ROUTE OPTIMIZER ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│ [Frontend: Vite 8 / React 19 / TypeScript / Tailwind CSS v4 / Interactive Canvas]      │
│  ├── Executive Command Center Console & Live Telemetry Ribbon                          │
│  ├── Interactive Workflow Canvas & Drag-and-Drop Node Visualizer                       │
│  ├── Fleet Asset Management Workspace (Vehicles, Drivers, Hubs with CRUD Modals)       │
│  ├── Shipment Ingestion & Order Manifest Directory                                    │
│  ├── AI Copilot Sliding Drawer (Multi-Turn Chat, Execution Traces, Action Cards)       │
│  └── Compliance Knowledge Inspector (SOP Search & Hazmat Citations)                    │
│                                │                                                       │
│                                ▼ (REST API / Bearer JWT Auth)                          │
│ [Backend: FastAPI / Python 3.14 / SQLAlchemy 2.0]                                      │
│  ├── Core Infrastructure: Config (Pydantic Settings), PBKDF2/JWT Auth, Logger         │
│  ├── Dual Database Engine: SQLite (Local Zero-Config) & PostgreSQL (Production)        │
│  │                                                                                     │
│  ├── Track A Engines (Manthan Nimodiya):                                               │
│  │   ├── RAG Knowledge Base & Vector Store (Cosine Similarity Store & SOP Ingestion)   │
│  │   ├── Zero-Hallucination Guardrails & Confidence Scoring Engine                     │
│  │   ├── Deterministic VRPTW Solver (Clarke-Wright Savings + 2-opt Heuristic)          │
│  │   └── Spatial Engine (Haversine Distance Matrix & Road Detour Correction)           │
│  │                                                                                     │
│  └── Track B Engines (Abhayraj Jaiswal):                                               │
│      ├── LangGraph Multi-Agent Engine (StateGraph, Router Agent, Policy Agent)         │
│      ├── Shipment Domain Engine (Time Windows [start, end], Parcel Capacity Checks)    │
│      ├── In-Transit State Machine (FSM: UNASSIGNED → IN_TRANSIT → COMPLETED)            │
│      ├── Driver Action API & Real-Time Telemetry Tracking                              │
│      └── Immutable Audit Logging System (Forensic State Diffs & Tamper-Proof Trail)    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Capabilities (PRD Alignment)

| Feature | PRD Priority | Description |
| :--- | :---: | :--- |
| **RBAC Authentication (US-001)** | `MUST` | Secure password hashing (`bcrypt`), signed JWT issuance, and 4 role authorization tiers (`ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `DRIVER`). |
| **Fleet Asset Management (US-002)** | `MUST` | Relational CRUD models for Hubs, Vehicles, and Drivers with database check constraints, capacity aggregations, and interactive UI modals. |
| **Shipment Order Ingestion (US-002)** | `MUST` | Discrete parcel consignments with delivery time windows, cargo weights/volumes, geocoded coordinates, and priority classifications. |
| **Deterministic VRPTW Solver (US-003)** | `MUST` | Clarke-Wright Savings heuristic + 2-opt local search solving up to 50 stops across 5 vehicles in <5.0 seconds. |
| **Interactive Map & Manifest (US-004)** | `MUST` | Interactive Leaflet map canvas rendering color-coded vehicle polylines, sequenced stop pins, and split-screen route manifest. |
| **Multi-Agent AI Copilot (US-005)** | `MUST` | LangGraph `StateGraph` with intent-classifying Router Agent, RAG-grounded Policy Agent, and Optimization Agent with human-in-the-loop proposals. |
| **RAG Compliance Engine (US-006)** | `MUST` | Grounded in Lewis et al. (2020) principles. Vectorized logistics SOPs (Hazmat ADR/DOT, driver rest mandates) with source citations. |
| **Operational KPI Dashboard (US-007)** | `SHOULD` | Executive dashboard tracking On-Time In-Full (OTIF) rate, transit duration, fuel burn index, and fleet capacity utilization. |
| **Dynamic Telemetry & FSM (US-008)** | `MUST` | Real-time driver action updates (`ARRIVED`, `COMPLETED`, `FAILED`, `DELAYED`), downstream ETA shifts, and immutable audit logs. |

---

## Balanced Two-Person Team Allocation (50-50 Split)

| Dimension | Track A: Manthan Nimodiya | Track B: Abhayraj Jaiswal |
| :--- | :--- | :--- |
| **Domain** | **RAG Knowledge Base, VRPTW Solver & Map** | **Multi-Agent Architecture, Governance & Platform** |
| **GenAI / AI** | Vector DB, Embedding Pipeline, SOP RAG, Optimization Agent | LangGraph StateGraph, Router Agent, Policy Agent, Copilot Drawer |
| **Full-Stack / Core** | VRPTW Solver, Leaflet Map, Resequencing, Compliance UI | RBAC Auth, Fleet Workspace UI, Shipment Engine, Audit Logger & UI |
| **Database Models** | Vehicle, Driver, Hub, Route, RouteStop Models | User, Shipment, AuditLog Models |
| **Algorithms** | Cosine Similarity, Clarke-Wright Savings, 2-opt | Intent Classifier, FSM Lifecycle Transitions, Audit Interceptor |

---

## Directory Structure

```
fleet-route-opt/
├── backend/
│   ├── app/
│   │   ├── core/                        # Shared: Config, Database engine, Security (PBKDF2/JWT), Logging
│   │   ├── models/                      # SQLAlchemy ORM models
│   │   │   ├── base.py                  # TimestampMixin & Base
│   │   │   ├── fleet.py                 # [Track A] Hub, Vehicle, Driver
│   │   │   ├── user.py                  # [Track B] User & UserRole enums
│   │   │   ├── shipment.py              # [Track B] Shipment, ShipmentPriority, ShipmentStatus
│   │   │   └── audit.py                 # [Track B] AuditLog & AuditAction enums
│   │   ├── schemas/                     # Pydantic v2 data validation schemas
│   │   │   ├── auth.py                  # User & Token schemas
│   │   │   ├── fleet.py                 # Hub, Vehicle, Driver schemas
│   │   │   ├── shipment.py              # Shipment validation schemas
│   │   │   └── audit.py                 # Audit log query schemas
│   │   ├── services/
│   │   │   ├── audit_service.py         # [Track B] Automated audit event recorder
│   │   │   ├── optimizer/               # [Track A] VRPTW Solver, Haversine Matrix
│   │   │   ├── copilot/                 # [Joint] LangGraph StateGraph, Router, Policy Agents
│   │   │   └── rag/                     # [Track A] Vector Store, SOPs, Knowledge Base
│   │   ├── api/v1/                      # REST API routers
│   │   │   ├── health.py                # Health & readiness probes
│   │   │   ├── auth.py                  # [Track B] Authentication & role switching
│   │   │   ├── fleet.py                 # [Track A] Fleet asset CRUD
│   │   │   ├── shipments.py             # [Track B] Shipment order CRUD & status updates
│   │   │   ├── audit.py                 # [Track B] Audit trail query endpoints
│   │   │   └── router.py                # Central API router aggregator
│   │   └── main.py                      # FastAPI root entrypoint, CORS & lifespan
│   ├── scripts/
│   │   └── seed_demo_data.py            # Automated database seeder (Users, Assets, Orders, Logs)
│   ├── tests/                           # Pytest automated test suites (17/17 passed)
│   │   ├── test_health.py               # Probe validation (3 tests)
│   │   ├── test_auth_rbac.py            # JWT & RBAC tests (5 tests)
│   │   ├── test_fleet_crud.py           # Fleet asset CRUD tests (4 tests)
│   │   └── test_shipments_audit.py      # Shipment & audit trail tests (5 tests)
│   └── requirements.txt                 # Backend Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Unified interactive command center & workflow canvas
│   │   ├── main.tsx                     # React 19 entrypoint
│   │   ├── index.css                    # Tailwind CSS v4 design tokens
│   │   └── lib/                         # Shared data contracts, API client & auth context
│   ├── index.html                       # HTML template
│   ├── package.json                     # Vite 8 + React 19 dependencies
│   ├── vite.config.ts                   # Vite configuration
│   └── vercel.json                      # Vercel Vite build & SPA rewrite config
│
├── complete_project_overview_and_work_split.md # Plain English master project guide & work split
├── conflict_free_architecture_guide.md         # Parallel development engineering protocol
├── milestones_tracker.md                      # Live 16-week progress tracker
├── team_work_split.md                         # Two-person engineering allocation breakdown
├── weekly_work_log.md                         # Weekly chronological work journal
└── README.md                                  # Main documentation (this file)
```

---

## Getting Started

### Prerequisites
- **Python**: `3.11+` (Compatible with Python `3.14`)
- **Node.js**: `v18.0+` (Tested on `v20` / `v22` / `v25`)
- **pnpm**: `v9.0+` or `npm`

---

### 1. Backend Setup (FastAPI)

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows (PowerShell):
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
python -m pip install -r requirements.txt

# Run all 17 automated tests
python -m pytest

# Seed demo data (creates demo users, hubs, vehicles, drivers, shipments & audit logs)
python scripts/seed_demo_data.py

# Start the development server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Interactive API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Alternative API Documentation (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check Probe**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

### 2. Frontend Setup (Vite + React 19)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies using pnpm (or npm)
pnpm install

# Start the Vite dev server
pnpm run dev
```

- **Interactive Command Center**: [http://localhost:3000](http://localhost:3000)

---

### Demo Accounts for Live Evaluation

The automated seeder (`python scripts/seed_demo_data.py`) creates the following test personas:

| Role | Email | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@fleetopt.io` | `password123` | Full system access, governance, audit logs, and settings |
| **Fleet Manager** | `manager@fleetopt.io` | `password123` | Asset CRUD (Hubs, Vehicles, Drivers), fleet capacity overview |
| **Dispatcher** | `dispatcher@fleetopt.io` | `password123` | Route optimization, shipment creation, AI Copilot, live map |
| **Driver** | `driver@fleetopt.io` | `password123` | Read-only shipments, live stop status updates (`IN_TRANSIT` / `DELIVERED`) |

---

## Scientific Principles & Citations

1. **RAG Architecture**: Lewis, P., et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*. [arXiv:2005.11401](https://arxiv.org/abs/2005.11401).
2. **Benchmark QA**: Microsoft Research. *WikiQA: A Challenge Evaluation Dataset for Open-Domain Question Answering*. [WikiQA Dataset](https://www.microsoft.com/en-us/research/project/wikiqa-dataset/).
3. **VRPTW Heuristics**: Clarke, G. and Wright, J.W. (1964). *Scheduling of Vehicles from a Central Depot to a Number of Delivery Points*. Operations Research.

---

## License

Enterprise Proprietary — Copyright © 2026 Abhayraj Jaiswal & Manthan Nimodiya. All rights reserved.
