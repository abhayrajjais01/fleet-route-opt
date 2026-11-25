# Performance Benchmarks (Week 15)

Two benchmark scripts, both run from `backend/`, both in CI:

| Script | Track | Covers |
|---|---|---|
| `python -m scripts.benchmark` | A | VRPTW solver (25–200 stops), distance matrix, RAG search, agent re-route |
| `python -m scripts.benchmark_copilot` | B | The multi-agent copilot end to end: every intent, proposal cards, concurrent load, full HTTP round trip |

`tests/test_performance.py` and `tests/test_copilot_performance.py` run short versions on every test run, so a
regression past the PRD targets fails the build.

## Route optimisation, routing and RAG (Track A)

`cd backend && python -m scripts.benchmark` (offline distance model, so the numbers are reproducible; a solve on the
road network adds one cached OSRM table call, about 0.3–0.6 s on the public server). Measured Nov 2026 on an Apple
M-series laptop, Python 3.14.

| Benchmark | Median | p95 | Target | Result |
|---|---|---|---|---|
| VRPTW solve, 50 stops / 5 vehicles | 4.8 ms | 4.9 ms | < 5 s | PASS |
| Distance matrix 250 × 250 (cold / cached) | 1.0 / 0.1 ms | 1.1 / 0.1 ms | < 500 ms | PASS |
| RAG vector search (100 queries) | 0.1 ms | 0.1 ms | < 100 ms | PASS |
| Downstream ETA recalculation, 12 stops | < 0.1 ms | < 0.1 ms | < 50 ms | PASS |
| Optimization agent: breakdown re-route | 5.6 ms | 5.7 ms | < 3 s | PASS |
| Optimization agent: 30 min delay | 26.6 ms | 36.6 ms | < 3 s | PASS |

**Solver scalability and memory** (peak Python heap per cold solve, `tracemalloc`):

| Stops / vehicles | Median | p95 | Peak memory | Routes | Unrouted |
|---|---|---|---|---|---|
| 10 / 2 | 0.5 ms | 0.5 ms | 0.01 MB | 2 | 0 |
| 25 / 3 | 1.7 ms | 1.7 ms | 0.07 MB | 3 | 0 |
| 50 / 5 | 4.9 ms | 4.9 ms | 0.28 MB | 5 | 0 |
| 100 / 9 | 10.2 ms | 10.4 ms | 1.52 MB | 9 | 0 |
| 200 / 18 (stress) | 35.2 ms | 41.1 ms | 6.49 MB | 16 | 0 |

Memory grows with the n × n distance matrix (quadratic), so 1,000 stops would need roughly 150 MB per solve.

**RAG retrieval accuracy** (Recall@k = right SOP section in the top k; MRR = mean reciprocal rank):

| Question set | R@1 | R@3 | MRR |
|---|---|---|---|
| Development (30 questions, tuning allowed) | 1.000 | 1.000 | 1.000 |
| Validation (41 natural-language questions, tuning allowed) | 0.829 | 0.951 | 0.890 |
| Test (40 questions written before tuning, never tuned on) | 0.800 | 0.925 | 0.870 |

The test set was written by the same team that tuned the retriever, so treat it as an upper estimate; questions
logged from real users are the next benchmark.

## Copilot latency (target: < 3 s per request)

Deterministic planner, Windows laptop, Python 3.14, 30 runs per row, Nov 20 2026:

| Benchmark | median ms | p95 ms | max ms | Result |
|---|---:|---:|---:|:---:|
| Copilot query: vehicle breakdown | 2.2 | 3.2 | 3.6 | PASS |
| Copilot query: traffic delay | 2.1 | 3.0 | 3.5 | PASS |
| Copilot query: policy (RAG + guardrail) | 2.5 | 4.8 | 40.8 | PASS |
| Copilot query: re-route request | 2.5 | 4.2 | 4.8 | PASS |
| Copilot query: general inquiry | 2.5 | 3.8 | 4.4 | PASS |
| Copilot query: off topic | 2.4 | 4.2 | 4.2 | PASS |
| Proposal card: breakdown (agent + route diff) | 1.4 | 2.5 | 2.5 | PASS |
| Proposal card: delay | 1.5 | 4.5 | 8.1 | PASS |
| Proposals, 10 concurrent dispatchers | 1.6 | 2.9 | 3.0 | PASS (538 req/s) |
| Proposals, 25 concurrent | 1.7 | 2.3 | 2.7 | PASS (550 req/s) |
| Proposals, 50 concurrent | 1.7 | 2.4 | 2.9 | PASS (536 req/s) |
| `POST /copilot/query` through every middleware | 12.3 | 15.9 | 62.5 | PASS |

Worst p95: **15.9 ms**, about 190× inside the 3 s target. With `ANTHROPIC_API_KEY` set, a signed-in user's
disruption message also goes to Claude for planning; that adds the model's response time, which the benchmark
deliberately leaves out. `GET /copilot/telemetry` reports live p50 / p95 and token usage for real traffic.

## Frontend bundle

Sections now load on first visit (`React.lazy`), so the first screen ships only the shell and the Command Center.

| Build | Entry script | gzip | Largest chunk warning |
|---|---:|---:|:---:|
| Before (Week 14) | 661.6 kB | 189.1 kB | yes (> 500 kB) |
| After (Week 15) | 338.3 kB | 98.5 kB | no |

Leaflet and the map tiles helper (152 kB, 45 kB gzip) load with the first map; each section is 7–44 kB.
Static assets are served by Nginx with gzip and one-year immutable caching (file names are content-hashed);
`index.html` is never cached, so a deploy shows up on the next load.

## Accessibility and responsive checks

- Real page title and `lang="en"` (they were template placeholders).
- Below 1024 px the sidebar becomes an overlay drawer (closed by default, closes after navigating, backdrop to
  dismiss); the role switcher becomes a select on phones; header labels collapse to icons with `aria-label`s.
- Navigation buttons carry `aria-current`, toggles `aria-pressed` / `aria-expanded`, and loading states `role="status"`.
- Every chart has a legend, a table view and hover tooltips; colours come from the validated palette, and status
  colours always come with an icon and a text label.
