"""How well does the vision step read a floor plan? Compare its output with the ground truth.

This is the project's evidence. The rules engine is deterministic, so the only part that
can be wrong in a way we cannot see is the reading of the drawing. For each demo plan we
know the right answer (demo/*_extraction.json, written by hand from the drawing), so we
can count how many facts the model read correctly and whether the same problems come out.

  python -m evaluation.evaluate_extraction --vision            # run the model on every demo plan (needs ANTHROPIC_API_KEY)
  python -m evaluation.evaluate_extraction --pred my.json --case cafe_flawed   # score a saved extraction

Writes reports/extraction_eval.md.

  python -m evaluation.evaluate_extraction --saved             # score the readings the last --vision run saved (no model call)

Items are paired with the ground truth one to one before values are compared (same type and
number, then shared words, then order), so a fuller label is not counted as a misreading.
Each real problem is reported as caught, flagged to confirm, or missed; false alarms separately.

STATUS: real model output was scored on 21 November 2026: one run on the three demo plans.
Three plans and one run is a small sample; nothing has been scored on a real floor plan.
"""
from __future__ import annotations

import argparse
import copy
import json
import re
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


# ---------------------------------------------------------------- matching items by label
_FILLER = {"a", "an", "the", "to", "of", "and", "at", "in", "for", "between"}


def _tokens(label: Optional[str]) -> list[str]:
    return re.findall(r"[a-z0-9]+", (label or "").lower())


def _type_and_number(label: Optional[str]) -> Optional[str]:
    """'Door 1 - Main Entry / Exit' -> 'door 1'; 'Restroom 2 door' -> 'restroom 2'; 'Aisle A (between tables)' -> 'aisle a'.

    The words up to the item's number (or its letter, when that is the second word). None if the label has neither.
    """
    t = _tokens(label)
    for i, token in enumerate(t[:3]):
        if i >= 1 and (token.isdigit() or (i == 1 and len(token) == 1)):
            return " ".join(t[:i + 1])
    return None


def _words(label: Optional[str]) -> set[str]:
    """The label's meaningful words, singular: 'Corridor to restrooms' -> {'corridor', 'restroom'}."""
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in _tokens(label) if w not in _FILLER and not w.isdigit()}


def match_items(truth_items: list[dict], pred_items: list[dict], name: str) -> list[tuple[dict, Optional[dict], str]]:
    """Pair each ground-truth item with at most one item the model reported: [(truth item, model item or None, how)].

    A model may label an item more fully than the ground truth does ("Door 1 - Main Entry / Exit" for
    "Door 1"). That is not a misreading, so items are paired one to one, in three passes:
      1. the same label, or the same type and number ("door 1");
      2. the most meaningful words in common;
      3. what is left over, in the order listed.
    The values are compared only after pairing, so a pairing never makes a wrong value count as right.
    """
    pred_items = list(pred_items or [])
    pairs: dict[int, tuple[Optional[dict], str]] = {}
    free = set(range(len(pred_items)))

    def take(ti: int, pi: int, how: str) -> None:
        pairs[ti] = (pred_items[pi], how)
        free.discard(pi)

    for ti, t in enumerate(truth_items):                                  # pass 1: same label, or same type and number
        same = [pi for pi in sorted(free) if _key(pred_items[pi].get(name)) == _key(t.get(name))]
        numbered = [pi for pi in sorted(free) if _type_and_number(t.get(name))
                    and _type_and_number(pred_items[pi].get(name)) == _type_and_number(t.get(name))]
        if same:
            take(ti, same[0], "same label")
        elif numbered:
            take(ti, numbered[0], "type and number")
    candidates = sorted(((len(_words(t.get(name)) & _words(pred_items[pi].get(name))), -ti, -pi)
                         for ti, t in enumerate(truth_items) if ti not in pairs for pi in free), reverse=True)
    for shared, neg_ti, neg_pi in candidates:                             # pass 2: most words in common first
        ti, pi = -neg_ti, -neg_pi
        if shared and ti not in pairs and pi in free:
            take(ti, pi, "shared words")
    for ti in range(len(truth_items)):                                    # pass 3: leftovers, in order
        if ti not in pairs and free:
            take(ti, min(free), "order")
    return [(t, *pairs.get(ti, (None, "not found"))) for ti, t in enumerate(truth_items)]


_LISTS = (("spaces", "name"), ("doors", "label"), ("aisles", "label"), ("restrooms", "label"))


