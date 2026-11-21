"""One permit, as stored in the database, and the column names of the three Seattle tables.

All names are lower case with underscores. They are ours: the city's own field names appear
only in pipeline/seattle.py, where each record is mapped. docs/data_sources.md lists every
column and the city field it comes from.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

# kinds of work, from the city's permit type description (see work_from_text)
NEW, ALTER, DEMO, OTHER_WORK = 0, 1, 2, 3


@dataclass
class Permit:
    permit_number: str
    address: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None            # food_drink, retail, salon or fitness (pipeline/classify.py)
    permit_class: Optional[str] = None        # the city's mapped class, e.g. "Non-Residential"
    permit_type: Optional[str] = None
    work_type: Optional[str] = None           # the city's permit type description, e.g. "Addition/Alteration"
    is_alteration: int = 0                    # 1 for an addition or alteration (a tenant build-out), else 0
    status: Optional[str] = None
    estimated_cost: Optional[float] = None
    contractor: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    applied_date: Optional[str] = None        # dates are ISO YYYY-MM-DD
    issued_date: Optional[str] = None
    completed_date: Optional[str] = None
    # --- plan-review timing ---
    review_rounds: Optional[int] = None           # number of plan-review rounds
    days_in_review: Optional[float] = None        # total days in plan review
    days_first_round: Optional[float] = None      # days to finish the first round
    days_with_city: Optional[float] = None        # days the city held the plans
    days_with_applicant: Optional[float] = None   # days the applicant held the plans making corrections
    record_url: Optional[str] = None
    raw: dict[str, Any] = field(default_factory=dict)

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["raw"] = json.dumps(self.raw, default=str)
        return d


COLUMNS = list(Permit.__dataclass_fields__.keys())

# One row per review step of a permit (Seattle "Plan Review" dataset). Reviewer names are not stored.
REVIEW_COLUMNS = ["permit_number", "review_round", "review_type", "review_team", "assigned_date", "finished_date",
                  "result", "complexity", "permit_class", "work_type", "description", "applied_date",
                  "address", "category"]
REVIEW_KEY = ["permit_number", "review_round", "review_type", "review_team", "assigned_date"]
# One row per reviewer comment (Seattle "Plan Comments" dataset).
COMMENT_COLUMNS = ["permit_number", "review_type", "review_round", "subject_raw", "chapter", "subject", "comment",
                   "letter_title", "letter_url", "letter_date"]


def work_from_text(text: Optional[str]) -> int:
    t = (text or "").lower()
    if "demo" in t:
        return DEMO
    if any(k in t for k in ("new construction", "new build", "/new", " new")) or t.startswith("new"):
        return NEW
    if any(k in t for k in ("alter", "addition", "remodel", "renovat", "repair", "tenant", "interior finish", "build-out", "buildout")):
        return ALTER
    return OTHER_WORK
