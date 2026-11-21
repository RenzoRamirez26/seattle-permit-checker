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
        return ' AND "category" = ?', [category]
    return ' AND "category" IN (' + ", ".join("?" * len(CATEGORIES)) + ")", list(CATEGORIES)


def review_summary(con: sqlite3.Connection, category: str | None = "food_drink",
                   alterations_only: bool = True) -> dict[str, Any]:
    """How long plan review takes for permits that went through at least one review round."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "review_rounds", "days_in_review", "days_with_applicant", "days_with_city" FROM permits '
        'WHERE "review_rounds" >= 1' + cond + (' AND "is_alteration" = 1' if alterations_only else ""), args)
    rows = cur.fetchall()
    cycles = [r["review_rounds"] for r in rows]

    def med(col):
        return _median([r[col] for r in rows if r[col] is not None])

    return {
        "permits": len(rows),
        "share_one_round": round(sum(c == 1 for c in cycles) / len(cycles), 3) if cycles else None,
        "share_two_or_more_rounds": round(sum(c >= 2 for c in cycles) / len(cycles), 3) if cycles else None,
        "median_review_rounds": _median(cycles),
        "median_days_in_review": med("days_in_review"),
        "median_days_with_city": med("days_with_city"),
        "median_days_with_applicant": med("days_with_applicant"),
    }


_ALTERATION = ' AND "work_type" LIKE \'%Alteration%\''


def corrections_by_review_type(con: sqlite3.Connection, category: str | None = "food_drink", cycle: int = 1,
                               min_permits: int = 5, limit: int = 10,
                               alterations_only: bool = True) -> list[dict[str, Any]]:
    """For each review type: how many projects it looked at in a given round, and what share it sent back."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "review_type" AS review_type, COUNT(DISTINCT "permit_number") AS permits, '
        'COUNT(DISTINCT CASE WHEN "result" LIKE \'Corrections%\' THEN "permit_number" END) AS sent_back '
        'FROM plan_reviews WHERE "review_round" = ?' + cond + (_ALTERATION if alterations_only else "") +
        ' GROUP BY "review_type" HAVING permits >= ? ORDER BY permits DESC LIMIT ?', (cycle, *args, min_permits, limit))
    return [dict(r) | {"share_corrections": round(r["sent_back"] / r["permits"], 3)} for r in cur]


def _permit_ids(category: str | None) -> tuple[str, list[str]]:
    """Sub-query for the tenant build-outs of a category, found in either table."""
    cond, args = _cat(category)
    return ('SELECT "permit_number" FROM permits WHERE "is_alteration" = 1' + cond +
            ' UNION SELECT "permit_number" FROM plan_reviews WHERE 1=1' + cond + _ALTERATION), args + args


def top_comment_subjects(con: sqlite3.Connection, category: str | None = "food_drink",
                         review_type: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
    """Most common subjects of reviewer comments, grouped by code chapter where the reviewer gave one."""
    sub, args = _permit_ids(category)
    where = ['"subject" != \'General\'', f'"permit_number" IN ({sub})']
    if review_type:
        where.append('"review_type" = ?'); args.append(review_type)
    cur = con.execute(
        'SELECT "subject" AS subject, "chapter" AS chapter, COUNT(*) AS comments, '
        'COUNT(DISTINCT "permit_number") AS permits FROM plan_comments WHERE ' + " AND ".join(where) +
        ' GROUP BY "subject" ORDER BY permits DESC, comments DESC LIMIT ?', (*args, limit))
    return [dict(r) for r in cur]


def example_comments(con: sqlite3.Connection, chapter: int, category: str | None = "food_drink",
                     limit: int = 5) -> list[dict[str, Any]]:
    """Real reviewer comments for one code chapter (10 = egress, 11 = accessibility), newest first."""
    sub, args = _permit_ids(category)
    cur = con.execute(
        'SELECT "permit_number", "review_type", "review_round", "subject_raw", "comment", "letter_url", "letter_date" '
        f'FROM plan_comments WHERE "chapter" = ? AND "permit_number" IN ({sub}) ORDER BY "letter_date" DESC LIMIT ?',
        (chapter, *args, limit))
    return [dict(r) for r in cur]


def slowest_examples(con: sqlite3.Connection, category: str | None = "food_drink", limit: int = 5) -> list[dict[str, Any]]:
    """Tenant build-outs with the most review rounds: real cases for the pitch."""
    cond, args = _cat(category)
    cur = con.execute(
        'SELECT "permit_number", "address", "description", "estimated_cost", "applied_date", "issued_date", '
        '"review_rounds", "days_in_review", "days_with_applicant", "record_url" FROM permits '
        'WHERE "review_rounds" >= 1 AND "is_alteration" = 1' + cond +
        ' ORDER BY "review_rounds" DESC, "days_in_review" DESC LIMIT ?', (*args, limit))
    return [dict(r) for r in cur]


def category_counts(con: sqlite3.Connection) -> dict[str, int]:
    cur = con.execute('SELECT "category" AS c, COUNT(*) AS n FROM permits WHERE "category" IS NOT NULL GROUP BY "category"')
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