def align(pred: dict, truth: dict) -> tuple[dict, dict[str, list]]:
    """The model's reading with each paired item renamed to the ground truth's label, and the pairings made.

    Findings carry item labels in their titles ("Widen the door: Restroom door (Restroom)"), so without
    this a correctly read item under a fuller label would count as one missed problem and one false alarm.
    Only labels change; no value is touched.
    """
    aligned = copy.deepcopy(pred)
    matches: dict[str, list] = {}
    renamed: dict[str, str] = {}
    for kind, name in _LISTS:
        matches[kind] = match_items(truth.get(kind) or [], aligned.get(kind) or [], name)
        for t, p, _how in matches[kind]:
            if p is not None:
                if kind in ("spaces", "restrooms") and p.get(name):
                    renamed[_key(p[name])] = t[name]
                p[name] = t[name]
    for door in aligned.get("doors") or []:                               # a door's room, named as the ground truth names it
        if door.get("serves") and _key(door["serves"]) in renamed:
            door["serves"] = renamed[_key(door["serves"])]
    return aligned, matches


def _same(truth, pred, kind: str) -> bool:
    if truth is None or pred is None:
        return truth is None and pred is None      # a truth of 0 read as "not stated" (None) is a misread
    if kind == "area":
        return abs(pred - truth) <= AREA_TOLERANCE * max(abs(truth), 1)
    return pred == truth


def compare(pred: dict, truth: dict) -> list[dict[str, Any]]:
    """One row per fact in the ground truth: what it should be, what was read, and whether they match."""
    rows: list[dict[str, Any]] = []
    _aligned, matches = align(pred, truth)

    def add(field, t, p, kind="exact"):
        rows.append({"field": field, "truth": t, "pred": p, "ok": _same(t, p, kind)})

    add("gross area (sq ft)", truth.get("gross_area_sqft"), pred.get("gross_area_sqft"), "area")
    add("seat count", truth.get("seat_count"), pred.get("seat_count"))
    add("accessible seats", truth.get("accessible_seat_count"), pred.get("accessible_seat_count"))

    for s, got, _how in matches["spaces"]:
        if s.get("area_sqft") is None:
            continue   # restrooms and corridors carry no area in the ground truth
        got = got or {}
        add(f"area of {s['name']}", s["area_sqft"], got.get("area_sqft"), "area")
        add(f"use of {s['name']}", s["use"], got.get("use"))

    for d, got, _how in matches["doors"]:
        got = got or {}
        add(f"{d['label']}: clear width (in.)", d.get("clear_width_in"), got.get("clear_width_in"))
        add(f"{d['label']}: is an exit", d.get("is_exit"), got.get("is_exit"))
        if d.get("is_exit"):
            add(f"{d['label']}: swing", d.get("swing"), got.get("swing"))

    for a, got, _how in matches["aisles"]:
        add(f"{a['label']}: width (in.)", a.get("min_width_in"), (got or {}).get("min_width_in"))

    for r, got, _how in matches["restrooms"]:
        got = got or {}
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


def _subject(title: str) -> str:
    """What a finding is about: 'Widen the door: Restroom door (Restroom)' -> 'restroom door (restroom)'; '' if general."""
    return title.split(": ", 1)[1].lower() if ": " in title else ""


def findings_agreement(pred: dict, truth: dict, case: dict, rules: Optional[dict] = None) -> dict[str, Any]:
    """Run the rules on both readings. For each real problem (a "fail" on the ground truth), what did the model's reading give?

      caught        the same problem, as a problem;
      to_confirm    the same rule on the same item came back as "review" (an item to confirm), not as a problem;
      missed        nothing;
    and false_alarms are problems the model's reading produced that the ground truth does not have.
    """
    rules = rules or rules_engine.load_rules()
    bt = case["intake"]["business_type"]
    aligned, _matches = align(pred, truth)

    def findings(extraction):
        z = zoning.classify(case.get("zoning"), rules, business_type=bt, area_sqft=extraction.get("gross_area_sqft"))
        return rules_engine.run_checks(extraction, case["intake"], rules, z)["findings"]

    # A problem is a rule on an item, not its exact title: a title can carry a count ("Add a second exit", "Add 2 exits").
    real = [(f["rule_id"], f["title"]) for f in findings(truth) if f["status"] == "fail"]
    got = findings(aligned)
    got_fail = {(f["rule_id"], _subject(f["title"])): f["title"] for f in got if f["status"] == "fail"}
    got_review = [(f["rule_id"], _subject(f["title"])) for f in got if f["status"] == "review"]
    caught, to_confirm, missed = [], [], []
    for rule_id, title in real:
        if (rule_id, _subject(title)) in got_fail:
            caught.append(title)
        elif (rule_id, _subject(title)) in got_review:
            got_review.remove((rule_id, _subject(title)))
            to_confirm.append(title)
        else:
            missed.append(title)
    real_keys = {(rule_id, _subject(title)) for rule_id, title in real}
    return {"real_problems": len(real), "caught": len(caught), "to_confirm": sorted(to_confirm), "missed": sorted(missed),
            "false_alarms": sorted(t for key, t in got_fail.items() if key not in real_keys)}


