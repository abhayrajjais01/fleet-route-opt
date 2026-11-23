"""Time-of-day congestion model: factors, period crossing, FIFO, and its effect on the solver and ETA engine."""
import pytest

from app.core.config import settings
from app.services.optimizer.eta_engine import recalculate
from app.services.optimizer.traffic import factor_at, profile, travel_time
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve

HUB = (19.1136, 72.8697)
STOPS = [Stop("a", 19.0660, 72.8650, 100, 1, 0, 1439), Stop("b", 19.1176, 72.9060, 100, 1, 0, 1439)]
VAN = VehicleSpec("v1", 1000, 10, "VAN", 900)


def test_rush_hours_are_slower_than_midday_and_night():
    assert factor_at(9 * 60) > factor_at(13 * 60) > factor_at(2 * 60)
    assert factor_at(18 * 60 + 30) == max(f["factor"] for f in profile())
    assert factor_at(13 * 60) == 1.0
    assert factor_at(24 * 60 + 9 * 60) == factor_at(9 * 60)  # wraps past midnight


def test_midday_leg_takes_its_base_time():
    assert travel_time(30, 12 * 60) == pytest.approx(30)


def test_leg_crossing_into_the_morning_peak():
    # Leaves 07:50 (factor 0.95): 10 clock-min covers 10/0.95 base-min; the rest is driven at the 1.30 peak.
    expected = 10 + (20 - 10 / 0.95) * 1.30
    assert travel_time(20, 7 * 60 + 50) == pytest.approx(expected)


def test_leaving_later_never_arrives_earlier():
    for base in (5, 25, 90, 300):
        arrivals = [t + travel_time(base, t) for t in range(0, 2 * 1440, 7)]
        assert all(b >= a - 1e-9 for a, b in zip(arrivals, arrivals[1:])), base


def test_can_be_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "TRAFFIC_MODEL", False)
    assert travel_time(30, 9 * 60) == 30
    assert all(f["factor"] == 1.0 for f in profile())


def test_eta_engine_uses_departure_time():
    peak = recalculate(HUB, STOPS, VAN, depart_min=8 * 60 + 30)
    midday = recalculate(HUB, STOPS, VAN, depart_min=12 * 60)
    assert peak.duration_min > midday.duration_min
    assert peak.stops[0].leg_min > midday.stops[0].leg_min
    assert peak.distance_km == pytest.approx(midday.distance_km)  # traffic changes time, not distance


def test_solver_plans_with_rush_hour_times():
    peak = solve(HUB, STOPS, [VAN], depart_min=17 * 60 + 30)
    midday = solve(HUB, STOPS, [VAN], depart_min=12 * 60)
    assert peak.routes[0].duration_min > midday.routes[0].duration_min
