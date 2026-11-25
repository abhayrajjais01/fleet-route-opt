"""
benchmark.py - Performance benchmark for the Track A engines (Week 15).

Run from backend/:   python -m scripts.benchmark
Prints median and p95 wall-clock times against the PRD targets:
  VRPTW solver: 50 stops < 5 s   ·   vector search < 100 ms   ·   disruption handling < 3 s
plus the solver's scalability (10 / 25 / 50 / 100 stops, and 200 as a stress case) with peak memory per solve
(tracemalloc) and the RAG accuracy on the development / validation / test sets.

Runs on the offline distance model (no routing-server calls) so results are reproducible; the road-network
version adds one OSRM table call per solve (about 0.3-0.6 s on the public server, cached afterwards).
"""

from __future__ import annotations

import logging
import random
import statistics
import time
import tracemalloc
from typing import Callable, List

logging.disable(logging.CRITICAL)

from app.services.analytics.history import simulated_history  # noqa: E402
from app.services.copilot.optimization_agent import FleetContext, RouteState, handle_disruption  # noqa: E402
from app.services.optimizer.distance_matrix import build_distance_matrix, clear_cache  # noqa: E402
from app.services.optimizer.eta_engine import recalculate  # noqa: E402
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec, solve  # noqa: E402
from app.services.rag.knowledge_base import get_knowledge_base  # noqa: E402
from app.services.rag.evaluation import EVAL_SET_PATH, TEST_PATH, VALIDATION_PATH, evaluate  # noqa: E402
from app.services.optimizer import osrm_client  # noqa: E402

HUB = (19.1136, 72.8697)


def stops(n: int, seed: int = 1) -> List[Stop]:
    rng = random.Random(seed)
    return [Stop(f"s{i}", 19.0 + rng.random() * 0.25, 72.82 + rng.random() * 0.2, rng.randint(50, 400),
                 round(rng.uniform(0.3, 3), 1), rng.choice([480, 540, 600]), rng.choice([720, 840, 960, 1080])) for i in range(n)]


def timed(fn: Callable[[], object], runs: int, cold: bool = True) -> List[float]:
    out = []
    for _ in range(runs):
        if cold:
            clear_cache()
        t = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t) * 1000)
    return out


def row(name: str, ms: List[float], target_ms: float | None) -> str:
    med, p95 = statistics.median(ms), sorted(ms)[max(0, int(0.95 * len(ms)) - 1)]
    verdict = "" if target_ms is None else ("PASS" if p95 < target_ms else "FAIL")
    target = "" if target_ms is None else f"< {target_ms:,.0f} ms"
    return f"{name:<42}{med:>10.1f}{p95:>10.1f}   {target:<12}{verdict}"


def peak_mb(fn: Callable[[], object]) -> float:
    """Peak Python heap allocated while fn runs (cold caches), in MB."""
    clear_cache()
    tracemalloc.start()
    fn()
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return peak / 1e6


def scalability() -> None:
    print(f"\n{'Solver scalability':<28}{'median ms':>10}{'p95 ms':>10}{'peak MB':>10}{'routes':>8}{'unrouted':>10}")
    print("-" * 76)
    for n, vehicles in [(10, 2), (25, 3), (50, 5), (100, 9), (200, 18)]:
        st, fl = stops(n), [VehicleSpec(f"v{i}", 3000, 22, "BOX_TRUCK", 600) for i in range(vehicles)]
        ms = timed(lambda: solve(HUB, st, fl, 480), 5)
        sol = solve(HUB, st, fl, 480)
        print(f"{f'{n} stops / {vehicles} vehicles':<28}{statistics.median(ms):>10.1f}{sorted(ms)[-1]:>10.1f}"
              f"{peak_mb(lambda: solve(HUB, st, fl, 480)):>10.2f}{len(sol.routes):>8}{len(sol.unassigned):>10}")


def rag_accuracy() -> None:
    print(f"\n{'RAG retrieval accuracy':<28}{'R@1':>8}{'R@3':>8}{'MRR':>8}{'p95 ms':>10}")
    print("-" * 62)
    for label, path in (("development set", EVAL_SET_PATH), ("validation set", VALIDATION_PATH), ("test set (untuned)", TEST_PATH)):
        r = evaluate(path=path)
        print(f"{label:<28}{r.recall_at_1:>8.3f}{r.recall_at_3:>8.3f}{r.mrr:>8.3f}{r.p95_latency_ms:>10.3f}")


def main() -> None:
    with osrm_client.offline():
        _main()


def _main() -> None:
    print(f"{'Benchmark':<42}{'median ms':>10}{'p95 ms':>10}   {'target':<12}result")
    print("-" * 86)
    for n, vehicles in [(50, 5)]:
        st, fl = stops(n), [VehicleSpec(f"v{i}", 3000, 22, "BOX_TRUCK", 600) for i in range(vehicles)]
        print(row(f"VRPTW solve, {n} stops / {vehicles} vehicles", timed(lambda: solve(HUB, st, fl, 480), 5), 5000))
    pts = [(s.lat, s.lon) for s in stops(250)]
    print(row("Distance matrix, 250 x 250 (cold)", timed(lambda: build_distance_matrix(pts), 10), 500))
    print(row("Distance matrix, 250 x 250 (cached)", timed(lambda: build_distance_matrix(pts), 10, cold=False), 5))

    kb = get_knowledge_base()
    queries = ["placard weight threshold for hazmat", "driver rest break after 4.5 hours", "vaccine temperature excursion",
               "vehicle broke down procedure", "OTIF definition"] * 20
    lat = []
    for q in queries:
        t = time.perf_counter(); kb.search(q, top_k=5); lat.append((time.perf_counter() - t) * 1000)
    print(row("RAG vector search (100 queries)", lat, 100))

    route = stops(12, seed=3)
    van = VehicleSpec("v", 3000, 22, "BOX_TRUCK", 720)
    print(row("Downstream ETA recalculation, 12 stops", timed(lambda: recalculate(HUB, route, van, 480, now_min=600, delay_min=30), 20, cold=False), 50))

    ctx = FleetContext(HUB, [RouteState(VehicleSpec(f"v{i}", 3000, 22, "BOX_TRUCK", 600), f"V-{100 + i}", stops(6, seed=i), 480)
                             for i in range(5)], [VehicleSpec("spare", 3000, 22, "BOX_TRUCK", 600)], 560)
    print(row("Optimization agent: breakdown re-route", timed(lambda: handle_disruption("V-101 broke down", ctx, use_llm=False), 5), 3000))
    print(row("Optimization agent: 30 min delay", timed(lambda: handle_disruption("V-102 delayed 30 min", ctx, use_llm=False), 5), 3000))

    simulated_history.cache_clear()
    print(row("Simulated history, 30 days (all hubs)", timed(lambda: simulated_history(30), 1, cold=False), None))
    scalability()
    rag_accuracy()


if __name__ == "__main__":
    main()
