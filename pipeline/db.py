"""SQLite storage: permits, plan-review steps and reviewer comments.

In:  a path. Out: connect(): a connection with the three tables created if they are missing (the pipeline's);
     connect_readonly(): a read-only connection, for the checker and the API, which never write to this file.

Every query in pipeline/ binds its values with ? or :name placeholders. The only SQL built with f-strings joins
table and column names from TABLES and pipeline/schema.py (constants in the code), never a value from a request;
tests/test_api_security.py fails if a new execute() call builds its SQL from anything else.

The database is rebuilt by the pipeline and is not migrated. If a file was built with
different column names (for example before the columns were renamed), connect() raises
OutdatedDatabase with the command that rebuilds it.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

from .schema import COLUMNS, COMMENT_COLUMNS, REVIEW_COLUMNS, REVIEW_KEY, Permit

REBUILD_COMMAND = "python -m pipeline.run_pipeline --seattle"
TABLES = {"permits": COLUMNS, "plan_reviews": REVIEW_COLUMNS, "plan_comments": COMMENT_COLUMNS}
_TYPES = {
    "is_alteration": "INTEGER", "estimated_cost": "REAL", "latitude": "REAL", "longitude": "REAL",
    "review_rounds": "INTEGER", "days_in_review": "REAL", "days_first_round": "REAL",
    "days_with_city": "REAL", "days_with_applicant": "REAL",
    "review_round": "INTEGER", "chapter": "INTEGER",
}


class OutdatedDatabase(RuntimeError):
    """The database file has different columns from the ones this code reads and writes."""


def _columns(columns: list[str]) -> str:
    return ", ".join(f'"{c}" {_TYPES.get(c, "TEXT")}' for c in columns)


def _key(columns: list[str]) -> str:
    return ", ".join(f'"{c}"' for c in columns)


def check_columns(con: sqlite3.Connection, path: Path | str) -> None:
    """Raise OutdatedDatabase if a table that already exists does not have exactly the expected columns."""
    for table, expected in TABLES.items():
        have = [r["name"] for r in con.execute(f"PRAGMA table_info({table})")]
        if have and set(have) != set(expected):
            unexpected = sorted(set(have) - set(expected))[:4]
            raise OutdatedDatabase(
                f"The Seattle database at {path} was built with different column names "
                f"(table {table} has {', '.join(unexpected) or 'columns missing'}). "
                f"Delete the file and rebuild it with: {REBUILD_COMMAND}")


def connect_readonly(path: Path | str) -> sqlite3.Connection:
    """A read-only connection (SQLite mode=ro): any INSERT, UPDATE, DELETE or CREATE through it fails.
    Raises OutdatedDatabase if the file lacks a table or has different columns, sqlite3.OperationalError if it is missing."""
    con = sqlite3.connect(f"{Path(path).resolve().as_uri()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        have = {r["name"] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        if not set(TABLES) <= have:
            raise OutdatedDatabase(f"The Seattle database at {path} has no {', '.join(sorted(set(TABLES) - have))} table. "
                                   f"Rebuild it with: {REBUILD_COMMAND}")
        check_columns(con, path)
    except Exception:
        con.close()
        raise
    return con


def connect(path: Path | str) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        check_columns(con, path)
    except OutdatedDatabase:
        con.close()
        raise
    con.execute(f'CREATE TABLE IF NOT EXISTS permits ({_columns(COLUMNS)}, PRIMARY KEY ("permit_number"))')
    con.execute('CREATE INDEX IF NOT EXISTS idx_addr ON permits ("address")')
    con.execute('CREATE INDEX IF NOT EXISTS idx_category ON permits ("category")')
    con.execute(f'CREATE TABLE IF NOT EXISTS plan_reviews ({_columns(REVIEW_COLUMNS)}, PRIMARY KEY ({_key(REVIEW_KEY)}))')
    con.execute(f'CREATE TABLE IF NOT EXISTS plan_comments ({_columns(COMMENT_COLUMNS)})')
    con.execute('CREATE INDEX IF NOT EXISTS idx_comment_permit ON plan_comments ("permit_number")')
    return con


def _insert(con: sqlite3.Connection, table: str, columns: list[str], rows: Iterable[dict], batch: int = 5000) -> int:
    sql = (f'INSERT OR REPLACE INTO {table} ({", ".join(chr(34) + c + chr(34) for c in columns)}) '
           f'VALUES ({", ".join(":" + c for c in columns)})')
    n, buf = 0, []
    for r in rows:
        if not r.get("permit_number"):
            continue
        buf.append({c: r.get(c) for c in columns})
        if len(buf) >= batch:
            con.executemany(sql, buf); n += len(buf); buf = []
    if buf:
        con.executemany(sql, buf); n += len(buf)
    con.commit()
    return n


def upsert_reviews(con: sqlite3.Connection, rows: Iterable[dict]) -> int:
    return _insert(con, "plan_reviews", REVIEW_COLUMNS, rows)


def replace_comments(con: sqlite3.Connection, rows: Iterable[dict]) -> int:
    """Comments have no natural key, so each load replaces the table."""
    con.execute("DELETE FROM plan_comments")
    return _insert(con, "plan_comments", COMMENT_COLUMNS, rows)


def upsert(con: sqlite3.Connection, permits: Iterable[Permit], batch: int = 2000) -> int:
    sql = (
        f'INSERT OR REPLACE INTO permits ({", ".join(chr(34) + c + chr(34) for c in COLUMNS)}) '
        f'VALUES ({", ".join(":" + c for c in COLUMNS)})'
    )
    n, buf = 0, []
    for p in permits:
        if not p.permit_number:
            continue
        buf.append(p.to_row())
        if len(buf) >= batch:
            con.executemany(sql, buf); n += len(buf); buf = []
    if buf:
        con.executemany(sql, buf); n += len(buf)
    con.commit()
    return n


def export_csv(con: sqlite3.Connection, path: Path | str) -> int:
    import csv

    cur = con.execute("SELECT * FROM permits")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([d[0] for d in cur.description])
        n = 0
        for row in cur:
            w.writerow(list(row)); n += 1
    return n
