"""Questions the checker and the app ask the Seattle permit database.

Every function takes a `category` (food_drink, retail, salon, fitness, or None for all of
them together) and by default counts tenant build-outs only: additions and alterations,
not new buildings, whose reviews are longer for reasons unrelated to the business in them.
"""
from __future__ import annotations

import sqlite3
import statistics
from typing import Any

from .classify import CATEGORIES

CATEGORY_LABELS = {"food_drink": "food and drink", "retail": "retail", "salon": "salon and barbershop",
                   "fitness": "gym and fitness", None: "small-business"}
SOURCE = "SDCI Building Permits, Plan Review and Plan Comments open data"


def _median(values: list[float]) -> float | None:
    return float(statistics.median(values)) if values else None


def _cat(category: str | None) -> tuple[str, list[str]]:
    """SQL condition and arguments that select one category, or every known category."""
    if category:
        return ' AND "Category" = ?', [category]
    return ' AND "Category" IN (' + ", ".join("?" * len(CATEGORIES)) + ")", list(CATEGORIES)


def review_summary(con: sqlite3.Connection, category: str | None = "food_drink",
                   alterations_only: bool = True) -> dict[str, Any]:
    """How long plan review takes for permits that went through at least one review round."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "Review_Cycles", "Days_Plan_Review", "Days_Out_Corrections", "Days_City_Review" FROM permits '
        'WHERE "Review_Cycles" >= 1' + cond + (' AND "New_Alter_Demo" = 1' if alterations_only else ""), args)
    rows = cur.fetchall()
    cycles = [r["Review_Cycles"] for r in rows]

    def med(col):
        return _median([r[col] for r in rows if r[col] is not None])

    return {
        "permits": len(rows),
        "share_one_cycle": round(sum(c == 1 for c in cycles) / len(cycles), 3) if cycles else None,
        "share_two_or_more_cycles": round(sum(c >= 2 for c in cycles) / len(cycles), 3) if cycles else None,
        "median_review_cycles": _median(cycles),
        "median_days_plan_review": med("Days_Plan_Review"),
        "median_days_city_review": med("Days_City_Review"),
        "median_days_out_corrections": med("Days_Out_Corrections"),
    }


_ALTERATION = ' AND "Permit_Type" LIKE \'%Alteration%\''


def corrections_by_review_type(con: sqlite3.Connection, category: str | None = "food_drink", cycle: int = 1,
                               min_permits: int = 5, limit: int = 10,
                               alterations_only: bool = True) -> list[dict[str, Any]]:
    """For each review type: how many projects it looked at in a given round, and what share it sent back."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "Review_Type" AS review_type, COUNT(DISTINCT "Permit_id") AS permits, '
        'COUNT(DISTINCT CASE WHEN "Result" LIKE \'Corrections%\' THEN "Permit_id" END) AS sent_back '
        'FROM plan_reviews WHERE "Review_Cycle" = ?' + cond + (_ALTERATION if alterations_only else "") +
        ' GROUP BY "Review_Type" HAVING permits >= ? ORDER BY permits DESC LIMIT ?', (cycle, *args, min_permits, limit))
    return [dict(r) | {"share_corrections": round(r["sent_back"] / r["permits"], 3)} for r in cur]


def _permit_ids(category: str | None) -> tuple[str, list[str]]:
    """Sub-query for the tenant build-outs of a category, found in either table."""
    cond, args = _cat(category)
    return ('SELECT "Permit_id" FROM permits WHERE "New_Alter_Demo" = 1' + cond +
            ' UNION SELECT "Permit_id" FROM plan_reviews WHERE 1=1' + cond + _ALTERATION), args + args


def top_comment_subjects(con: sqlite3.Connection, category: str | None = "food_drink",
                         review_type: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
    """Most common subjects of reviewer comments, grouped by code chapter where the reviewer gave one."""
    sub, args = _permit_ids(category)
    where = ['"Subject" != \'General\'', f'"Permit_id" IN ({sub})']
    if review_type:
        where.append('"Review_Type" = ?'); args.append(review_type)
    cur = con.execute(
        'SELECT "Subject" AS subject, "Chapter" AS chapter, COUNT(*) AS comments, '
        'COUNT(DISTINCT "Permit_id") AS permits FROM plan_comments WHERE ' + " AND ".join(where) +
        ' GROUP BY "Subject" ORDER BY permits DESC, comments DESC LIMIT ?', (*args, limit))
    return [dict(r) for r in cur]


def example_comments(con: sqlite3.Connection, chapter: int, category: str | None = "food_drink",
                     limit: int = 5) -> list[dict[str, Any]]:
    """Real reviewer comments for one code chapter (10 = egress, 11 = accessibility), newest first."""
    sub, args = _permit_ids(category)
    cur = con.execute(
        'SELECT "Permit_id", "Review_Type", "Review_Cycle", "Subject_Raw", "Comment", "Document_URL", "Document_Date" '
        f'FROM plan_comments WHERE "Chapter" = ? AND "Permit_id" IN ({sub}) ORDER BY "Document_Date" DESC LIMIT ?',
        (chapter, *args, limit))
    return [dict(r) for r in cur]


def slowest_examples(con: sqlite3.Connection, category: str | None = "food_drink", limit: int = 5) -> list[dict[str, Any]]:
    """Tenant build-outs with the most review rounds: real cases for the pitch."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "Permit_id", "Address", "Description", "Estimated_Cost", "Applied_Date", "Issue_Date", '
        '"Review_Cycles", "Days_Plan_Review", "Days_Out_Corrections", "Source_URL" FROM permits '
        'WHERE "Review_Cycles" >= 1 AND "New_Alter_Demo" = 1' + cond +
        ' ORDER BY "Review_Cycles" DESC, "Days_Plan_Review" DESC LIMIT ?', (*args, limit))
    return [dict(r) for r in cur]


def category_counts(con: sqlite3.Connection) -> dict[str, int]:
    cur = con.execute('SELECT "Category" AS c, COUNT(*) AS n FROM permits WHERE "Category" IS NOT NULL GROUP BY "Category"')
    return {r["c"]: r["n"] for r in cur}


def review_data(con: sqlite3.Connection, category: str | None = "food_drink") -> dict[str, Any] | None:
    """Everything the report shows from Seattle's plan-review records, or None if there is none."""
    summary = review_summary(con, category)
    if not summary["permits"]:
        return None
    return {
        "city": "Seattle",
        "category": category,
        "category_label": CATEGORY_LABELS.get(category, category),
        "source": SOURCE,
        "summary": summary,
        "corrections_by_review_type": corrections_by_review_type(con, category),
        "top_comment_subjects": top_comment_subjects(con, category, limit=8),
    }
