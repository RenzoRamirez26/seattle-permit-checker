"""How well does the vision step read a floor plan? Compare its output with the ground truth.

This is the project's evidence. The rules engine is deterministic, so the only part that
can be wrong in a way we cannot see is the reading of the drawing. For each demo plan we
know the right answer (demo/*_extraction.json, written by hand from the drawing), so we
can count how many facts the model read correctly and whether the same problems come out.

  python -m evaluation.evaluate_extraction --vision            # run the model on every demo plan (needs ANTHROPIC_API_KEY)
  python -m evaluation.evaluate_extraction --pred my.json --case cafe_flawed   # score a saved extraction

Writes reports/extraction_eval.md.

STATUS: the scoring is tested. No real model output has been scored yet, so there are no
results to report until --vision has been run.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Optional

from checker import rules_engine, zoning

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
AREA_TOLERANCE = 0.02   # areas within 2% count as correct; inches and counts must match exactly


def load_cases() -> list[dict[str, Any]]:
    return json.loads((DEMO / "cases.json").read_text(encoding="utf-8"))


def load_truth(case: dict) -> dict:
    return json.loads((DEMO / case["extraction"]).read_text(encoding="utf-8"))


def _key(label: Optional[str]) -> str:
    """Match items by a loose label: 'Restroom 1 door' and 'restroom 1 Door' are the same."""
    return " ".join(sorted((label or "").lower().replace("/", " ").replace("-", " ").split()))


def _same(truth, pred, kind: str) -> bool:
    if truth is None or pred is None:
        return truth is None and pred is None
    if kind == "area":
        return abs(pred - truth) <= AREA_TOLERANCE * max(abs(truth), 1)
    return pred == truth


def compare(pred: dict, truth: dict) -> list[dict[str, Any]]:
    """One row per fact in the ground truth: what it should be, what was read, and whether they match."""
    rows: list[dict[str, Any]] = []

    def add(field, t, p, kind="exact"):
        rows.append({"field": field, "truth": t, "pred": p, "ok": _same(t, p, kind)})

    add("gross area (sq ft)", truth.get("gross_area_sqft"), pred.get("gross_area_sqft"), "area")
    add("seat count", truth.get("seat_count"), pred.get("seat_count"))
    add("accessible seats", truth.get("accessible_seat_count"), pred.get("accessible_seat_count"))

    def by_label(items, name):
        return {_key(i.get(name)): i for i in items or []}

    p_spaces = by_label(pred.get("spaces"), "name")
    for s in truth.get("spaces", []):
        if s.get("area_sqft") is None:
            continue   # restrooms and corridors carry no area in the ground truth
        got = p_spaces.get(_key(s["name"]), {})
        add(f"area of {s['name']}", s["area_sqft"], got.get("area_sqft"), "area")
        add(f"use of {s['name']}", s["use"], got.get("use"))

    p_doors = by_label(pred.get("doors"), "label")
    for d in truth.get("doors", []):
        got = p_doors.get(_key(d["label"]), {})
        add(f"{d['label']}: clear width (in.)", d.get("clear_width_in"), got.get("clear_width_in"))
        add(f"{d['label']}: is an exit", d.get("is_exit"), got.get("is_exit"))
        if d.get("is_exit"):
            add(f"{d['label']}: swing", d.get("swing"), got.get("swing"))

    p_aisles = by_label(pred.get("aisles"), "label")
    for a in truth.get("aisles", []):
        add(f"{a['label']}: width (in.)", a.get("min_width_in"), p_aisles.get(_key(a["label"]), {}).get("min_width_in"))

    p_rest = by_label(pred.get("restrooms"), "label")
    for r in truth.get("restrooms", []):
        got = p_rest.get(_key(r["label"]), {})
        for field, name in (("water_closets", "water closets"), ("lavatories", "lavatories"),
                            ("turning_circle_diameter_in", "turning circle (in.)"),
                            ("door_clear_width_in", "door width (in.)"), ("designation", "designation")):
            add(f"{r['label']}: {name}", r.get(field), got.get(field))

    for block, fields in (("kitchen", ("grease_producing_cooking", "type1_hood_shown", "hand_sinks",
                                       "three_compartment_sink", "mop_or_service_sink")),
                          ("fire_safety", ("exit_signs_shown", "fire_extinguishers_shown", "sprinklers_noted"))):
        for field in fields:
            t = (truth.get(block) or {}).get(field)
            if t is not None:
                add(f"{block}: {field}", t, (pred.get(block) or {}).get(field))
    return rows


def score(rows: list[dict]) -> dict[str, Any]:
    n, ok = len(rows), sum(r["ok"] for r in rows)
    return {"facts": n, "correct": ok, "accuracy": round(ok / n, 3) if n else None,
            "wrong": [r for r in rows if not r["ok"]]}


def findings_agreement(pred: dict, truth: dict, case: dict, rules: Optional[dict] = None) -> dict[str, Any]:
    """Run the rules on both extractions: which real problems were caught, missed or invented?"""
    rules = rules or rules_engine.load_rules()
    bt = case["intake"]["business_type"]

    def problems(extraction):
        z = zoning.classify(case.get("zoning"), rules, business_type=bt, area_sqft=extraction.get("gross_area_sqft"))
        result = rules_engine.run_checks(extraction, case["intake"], rules, z)
        return {(f["rule_id"], f["title"]) for f in result["findings"] if f["status"] == "fail"}

    real, found = problems(truth), problems(pred)
    return {"real_problems": len(real), "caught": len(real & found),
            "missed": sorted(t for _, t in real - found), "false_alarms": sorted(t for _, t in found - real)}


def evaluate_case(case: dict, pred: dict) -> dict[str, Any]:
    truth = load_truth(case)
    return {"case": case["id"], "title": case["title"]} | score(compare(pred, truth)) | \
        {"problems": findings_agreement(pred, truth, case)}


def to_markdown(results: list[dict], source: str) -> str:
    out = ["# Plan-reading evaluation", "", f"Extractions scored: {source}.", "",
           "| Plan | Facts checked | Read correctly | Accuracy | Real problems | Caught | False alarms |",
           "|---|---|---|---|---|---|---|"]
    for r in results:
        p = r["problems"]
        out.append(f"| {r['title']} | {r['facts']} | {r['correct']} | {r['accuracy']:.0%} | "
                   f"{p['real_problems']} | {p['caught']} | {len(p['false_alarms'])} |")
    for r in results:
        if r["wrong"] or r["problems"]["missed"] or r["problems"]["false_alarms"]:
            out += ["", f"## {r['title']}", ""]
            out += [f"- Misread {w['field']}: read {w['pred']!r}, should be {w['truth']!r}" for w in r["wrong"]]
            out += [f"- Missed problem: {t}" for t in r["problems"]["missed"]]
            out += [f"- False alarm: {t}" for t in r["problems"]["false_alarms"]]
    out += ["", "_The plans are fictional demo drawings with printed dimensions. Real drawings are harder._", ""]
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vision", action="store_true", help="run the vision model on every demo plan")
    ap.add_argument("--pred", help="a saved extraction JSON to score")
    ap.add_argument("--case", help="demo case id the --pred file belongs to")
    ap.add_argument("--out", default=str(ROOT / "reports" / "extraction_eval.md"))
    a = ap.parse_args(argv)
    cases = {c["id"]: c for c in load_cases()}
    results = []
    if a.vision:
        from checker.extract import DEFAULT_MODEL, extract_floor_plan

        for c in cases.values():
            bt = rules_engine.business(rules_engine.load_rules(), c["intake"]["business_type"])
            pred = extract_floor_plan(DEMO / c["plan"], f"business type: {bt['label']}")
            (ROOT / "reports").mkdir(exist_ok=True)
            (ROOT / "reports" / f"{c['id']}_vision_extraction.json").write_text(json.dumps(pred, indent=2))
            results.append(evaluate_case(c, pred))
        source = f"vision model {DEFAULT_MODEL}"
    elif a.pred and a.case in cases:
        results.append(evaluate_case(cases[a.case], json.loads(Path(a.pred).read_text(encoding="utf-8"))))
        source = a.pred
    else:
        ap.error("give --vision, or --pred FILE with --case " + "|".join(cases))
    md = to_markdown(results, source)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
