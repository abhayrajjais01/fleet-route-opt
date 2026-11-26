# API Security Audit (Week 14)

Track B, Abhayraj Jaiswal. Scope: every FastAPI endpoint under `/api/v1`, the CORS policy, user-facing text inputs,
exports, and the audit trail. Tests: `backend/tests/test_security_hardening.py` (28 cases),
`backend/tests/test_fleet_crud.py::test_fleet_endpoints_require_authentication_and_roles`, and the end-to-end
regression `backend/tests/test_e2e_regression.py`.

## Findings and fixes

| # | Severity | Finding | Fix | Verified by |
|---|---|---|---|---|
| 1 | Critical | **Anyone could register as `ADMIN`.** `POST /auth/register` accepted the requested role from the request body. | Only the very first account bootstraps as admin. Afterwards self-registration creates `DRIVER` accounts only; any other role needs a signed-in admin's token (`403` otherwise). | `test_privileged_roles_cannot_be_self_registered` |
| 2 | Critical | **Fleet endpoints had no authentication.** Anonymous callers could create, edit and delete hubs, vehicles and drivers. | Reads need a signed-in user; create / update need `ADMIN` or `FLEET_MANAGER`; delete needs `ADMIN`. | `test_fleet_endpoints_require_authentication_and_roles` |
| 3 | High | **Fleet changes were not audited.** Creating, editing or deleting assets left no trace. | Every fleet change writes `ASSET_CREATED` / `ASSET_UPDATED` / `ASSET_DELETED` with before / after snapshots. | `test_full_operating_day` (audit totals per entity) |
| 4 | High | **Demo accounts with a published password could be created on any deployment** (`POST /auth/seed-demo-users`, open). | Off when `APP_ENV=production` unless `DEMO_ACCOUNTS_ENABLED=true` is set explicitly (returns `404`). The Docker image runs in production mode; its entrypoint seeds demo data directly. | `test_demo_account_seeding_is_off_in_production` |
| 5 | High | **CORS allowed every `*.vercel.app` site, with credentials.** Any Vercel-hosted page could call the API from a signed-in browser. | Only `fleet-route-opt` and its preview deployments (`fleet-route-opt-*.vercel.app`) match. Methods and headers are explicit. | `test_cors_origins` (6 origins) |
| 6 | Medium | **No rate limiting.** Login could be brute-forced; the solver, agents and PDF exports could be flooded. | Per-client token buckets: login / register 10/min, AI agents 60/min, exports 20/min, rest 600/min. `429` + `Retry-After`. Health probes exempt. | `test_login_brute_force_is_throttled`, `test_token_bucket_refills_and_separates_clients` |
| 7 | Medium | **Anonymous callers could make the server call Claude** via `POST /routes/disruption` (paid LLM usage). | Anonymous requests always use the deterministic planner; only signed-in users reach the LLM planner. | `test_anonymous_disruption_requests_never_reach_the_llm` |
| 8 | Medium | **No input sanitisation.** Names, addresses, notes and chat accepted HTML, control characters and invisible Unicode (bidi overrides, zero-width), which then reached the dashboard, audit log, exports and agents. | All user text is cleaned at the schema boundary (`app/core/sanitize.py`): NFKC normalisation, control / invisible characters removed, tags stripped (comparisons such as `<30 min` kept), whitespace collapsed. | `test_clean_text` (6 cases), `test_schema_inputs_are_cleaned_and_search_is_literal` |
| 9 | Medium | **Spreadsheet formula injection in exports.** A customer named `=HYPERLINK(...)` would run as a formula in Excel. | Text cells starting with `= + - @` are prefixed with `'` in the audit CSV. | `test_csv_formula_and_like_escaping`, `test_audit_report_checks_and_exports` |
| 10 | Low | **Missing security headers; responses cacheable; server banner.** | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, a strict CSP on API responses (Swagger-specific CSP on `/docs`), HSTS in production, `Cache-Control: no-store` on authenticated responses, no `Server` header. | `test_security_headers_on_api_and_docs` |
| 11 | Low | **Unbounded request bodies.** | Bodies over 10 MB get `413` before they are read (Nginx enforces the same limit). | `test_oversized_body_is_rejected` |
| 12 | Low | **Frontend could not read download filenames** (`Content-Disposition` not exposed cross-origin). | Exposed with the rate-limit headers. | `test_cors_exposes_download_and_rate_limit_headers` |
| 13 | High | **A driver could act on any shipment.** Arrive, deliver, fail and delay (live and offline sync) did not check whose vehicle the shipment was on, and a same-named sign-up matched an already linked driver profile. | Drivers may act only on shipments on their own vehicle (`403` otherwise); a profile linked to an account is never matched by name. Cached stops and queued actions are stored per account on the device. | `test_driver_cannot_act_on_another_drivers_shipments`, `test_same_name_does_not_take_over_a_linked_driver_profile` |
| 14 | Critical | **Deliveries could be confirmed with no proof.** The apps sent `OTP-VERIFIED` / `SIG-VERIFIED` placeholders, and `PATCH /shipments/{id}/status` let any driver mark any shipment delivered. | `DELIVERED` needs the customer's 6-digit code (verified by the server, hidden from drivers, locked after 5 wrong attempts) or a drawn signature. No other endpoint can set it, offline sync included. | `test_delivery_proof.py` |
| 15 | High | **Passwords could not be changed or reset.** | Change password, forgot password, admin reset with a one-time temporary password. Temporary passwords must be replaced before anything else works; any change ends older sessions. | `test_passwords.py` |
| 16 | High | **Dispatches lived in one browser.** A refresh lost them and dispatchers could overwrite each other. | Plans are saved in one transaction with conflict detection (`409`, including route order and departure time) and safety rules for every vehicle touched (driver, vehicle in service, hazmat). Editing the hazard class of a dispatched order, or departing on another truck, rechecks the whole load. | `test_dispatch_plan.py` |
| 17 | High | **The Policy Agent's hazmat rule was wrong** (Class 3 with 8). | It uses the route planner's SOP-HZ-001 §5 rules. | `test_coload_rule_matches_the_sop_and_the_planner` |

