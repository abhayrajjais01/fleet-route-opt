"""
test_security_hardening.py - API security audit (Week 14 · Track B: Abhayraj Jaiswal)

Verifies:
1. Security headers on API and docs responses, no-store on authenticated responses.
2. CORS: the dev origin and this project's Vercel deployments are allowed; other origins and other *.vercel.app sites are not.
3. Rate limiting: login brute force gets 429 + Retry-After, buckets refill, health probes are exempt, clients are separate.
4. Oversized request bodies get 413.
5. Input sanitization of names, chat, notes and search, and spreadsheet-formula neutralisation in exports.
6. Copilot telemetry: per-node latency and LLM token usage.
7. Audit compliance report: summary, sequence-gap / snapshot / coverage checks, CSV and PDF.
"""

import pytest

from app.core.http_security import Bucket, TokenBucketLimiter, client_id
from app.core.sanitize import clean_text, csv_safe, like_pattern
from app.models.audit import AuditLog
from app.models.shipment import Shipment, ShipmentStatus
from app.services.copilot import telemetry
from tests.conftest import TestingSessionLocal
from tests.conftest import auth_headers

API = "/api/v1"


def _headers(client, email, role="ADMIN"):
    return auth_headers(client, email, role)


def _hub(client, h, code="HUB-SEC-01"):
    res = client.post(f"{API}/fleet/hubs", headers=h, json={
        "name": "Security Hub", "code": code, "address": "1 Test Road, Mumbai", "latitude": 19.1, "longitude": 72.9,
        "contact_phone": "+91 22 0000 0000"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _shipment(client, h, hub_id, tracking, customer="Acme Retail"):
    res = client.post(f"{API}/shipments", headers=h, json={
        "tracking_number": tracking, "customer_name": customer, "destination_address": "22 Market Street, Mumbai",
        "latitude": 19.05, "longitude": 72.85, "weight_kg": 50, "volume_m3": 0.4, "hub_id": hub_id})
    assert res.status_code == 201, res.text
    return res.json()


# ─── 1. Headers ──────────────────────────────────────────────────────────────────────────────

def test_security_headers_on_api_and_docs(client):
    res = client.get(f"{API}/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in res.headers["content-security-policy"]
    assert "cache-control" not in res.headers                         # anonymous health probe may be cached
    assert "strict-transport-security" not in res.headers            # HSTS only in production

    docs = client.get("/docs")
    assert docs.status_code == 200 and "cdn.jsdelivr.net" in docs.headers["content-security-policy"]

    h = _headers(client, "sec-admin@w14.io")
    me = client.get(f"{API}/auth/me", headers=h)
    assert me.headers["cache-control"] == "no-store"


# ─── 2. CORS ─────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("origin, allowed", [
    ("http://localhost:3000", True),
    ("https://fleet-route-opt.vercel.app", True),
    ("https://fleet-route-opt-git-feature-abc.vercel.app", True),
    ("https://evil-site.vercel.app", False),
    ("https://fleet-route-opt.vercel.app.evil.com", False),
    ("http://localhost:5173", False),
])
def test_cors_origins(client, origin, allowed):
    res = client.options(f"{API}/shipments", headers={"Origin": origin, "Access-Control-Request-Method": "GET",
                                                     "Access-Control-Request-Headers": "authorization"})
    assert (res.headers.get("access-control-allow-origin") == origin) is allowed


def test_cors_exposes_download_and_rate_limit_headers(client):
    res = client.get(f"{API}/health", headers={"Origin": "http://localhost:3000"})
    exposed = res.headers["access-control-expose-headers"].lower()
    assert "content-disposition" in exposed and "retry-after" in exposed


# ─── 3. Rate limiting ────────────────────────────────────────────────────────────────────────

def test_login_brute_force_is_throttled(client):
    statuses = [client.post(f"{API}/auth/login", data={"username": "nobody@w14.io", "password": "wrong"}).status_code
                for _ in range(12)]
    assert statuses[:10] == [statuses[0]] * 10 and statuses[0] in (400, 401, 422)
    assert statuses[10] == 429
    blocked = client.post(f"{API}/auth/login", data={"username": "nobody@w14.io", "password": "wrong"})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) >= 1
    assert "too many requests" in blocked.json()["detail"].lower()
    # health probes are never limited, and other endpoints use their own bucket
    assert client.get(f"{API}/health").status_code == 200
    assert client.get(f"{API}/rag/categories").status_code == 200


