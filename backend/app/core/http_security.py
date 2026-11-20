"""
http_security.py - API hardening middleware (Week 14 · Track B: Abhayraj Jaiswal)

  RateLimitMiddleware       per-client token buckets, with tighter buckets for login (brute force), the AI agents
                            (cost and CPU) and file exports; 429 + Retry-After when a bucket is empty
  SecurityHeadersMiddleware nosniff, frame denial, referrer and permissions policy, a locked-down CSP on API
                            responses, HSTS in production, and no-store on authenticated responses
  BodySizeLimitMiddleware   rejects request bodies above MAX_REQUEST_BYTES with 413 before they are read

All three are plain ASGI middleware, so they add microseconds per request and do not buffer responses.
Limits are configurable through settings (see core/config.py and .env.example).
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# ─── Rate limiting ───────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Bucket:
    name: str
    per_minute: int
    prefixes: Tuple[str, ...] = ()
    suffixes: Tuple[str, ...] = ()


def default_buckets(api: str, auth_per_min: int, ai_per_min: int, export_per_min: int, default_per_min: int) -> List[Bucket]:
    """First match wins. Paths are matched without the query string."""
    return [
        Bucket("auth", auth_per_min, prefixes=(f"{api}/auth/login", f"{api}/auth/register", f"{api}/auth/token")),
        Bucket("ai", ai_per_min, prefixes=(f"{api}/copilot/query", f"{api}/copilot/proposals", f"{api}/copilot/guardrails",
                                           f"{api}/routes/disruption", f"{api}/rag/search", f"{api}/rag/benchmark")),
        Bucket("export", export_per_min, suffixes=(".csv", ".pdf")),
        Bucket("default", default_per_min, prefixes=(api,)),
    ]


EXEMPT_PATHS = ("/api/v1/health", "/api/v1/ready")


class TokenBucketLimiter:
    """Thread-safe token buckets keyed by (client, bucket). Each holds `per_minute` tokens and refills continuously."""

    MAX_KEYS = 20_000

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._state: Dict[Tuple[str, str], Tuple[float, float]] = {}   # key -> (tokens, last_refill)
        self._lock = threading.Lock()

    def take(self, client: str, bucket: Bucket) -> Tuple[bool, int, float]:
        """Returns (allowed, remaining, retry_after_seconds)."""
        now = self._clock()
        capacity = float(bucket.per_minute)
        rate = capacity / 60.0
        key = (client, bucket.name)
        with self._lock:
            tokens, last = self._state.get(key, (capacity, now))
            tokens = min(capacity, tokens + (now - last) * rate)
            if tokens >= 1.0:
                tokens -= 1.0
                self._state[key] = (tokens, now)
                allowed, retry = True, 0.0
            else:
                self._state[key] = (tokens, now)
                allowed, retry = False, (1.0 - tokens) / rate
            if len(self._state) > self.MAX_KEYS:
                self._prune(now)
        return allowed, int(tokens), retry

    def _prune(self, now: float) -> None:
        # Drop the oldest half: those buckets have refilled and carry no information.
        for key, _ in sorted(self._state.items(), key=lambda kv: kv[1][1])[: len(self._state) // 2]:
            del self._state[key]

    def reset(self) -> None:
        with self._lock:
            self._state.clear()


# One limiter per process; tests reset it between cases.
rate_limiter = TokenBucketLimiter()


def _header(scope: Scope, name: bytes) -> Optional[str]:
    for k, v in scope.get("headers") or []:
        if k == name:
            return v.decode("latin-1")
    return None


def client_id(scope: Scope, trust_proxy: bool) -> str:
    """The caller's address. Behind the bundled Nginx (TRUST_PROXY_HEADERS=true) that is X-Real-IP, which Nginx
    overwrites on every request; otherwise the socket peer, because a client can put anything in those headers."""
    if trust_proxy:
        real = _header(scope, b"x-real-ip")
        if real:
            return real.strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, buckets: Iterable[Bucket], enabled: bool = True, trust_proxy: bool = False,
                 limiter: Optional[TokenBucketLimiter] = None):
        self.app = app
        self.buckets = list(buckets)
        self.enabled = enabled
        self.trust_proxy = trust_proxy
        self.limiter = limiter or rate_limiter

    def bucket_for(self, path: str) -> Optional[Bucket]:
        if path.startswith(EXEMPT_PATHS):
            return None
        for b in self.buckets:
            if (b.prefixes and path.startswith(b.prefixes)) or (b.suffixes and path.endswith(b.suffixes)):
                return b
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self.enabled or scope["type"] != "http" or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        bucket = self.bucket_for(scope.get("path", ""))
        if bucket is None:
            await self.app(scope, receive, send)
            return
        allowed, remaining, retry = self.limiter.take(client_id(scope, self.trust_proxy), bucket)
        limit_headers = [(b"x-ratelimit-limit", str(bucket.per_minute).encode()),
                         (b"x-ratelimit-remaining", str(max(0, remaining)).encode()),
                         (b"x-ratelimit-policy", f"{bucket.name};w=60".encode())]
        if not allowed:
            wait = max(1, math.ceil(retry))
            body = (b'{"detail":"Too many requests. Please wait %d second%s and try again."}'
                    % (wait, b"" if wait == 1 else b"s"))
            await send({"type": "http.response.start", "status": 429,
                        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
                                    (b"retry-after", str(wait).encode())] + limit_headers})
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                message = {**message, "headers": list(message.get("headers") or []) + limit_headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ─── Security headers ─────────────────────────────────────────────────────────────────────────

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
# Swagger UI / ReDoc load their bundles from jsDelivr and run a small inline bootstrap script.
DOCS_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://fastapi.tiangolo.com https://cdn.redoc.ly; "
            "worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'")
DOCS_PATHS = ("/docs", "/redoc")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, hsts: bool = False):
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        authenticated = _header(scope, b"authorization") is not None
        extra = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"permissions-policy", b"geolocation=(), camera=(), microphone=(), payment=()"),
            (b"cross-origin-opener-policy", b"same-origin"),
            (b"content-security-policy", (DOCS_CSP if path.startswith(DOCS_PATHS) else API_CSP).encode()),
        ]
        if self.hsts:
            extra.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in (message.get("headers") or []) if k.lower() != b"server"]
                present = {k.lower() for k, _ in headers}
                headers += [(k, v) for k, v in extra if k not in present]
                # Responses to authenticated calls carry fleet and customer data: keep them out of shared caches.
                if authenticated and b"cache-control" not in present:
                    headers.append((b"cache-control", b"no-store"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ─── Request body size ────────────────────────────────────────────────────────────────────────

class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = _header(scope, b"content-length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _TooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _TooLarge:
            await self._reject(send)

    async def _reject(self, send: Send) -> None:
        body = b'{"detail":"Request body too large. Split the upload into smaller files."}'
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})


class _TooLarge(Exception):
    pass