def evaluate_case(case: dict, pred: dict) -> dict[str, Any]:
    truth = load_truth(case)
    _aligned, matches = align(pred, truth)
    how = [h for pairs in matches.values() for _t, _p, h in pairs]
    return {"case": case["id"], "title": case["title"]} | score(compare(pred, truth)) | \
        {"problems": findings_agreement(pred, truth, case),
         "matching": {h: how.count(h) for h in ("same label", "type and number", "shared words", "order", "not found") if how.count(h)}}


def to_markdown(results: list[dict], source: str) -> str:
    out = ["# Plan-reading evaluation", "", f"Extractions scored: {source}.", "",
           "| Plan | Facts checked | Read correctly | Accuracy | Real problems | Caught as a problem | Flagged to confirm | Missed | False alarms |",
           "|---|---|---|---|---|---|---|---|---|"]
    for r in results:
        p = r["problems"]
        out.append(f"| {r['title']} | {r['facts']} | {r['correct']} | {r['accuracy']:.0%} | {p['real_problems']} | "
                   f"{p['caught']} | {len(p['to_confirm'])} | {len(p['missed'])} | {len(p['false_alarms'])} |")
    out += ["", "A real problem is one the rules find on the hand-written correct reading of the plan. \"Flagged to confirm\" "
            "means the model's reading produced an item to confirm for the same rule and item, not a problem: the owner is "
            "still pointed at it, with less certainty. A fact whose correct value is 0 and which the model left as "
            "\"not stated\" counts as misread."]
    for r in results:
        p = r["problems"]
        if r["wrong"] or p["to_confirm"] or p["missed"] or p["false_alarms"]:
            out += ["", f"## {r['title']}", ""]
            out += [f"- Misread {w['field']}: read {w['pred']!r}, should be {w['truth']!r}" for w in r["wrong"]]
            out += [f"- Flagged to confirm, not as a problem: {t}" for t in p["to_confirm"]]
            out += [f"- Missed problem: {t}" for t in p["missed"]]
            out += [f"- False alarm: {t}" for t in p["false_alarms"]]
    by_method: dict[str, int] = {}
    for r in results:
        for h, n in (r.get("matching") or {}).items():
            by_method[h] = by_method.get(h, 0) + n
    if by_method:
        out += ["", "How the model's items were paired with the ground truth's before comparing values: "
                + ", ".join(f"{n} by {h}" if h != "not found" else f"{n} not found" for h, n in by_method.items()) + ". "
                "A model may label an item more fully than the ground truth (\"Door 1 - Main Entry / Exit\" for \"Door 1\"); "
                "that is not counted as a misreading."]
    out += ["", "_The plans are fictional demo drawings with printed dimensions. Real drawings are harder._", ""]
    return "\n".join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vision", action="store_true", help="run the vision model on every demo plan")
    ap.add_argument("--saved", action="store_true",
                    help="score the readings saved by the last --vision run (reports/<case>_vision_extraction.json); no model call")
    ap.add_argument("--label", help="how to describe the readings in the report, for --saved")
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
    elif a.saved:
        for c in cases.values():
            saved = ROOT / "reports" / f"{c['id']}_vision_extraction.json"
            if not saved.exists():
                ap.error(f"{saved} is missing: run --vision first")
            results.append(evaluate_case(c, json.loads(saved.read_text(encoding="utf-8"))))
        source = a.label or "readings saved by the last vision run (no new model call)"
    elif a.pred and a.case in cases:
        results.append(evaluate_case(cases[a.case], json.loads(Path(a.pred).read_text(encoding="utf-8"))))
        source = a.pred
    else:
        ap.error("give --vision, --saved, or --pred FILE with --case " + "|".join(cases))
    md = to_markdown(results, source)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
