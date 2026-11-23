"""
osrm_client.py - Thin, fault-tolerant client for OSRM (Track A: Manthan Nimodiya)

OSRM (Open Source Routing Machine) computes driving routes on OpenStreetMap road data. Two services are used:
    /route  - the road path, distance and time through an ordered list of points   (maps, driver instructions)
    /table  - all-pairs road distance and time between a set of points              (optimizer, ETA engine)

Production behaviour:
- Responses are memoised per rounded coordinate set (LRU), so the same stops are fetched once per process.
- Every call has a timeout (OSRM_TIMEOUT_S). Failures raise OsrmUnavailable; they are never cached.
- Circuit breaker: after a failure, OSRM is skipped for BREAKER_COOLDOWN_S, so a routing outage costs one
  timeout instead of one per request. Callers fall back to the haversine estimate meanwhile.
- ROAD_ROUTING="estimate" turns OSRM off entirely (tests, air-gapped deployments); `with offline():` turns it
  off for one block of work (bulk simulations).

The base URL is configurable (OSRM_URL). The default public server suits demos; production should run OSRM in
Docker on an India extract and point OSRM_URL at it (no per-request limits, no data leaves the network).
"""

from __future__ import annotations

import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from functools import lru_cache
from typing import Tuple

import httpx

from app.core.config import settings
from app.core.logging import logger

MAX_ROUTE_POINTS = 100      # public OSRM server limits
MAX_TABLE_POINTS = 100
BREAKER_COOLDOWN_S = 60.0

Key = Tuple[Tuple[float, float], ...]   # ((lat, lon), ...) rounded to 6 dp


class OsrmUnavailable(Exception):
    """OSRM is disabled, down, slow, or could not route these points."""


_lock = threading.Lock()
_open_until = 0.0           # circuit breaker: skip OSRM until this monotonic time
_offline: ContextVar[bool] = ContextVar("osrm_offline", default=False)


def enabled() -> bool:
    return settings.ROAD_ROUTING == "osrm" and not _offline.get() and time.monotonic() >= _open_until


@contextmanager
def offline():
    """Use the estimate for everything inside the block (bulk simulations that must be fast and reproducible)."""
    token = _offline.set(True)
    try:
        yield
    finally:
        _offline.reset(token)


_http: httpx.Client | None = None


def _send(url: str, params: dict) -> httpx.Response:
    """GET over one shared keep-alive connection pool (saves a TLS handshake per request)."""
    global _http
    if _http is None:
        with _lock:
            if _http is None:
                _http = httpx.Client(timeout=settings.OSRM_TIMEOUT_S, headers={"User-Agent": "fleet-route-optimizer"},
                                     limits=httpx.Limits(max_keepalive_connections=4, max_connections=8))
    return _http.get(url, params=params)


def _trip(reason: str) -> None:
    global _open_until
    with _lock:
        _open_until = time.monotonic() + BREAKER_COOLDOWN_S
    logger.warning(f"OSRM unavailable ({reason}); using distance estimates for {BREAKER_COOLDOWN_S:.0f}s")


def _get(service: str, key: Key, params: dict) -> dict:
    if not enabled():
        raise OsrmUnavailable("disabled")
    coords = ";".join(f"{lon},{lat}" for lat, lon in key)   # OSRM takes lon,lat
    url = f"{settings.OSRM_URL.rstrip('/')}/{service}/v1/driving/{coords}"
    try:
        r = _send(url, params)
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        _trip(type(e).__name__)
        raise OsrmUnavailable(str(e)) from e
    if r.status_code != 200 or data.get("code") != "Ok":
        # A routing error for these points (e.g. "NoRoute") is not an outage, so it doesn't trip the breaker,
        # but a server error does.
        if r.status_code >= 500 or r.status_code == 429:
            _trip(f"HTTP {r.status_code}")
        raise OsrmUnavailable(data.get("code", f"HTTP {r.status_code}") if isinstance(data, dict) else f"HTTP {r.status_code}")
    return data


@lru_cache(maxsize=512)
def route(key: Key) -> dict:
    """Road path through the points in order (legs with step geometry)."""
    if len(key) > MAX_ROUTE_POINTS:
        raise OsrmUnavailable("too many points")
    data = _get("route", key, {"overview": "false", "steps": "true", "geometries": "geojson"})
    if not data.get("routes"):
        raise OsrmUnavailable("no route")
    return data


@lru_cache(maxsize=256)
def table(key: Key) -> dict:
    """All-pairs road distances (m) and free-flow durations (s); unreachable pairs are null."""
    if len(key) > MAX_TABLE_POINTS:
        raise OsrmUnavailable("too many points")
    data = _get("table", key, {"annotations": "distance,duration"})
    if not data.get("distances") or not data.get("durations"):
        raise OsrmUnavailable("empty table")
    return data


def make_key(points) -> Key:
    return tuple((round(float(lat), 6), round(float(lon), 6)) for lat, lon in points)


def reset() -> None:
    """Clear caches and close the circuit breaker (tests, config changes)."""
    global _open_until
    route.cache_clear()
    table.cache_clear()
    with _lock:
        _open_until = 0.0