def test_token_bucket_refills_and_separates_clients():
    now = [0.0]
    limiter = TokenBucketLimiter(clock=lambda: now[0])
    bucket = Bucket("t", 6, prefixes=("/x",))                          # 6 per minute = one every 10 s
    assert all(limiter.take("a", bucket)[0] for _ in range(6))
    allowed, remaining, retry = limiter.take("a", bucket)
    assert not allowed and remaining == 0 and retry == pytest.approx(10.0)
    assert limiter.take("b", bucket)[0]                               # another client is unaffected
    now[0] = 10.0
    assert limiter.take("a", bucket)[0] and not limiter.take("a", bucket)[0]


def test_client_id_trusts_proxy_header_only_when_configured():
    scope = {"client": ("10.0.0.5", 1234), "headers": [(b"x-real-ip", b"203.0.113.9")]}
    assert client_id(scope, trust_proxy=False) == "10.0.0.5"
    assert client_id(scope, trust_proxy=True) == "203.0.113.9"


# ─── 4. Body size ────────────────────────────────────────────────────────────────────────────

def test_oversized_body_is_rejected(client):
    res = client.post(f"{API}/copilot/query", content=b"x" * (10 * 1024 * 1024 + 1), headers={"Content-Type": "application/json"})
    assert res.status_code == 413


# ─── 5. Sanitization ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw, clean", [
    ("  Mumbai   Hub ", "Mumbai Hub"),
    ("<script>alert(1)</script>Acme <b>Retail</b>", "Acme Retail"),
    ("Acme​ Re‮tail", "Acme Retail"),                     # zero-width + bidi override removed
    ("Ｍｕｍｂａｉ", "Mumbai"),                                          # full-width look-alikes normalised
    ("line\x00one\x07", "lineone"),
    ("delay <30 min and > 10 stops", "delay <30 min and > 10 stops"),  # comparisons are not tags
])
def test_clean_text(raw, clean):
    assert clean_text(raw) == clean


def test_clean_text_multiline_keeps_line_breaks():
    assert clean_text("first\r\n\n\n\nsecond\t  line ", multiline=True) == "first\n\nsecond line"


def test_csv_formula_and_like_escaping():
    assert csv_safe("=HYPERLINK(\"http://x\")") == "'=HYPERLINK(\"http://x\")"
    assert csv_safe("-5") == "-5" and csv_safe("@SUM(A1)") == "'@SUM(A1)" and csv_safe(42) == 42
    assert like_pattern("50%_off") == "%50\\%\\_off%"


def test_schema_inputs_are_cleaned_and_search_is_literal(client):
    h = _headers(client, "sec-clean@w14.io")
    hub = client.post(f"{API}/fleet/hubs", headers=h, json={
        "name": "<img src=x onerror=alert(1)>North​ Hub", "code": "HUB-SEC-09", "address": "9 Test Road, Pune",
        "latitude": 18.5, "longitude": 73.8, "contact_phone": "+91 20 0000 0000"})
    assert hub.status_code == 201 and hub.json()["name"] == "North Hub"

    empty = client.post(f"{API}/fleet/hubs", headers=h, json={
        "name": "<b></b>", "code": "HUB-SEC-10", "address": "9 Test Road, Pune", "latitude": 18.5, "longitude": 73.8,
        "contact_phone": "+91 20 0000 0000"})
    assert empty.status_code == 422                                   # nothing left after cleaning

    hub_id = hub.json()["id"]
    _shipment(client, h, hub_id, "TRK-SEC-1", "50% Off Store")
    _shipment(client, h, hub_id, "TRK-SEC-2", "500 Offers Ltd")
    found = client.get(f"{API}/shipments", params={"search": "50%"}, headers=h).json()
    assert [s["customer_name"] for s in found] == ["50% Off Store"]   # '%' is literal, not a wildcard
    assert client.get(f"{API}/shipments", params={"search": "trk-sec"}, headers=h).json().__len__() == 2

    q = client.post(f"{API}/copilot/query", headers=h, json={"query": "V-101 delayed <30 min​ on NH-48"})
    assert q.status_code == 200 and q.json()["query"] == "V-101 delayed <30 min on NH-48"


# ─── 6. Copilot telemetry ────────────────────────────────────────────────────────────────────

