"""
benchmark_copilot.py - Multi-agent copilot latency benchmark (Week 15 · Track B: Abhayraj Jaiswal)

Run from backend/:   python -m scripts.benchmark_copilot [--runs 30] [--json out.json]

Measures end-to-end response time of the copilot against the PRD target (< 3 s per request):

  1. StateGraph query per intent         router -> entity extraction -> handler node (breakdown, delay, policy/RAG,
                                         re-route, general, off-topic), sequential
  2. Disruption proposal                 Optimization Agent + route-diff card (breakdown and delay), sequential
  3. Proposals under concurrent load     10 / 25 / 50 dispatchers at once (thread pool), p95 per request and throughput
  4. Full HTTP round trip                POST /copilot/query through every middleware (auth, rate limit, headers,
                                         sanitisation), sequential

The deterministic planner is used (no network), so the numbers measure this code, not an LLM provider.
"""

from __future__ import annotations

import argparse
import json
import logging
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, List

logging.disable(logging.CRITICAL)

from app.services.copilot.optimization_agent import FleetContext, RouteState, handle_disruption  # noqa: E402
from app.services.copilot.proposal_service import build_card  # noqa: E402
from app.services.copilot.state_graph import get_copilot_graph  # noqa: E402
from app.services.optimizer.vrptw_solver import Stop, VehicleSpec  # noqa: E402

TARGET_MS = 3000.0
HUB = (19.1136, 72.8697)

QUERIES: Dict[str, str] = {
    "VEHICLE_BREAKDOWN": "Truck MH-04-AB-2045 broke down near Sion, engine overheated",
    "TRAFFIC_DELAY": "MH-02-EE-1001 stuck in traffic on the Eastern Express Highway, 45 minute delay",
    "POLICY_QUERY": "What is the maximum driving time before a mandatory rest break?",
    "REROUTE_REQUEST": "Reroute vehicle MH-02-EE-1001 to avoid the flooded underpass",
    "GENERAL_INQUIRY": "What can you help me with?",
    "OFF_TOPIC": "Tell me a joke",
}


def fleet() -> FleetContext:
    van, box = VehicleSpec("1", 1500, 12, "VAN", 480), VehicleSpec("2", 3500, 24.5, "BOX_TRUCK", 600)
    stops_a = [Stop("9", 19.0596, 72.8295, 140, 1.1, 540, 750), Stop("2", 19.1176, 72.906, 180, 1.5, 600, 840),
               Stop("11", 19.086, 72.9081, 160, 1.0, 690, 960), Stop("12", 19.13, 72.88, 90, 0.6, 600, 900)]
    stops_b = [Stop("1", 19.066, 72.865, 450, 3.2, 540, 720), Stop("10", 18.998, 72.83, 220, 1.6, 600, 780),
               Stop("5", 18.9256, 72.8242, 120, 0.8, 570, 660), Stop("6", 19.02, 72.85, 200, 1.2, 600, 900)]
    return FleetContext(hub=HUB, routes=[RouteState(van, "MH-02-EE-1001", stops_a, 510),
                                         RouteState(box, "MH-04-AB-2045", stops_b, 510, completed={"1": 550})],
                        spare_vehicles=[VehicleSpec("5", 2500, 18, "BOX_TRUCK", 540)], now_min=555)


def timed(fn: Callable[[], object], runs: int) -> List[float]:
    out = []
    for _ in range(runs):
        t = time.perf_counter()
        fn()
        out.append((time.perf_counter() - t) * 1000)
    return out


def pct(ms: List[float], q: float) -> float:
    s = sorted(ms)
    return s[min(len(s) - 1, max(0, round(q * (len(s) - 1))))]


def stats(ms: List[float]) -> Dict[str, float]:
    return {"runs": len(ms), "median_ms": round(statistics.median(ms), 2), "p95_ms": round(pct(ms, 0.95), 2),
            "max_ms": round(max(ms), 2)}


def proposal(message: str) -> None:
    ctx = fleet()
    build_card(ctx, handle_disruption(message, ctx, use_llm=False))


