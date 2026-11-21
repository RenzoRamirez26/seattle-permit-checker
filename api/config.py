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


def check_days() -> float:
    """How long a stored check is kept before it is deleted."""
    return _number("PERMIT_CHECK_DAYS", 30)


def cors_origin() -> str:
    """The one browser address allowed to call the API (the front end's)."""
    return os.environ.get("PERMIT_CORS_ORIGIN", "http://localhost:3000").strip() or "http://localhost:3000"


def has_api_key() -> bool:
    """True when the server has a Claude API key. The key itself is never returned by any endpoint."""
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
