# FleetOps User Manual

FleetOps plans and runs a day of deliveries across the Mumbai–Pune network: orders come in, the optimizer builds
routes, drivers work through their stops, and an AI copilot helps dispatchers handle breakdowns and delays. Every
change is recorded in an audit trail. This manual is organised by what each role does.

## 1. Getting started

### Run everything with Docker (recommended)

```bash
docker compose up --build
```

Open **http://localhost:8080**. The first start takes a few minutes (images build, PostgreSQL initialises, demo data
is seeded). The API docs are at http://localhost:8080/docs.

### Run for development

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && pnpm install && pnpm dev
```

Open **http://localhost:3000** (the backend allows this origin). Seed demo data once with
`python -m scripts.seed_demo_data` from `backend/`.

### Signing in

The platform opens on a **login page** with two ways in:

- **Sign in** with your email and password. The workspace shows only the sections your role is assigned (for
  example a dispatcher sees orders, planning, tracking and compliance; a driver sees only the mobile app), and every
  request runs with your account's permissions. The account menu (top right) shows who you are and has **Sign out**.
  You stay signed in if you reload, until you sign out or close the tab; an expired session returns you to the login
  page with a message.
- **Explore in demo mode** with no account: pick a profile to start as. A **DEMO** badge and a role switcher appear in
  the header, so you can move between Admin, Fleet manager, Dispatcher and Driver and see every feature with sample
  data. *Exit demo mode* is in the account menu. A deployment can hide demo mode by building the frontend with
  `VITE_DEMO_MODE=false` (`docker-compose.yml` → `frontend.build.args`).

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@fleetopt.io` | `password123` |
| Fleet manager | `manager@fleetopt.io` | `password123` |
| Dispatcher | `dispatcher@fleetopt.io` | `password123` |
| Driver | `driver@fleetopt.io` (Rajesh Kumar) | `password123` |

Sign in with any of these to see that role's view. In demo mode the role switcher at the top right (a dropdown on
phones) changes the view instantly. These accounts exist only on demo installs; production deployments do not
create them.

### Getting around

The left sidebar groups pages into **Operations**, **Assets & policy** and **Governance**. Below 1024 px wide it
becomes a drawer: tap ☰ to open it; it closes when you pick a page. The status box at its foot shows whether the
backend, distance engine and compliance knowledge base are reachable.

## 2. Dispatcher

| Task | Where | How |
|---|---|---|
| See the day at a glance | **AI Command** | Live counts, shipments, and a copilot console. Click a test prompt or type a request. |
| Add or import orders | **Shipments** | *+ New shipment*, or upload a CSV / JSON batch. Rows with errors are listed and skipped; the rest import. |
| Plan one order at a time | **Dispatch Planner** | Review the order, pick a vehicle and driver, dispatch. |
| Plan the whole day | **Route Planner** | *Optimize* builds routes for every vehicle (VRPTW: capacities, time windows, shift limits). Drag stops to reorder; the timing updates. *Approve & dispatch* sends the routes. |
| Watch the routes | **Live Tracking** | Vehicles on the map, ETAs per stop, SLA alerts for stops at risk. |
| Ask a compliance question | **Compliance** | Search the SOP knowledge base; every answer quotes its source. |

### Handling a disruption with the copilot

1. Open the copilot (**AI Copilot** button in the header, or the console on AI Command).
2. Describe what happened, naming the vehicle: *"MH-02-EE-1001 broke down near Sion"*, *"MH-04-AB-2045 stuck in
   traffic, 40 min delay"*, *"Reroute MH-02-EE-1001"*.
3. The copilot answers with a **proposal card**: current vs proposed stop order for every affected vehicle, and the
   change in distance, driving time, cost and minutes late.
4. **Accept** applies it to the live plan (stops move, ETAs update, a spare vehicle is dispatched with a free
   driver from its hub). **Reject** leaves everything as it was. Either way the decision is written to the audit log.

If no driver is free for a spare vehicle, its stops go back to *Unassigned* and the card says so.

## 3. Driver

