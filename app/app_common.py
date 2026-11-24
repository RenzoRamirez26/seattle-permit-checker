"""
Shared pieces of the app: page paths, session-state keys, cached loads and the notes shown on
the Limits and About pages. Used by the entrypoint (app/streamlit_app.py) and the pages in
app/pages_app/.

The app holds no rules of its own. Everything it shows comes from checker/ and pipeline/.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Callable

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from checker import audit, pdf, rules_engine  # noqa: E402
from pipeline.classify import CATEGORY_FOR_BUSINESS  # noqa: E402

DEMO_DIR = ROOT / "demo"
REPORTS_DIR = ROOT / "reports"
DB_PATH = ROOT / "data" / "permits.sqlite"

# Page files, relative to the entrypoint.
PAGE_CHECK = "pages_app/check.py"
PAGE_DATA = "pages_app/seattle_data.py"
PAGE_EVIDENCE = "pages_app/evidence.py"
PAGE_LIMITS = "pages_app/limits.py"
PAGE_ABOUT = "pages_app/about.py"

# Session-state keys.
KEY_SOURCE = "plan_source"          # "demo" or "upload"
KEY_CASE = "demo_case"              # selected demo case id
KEY_BUSINESS = "business_type"
KEY_COOKING = "cooking"
KEY_ALCOHOL = "alcohol"
KEY_OUTDOOR = "outdoor"
KEY_UPPER = "upper_floor"
KEY_HISTORIC = "historic"
KEY_ZONE_MODE = "zone_mode"         # "zone" or "address"
KEY_ZONE = "zone_text"
KEY_ADDRESS = "address_text"
KEY_USE_VISION = "use_vision"
KEY_EXTRACTION = "extraction"       # facts read from the plan (dict)
KEY_EXTRACTION_SOURCE = "extraction_source"
KEY_PLAN_ID = "plan_id"             # which plan the reading came from: "demo:<case id>" or "upload:<hash of the file>"
KEY_READY = "check_page_ready"      # set once per session, when the first demo plan's answers have been filled in
KEY_RESULT = "result"               # the last audit result
KEY_CHAT = "chat"                   # list of {"role", "content", "by"}
KEY_QUESTION = "question"
KEY_SPEAK = "speak_text"            # answer waiting to be spoken on this run

ZONE_BY_HAND, ZONE_BY_ADDRESS = "Enter the zone", "Look up an address"
SOURCE_DEMO, SOURCE_UPLOAD = "Use a demo plan", "Upload my own plan"


@st.cache_data(show_spinner=False)
def rules() -> dict:
    return rules_engine.load_rules()


@st.cache_data(show_spinner=False)
def cases() -> dict[str, dict]:
    return {c["id"]: c for c in json.loads((DEMO_DIR / "cases.json").read_text(encoding="utf-8"))}


def business_labels() -> dict[str, str]:
    return {k: v["label"] for k, v in rules()["business_types"].items()}


def truth_extraction(case_id: str) -> dict:
    return json.loads((DEMO_DIR / cases()[case_id]["extraction"]).read_text(encoding="utf-8"))


def read_uploaded_plan(data: bytes, filename: str, reader: Callable[[Path], dict]) -> dict:
    """Read an uploaded floor plan and leave no copy behind.

    The reader needs a file path (a PDF cannot be read from memory by the plan reader), so the
    upload is written to a temporary file. That file is deleted as soon as the read ends,
    whether it worked or failed: an owner's floor plan must not stay on the disk.
    """
    with tempfile.NamedTemporaryFile(suffix=Path(filename).suffix, delete=False) as f:
        f.write(data)
    path = Path(f.name)
    try:
        return reader(path)
    finally:
        path.unlink(missing_ok=True)


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def database_problem() -> str | None:
    """Why the Seattle database on this computer cannot be used, or None. Shown on the page instead of a crash."""
    if not DB_PATH.exists():
        return None
    from pipeline import db

    try:
        db.connect(DB_PATH).close()
    except db.OutdatedDatabase as e:
        return str(e)
    return None


def has_database() -> bool:
    """True when the database is there and was built with the column names this code reads."""
    return DB_PATH.exists() and database_problem() is None


def category_for(business_type: str):
    return CATEGORY_FOR_BUSINESS.get(business_type)


def run_audit(extraction: dict, intake: dict, *, zone: str | None, address: str | None) -> dict:
    """One call into the engine: the same function the command line and the tests use."""
    return audit.audit(None, intake, extraction=extraction, zoning_override=zone or None, address=address or None,
                       db_path=str(DB_PATH) if has_database() else None)


@st.cache_data(show_spinner=False, max_entries=8)
def report_pdf(result: dict) -> bytes:
    """The pre-check report as a PDF (checker/pdf.py). Cached, so it is built once per result, not on every rerun."""
    return pdf.report_pdf(result)


@st.cache_data(show_spinner=False, max_entries=8)
def permit_sheet_pdf(result: dict) -> bytes:
    """The permit application preparation sheet as a PDF (checker/pdf.py). Cached like the report."""
    return pdf.permit_sheet_pdf(result)


def reviewer_examples(result: dict, per_chapter: int = 2) -> list[dict]:
    """A few real reviewer comments on the code chapters this plan failed, for the agent to draw on."""
    if not has_database():
        return []
    from pipeline import db, query

    routing = rules().get("review_routing", {})
    chapters: list[int] = []
    for f in result["findings"]:
        route = routing.get(f["rule_id"]) or routing.get(f["rule_id"].split("-")[0]) or {}
        if f["status"] == "fail" and route.get("chapter") and route["chapter"] not in chapters:
            chapters.append(route["chapter"])
    con = db.connect(DB_PATH)
    try:
        category = category_for(result["summary"]["business_type"])
        return [c for ch in chapters[:2] for c in query.example_comments(con, ch, category, limit=per_chapter)]
    finally:
        con.close()


LIMITS_NOTE = """
- **This is a pre-submission check, not a code determination.** A licensed design professional and
  the city's plan reviewer decide what complies.
