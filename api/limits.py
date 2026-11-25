"""Limits that keep the public site affordable: per-address rate limits, a daily cap on model calls, and an optional
Cloudflare Turnstile check.

In:  the request (for the client's address and an optional Turnstile token) and the route's bucket name.
Out: nothing when the request may go ahead; otherwise an ApiError the front end shows in CONTENT.md words:
     429 rate_limited (with Retry-After), 503 reading_paused (the day's model calls are used up), 403 verification_needed.

- Rate limits are counted in memory, per client address, in a sliding window. The addresses are kept only for the
  length of the window and never written to disk or the log. With several server processes each counts on its own.
- The daily cap counts real model calls (each plan-reading attempt and each assistant answer), per UTC day, in the
  checks database, so a restart does not reset it. When it is reached plan reading stops with reading_paused, and the
  assistant answers from its templates (still only from the result).
- Turnstile is checked only when PERMIT_TURNSTILE_SECRET is set.

STATUS: tested with the network mocked. Turnstile's siteverify has NOT been called from this code against Cloudflare.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

import requests
from fastapi import Request

from . import config
from .errors import ApiError

# bucket -> (requests allowed, window in seconds). Each can be changed with PERMIT_RATE_<BUCKET>="count/seconds".
DEFAULT_RATES: dict[str, tuple[int, int]] = {
    "plan_read": (10, 600),      # uploads read by the model, and demo plans (cheap, but the same route)
    "ask": (30, 600),            # questions to the assistant
    "transcribe": (30, 600),     # spoken questions turned into text (CPU)
    "zoning": (30, 600),         # address lookups (two outside services per lookup)
    "checks": (30, 600),         # running the rules and storing a check
    "pdf": (60, 600),            # building a PDF (CPU)
}
MAX_TRACKED = 50_000             # addresses held at once; the oldest are dropped first
RATE_LIMITED = "You've sent a lot of requests in a short time. Wait a few minutes, then try again."
READING_PAUSED = ("Reading uploaded plans is paused for today. Try an example plan, or enter the measurements "
                  "yourself. Reading starts again tomorrow.")
TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_HEADER = "cf-turnstile-response"


def rate(bucket: str) -> tuple[int, int]:
    value = os.environ.get(f"PERMIT_RATE_{bucket.upper()}", "")
    try:
        count, seconds = (int(x) for x in value.split("/"))
        if count > 0 and seconds > 0:
            return count, seconds
    except ValueError:
        pass
    return DEFAULT_RATES[bucket]


def client_ip(request: Request) -> str:
    """The caller's address. Behind PERMIT_PROXY_HOPS proxies of our own, it is that many places from the right of
    X-Forwarded-For (the entries to its left are written by the caller and cannot be trusted)."""
    hops = config.proxy_hops()
    if hops:
        chain = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def hit(self, bucket: str, key: str, now: Optional[float] = None) -> Optional[int]:
        """Count one request. None if it is allowed, else the seconds until the next one would be."""
        limit, window = rate(bucket)
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits.get((bucket, key))
            if hits is None:
                if len(self._hits) >= MAX_TRACKED:
                    self._forget_oldest(now)
                hits = self._hits[(bucket, key)] = deque()
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(hits[0] + window - now) + 1)
            hits.append(now)
            return None

    def _forget_oldest(self, now: float) -> None:
        stale = [k for k, h in self._hits.items() if not h or h[-1] <= now - rate(k[0])[1]]
        for k in stale or list(self._hits)[: max(1, len(self._hits) // 10)]:
            del self._hits[k]


limiter = RateLimiter()


def rate_limit(bucket: str):
    """A FastAPI dependency: Depends(rate_limit("ask"))."""
    def check(request: Request) -> None:
        wait = limiter.hit(bucket, client_ip(request))
        if wait is not None:
            raise ApiError(429, "rate_limited", RATE_LIMITED, headers={"Retry-After": str(wait)})
    return check


# ---------------------------------------------------------------- the daily cap on model calls
_budget_lock = threading.Lock()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _usage_db() -> sqlite3.Connection:
    path = config.checks_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE IF NOT EXISTS model_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL)")
    return con


def calls_today() -> int:
    con = _usage_db()
    try:
        row = con.execute("SELECT calls FROM model_usage WHERE day = ?", (_today(),)).fetchone()
        return int(row[0]) if row else 0
    finally:
        con.close()


def model_paused() -> bool:
    """True when today's model calls are used up (PERMIT_DAILY_MODEL_CALLS)."""
    return calls_today() >= config.daily_model_calls()


def take_model_call() -> bool:
    """Count one model call. False (and nothing counted) when the day's cap is already reached."""
    with _budget_lock:
        con = _usage_db()
        try:
            day = _today()
            row = con.execute("SELECT calls FROM model_usage WHERE day = ?", (day,)).fetchone()
            used = int(row[0]) if row else 0
            if used >= config.daily_model_calls():
                return False
            con.execute("INSERT INTO model_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1",
                        (day,))
            con.execute("DELETE FROM model_usage WHERE day < date(?, '-31 days')", (day,))
            con.commit()
            return True
        finally:
            con.close()


class BudgetExhausted(RuntimeError):
    """The day's model calls are used up."""


class _CountedMessages:
    def __init__(self, messages: Any) -> None:
        self._messages = messages

    def create(self, *args: Any, **kwargs: Any) -> Any:
        if not take_model_call():
            raise BudgetExhausted("the daily model-call cap is reached")
        return self._messages.create(*args, **kwargs)


class CountedClient:
    """Wraps a model client so every messages.create() counts against the daily cap and stops when it is reached.
    checker/agent.py treats the BudgetExhausted error like any model failure and answers from its template."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.messages = _CountedMessages(client.messages)


def counted(client: Any) -> Any:
    """The client to hand to checker/: the test stand-in or the real Anthropic client, counted. None when the server
    has no key and no stand-in was given (checker/ then uses its template or refuses)."""
    if client is None:
        if not config.has_api_key():
            return None
        import anthropic

        client = anthropic.Anthropic()
    return CountedClient(client)


# ---------------------------------------------------------------- Cloudflare Turnstile (optional)
def verify_turnstile(request: Request, token: Optional[str] = None) -> None:
    """When PERMIT_TURNSTILE_SECRET is set, the request must carry a valid Turnstile token (header or form field)."""
    secret = config.turnstile_secret()
    if not secret:
        return
    token = (token or request.headers.get(TURNSTILE_HEADER) or "").strip()
    problem = ApiError(403, "verification_needed", "We couldn't confirm this request came from a person. Reload the page, "
                                                   "then try again.")
    if not token or len(token) > 2048:
        raise problem
    try:
        r = requests.post(TURNSTILE_URL, data={"secret": secret, "response": token, "remoteip": client_ip(request)}, timeout=10)
        ok = r.ok and bool(r.json().get("success"))
    except (requests.RequestException, ValueError):
        ok = False
    if not ok:
        raise problem
