"""SQLite storage: permits, plan-review steps and reviewer comments."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

from .schema import COLUMNS, Permit

_TYPES = {
    "Comm_Res": "INTEGER", "New_Alter_Demo": "INTEGER", "Food_Drink": "INTEGER",
    "Estimated_Cost": "REAL", "Sqr_Ft": "REAL", "Lat": "REAL", "Lon": "REAL",
    "Review_Cycles": "INTEGER", "Days_Plan_Review": "REAL", "Days_Initial_Review": "REAL",
    "Days_City_Review": "REAL", "Days_Out_Corrections": "REAL",
}

# One row per review step of a permit (Seattle "Plan Review" dataset). Reviewer names are not stored.
REVIEW_COLUMNS = ["Permit_id", "Review_Cycle", "Review_Type", "Review_Team", "Assign_Date", "Finish_Date",
                  "Result", "Complexity", "Permit_Class", "Permit_Type", "Description", "Applied_Date",
                  "Address", "Category"]
# One row per reviewer comment (Seattle "Plan Comments" dataset).
COMMENT_COLUMNS = ["Permit_id", "Review_Type", "Review_Cycle", "Subject_Raw", "Chapter", "Subject", "Comment",
                   "Document_Title", "Document_URL", "Document_Date"]


def connect(path: Path | str) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    cols = ", ".join(f'"{c}" {_TYPES.get(c, "TEXT")}' for c in COLUMNS)
    con.execute(f'CREATE TABLE IF NOT EXISTS permits ({cols}, PRIMARY KEY ("County", "Permit_id"))')
    have = {r["name"] for r in con.execute("PRAGMA table_info(permits)")}
    for c in COLUMNS:  # databases made before a column was added
        if c not in have:
            con.execute(f'ALTER TABLE permits ADD COLUMN "{c}" {_TYPES.get(c, "TEXT")}')
    con.execute('CREATE INDEX IF NOT EXISTS idx_addr ON permits ("Address")')
    con.execute('CREATE INDEX IF NOT EXISTS idx_category ON permits ("Category")')
    con.execute(
        'CREATE TABLE IF NOT EXISTS plan_reviews ("Permit_id" TEXT, "Review_Cycle" INTEGER, "Review_Type" TEXT, '
        '"Review_Team" TEXT, "Assign_Date" TEXT, "Finish_Date" TEXT, "Result" TEXT, "Complexity" TEXT, '
        '"Permit_Class" TEXT, "Permit_Type" TEXT, "Description" TEXT, "Applied_Date" TEXT, "Address" TEXT, '
        '"Category" TEXT, PRIMARY KEY ("Permit_id", "Review_Cycle", "Review_Type", "Review_Team", "Assign_Date"))')
    con.execute(
        'CREATE TABLE IF NOT EXISTS plan_comments ("Permit_id" TEXT, "Review_Type" TEXT, "Review_Cycle" INTEGER, '
        '"Subject_Raw" TEXT, "Chapter" INTEGER, "Subject" TEXT, "Comment" TEXT, "Document_Title" TEXT, '
        '"Document_URL" TEXT, "Document_Date" TEXT)')
    con.execute('CREATE INDEX IF NOT EXISTS idx_comment_permit ON plan_comments ("Permit_id")')
    return con


def _insert(con: sqlite3.Connection, table: str, columns: list[str], rows: Iterable[dict], batch: int = 5000) -> int:
    sql = (f'INSERT OR REPLACE INTO {table} ({", ".join(chr(34) + c + chr(34) for c in columns)}) '
           f'VALUES ({", ".join(":" + c for c in columns)})')
    n, buf = 0, []
    for r in rows:
        if not r.get("Permit_id"):
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
        if not p.Permit_id:
            continue
        buf.append(p.to_row())
        if len(buf) >= batch:
            con.executemany(sql, buf); n += len(buf); buf = []
    if buf:
        con.executemany(sql, buf); n += len(buf)
    con.commit()
    return n


def export_csv(con: sqlite3.Connection, path: Path | str, where: str = "1=1") -> int:
    import csv

    cur = con.execute(f"SELECT * FROM permits WHERE {where}")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([d[0] for d in cur.description])
        n = 0
        for row in cur:
            w.writerow(list(row)); n += 1
    return n