The driver view opens on **My stops**: the next stop first, with the customer, time window and a *Navigate* link.

- **Depart** → **Arrive** → **Deliver** (recipient name and signature) or **Failed** (pick a reason).
- **Report delay** with minutes and a reason; downstream ETAs shift for the dispatcher.
- **Offline**: actions taken without signal are queued on the phone and sent when the connection returns. Anything
  the server rejects stays in the queue with the reason.
- **Shared phones**: saved stops and queued actions belong to the account that created them. Another driver signing in
  on the same phone never sees or sends them. If the app says *No driver profile linked*, an admin must link the account.
- **Map** shows the route; the toggle in the header switches between stops and map.

## 4. Fleet manager

| Task | Where |
|---|---|
| Vehicles, drivers and hubs | **Fleet Assets** (create and edit; through the API, deleting is admin-only) |
| Executive KPIs | **Executive KPIs** (below) |
| Operational reports | **Reports**: OTIF, transit time, fuel, cost per tonne-km, with CSV / PDF export |
| Audit trail and compliance report | **Audit Log** (below) |

### Executive KPIs

- **Filters** (one row, applies to everything): last 7 / 30 / 90 days or a custom range, hub, vehicle type, driver
  and priority. *Clear* resets them.
- **Right now** follows the live plan and changes as trips progress.
- **KPI tiles** compare each figure with the previous period of the same length; the arrow says whether the change
  is better or worse.
- **Daily delivery volume** and **SLA compliance by time of day**: hover for exact values; *Table* shows the numbers.
- **Where deliveries happen**: a heatmap of delivery attempts per ~2 km square, opening on the busiest hub. The
  buttons above the map jump to another hub or the whole network; hover a square for its on-time rate.
- **Driver efficiency**: ranked by on-time rate, then stops per hour.
- **Exports**: *CSV* on each card downloads that view; *KPIs as CSV* the tiles; *PDF summary* a printable report
  (KPIs with change, weekly volume, weakest hours, driver ranking). Exports use the filters on screen.

With a priority filter, delivery counts cover only those stops, while distance and cost cover the whole trips that
served them.

## 5. Admin

Everything above, plus:

- **Users**: manage accounts and roles. On the API, only an admin can create dispatcher, fleet-manager or admin
  accounts (`POST /api/v1/auth/register` with an admin's token); people who sign up on their own get a driver account.
- **Deleting** hubs, vehicles and drivers (API: admin only).
- **Audit Log → Compliance report**: three checks over the server's audit log, each *Pass*, *Review* or *Fail*:
  - *No missing entries*: entries are numbered without gaps. On PostgreSQL a gap can also come from an aborted
    transaction, so it shows as *Review* rather than *Fail*.
  - *Before / after recorded*: every change keeps both states.
  - *Every status change logged*: each shipment's current status is the last one its audit history recorded.
  
  Pick a date range, then *Export CSV* (opens safely in Excel) or *PDF report* for an auditor.
- **Copilot telemetry** (`GET /api/v1/copilot/telemetry`): latency per agent and LLM token usage.

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Status box says *Backend Offline* | The API is not reachable. Docker: `docker compose ps` and `docker compose logs backend`. Development: start uvicorn on port 8000. |
| "Too many requests. Please wait N seconds" | Rate limit (e.g. 10 sign-in attempts a minute). Wait the stated time. |
| "Only an administrator can create … accounts" | Privileged roles are assigned by an admin from **Users**. |
| Copilot: "Which vehicle?" | Name the vehicle by plate (`MH-04-AB-2045`) or id (`V-101`). |
| Copilot: "No dispatched vehicle matches" | That vehicle has no route today; check **Live Tracking**. |
| Executive KPIs: "date range can be at most 90 days" | Shorten the custom range. History ends yesterday. |
| Request body too large | Uploads are limited to 10 MB; split the file. |

See also: `documentation/API_REFERENCE.md` (every endpoint and who may call it), `documentation/SECURITY_AUDIT.md`,
`documentation/PERFORMANCE.md`.
