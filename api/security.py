"""HTTP hardening for the API: security headers on every response, and a size cap on every request body.

In:  every request and response (pure ASGI middleware, so streaming and uploads are not buffered here).
Out: the same response with security headers added; or a JSON 413 when a body is larger than its route allows,
     before the body is parsed or spooled to disk.

Headers: a Content-Security-Policy that lets an API response load nothing and be framed by nobody (the docs page,
when it is switched on, may load Swagger UI from its CDN), X-Content-Type-Options, Referrer-Policy, X-Frame-Options,
a Permissions-Policy (microphone only for the site's own origin, no camera), Cache-Control: no-store (a check's
data is never kept by a browser or proxy cache), and Strict-Transport-Security in production.
"""
from __future__ import annotations

import json
from typing import Any, Awaitable, Callable

from starlette.exceptions import HTTPException as StarletteHTTPException

from . import config

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
PDF_CSP = "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"     # the browser's PDF viewer must still run
DOCS_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
PERMISSIONS = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()"      # the same as web/vercel.json
HSTS = "max-age=63072000; includeSubDomains"
DOCS_PATHS = ("/docs", "/redoc")


def common_headers(path: str, content_type: str = "") -> list[tuple[bytes, bytes]]:
    csp = DOCS_CSP if path.startswith(DOCS_PATHS) else PDF_CSP if content_type.startswith("application/pdf") else API_CSP
    headers = [("content-security-policy", csp), ("x-content-type-options", "nosniff"),
               ("referrer-policy", "strict-origin-when-cross-origin"), ("x-frame-options", "DENY"),
               ("permissions-policy", PERMISSIONS), ("cross-origin-opener-policy", "same-origin")]
    if path.startswith("/api/"):
        headers.append(("cache-control", "no-store"))
    if config.is_production():
        headers.append(("strict-transport-security", HSTS))
    return [(k.encode(), v.encode()) for k, v in headers]


class SecurityHeaders:
    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                have = {k.lower() for k, _ in message.get("headers", [])}
                ctype = next((v.decode("latin-1") for k, v in message.get("headers", []) if k.lower() == b"content-type"), "")
                message["headers"] = list(message.get("headers", [])) + [
                    (k, v) for k, v in common_headers(scope["path"], ctype) if k not in have]
            await send(message)

        await self.app(scope, receive, with_headers)


# ---------------------------------------------------------------- request body size
class BodyTooLarge(StarletteHTTPException):
    """A request body over its route's cap. Raised while the body is read, so it is never parsed or stored."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(status_code=413, detail=message)
        self.code, self.message = code, message


_FORM_OVERHEAD = 64 * 1024      # the multipart boundaries and the small form fields around an upload


def body_cap(path: str) -> tuple[int, str, str]:
    """(largest body in bytes, error code, sentence) for a route."""
    if path == "/api/plans/read":
        mb = config.max_upload_bytes() / 1024 / 1024
        return config.max_upload_bytes() + _FORM_OVERHEAD, "file_too_large", f"The plan is larger than the {mb:g} MB limit."
    if path == "/api/transcribe":
        mb = config.max_audio_bytes() / 1024 / 1024
        return (config.max_audio_bytes() + _FORM_OVERHEAD, "audio_too_large",
                f"The recording is larger than the {mb:g} MB limit. Ask a shorter question.")
    return config.MAX_JSON_BYTES, "request_too_large", "The request is larger than the pre-check accepts."


class BodyLimit:
    """Refuses a body over its cap from its Content-Length, and counts the bytes of a body sent without one."""

    def __init__(self, app: Callable) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS", "DELETE"):
            return await self.app(scope, receive, send)
        cap, code, message = body_cap(scope["path"])
        length = next((v for k, v in scope.get("headers", []) if k == b"content-length"), None)
        try:
            too_big = length is not None and int(length) > cap
        except ValueError:
            too_big = True
        if too_big:
            return await _refuse(send, scope["path"], code, message)
        seen = 0
        started = False

        async def counted() -> dict:
            nonlocal seen
            message_ = await receive()
            if message_["type"] == "http.request":
                seen += len(message_.get("body", b""))
                if seen > cap:
                    raise BodyTooLarge(code, message)
            return message_

        async def tracking(message_: dict) -> None:
            nonlocal started
            if message_["type"] == "http.response.start":
                started = True
            await send(message_)

        try:
            await self.app(scope, counted, tracking)
        except BodyTooLarge as e:
            if not started:
                await _refuse(send, scope["path"], e.code, e.message)


async def _refuse(send: Send, path: str, code: str, message: str) -> None:
    body = json.dumps({"error": {"code": code, "message": message}}).encode()
    headers = [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"connection", b"close")]
    await send({"type": "http.response.start", "status": 413, "headers": headers + common_headers(path, "application/json")})
    await send({"type": "http.response.body", "body": body})
