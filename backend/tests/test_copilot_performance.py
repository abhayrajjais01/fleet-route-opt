"""
test_copilot_performance.py - Copilot latency guard (Week 15 · Track B: Abhayraj Jaiswal)

Runs a short version of scripts/benchmark_copilot.py so CI fails if any copilot path (every intent, both proposal
types, 10 / 25 / 50 concurrent proposals, and the full HTTP round trip) breaks the PRD's 3-second target.
The full benchmark prints a table:  python -m scripts.benchmark_copilot
"""

from scripts.benchmark_copilot import TARGET_MS, run


def test_copilot_meets_latency_target_under_load():
    results = run(runs=5)
    assert set(results["queries"]) == {"VEHICLE_BREAKDOWN", "TRAFFIC_DELAY", "POLICY_QUERY", "REROUTE_REQUEST",
                                       "GENERAL_INQUIRY", "OFF_TOPIC"}
    assert [c["concurrency"] for c in results["concurrent"]] == [10, 25, 50]
    assert results["passed"], f"worst p95 {results['worst_p95_ms']} ms >= {TARGET_MS} ms: {results}"
    assert all(c["throughput_rps"] > 10 for c in results["concurrent"])