- **It checks a short list of items**: occupant load, exits, door widths and swing, aisle widths,
  restroom count and turning space, sprinklers, the kitchen hood and sinks, and zoning. A real
  review covers far more (structure, energy, ventilation, electrical, signage, parking).
- **The reading of the drawing can be wrong.** That is why step 3 shows what was read and lets you
  correct it before the check runs.
- **The demo plans are fictional**, drawn with printed dimensions so they are easy to read. Real
  drawings are harder.
- **Part of the rulebook is unverified.** `docs/rulebook.md` lists which numbers were checked against
  Seattle's code and which were entered from memory.
- **Seattle only.** Other cities have different codes, zones and agencies.
- **Not affiliated with the City of Seattle** or any agency named here.
"""

ABOUT_TEMPLATE = """
**What this is.** A pre-check for someone opening a small business in Seattle: a café, bar, shop,
salon, office or gym. It reads a floor plan, lists what a plan reviewer would likely send back,
and names the permits to expect.

**How it decides.** A vision model reads facts off the drawing (areas, door widths, fixtures). It
does not judge anything. Plain Python then compares those facts with rules our team coded from
Seattle's building and plumbing codes, the federal accessibility standards, and the King County and
Washington State food codes, and every problem is tied to a code section and to the reviewer who checks
it. {checked}

**Where the numbers on the data page come from.** Seattle publishes every permit's review history:
how many rounds it took, how long, and the reviewers' comments. The app only repeats those records.

**The agent.** You can ask questions about your result by typing or speaking. The agent answers only
from your result, and an answer that cites a rule your result does not contain is thrown away.

**Built with.** Python, Streamlit, the Claude API for reading plans and answering questions, and
Seattle's open data. Source and status are in the repository README.
"""


def about_note() -> str:
    """The About text, with how many rules are checked against the code text, counted from the rulebook."""
    rules = rules_engine.load_rules()
    return ABOUT_TEMPLATE.replace("{checked}", rules_engine.rules_checked_sentence(rules_engine.rule_counts(rules)))
