"""Stored checks: a small SQLite file (data/checks.sqlite, git-ignored).

In:  the confirmed facts, the intake answers, the zoning input and the audit result of one check.
Out: an id; the stored check by id; nothing once it is deleted or older than config.check_days().

What is stored is text only: the facts read from the plan, the answers, the address or zone if one
was given, and the result. The uploaded plan file is never stored. Expired checks are deleted when
the server starts and whenever a check is asked for.
"""
from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from . import config


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> sqlite3.Connection:
    path = config.checks_db()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("CREATE TABLE IF NOT EXISTS checks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, "
                "facts TEXT NOT NULL, intake TEXT NOT NULL, zoning_input TEXT NOT NULL, result TEXT NOT NULL, notices TEXT NOT NULL)")
    return con


def purge_expired() -> int:
    """Delete every check past its expiry. Returns how many were deleted."""
    con = _connect()
    try:
        n = con.execute("DELETE FROM checks WHERE expires_at <= ?", (_now().isoformat(),)).rowcount
        con.commit()
        return n
    finally:
        con.close()


def save(facts: dict, intake: dict, zoning_input: dict, result: dict, notices: Optional[list[str]] = None) -> dict[str, Any]:
    """Store one check under a new, unguessable id."""
    created = _now()
    row = {"id": secrets.token_urlsafe(16), "created_at": created.isoformat(timespec="seconds"),
           "expires_at": (created + timedelta(days=config.check_days())).isoformat(timespec="seconds")}
    con = _connect()
    try:
        con.execute("INSERT INTO checks (id, created_at, expires_at, facts, intake, zoning_input, result, notices) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (row["id"], row["created_at"], row["expires_at"], json.dumps(facts), json.dumps(intake),
                     json.dumps(zoning_input), json.dumps(result, default=str), json.dumps(notices or [])))
        con.commit()
    finally:
        con.close()
    return row | {"result": result}


def get(check_id: str) -> Optional[dict[str, Any]]:
    """The stored check, or None if there is none with that id (never made, deleted, or expired)."""
    purge_expired()
    con = _connect()
    try:
        r = con.execute("SELECT * FROM checks WHERE id = ?", (check_id,)).fetchone()
    finally:
        con.close()
    if r is None:
        return None
    return {"id": r["id"], "created_at": r["created_at"], "expires_at": r["expires_at"], "result": json.loads(r["result"]),
            "notices": json.loads(r["notices"])}


def delete(check_id: str) -> bool:
    con = _connect()
    try:
        n = con.execute("DELETE FROM checks WHERE id = ?", (check_id,)).rowcount
        con.commit()
        return n > 0
    finally:
        con.close()