def test_copilot_telemetry_records_latency_and_tokens(client):
    telemetry.buffer.clear()
    h = _headers(client, "sec-tele@w14.io")
    assert client.post(f"{API}/copilot/query", headers=h, json={"query": "Vehicle V-101 broke down near Sion"}).status_code == 200
    with telemetry.track("unit-test") as run:
        telemetry.record_llm_usage({"input_tokens": 1200, "output_tokens": 80, "cache_read_input_tokens": 900}, "claude-test")
    assert run.planner == "claude-test" and run.tokens.total == 2180

    body = client.get(f"{API}/copilot/telemetry", headers=h).json()
    assert body["requests"] == 2 and body["errors"] == 0
    assert body["by_endpoint"]["query"]["count"] == 1
    assert body["by_intent"]["VEHICLE_BREAKDOWN"]["count"] == 1
    assert body["by_node"], "node latencies come from the StateGraph trace"
    assert body["tokens"]["input_tokens"] == 1200 and body["tokens"]["llm_calls"] == 1
    assert body["recent"][0]["endpoint"] == "unit-test"

    dispatcher = _headers(client, "sec-tele-d@w14.io", "DISPATCHER")
    assert client.get(f"{API}/copilot/telemetry", headers=dispatcher).status_code == 403


# ─── 7. Audit compliance report ──────────────────────────────────────────────────────────────

