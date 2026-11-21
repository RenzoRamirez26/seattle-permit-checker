"""City of Seattle permits, plan reviews and reviewer comments.

Three datasets on the city's open data portal (Socrata), all published by the
Seattle Department of Construction and Inspections (SDCI):

1. Building Permits (76t5-zqzr): one row per permit, with applied and issued
   dates, the number of review cycles, and how many days the plans spent in
   review and out for corrections.
2. Plan Review (tqk8-y2z5): one row per review step (review type, cycle,
   assign and finish dates, result such as "Corrections Required").
3. Plan Comments (e285-aq8h): one row per reviewer comment, with the review
   type, cycle, subject and comment text. About 26,000 comments on about 700
   permits (2022 to 2025), so it is a sample of projects, not all of them.

Field names below were read from live records in November 2026.

Each dataset is saved to data/raw/seattle/<name>.jsonl first, then parsed from
that file, so a download can be re-used and inspected.

STATUS: the mappers are tested on real records and the paging on a stand-in. The live
download has not been run from this code yet; run `python -m pipeline.run_pipeline --seattle`.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Iterator, Optional

from .classify import business_category
from .http import get
from .schema import Permit, comm_res_from_text, work_from_text
from .util import num as _num, parse_date as _parse_date

HOST = "https://cos-data.seattle.gov/resource"
BUILDING_PERMITS = "76t5-zqzr"
PLAN_REVIEW = "tqk8-y2z5"
PLAN_COMMENTS = "e285-aq8h"
DEFAULT_SINCE = "2019-01-01"

# Chapter numbers reviewers put at the start of a comment subject ("10 Means of Egress").
SBC_CHAPTERS = {
    1: "Administration", 2: "Definitions", 3: "Occupancy Classification and Use",
    4: "Special Detailed Requirements", 5: "Building Heights and Areas", 6: "Types of Construction",
    7: "Fire and Smoke Protection Features", 8: "Interior Finishes", 9: "Fire Protection and Life Safety Systems",
    10: "Means of Egress", 11: "Accessibility", 12: "Interior Environment", 13: "Energy Efficiency",
    14: "Exterior Walls", 15: "Roof Assemblies", 16: "Structural Design", 17: "Special Inspections and Tests",
    18: "Soils and Foundations", 19: "Concrete", 21: "Masonry", 22: "Steel", 23: "Wood",
    24: "Glass and Glazing", 25: "Gypsum Board and Plaster", 26: "Plastic", 27: "Electrical",
    28: "Mechanical Systems", 29: "Plumbing Systems", 30: "Elevators and Conveying Systems",
    31: "Special Construction", 32: "Encroachments into the Public Right-of-Way",
    33: "Safeguards During Construction",
}


# ---------------------------------------------------------------- download
def soda(dataset: str, *, where: Optional[str] = None, page: int = 50000) -> Iterator[dict[str, Any]]:
    """Page through a Socrata dataset. Set SEATTLE_APP_TOKEN to raise the rate limit (optional)."""
    offset = 0
    while True:
        params: dict[str, Any] = {"$limit": page, "$offset": offset, "$order": ":id"}
        if where:
            params["$where"] = where
        if os.environ.get("SEATTLE_APP_TOKEN"):
            params["$$app_token"] = os.environ["SEATTLE_APP_TOKEN"]
        rows = get(f"{HOST}/{dataset}.json", params=params, timeout=180).json()
        if isinstance(rows, dict):  # Socrata reports query errors as an object
            raise RuntimeError(f"Socrata error on {dataset}: {rows.get('message', rows)}")
        yield from rows
        if len(rows) < page:
            return
        offset += page


# Words searched for on the city's server so only small-business projects are downloaded.
# All commercial building permits since 2019 is about 194,000 permit rows and 350,000 review
# rows (counted November 2026); this filter cuts that to a few thousand. The stricter local
# classifier (pipeline/classify.py) then sorts them and drops look-alikes such as "cafeteria".
SEARCH_TERMS = [
    # food and drink
    "RESTAURANT", "CAFE", "CAFÉ", "COFFEE", "ESPRESSO", "BAKERY", "TAVERN", "BREWERY", "BREWPUB",
    "TAPROOM", "PIZZ", "EATERY", "FOOD SERVICE", "COMMERCIAL KITCHEN", "TYPE I HOOD",
    # salons, fitness, retail
    "SALON", "BARBER", "FITNESS", "YOGA", "PILATES", "RETAIL", "BOUTIQUE",
]


def build_where(since: str = DEFAULT_SINCE, small_business_only: bool = True) -> str:
    where = (f"permittypemapped='Building' AND permitclassmapped='Non-Residential' "
             f"AND applieddate >= '{since}T00:00:00'")
    if small_business_only:
        where += " AND (" + " OR ".join(f"upper(description) like '%{t}%'" for t in SEARCH_TERMS) + ")"
    return where


def download(dataset: str, dest: Path, where: Optional[str] = None, refresh: bool = False) -> Path:
    """Save a dataset as JSON lines. Skips the download if the file is already there."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0 and not refresh:
        return dest
    tmp = dest.with_suffix(".part")
    with open(tmp, "w", encoding="utf-8") as f:
        for row in soda(dataset, where=where):
            f.write(json.dumps(row) + "\n")
    tmp.replace(dest)
    return dest


