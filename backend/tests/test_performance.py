"""
test_performance.py - Week 15 performance regression guards (PRD targets, with headroom for slow CI machines).
"""

import random
import time

from app.services.copilot.optimization_agent import FleetContext, RouteState, handle_disruption
from app.services.optimizer.distance_matrix import clear_cache
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve
from app.services.rag.knowledge_base import get_knowledge_base

HUB = (19.1136, 72.8697)


def stops(n, seed=1):
    rng = random.Random(seed)
    return [Stop(f"s{i}", 19.0 + rng.random() * 0.25, 72.82 + rng.random() * 0.2, rng.randint(50, 400),
                 round(rng.uniform(0.3, 3), 1), rng.choice([480, 540, 600]), rng.choice([720, 840, 960, 1080])) for i in range(n)]


def test_100_stop_solve_well_under_five_seconds_and_fully_routed():
    clear_cache()
    t = time.perf_counter()
    sol = solve(HUB, stops(100), [VehicleSpec(f"v{i}", 3000, 22, "BOX_TRUCK", 600) for i in range(9)], 480)
    assert time.perf_counter() - t < 5.0
    assert not sol.unassigned


def test_vector_search_p95_under_100ms():
    kb = get_knowledge_base()
    lat = []
    for q in ["hazmat placard", "driver rest break", "cold chain excursion", "breakdown procedure", "OTIF"] * 10:
        t = time.perf_counter()
        kb.search(q, top_k=5)
        lat.append(time.perf_counter() - t)
    assert sorted(lat)[int(0.95 * len(lat)) - 1] < 0.1


def test_disruption_handling_under_three_seconds():
    ctx = FleetContext(HUB, [RouteState(VehicleSpec(f"v{i}", 3000, 22, "BOX_TRUCK", 600), f"V-{100 + i}", stops(6, seed=i), 480)
                             for i in range(5)], [VehicleSpec("spare", 3000, 22, "BOX_TRUCK", 600)], 560)
    t = time.perf_counter()
    handle_disruption("V-101 broke down", ctx, use_llm=False)
    handle_disruption("V-102 delayed 30 min", ctx, use_llm=False)
    assert time.perf_counter() - t < 3.0
