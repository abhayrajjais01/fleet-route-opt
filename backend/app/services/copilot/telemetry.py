"""
telemetry.py - Multi-agent latency and token-usage logging (Week 14 · Track B: Abhayraj Jaiswal)

Every copilot request (natural-language query or disruption proposal) is recorded once:
  - end-to-end latency, and the latency of each agent node from the StateGraph execution trace
  - the intent and the planner that handled it (deterministic, or the Claude model)
  - LLM token usage (input / output / cache) when an LLM was called; 0 for the deterministic path
  - success or the error class

Records go to the application log as one structured line each, and to an in-memory ring buffer that the
GET /copilot/telemetry endpoint summarises (count, p50 / p95 / max latency per endpoint, intent and node, token
totals). The buffer is per process and bounded, so it costs nothing to keep running.
"""

from __future__ import annotations

import contextvars
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Deque, Dict, Iterator, List, Optional
from contextlib import contextmanager

from app.core.logging import logger

BUFFER_SIZE = 1000


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0
    llm_calls: int = 0

    def add(self, usage: Any) -> None:
        """Accepts an Anthropic `usage` object (or any object / dict with the same fields)."""
        get = (lambda k: usage.get(k)) if isinstance(usage, dict) else (lambda k: getattr(usage, k, None))
        self.input_tokens += int(get("input_tokens") or 0)
        self.output_tokens += int(get("output_tokens") or 0)
        self.cache_read_input_tokens += int(get("cache_read_input_tokens") or 0)
        self.cache_creation_input_tokens += int(get("cache_creation_input_tokens") or 0)
        self.llm_calls += 1

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens + self.cache_read_input_tokens + self.cache_creation_input_tokens


@dataclass
class AgentRun:
    endpoint: str
    started_at: str
    latency_ms: float = 0.0
    intent: Optional[str] = None
    planner: str = "deterministic"
    nodes: Dict[str, float] = field(default_factory=dict)       # node name -> latency ms
    tokens: TokenUsage = field(default_factory=TokenUsage)
    ok: bool = True
    error: Optional[str] = None
    user_role: Optional[str] = None


_current: contextvars.ContextVar[Optional[AgentRun]] = contextvars.ContextVar("copilot_agent_run", default=None)


class TelemetryBuffer:
    def __init__(self, size: int = BUFFER_SIZE):
        self._runs: Deque[AgentRun] = deque(maxlen=size)
        self._lock = threading.Lock()

    def add(self, run: AgentRun) -> None:
        with self._lock:
            self._runs.append(run)

    def runs(self) -> List[AgentRun]:
        with self._lock:
            return list(self._runs)

    def clear(self) -> None:
        with self._lock:
            self._runs.clear()


buffer = TelemetryBuffer()


@contextmanager
def track(endpoint: str, user_role: Optional[str] = None) -> Iterator[AgentRun]:
    """Wraps one copilot request. Agents called inside can add token usage with `record_llm_usage`."""
    run = AgentRun(endpoint=endpoint, started_at=datetime.now(timezone.utc).isoformat(), user_role=user_role)
    token = _current.set(run)
    t0 = time.perf_counter()
    try:
        yield run
    except Exception as err:
        run.ok, run.error = False, type(err).__name__
        raise
    finally:
        run.latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        _current.reset(token)
        buffer.add(run)
        logger.info(
            "copilot.telemetry endpoint=%s intent=%s planner=%s ok=%s latency_ms=%.2f nodes=%s "
            "tokens_in=%d tokens_out=%d cache_read=%d llm_calls=%d%s",
            run.endpoint, run.intent, run.planner, run.ok, run.latency_ms,
            ",".join(f"{k}:{v:.1f}" for k, v in run.nodes.items()) or "-",
            run.tokens.input_tokens, run.tokens.output_tokens, run.tokens.cache_read_input_tokens, run.tokens.llm_calls,
            f" error={run.error}" if run.error else "",
        )


def record_llm_usage(usage: Any, model: Optional[str] = None) -> None:
    """Called by an agent right after an LLM call. A no-op outside a tracked request."""
    run = _current.get()
    if run is None or usage is None:
        return
    run.tokens.add(usage)
    if model:
        run.planner = model


def record_trace(run: AgentRun, trace: List[Any]) -> None:
    """Copies node latencies from a StateGraph execution trace (list of TraceStep or dicts)."""
    for step in trace or []:
        node = getattr(step, "node", None) or (step.get("node") if isinstance(step, dict) else None)
        ms = getattr(step, "latency_ms", None) if not isinstance(step, dict) else step.get("latency_ms")
        if node:
            run.nodes[node] = round(run.nodes.get(node, 0.0) + float(ms or 0.0), 2)


# ─── Summary for the API ──────────────────────────────────────────────────────────────────────

def _percentile(values: List[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = (len(ordered) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return round(ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo), 2)


def _stats(values: List[float]) -> Dict[str, float]:
    return {"count": len(values), "p50_ms": _percentile(values, 0.5), "p95_ms": _percentile(values, 0.95),
            "max_ms": round(max(values), 2) if values else 0.0}


def summary(recent: int = 20) -> Dict[str, Any]:
    runs = buffer.runs()
    by_endpoint: Dict[str, List[float]] = {}
    by_intent: Dict[str, List[float]] = {}
    by_node: Dict[str, List[float]] = {}
    totals = TokenUsage()
    for r in runs:
        by_endpoint.setdefault(r.endpoint, []).append(r.latency_ms)
        if r.intent:
            by_intent.setdefault(r.intent, []).append(r.latency_ms)
        for node, ms in r.nodes.items():
            by_node.setdefault(node, []).append(ms)
        totals.input_tokens += r.tokens.input_tokens
        totals.output_tokens += r.tokens.output_tokens
        totals.cache_read_input_tokens += r.tokens.cache_read_input_tokens
        totals.cache_creation_input_tokens += r.tokens.cache_creation_input_tokens
        totals.llm_calls += r.tokens.llm_calls
    return {
        "requests": len(runs),
        "errors": sum(not r.ok for r in runs),
        "latency": _stats([r.latency_ms for r in runs]),
        "by_endpoint": {k: _stats(v) for k, v in sorted(by_endpoint.items())},
        "by_intent": {k: _stats(v) for k, v in sorted(by_intent.items())},
        "by_node": {k: _stats(v) for k, v in sorted(by_node.items())},
        "tokens": {**asdict(totals), "total": totals.total},
        "recent": [{**asdict(r), "tokens": {**asdict(r.tokens), "total": r.tokens.total}} for r in runs[-recent:][::-1]],
        "buffer_size": BUFFER_SIZE,
    }
