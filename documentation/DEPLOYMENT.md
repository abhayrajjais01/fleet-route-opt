# Deployment Runbook

How to deploy, configure, seed and operate the FleetOps backend and frontend. For day-to-day use of the app see
[USER_MANUAL.md](USER_MANUAL.md); for security settings see [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

## 1. What runs

| Service | Image / command | Port | Notes |
|---|---|---|---|
| `db` | PostgreSQL 16 | 5432 | Any PostgreSQL 13+ works. SQLite (`sqlite:///./fleet_opt.db`) is for local development only. |
| `backend` | `backend/Dockerfile` (multi-stage, non-root) → uvicorn | 8000 | Waits for the database, creates tables, applies migrations, optionally seeds demo data. |
| `frontend` | `frontend/Dockerfile` → Nginx | 80 | Serves the built app and proxies `/api` to the backend (same origin, no CORS needed). |
| OSRM (optional) | `ghcr.io/project-osrm/osrm-backend` | 5000 | Road routing. Without it the API uses the public demo server or the offline estimate. |

## 2. Quick start (everything on one machine)

```bash
cp backend/.env.example backend/.env      # then edit SECRET_KEY at least
SECRET_KEY="$(openssl rand -hex 32)" docker compose up --build
```

Open http://localhost. The compose file seeds the demo network (`SEED_DEMO_DATA=true`); turn that off for real data.

## 3. Configuration (backend environment)

| Variable | Default | Production value |
|---|---|---|
| `APP_ENV` | `development` | `production` (turns off demo-account seeding through the API) |
| `DATABASE_URL` | SQLite file | `postgresql+psycopg2://user:pass@host:5432/fleet_opt` |
| `SECRET_KEY` | development key | a long random value (`openssl rand -hex 32`); rotating it signs everyone out |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 1440 | shorter if devices are shared |
| `BACKEND_CORS_ORIGINS` | localhost + Vercel | only the origins that serve the frontend (not needed behind the bundled Nginx) |
| `TRUST_PROXY_HEADERS` | `False` | `True` only behind the bundled Nginx (it sets `X-Real-IP`) |
| `RATE_LIMIT_*` | see `.env.example` | per worker; scale limits with `WEB_CONCURRENCY` |
| `ROAD_ROUTING` | `osrm` | `osrm` (or `estimate` for air-gapped installs) |
| `OSRM_URL` | public demo server | your own OSRM, e.g. `http://osrm:5000` |
| `OSRM_TIMEOUT_S` | 6 | 2–3 for a server on the same network |
| `TRAFFIC_MODEL` | `True` | `True` |
| `ANTHROPIC_API_KEY` | unset | optional: enables the Claude planner for the Optimization Agent |
| `SEED_DEMO_DATA` | `false` | `false` |
| `WEB_CONCURRENCY` | 2 | about 2 × CPU cores |

Frontend build arguments: `VITE_API_URL` (empty behind Nginx, else the API origin) and `VITE_DEMO_MODE`
(`false` hides demo mode on the login page).

## 4. Database

- **Tables and migrations** are applied by `scripts/docker_entrypoint.py` on every start (idempotent).
- **Demo data**: `python scripts/seed_demo_data.py` adds the Mumbai – Navi Mumbai – Pune demo network (3 hubs,
  6 vehicles, 7 drivers with linked logins, 11 shipments) and the demo accounts. It never changes existing rows.
- **Resetting a demo database**: `python scripts/seed_demo_data.py --reset` drops **every table** first. Never run
  it against production. Take a backup first (below).
- **Backups (PostgreSQL)**: `pg_dump -Fc "$DATABASE_URL" > fleetops-$(date +%F).dump`; restore with
  `pg_restore --clean -d "$DATABASE_URL" fleetops-YYYY-MM-DD.dump`. Schedule daily dumps and keep 14 days.

## 5. Road routing (OSRM)

The API asks OSRM for road distances, drive times and turn-by-turn directions. Results are cached per stop set;
a circuit breaker skips OSRM for 60 s after a failure so an outage costs one timeout, not one per request. The
offline estimate is always the fallback, and every routing response says which source it used
(`distance_source` / `source`).

The public server (`router.project-osrm.org`) has no service guarantee and limits request rates: use it for demos
only. To run your own on the India road network (about 30 minutes and 8 GB RAM to prepare):

```bash
mkdir osrm && cd osrm
# Download an extract for the region you serve from https://download.geofabrik.de/asia/india.html
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/<region>-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/<region>-latest.osrm
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/<region>-latest.osrm
docker run -d -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld --max-table-size 250 /data/<region>-latest.osrm
```

Then set `OSRM_URL=http://<host>:5000`. Rebuild the data monthly to pick up new roads.

## 6. Health and monitoring

| Check | Expect |
|---|---|
| `GET /api/v1/health` | `200`: process up |
| `GET /api/v1/ready` | `200` with database status: ready for traffic (use for load-balancer health checks) |
| Logs: `OSRM unavailable (...)` | routing fell back to estimates for 60 s; investigate if it repeats |
| `GET /api/v1/copilot/telemetry` (admin) | agent latency and LLM token usage |
| `python -m scripts.benchmark` | solver, routing, RAG and agent timings against the PRD targets (see PERFORMANCE.md) |

## 7. Release and rollback

1. Run the checks: `cd backend && pytest -q` and `cd frontend && pnpm build`.
2. Back up the database (section 4).
3. Deploy the new images (`docker compose pull && docker compose up -d`, or the platform's deploy).
4. Smoke test: sign in, open Route Planner, optimise sample orders, open Live Tracking.
5. Roll back by redeploying the previous image tag. Migrations only add columns or tables, so the previous version
   keeps working against the newer schema; restore the backup only if data was damaged.

## 8. Production checklist

- [ ] `APP_ENV=production`, a random `SECRET_KEY`, `SEED_DEMO_DATA=false`, `VITE_DEMO_MODE=false`
- [ ] PostgreSQL with daily backups, restore tested
- [ ] Own OSRM server (or `ROAD_ROUTING=estimate` if road routing is not wanted)
- [ ] HTTPS in front of Nginx; `TRUST_PROXY_HEADERS=True` only there
- [ ] At least one admin account created, demo accounts absent