def download_all(raw_dir: Path, since: str = DEFAULT_SINCE, refresh: bool = False,
                 small_business_only: bool = True) -> dict[str, Path]:
    """Download the three datasets. With small_business_only=False every commercial building permit is fetched (large)."""
    d = raw_dir / ("seattle" if small_business_only else "seattle_all_commercial")
    where = build_where(since, small_business_only)
    return {
        "permits": download(BUILDING_PERMITS, d / "building_permits.jsonl", where, refresh),
        "reviews": download(PLAN_REVIEW, d / "plan_review.jsonl", where, refresh),
        "comments": download(PLAN_COMMENTS, d / "plan_comments.jsonl", None, refresh),
    }


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    """Rows from a .jsonl file, or from a .json file holding one array (a browser download)."""
    with open(path, encoding="utf-8") as f:
        if f.read(1) == "[":
            f.seek(0)
            yield from json.load(f)
            return
        f.seek(0)
        for line in f:
            if line.strip():
                yield json.loads(line)


# ---------------------------------------------------------------- mappers
def _int(v) -> Optional[int]:
    n = _num(v)
    return int(n) if n is not None else None


def _link(v) -> Optional[str]:
    return v.get("url") if isinstance(v, dict) else v


def permit_from_row(r: dict[str, Any]) -> Permit:
    desc = r.get("description")
    category = business_category(desc)
    return Permit(
        Permit_id=str(r.get("permitnum") or ""),
        County="King",
        Jurisdiction="City of Seattle",
        Address=r.get("originaladdress1"),
        Comm_Res=comm_res_from_text(r.get("permitclassmapped")),
        Description=desc,
        Estimated_Cost=_num(r.get("estprojectcost")),
        Issue_Date=_parse_date(r.get("issueddate")),
        New_Alter_Demo=work_from_text(r.get("permittypedesc")),
        Permit_Type="/".join(x for x in (r.get("permittypemapped"), r.get("permittypedesc")) if x) or None,
        Status=r.get("statuscurrent"),
        Structure_Type=r.get("permitclass"),
        Work_Type=r.get("permittypedesc"),
        Contractor=r.get("contractorcompanyname"),
        Lat=_num(r.get("latitude")),
        Lon=_num(r.get("longitude")),
        Category=category,
        Food_Drink=int(category == "food_drink"),
        Applied_Date=_parse_date(r.get("applieddate")),
        Review_Cycles=_int(r.get("numberreviewcycles")),
        Days_Plan_Review=_num(r.get("totaldaysplanreview")),
        Days_Initial_Review=_num(r.get("daysinitialplanreview")),
        Days_City_Review=_num(r.get("daysplanreviewcity")),
        Days_Out_Corrections=_num(r.get("daysoutcorrections")),
        Source_URL=_link(r.get("link")),
        Raw=r,
    )


def review_from_row(r: dict[str, Any]) -> dict[str, Any]:
    """One review step. The reviewer's name is in the source data and is left out here."""
    desc = r.get("description")
    return {
        "Permit_id": str(r.get("permitnum") or ""),
        "Review_Cycle": _int(r.get("reviewcycle")),
        "Review_Type": r.get("reviewtype"),
        "Review_Team": r.get("reviewteam") or "",
        "Assign_Date": _parse_date(r.get("reviewteamassigndate")) or "",
        "Finish_Date": _parse_date(r.get("reviewerfinishdate")),
        "Result": r.get("reviewresultdesc"),
        "Complexity": r.get("reviewcomplexitydesc"),
        "Permit_Class": r.get("permitclassmapped"),
        "Permit_Type": r.get("permittypedesc"),
        "Description": desc,
        "Applied_Date": _parse_date(r.get("applieddate")),
        "Address": r.get("originaladdress1"),
        "Category": business_category(desc),
    }


_SUBJECT = re.compile(r"^(?:SBC\s*Ch\.?\s*)?(\d{1,2})(?:\s+(.*))?$", re.I)


def normalize_subject(raw: Optional[str]) -> tuple[Optional[int], str]:
    """Group reviewer subjects by code chapter.

    '10 Means of Egress' -> (10, 'Ch. 10 Means of Egress')
    '16 Gravity Design'  -> (16, 'Ch. 16 Structural Design')
    'SBC Ch29'           -> (29, 'Ch. 29 Plumbing Systems')
    '00 Code Edition', '0', 'General', '' -> (None, 'General')
    Anything else is kept as written.
    """
    s = (raw or "").strip()
    m = _SUBJECT.match(s)
    if m:
        ch = int(m.group(1))
        if ch == 0:
            return None, "General"
        if ch in SBC_CHAPTERS:
            return ch, f"Ch. {ch} {SBC_CHAPTERS[ch]}"
        return ch, s
    if not s or s.lower() in ("general", "sbc ch"):
        return None, "General"
    return None, s


def comment_from_row(r: dict[str, Any]) -> dict[str, Any]:
    chapter, subject = normalize_subject(r.get("commentsubject"))
    return {
        "Permit_id": str(r.get("permitnum") or ""),
        "Review_Type": r.get("reviewtype"),
        "Review_Cycle": _int(r.get("reviewcycle")),
        "Subject_Raw": r.get("commentsubject"),
        "Chapter": chapter,
        "Subject": subject,
        "Comment": r.get("comment"),
        "Document_Title": r.get("documenttitle"),
        "Document_URL": _link(r.get("url")),
        "Document_Date": _parse_date(r.get("documentdate")),
    }


# ---------------------------------------------------------------- parse files
def parse_permits(path: Path) -> Iterator[Permit]:
    return (permit_from_row(r) for r in read_jsonl(path))


def parse_reviews(path: Path) -> Iterator[dict[str, Any]]:
    return (review_from_row(r) for r in read_jsonl(path))


def parse_comments(path: Path) -> Iterator[dict[str, Any]]:
    return (comment_from_row(r) for r in read_jsonl(path))