def concurrent(n: int, rounds: int = 3) -> Dict[str, float]:
    """n dispatchers submit disruption reports at the same moment; per-request latency and requests per second."""
    messages = ["MH-04-AB-2045 broke down near Sion", "MH-02-EE-1001 stuck in traffic, 40 min delay"]
    latencies: List[float] = []

    def one(i: int) -> float:
        t = time.perf_counter()
        proposal(messages[i % 2])
        return (time.perf_counter() - t) * 1000

    wall = 0.0
    with ThreadPoolExecutor(max_workers=n) as pool:
        for _ in range(rounds):
            t = time.perf_counter()
            latencies += list(pool.map(one, range(n)))
            wall += time.perf_counter() - t
    return {**stats(latencies), "concurrency": n, "throughput_rps": round(n * rounds / wall, 1)}


def http_round_trip(runs: int) -> Dict[str, float]:
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    import app.models  # noqa: F401  (register tables)
    from app.core.config import settings
    from app.core.database import Base, get_db
    from app.main import app

    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)

    def db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = db
    settings.RATE_LIMIT_ENABLED = False         # the benchmark measures latency, not the limiter
    try:
        client = TestClient(app)
        token = client.post("/api/v1/auth/register", json={"email": "bench@fleetopt-bench.io", "password": "Password123!",
                                                           "full_name": "Benchmark", "role": "ADMIN"}).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        texts = list(QUERIES.values())
        i = [0]

        def call():
            res = client.post("/api/v1/copilot/query", headers=headers, json={"query": texts[i[0] % len(texts)]})
            i[0] += 1
            assert res.status_code == 200, res.text

        return stats(timed(call, runs))
    finally:
        app.dependency_overrides.pop(get_db, None)


def run(runs: int = 30) -> Dict:
    graph = get_copilot_graph()
    graph.execute(query="warm up", session_id="bench", context={})          # load the RAG index once
    proposal("MH-04-AB-2045 broke down")
    results: Dict = {"target_ms": TARGET_MS, "queries": {}, "proposals": {}, "concurrent": [], "http": None}
    for intent, text in QUERIES.items():
        results["queries"][intent] = stats(timed(lambda: graph.execute(query=text, session_id="bench", context={}), runs))
    results["proposals"]["breakdown"] = stats(timed(lambda: proposal("MH-04-AB-2045 broke down near Sion"), runs))
    results["proposals"]["delay"] = stats(timed(lambda: proposal("MH-02-EE-1001 stuck in traffic, 40 min delay"), runs))
    for n in (10, 25, 50):
        results["concurrent"].append(concurrent(n))
    results["http"] = stats(timed(lambda: None, 1)) if runs == 0 else http_round_trip(runs)
    worst = max([r["p95_ms"] for r in results["queries"].values()] + [r["p95_ms"] for r in results["proposals"].values()]
                + [c["p95_ms"] for c in results["concurrent"]] + [results["http"]["p95_ms"]])
    results["worst_p95_ms"] = round(worst, 2)
    results["passed"] = worst < TARGET_MS
    return results


def print_table(r: Dict) -> None:
    line = f"{'Benchmark':<46}{'median ms':>10}{'p95 ms':>10}{'max ms':>10}   result"
    print(line)
    print("-" * len(line))

    def row(name: str, s: Dict[str, float], extra: str = "") -> None:
        verdict = "PASS" if s["p95_ms"] < r["target_ms"] else "FAIL"
        print(f"{name:<46}{s['median_ms']:>10.1f}{s['p95_ms']:>10.1f}{s['max_ms']:>10.1f}   {verdict}{extra}")

    for intent, s in r["queries"].items():
        row(f"Copilot query: {intent.lower().replace('_', ' ')}", s)
    for kind, s in r["proposals"].items():
        row(f"Proposal card: {kind}", s)
    for c in r["concurrent"]:
        row(f"Proposals, {c['concurrency']} concurrent", c, f"  ({c['throughput_rps']} req/s)")
    row("HTTP POST /copilot/query (full stack)", r["http"])
    print("-" * len(line))
    print(f"Worst p95: {r['worst_p95_ms']:.1f} ms against a {r['target_ms']:.0f} ms target -> {'PASS' if r['passed'] else 'FAIL'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("--runs", type=int, default=30)
    parser.add_argument("--json", help="also write the results to this file")
    args = parser.parse_args()
    results = run(args.runs)
    print_table(results)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