## Input sanitisation coverage

| Interface | Fields cleaned |
|---|---|
| Copilot chat, disruption proposals, guardrail check | `query`, `message` (line breaks kept) |
| RAG compliance search | `query` |
| Shipment search | `GET /shipments?search=` (cleaned, and `%` / `_` match literally) |
| Shipments (single, batch, update, status notes) | tracking number, customer, address, hazard class, notes |
| Fleet assets | hub name / code / address / phone / hours, vehicle name / plate, driver name / licence / phone |
| Transit (driver actions) | notes, delay reason, recipient name, signature |
| Accounts | full name |

SQL injection is prevented by SQLAlchemy's bound parameters everywhere; the free-text search also escapes LIKE
wildcards. HTML output is escaped by React and by the Leaflet popup helper (`escapeHtml`).

## Audit trail compliance report

`GET /audit/report`, `/audit/export.csv` and `/audit/report.pdf` (admin, fleet manager) run three checks over the
whole log, shown as pass / fail on the Audit Log page:

1. **Sequence**: audit ids should be gap-free. On SQLite an aborted insert does not consume an id, so a gap means a
   removed entry (**fail**). PostgreSQL sequences are never rolled back, so there a gap may be an aborted transaction
   and is reported for **review**, not as tampering.
2. **Snapshots**: every status change and update carries both the before and after state.
3. **Coverage**: every shipment's current status must equal the last status its audit history recorded (or
   `UNASSIGNED` if it has none, which is how every shipment starts). A status changed behind the API fails the check
   even when the shipment has other audit entries.

`test_audit_report_checks_and_exports`, `test_coverage_catches_unlogged_transition_of_an_audited_shipment` and
`test_sequence_gaps_are_for_review_on_postgresql` tamper with the database (delete an entry, change a status behind
the API) and assert the checks report it, with the right severity per database.

## Multi-agent telemetry

Every copilot query and proposal is logged once (`copilot.telemetry` log line) with end-to-end latency, per-node
latency from the StateGraph trace, the planner used and LLM token usage (input, output, cache). `GET /copilot/telemetry`
(admin, fleet manager) returns p50 / p95 / max per endpoint, intent and node, token totals and the 20 most recent
requests.

## Residual risks and recommendations

- **Public compute endpoints.** `/routes/*` (solver, ETAs, explanations), `/rag/*` and `/reports/*` remain open,
  because the Route Planner, Compliance Inspector and Reports pages call them without a token. They take
  caller-supplied or simulated data, write nothing, and are rate-limited. Recommended next step: send the session
  token from those pages and require a signed-in user.
- **Rate limits are per process.** With `WEB_CONCURRENCY=2` each worker keeps its own buckets, so the effective limit
  doubles. A shared store (Redis) would make them exact across workers and replicas.
- **Tokens live in browser memory** and last 24 hours; there is no revocation list. Shorter tokens with refresh,
  or server-side sessions, would allow logout-everywhere.
- **`SECRET_KEY`** has a development default. Production deployments must set their own (the compose file reads
  `SECRET_KEY` from the environment).
- **Audit sequence check** cannot prove deletion on PostgreSQL (ids skip on rollbacks) and never detects in-place
  edits. Hash-chaining each entry to the previous one (serialised writes) would make both detectable.
