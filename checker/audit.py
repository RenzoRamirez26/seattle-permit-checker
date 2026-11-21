"""End-to-end audit: floor plan + intake answers -> fix list, permit list and Seattle data.

  # full run (needs ANTHROPIC_API_KEY)
  python -m checker.audit demo/flawed_plan.png --business cafe_restaurant --cooking \
      --address "<street address>, Seattle, WA" --out report

  # no API key: reuse a saved (or hand-corrected) extraction
  python -m checker.audit --extraction demo/salon_flawed_extraction.json --business salon --zoning NR3

Writes <out>.json, <out>.md and <out>.pdf (the report). If the database built by pipeline/run_pipeline.py exists,
the report also shows what Seattle's plan-review records say about similar projects.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import rules_engine, zoning as zoning_mod

DEFAULT_DB = "data/permits.sqlite"


def local_review_data(db_path: str | None, business_type: str) -> dict | None:
    """Seattle plan-review numbers for the permit category this business type is compared with."""
    if not db_path or not Path(db_path).exists():
        return None
    from pipeline import db, query
    from pipeline.classify import CATEGORY_FOR_BUSINESS

    con = db.connect(db_path)
    try:
        return query.review_data(con, CATEGORY_FOR_BUSINESS.get(business_type, None))
    finally:
        con.close()


def audit(plan: str | None, intake: dict, *, extraction: dict | None = None,
          rules_name: str = rules_engine.DEFAULT_RULES, address: str | None = None,
          zoning_override: str | None = None, db_path: str | None = None, client=None) -> dict:
    rules = rules_engine.load_rules(rules_name)
    bt = rules_engine.business(rules, intake.get("business_type"))
    intake = intake | {"business_type": bt["key"]}
    if extraction is None:
        from .extract import extract_floor_plan

        context = f"business type: {bt['label']}; " + "; ".join(
            f"{k}: {v}" for k, v in intake.items() if k != "business_type" and v not in (None, False, ""))
        extraction = extract_floor_plan(plan, context, client=client)
    z = None
    if address or zoning_override:
        z = zoning_mod.check_address(address or "", rules, zoning_override, business_type=bt["key"],
                                     area_sqft=extraction.get("gross_area_sqft"))
    result = rules_engine.run_checks(extraction, intake, rules, z)
    result["extraction"] = extraction
    result["intake"] = intake
    if z:
        result["zoning"] = z
    review = local_review_data(db_path, bt["key"])
    if review:
        result["local_review_data"] = review
    return result


def main(argv=None) -> int:
    types = rules_engine.load_rules()["business_types"]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plan", nargs="?", help="floor plan image or PDF")
    ap.add_argument("--extraction", help="JSON file with a saved extraction (skips the vision call)")
    ap.add_argument("--business", default=rules_engine.DEFAULT_BUSINESS, choices=list(types),
                    help="kind of business (default %(default)s)")
    ap.add_argument("--cooking", action="store_true", help="grease-producing cooking on site (range, fryer, grill)")
    ap.add_argument("--food-prep", action="store_true", help="food prep without cooking")
    ap.add_argument("--alcohol", action="store_true")
    ap.add_argument("--outdoor-seating", action="store_true")
    ap.add_argument("--upper-floor", action="store_true", help="the space is not on the ground floor")
    ap.add_argument("--historic", action="store_true", help="the building is a landmark or in a historic district")
    ap.add_argument("--address", help="street address in Seattle (zoning lookup)")
    ap.add_argument("--zoning", help='set the zone by hand, e.g. "NC2-55 (M)"')
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--out", default="report")
    a = ap.parse_args(argv)
    if not a.plan and not a.extraction:
        ap.error("give a floor plan or --extraction")

    intake = {"business_type": a.business, "cooking_on_site": a.cooking, "food_prep": a.food_prep or a.cooking,
              "serves_alcohol": a.alcohol, "outdoor_seating": a.outdoor_seating, "upper_floor": a.upper_floor,
              "historic_district": a.historic}
    extraction = json.loads(Path(a.extraction).read_text(encoding="utf-8")) if a.extraction else None
    result = audit(a.plan, intake, extraction=extraction, address=a.address, zoning_override=a.zoning, db_path=a.db)
    Path(f"{a.out}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    md = rules_engine.to_markdown(result)
    Path(f"{a.out}.md").write_text(md + "\n", encoding="utf-8")
    from .pdf import report_pdf      # imported here so the checks above still run if the PDF library is missing

    Path(f"{a.out}.pdf").write_bytes(report_pdf(result))
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
