"""Settings for the API, read from the environment each time they are asked for.

In:  environment variables (see .env.example).  Out: paths, limits and the allowed browser origin.
Nothing here is a building-code value; these are server limits only.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "demo"

MAX_QUESTION_CHARS = 500        # a longer question is rejected
MAX_HISTORY_TURNS = 6           # only the last turns of a conversation are passed to the agent
MAX_HISTORY_TURN_CHARS = 1000   # each of those turns is cut to this length
UPLOAD_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf"}


def _number(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, default))
    except ValueError:
        return default
    return value if value > 0 else default


def checks_db() -> Path:
    """Where stored checks live. Git-ignored (data/*.sqlite)."""
    return Path(os.environ.get("PERMIT_CHECKS_DB", ROOT / "data" / "checks.sqlite"))


def seattle_db() -> Path:
    """The Seattle review-records database built by pipeline/run_pipeline.py, if it has been built."""
    return Path(os.environ.get("PERMIT_SEATTLE_DB", ROOT / "data" / "permits.sqlite"))


def max_upload_bytes() -> int:
    return int(_number("PERMIT_MAX_UPLOAD_MB", 10) * 1024 * 1024)


MAX_AUDIO_SECONDS = 30          # the browser stops recording a spoken question at this length


def max_audio_bytes() -> int:
    """The largest spoken question accepted: 2 MB by default, about a minute of 16 kHz mono WAV."""
    return int(_number("PERMIT_MAX_AUDIO_MB", 2) * 1024 * 1024)


def check_days() -> float:
    """How long a stored check is kept before it is deleted."""
    return _number("PERMIT_CHECK_DAYS", 30)


LOCAL_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def is_production() -> bool:
    """PERMIT_ENV=production: the docs page is off, only PERMIT_CORS_ORIGIN may call, HSTS is sent. The Docker image sets it."""
    return os.environ.get("PERMIT_ENV", "development").strip().lower() == "production"


def docs_enabled() -> bool:
    """/docs, /redoc and /openapi.json: on in development, off in production unless PERMIT_API_DOCS=1."""
    return not is_production() or os.environ.get("PERMIT_API_DOCS", "").strip().lower() in ("1", "true", "yes", "on")


def cors_origin() -> str:
    """The front end's address, from PERMIT_CORS_ORIGIN (the first one if several are given)."""
    origins = cors_origins()
    return origins[0] if origins else ""


def cors_origins() -> list[str]:
    """The browser origins allowed to call the API. Never a wildcard.

    PERMIT_CORS_ORIGIN holds the production origin (several may be given, separated by commas, for example the
    www and bare domains). In development the local front end (localhost:3000) is always allowed as well; in
    production only what PERMIT_CORS_ORIGIN names. A "*" is dropped, so a typo can never open the API to every site.
    """
    given = [o.strip().rstrip("/") for o in os.environ.get("PERMIT_CORS_ORIGIN", "").split(",")]
    origins = [o for o in given if o and o != "*" and o.startswith(("https://", "http://"))]
    if not is_production():
        origins += [o for o in LOCAL_ORIGINS if o not in origins]
    return origins


def max_pdf_pages() -> int:
    """A PDF plan with more pages than this is refused: only the first page is read, so a long document is not a plan."""
    return int(_number("PERMIT_MAX_PDF_PAGES", 10))


def max_image_pixels() -> int:
    """The largest picture accepted, in pixels (width x height), so a small file cannot unpack into a huge image."""
    return int(_number("PERMIT_MAX_IMAGE_MEGAPIXELS", 40) * 1_000_000)


MAX_JSON_BYTES = 512 * 1024     # the largest JSON body (a check's facts and answers are a few KB)


# Sized for a $10-a-month Anthropic spend limit: 10 calls x $0.0268 (the dearest call measured) x 31 days = $8.31,
# under $9. The measurement and the formula: docs/launch.md, Budget; tests/test_budget.py keeps them in step.
DEFAULT_DAILY_MODEL_CALLS = 10


def daily_model_calls() -> int:
    """How many model calls (plan readings and assistant answers) the whole site may make per UTC day. 0 means none."""
    try:
        return max(0, int(os.environ.get("PERMIT_DAILY_MODEL_CALLS", str(DEFAULT_DAILY_MODEL_CALLS))))
    except ValueError:
        return DEFAULT_DAILY_MODEL_CALLS


def proxy_hops() -> int:
    """How many proxies of our own sit in front of the API (the host's load balancer is one). The client's address is
    taken that many places from the right of X-Forwarded-For; 0 uses the connection's address. Never trust more."""
    try:
        return max(0, int(os.environ.get("PERMIT_PROXY_HOPS", "0")))
    except ValueError:
        return 0


def turnstile_secret() -> str:
    """Cloudflare Turnstile's secret key. When set, uploads and the assistant need a Turnstile token."""
    return os.environ.get("PERMIT_TURNSTILE_SECRET", "").strip()


def has_api_key() -> bool:
    """True when the server has a Claude API key. The key itself is never returned by any endpoint."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