def test_audit_report_checks_and_exports(client):
    h = _headers(client, "sec-audit@w14.io")
    hub_id = _hub(client, h)
    s1 = _shipment(client, h, hub_id, "TRK-AUD-1", "=cmd|' /C calc'!A0")      # formula-looking name
    s2 = _shipment(client, h, hub_id, "TRK-AUD-2")
    assert client.patch(f"{API}/shipments/{s1['id']}/status", headers=h, json={"status": "ASSIGNED", "notes": "planned"}).status_code == 200

    report = client.get(f"{API}/audit/report", headers=h).json()
    assert report["total"] == 4 and report["by_action"] == {"ASSET_CREATED": 3, "STATUS_CHANGE": 1}   # hub + 2 shipments
    assert all(c["ok"] for c in report["checks"].values()), report["checks"]
    assert client.get(f"{API}/audit/report", params={"action_type": "STATUS_CHANGE"}, headers=h).json()["total"] == 1

    csv_text = client.get(f"{API}/audit/export.csv", headers=h)
    assert csv_text.status_code == 200 and "attachment" in csv_text.headers["content-disposition"]
    assert "'=cmd" in csv_text.text and ",=cmd" not in csv_text.text

    pdf = client.get(f"{API}/audit/report.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # Tampering: shipment 2 is marked delivered behind the API's back and its audit entry (id 3 of 4) is deleted.
    db = TestingSessionLocal()
    try:
        db.query(Shipment).filter(Shipment.id == s2["id"]).update({"status": ShipmentStatus.DELIVERED})
        db.query(AuditLog).filter(AuditLog.entity_id == s2["id"], AuditLog.entity_type == "Shipment").delete()
        db.commit()
    finally:
        db.close()
    checks = client.get(f"{API}/audit/report", headers=h).json()["checks"]
    assert not checks["sequence"]["ok"] and checks["sequence"]["gaps"] == [{"after_id": 2, "before_id": 4, "missing": 1}]
    assert not checks["coverage"]["ok"] and checks["coverage"]["untracked"][0]["tracking_number"] == "TRK-AUD-2"

    dispatcher = _headers(client, "sec-audit-d@w14.io", "DISPATCHER")
    assert client.get(f"{API}/audit/report", headers=dispatcher).status_code == 403
    assert client.get(f"{API}/audit/report", params={"date_from": "2026-11-10", "date_to": "2026-11-01"}, headers=h).status_code == 422


# ─── 8. Account creation (security audit findings) ───────────────────────────────────────────

def test_privileged_roles_cannot_be_self_registered(client):
    def register(email, role, headers=None):
        return client.post(f"{API}/auth/register", headers=headers or {}, json={
            "email": email, "password": "Password123!", "full_name": "Someone", "role": role})

    first = register("owner@w14.io", "DRIVER")
    assert first.status_code == 201                                   # the very first account bootstraps as ADMIN
    owner = {"Authorization": f"Bearer {first.json()['access_token']}"}
    assert client.get(f"{API}/auth/me", headers=owner).json()["role"] == "ADMIN"

    for role in ("ADMIN", "FLEET_MANAGER", "DISPATCHER"):
        res = register(f"climber-{role.lower()}@w14.io", role)
        assert res.status_code == 403 and "administrator" in res.json()["detail"]
    assert register("new-driver@w14.io", "DRIVER").status_code == 201  # lowest role stays self-service

    driver = {"Authorization": f"Bearer {client.post(f'{API}/auth/login', json={'email': 'new-driver@w14.io', 'password': 'Password123!'}).json()['access_token']}"}
    assert register("driver-made@w14.io", "ADMIN", driver).status_code == 403
    made = register("ops@w14.io", "FLEET_MANAGER", owner)
    assert made.status_code == 201
    ops = {"Authorization": f"Bearer {made.json()['access_token']}"}
    assert client.get(f"{API}/auth/me", headers=ops).json()["role"] == "FLEET_MANAGER"


def test_demo_account_seeding_is_off_in_production(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "APP_ENV", "production")
    monkeypatch.setattr(settings, "DEMO_ACCOUNTS_ENABLED", None)
    assert client.post(f"{API}/auth/seed-demo-users").status_code == 404
    monkeypatch.setattr(settings, "DEMO_ACCOUNTS_ENABLED", True)          # an explicit opt-in still works
    assert client.post(f"{API}/auth/seed-demo-users").status_code == 200


def test_anonymous_disruption_requests_never_reach_the_llm(client, monkeypatch):
    import app.services.copilot.optimization_agent as agent
    calls = []
    monkeypatch.setattr(agent, "plan_with_claude", lambda *a, **k: calls.append(1) or None)
    body = {"message": "MH-02-EE-1001 broke down near Sion", "use_llm": True,
            "hub": {"id": "hub", "latitude": 19.1136, "longitude": 72.8697},
            "routes": [{"vehicle": {"id": "1", "label": "MH-02-EE-1001", "capacity_kg": 1500, "capacity_m3": 12},
                        "stops": [{"id": "9", "latitude": 19.06, "longitude": 72.83, "weight_kg": 100, "volume_m3": 1}],
                        "departure": "08:30"}],
            "spare_vehicles": [{"id": "5", "label": "MH-43-BX-3310", "capacity_kg": 2500, "capacity_m3": 18}]}
    assert client.post(f"{API}/routes/disruption", json=body).status_code == 200
    assert calls == []                                                  # anonymous: deterministic planner only
    h = _headers(client, "llm-user@w14.io", "DISPATCHER")
    assert client.post(f"{API}/routes/disruption", json=body, headers=h).status_code == 200
    assert calls == [1]                                                 # signed in: the LLM planner is tried


def test_coverage_catches_unlogged_transition_of_an_audited_shipment(client):
    """Review finding: a shipment with an ASSET_CREATED entry whose status is later changed behind the API used to pass."""
    h = _headers(client, "sec-cover@w14.io")
    hub_id = _hub(client, h, code="HUB-SEC-02")
    s = _shipment(client, h, hub_id, "TRK-COV-1")
    assert client.get(f"{API}/audit/report", headers=h).json()["checks"]["coverage"]["ok"]

    db = TestingSessionLocal()
    try:
        db.query(Shipment).filter(Shipment.id == s["id"]).update({"status": ShipmentStatus.IN_TRANSIT})
        db.commit()
    finally:
        db.close()
    coverage = client.get(f"{API}/audit/report", headers=h).json()["checks"]["coverage"]
    assert coverage["status"] == "fail"
    assert coverage["untracked"] == [{"id": s["id"], "tracking_number": "TRK-COV-1", "status": "IN_TRANSIT",
                                      "last_logged_status": "UNASSIGNED"}]

    # Once the change goes through the API it is logged, and coverage passes again.
    assert client.patch(f"{API}/shipments/{s['id']}/status", headers=h, json={"status": "DELIVERED", "notes": "handed over"}).status_code == 200
    assert client.get(f"{API}/audit/report", headers=h).json()["checks"]["coverage"]["ok"]


def test_sequence_gaps_are_for_review_on_postgresql(client, monkeypatch):
    """Review finding: PostgreSQL sequences skip ids on rolled-back transactions, so a gap there is not proof of deletion."""
    import app.services.audit_report as audit_report
    h = _headers(client, "sec-seq@w14.io")
    hub_id = _hub(client, h, code="HUB-SEC-03")
    s1 = _shipment(client, h, hub_id, "TRK-SEQ-1")
    _shipment(client, h, hub_id, "TRK-SEQ-2")
    db = TestingSessionLocal()
    try:
        db.query(AuditLog).filter(AuditLog.entity_type == "Shipment", AuditLog.entity_id == s1["id"]).delete()
        db.commit()
    finally:
        db.close()

    sqlite = client.get(f"{API}/audit/report", headers=h).json()["checks"]["sequence"]
    assert sqlite["status"] == "fail" and not sqlite["ok"]               # SQLite never skips ids: a gap is a deletion

    monkeypatch.setattr(audit_report, "_dialect", lambda db: "postgresql")
    pg = client.get(f"{API}/audit/report", headers=h).json()["checks"]["sequence"]
    assert pg["status"] == "warn" and pg["ok"] and pg["gaps"] and "aborted transaction" in pg["note"]
    pdf = client.get(f"{API}/audit/report.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
