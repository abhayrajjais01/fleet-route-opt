"""
test_reports.py - Weeks 13-14 (Track A): metrics engine, simulated history, CSV and PDF exports.
"""

import csv
import io
from datetime import date

import pytest

from app.services.analytics.history import simulate_day, simulated_history
from app.services.analytics.metrics import StopRecord, TripRecord, breakdown, compute_metrics, filter_trips


def trip(trip_id="t1", hub="H1", vtype="VAN", stops=None, km=50, separate=100, minutes=240, load=1000, payload=2000, kpl=10):
    return TripRecord(trip_id, "2026-11-01", hub, "MH-01", vtype, "Asha", km, separate, minutes, load, payload, kpl, stops or [])


def stop(arrival, close=600, delivered=True, in_full=True):
    return StopRecord("s", "Cust", close, arrival, delivered, in_full, 100)


def test_otif_requires_on_time_and_in_full():
    t = trip(stops=[stop(500), stop(700), stop(500, in_full=False), stop(None, delivered=False)])
    m = compute_metrics([t])
    assert m.stops == 4
    assert m.otif_pct == 25.0          # only the first stop is on time AND in full
    assert m.on_time_pct == 50.0       # stops 1 and 3
    assert m.sla_breach_pct == 25.0    # stop 2 arrived after close
    assert m.failed_pct == 25.0
    assert m.in_full_pct == pytest.approx(66.7)


def test_efficiency_fuel_and_cost_formulas():
    m = compute_metrics([trip(km=50, separate=100, minutes=240, load=1000, kpl=10)], fuel_price_per_l=100, driver_cost_per_hour=200)
    assert m.route_efficiency_index == 2.0          # 100 separate km / 50 actual
    assert m.fuel_l == 5.0 and m.fuel_l_per_100km == 10.0
    # cost = 5 L x 100 + 4 h x 200 = 1300; ton-km = 1 t x 50 km x 0.5 = 25
    assert m.total_cost == 1300 and m.cost_per_ton_km == 52.0
    assert m.fleet_utilisation_pct == 50.0


def test_empty_input_is_safe():
    m = compute_metrics([])
    assert m.trips == 0 and m.otif_pct == 0.0 and m.cost_per_ton_km == 0.0


def test_breakdown_and_filters():
    trips = [trip("a", hub="H1", vtype="VAN"), trip("b", hub="H2", vtype="EV"), trip("c", hub="H2", vtype="VAN")]
    assert set(breakdown(trips, lambda t: t.hub)) == {"H1", "H2"}
    assert [t.trip_id for t in filter_trips(trips, hub="H2", vehicle_type="VAN")] == ["c"]


def test_simulated_history_is_deterministic_and_plausible():
    day = date(2026, 11, 2)
    a, b = simulate_day(day), simulate_day(day)
    assert [t.trip_id for t in a] == [t.trip_id for t in b]
    assert [s.arrival for t in a for s in t.stops] == [s.arrival for t in b for s in t.stops]
    m = compute_metrics(simulated_history(14))
    assert m.trips > 20 and 80 <= m.otif_pct <= 100 and m.route_efficiency_index > 1


@pytest.fixture
def auth():
    """Bearer headers for a fleet manager (reports are restricted to managers and dispatchers)."""
    from tests.conftest import TestingSessionLocal
    from app.core.security import create_access_token, hash_password
    from app.models.user import User, UserRole
    db = TestingSessionLocal()
    db.add(User(email="manager@test.io", hashed_password=hash_password("x"), full_name="M", role=UserRole.FLEET_MANAGER))
    db.add(User(email="driver@test.io", hashed_password=hash_password("x"), full_name="D", role=UserRole.DRIVER))
    db.commit(); db.close()
    return {"Authorization": f"Bearer {create_access_token(data={'sub': 'manager@test.io', 'role': 'FLEET_MANAGER'})}"}


def test_reports_require_a_manager_or_dispatcher(client, auth):
    from app.core.security import create_access_token
    assert client.get("/api/v1/reports/metrics").status_code == 401
    driver = {"Authorization": f"Bearer {create_access_token(data={'sub': 'driver@test.io', 'role': 'DRIVER'})}"}
    for path in ("/api/v1/reports/metrics", "/api/v1/reports/export.csv", "/api/v1/reports/summary.pdf"):
        assert client.get(path, headers=driver).status_code == 403, path


def test_csv_cells_cannot_inject_formulas():
    from app.services.analytics.exports import _safe_cell
    assert _safe_cell("=HYPERLINK(\"http://x\")") == "'=HYPERLINK(\"http://x\")"
    assert _safe_cell("@SUM(A1)") == "'@SUM(A1)" and _safe_cell("+91 22") == "'+91 22"
    assert _safe_cell("Reliance Industries") == "Reliance Industries" and _safe_cell(-3.5) == -3.5


def test_history_window_rolls_over_daily(monkeypatch):
    import datetime as dt
    from app.services.analytics import history as h
    class Day(dt.date):
        today_value = dt.date(2026, 11, 20)
        @classmethod
        def today(cls): return cls.today_value
    monkeypatch.setattr(h, "date", Day)
    first = h.history(3)
    Day.today_value = dt.date(2026, 11, 21)
    second = h.history(3)
    assert {t.date for t in first} != {t.date for t in second}
    assert max(t.date for t in second) == "2026-11-20"


def test_metrics_endpoint_and_filters(client, auth):
    body = client.get("/api/v1/reports/metrics", params={"days": 14}, headers=auth).json()
    assert "Simulated" in body["source"] and len(body["daily"]) == 14
    assert set(body["by_hub"]) == set(body["options"]["hubs"])
    one = client.get("/api/v1/reports/metrics", params={"days": 14, "hub": "HUB-PNQ-03"}, headers=auth).json()
    assert set(one["by_hub"]) == {"HUB-PNQ-03"} and one["kpis"]["trips"] < body["kpis"]["trips"]
    assert client.get("/api/v1/reports/metrics", params={"days": 0}, headers=auth).status_code == 422


def test_csv_export_matches_metrics(client, auth):
    res = client.get("/api/v1/reports/export.csv", params={"days": 7, "hub": "HUB-MUM-01"}, headers=auth)
    assert res.status_code == 200 and "attachment" in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.text)))
    kpis = client.get("/api/v1/reports/metrics", params={"days": 7, "hub": "HUB-MUM-01"}, headers=auth).json()["kpis"]
    assert len(rows) == kpis["stops"] and {r["hub"] for r in rows} == {"HUB-MUM-01"}
    otif = sum(r["otif"] == "True" for r in rows) / len(rows) * 100
    assert round(otif, 1) == kpis["otif_pct"]


def test_pdf_export(client, auth):
    res = client.get("/api/v1/reports/summary.pdf", params={"days": 7}, headers=auth)
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF") and len(res.content) > 1500
