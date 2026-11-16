"""
test_executive_analytics.py - Executive KPI Analytics Dashboard (US-008, Week 12 · Track B)

Verifies:
1. Date-range handling: defaults, the 90-day limit, and history ending yesterday.
2. KPI cards agree with the shared metrics engine and compare against the previous period of equal length.
3. Daily trend, SLA-by-hour and driver tables add up to the same stop counts.
4. Hub / vehicle-type filters, the live database snapshot, and role restrictions on the endpoint.
"""

from datetime import date, timedelta

import pytest

from app.services.analytics.metrics import compute_metrics
from app.services.executive_analytics import (
    InvalidRange,
    Period,
    executive_report,
    period_trips,
    resolve_period,
)

TODAY = date(2026, 11, 15)
YESTERDAY = TODAY - timedelta(days=1)


def test_resolve_period_defaults_and_limits():
    p = resolve_period(None, None, today=TODAY)
    assert p.date_to == YESTERDAY and p.days == 30
    assert p.previous().date_to == p.date_from - timedelta(days=1) and p.previous().days == 30
    with pytest.raises(InvalidRange):
        resolve_period(None, TODAY, today=TODAY)                       # no history for today yet
    with pytest.raises(InvalidRange):
        resolve_period(YESTERDAY - timedelta(days=90), YESTERDAY, today=TODAY)   # 91 days
    with pytest.raises(InvalidRange):
        resolve_period(YESTERDAY, YESTERDAY - timedelta(days=3), today=TODAY)


def test_kpis_match_metrics_engine_and_compare_with_previous_period():
    period = Period(date(2026, 10, 1), date(2026, 10, 14))
    report = executive_report(period)
    cards = {c["key"]: c for c in report["kpis"]}
    trips = period_trips(period)
    m = compute_metrics(trips)
    assert cards["on_time_pct"]["value"] == m.on_time_pct
    assert cards["total_cost"]["value"] == m.total_cost
    assert cards["deliveries"]["value"] == sum(1 for t in trips for s in t.stops if s.delivered)

    prev = compute_metrics(period_trips(period.previous()))
    assert cards["on_time_pct"]["previous"] == prev.on_time_pct
    assert cards["on_time_pct"]["change"] == pytest.approx(m.on_time_pct - prev.on_time_pct, abs=0.11)
    assert cards["total_cost"]["higher_is_better"] is False and cards["on_time_pct"]["higher_is_better"] is True


def test_breakdowns_add_up():
    period = Period(date(2026, 10, 1), date(2026, 10, 14))
    report = executive_report(period)
    total_stops = sum(len(t.stops) for t in period_trips(period))
    assert len(report["daily"]) == 14 and report["daily"][0]["date"] == "2026-10-01"
    assert sum(d["stops"] for d in report["daily"]) == total_stops
    assert all(d["on_time"] + d["late"] + d["failed"] == d["stops"] for d in report["daily"])
    hours = report["sla_by_hour"]
    assert sum(h["stops"] for h in hours) == total_stops
    assert all(h["on_time"] + h["late"] + h["failed"] == h["stops"] for h in hours)
    drivers = report["drivers"]
    assert sum(d["stops"] for d in drivers) == total_stops
    assert [d["rank"] for d in drivers] == list(range(1, len(drivers) + 1))
    assert drivers == sorted(drivers, key=lambda d: (-d["on_time_pct"], -d["stops_per_hour"]))


def test_filters_narrow_the_data():
    period = Period(date(2026, 10, 1), date(2026, 10, 7))
    report = executive_report(period, hub="HUB-PNQ-03")
    assert {h for d in report["drivers"] for h in d["hubs"]} == {"HUB-PNQ-03"}
    evs = executive_report(period, vehicle_type="EV")
    assert all(d["vehicle_types"] == ["EV"] for d in evs["drivers"])
    assert "HUB-MUM-01" in report["options"]["hubs"]


def _token(client, email, role):
    res = client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!", "full_name": email.split("@")[0], "role": role})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_executive_endpoint(client):
    admin = _token(client, "exec@w12.io", "ADMIN")            # first user becomes ADMIN
    dispatcher = _token(client, "disp@w12.io", "DISPATCHER")

    res = client.get("/api/v1/analytics/executive", params={"hub": "HUB-MUM-01"}, headers=admin)
    assert res.status_code == 200
    body = res.json()
    assert body["period"]["days"] == 30 and body["filters"]["hub"] == "HUB-MUM-01"
    assert [k["key"] for k in body["kpis"]][:4] == ["on_time_pct", "otif_pct", "deliveries", "total_cost"]
    assert "shipments_by_status" in body["live"] and "Simulated" in body["source"]

    assert client.get("/api/v1/analytics/executive", headers=dispatcher).status_code == 403
    assert client.get("/api/v1/analytics/executive").status_code in (401, 403)
    too_long = client.get("/api/v1/analytics/executive", params={"date_from": "2026-01-01", "date_to": "2026-06-30"}, headers=admin)
    assert too_long.status_code == 422
