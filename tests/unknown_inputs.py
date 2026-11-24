"""Runs every rule with each plan input set to known values and then to unknown, for tests/test_rules.py.

In:  the demo plans, five business and zone cases, and the plan schema (checker.extract.FLOOR_PLAN_SCHEMA) for each
     field's kind. Out: for each case and each input path, every rule's outcome under each value.

An input's "known" values are a spread of numbers (0 to a million), both booleans, or every value of its enum except
"unknown". Its "unknown" values are null, and "unknown" where the enum has it. A rule's outcome under one value is its
worst finding (fail, then review, then pass) or "absent".

`python -m tests.unknown_inputs` rewrites tests/fixtures/fix_findings_snapshot.json: a hash of every Fix finding over
the whole grid. It was first written with the engine as it was before unknown inputs were enforced, so the test can
show Fix findings did not change. Rewrite it only on purpose, and say why in the pull request.
"""
from __future__ import annotations

import copy
import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

from checker import rules_engine, zoning
from checker.extract import FLOOR_PLAN_SCHEMA

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "tests" / "fixtures" / "fix_findings_snapshot.json"

# business type, demo plan, zone (zones with a size limit, so the floor area matters to zoning too)
CASES = [
    ("cafe_restaurant", "flawed", "NC1-40"),
    ("cafe_restaurant", "compliant", "NC1-40"),
    ("salon", "salon_flawed", "NR3"),
    ("retail", "compliant", "NC1-40"),
    ("bar_taproom", "compliant", "NC2-40"),
]
NUMBERS = [0, 1, 30, 1000, 1_000_000]
ORDER = {"fail": 0, "review": 1, "pass": 2, "absent": 3}


def _kinds() -> dict[str, tuple[str, list]]:
    """Field name -> (kind, enum) from the plan schema: number, integer, boolean, enum or text."""
    out: dict[str, tuple[str, list]] = {}

    def walk(props: dict) -> None:
        for name, spec in props.items():
            types = spec.get("type")
            types = [types] if isinstance(types, str) else (types or [])
            if "enum" in spec:
                out[name] = ("enum", [v for v in spec["enum"] if v is not None])
            elif "number" in types:
                out[name] = ("number", [])
            elif "integer" in types:
                out[name] = ("integer", [])
            elif "boolean" in types:
                out[name] = ("boolean", [])
            if "properties" in spec:
                walk(spec["properties"])
            if isinstance(spec.get("items"), dict) and "properties" in spec["items"]:
                walk(spec["items"]["properties"])
    walk(FLOOR_PLAN_SCHEMA["properties"])
    return out


def values_for(field: str) -> tuple[list, list]:
    """(known values, unknown values) for one plan field, or ([], []) when no rule reads it as a value."""
    kind, enum = _kinds().get(field, ("text", []))
    if kind in ("number", "integer"):
        return list(NUMBERS), [None]
    if kind == "boolean":
        return [True, False], [None]
    if kind == "enum":
        return [v for v in enum if v != "unknown"], [None] + (["unknown"] if "unknown" in enum else [])
    return [], []


def input_paths(facts: dict) -> Iterator[tuple]:
    """Every path in the plan reading whose field has known and unknown values, e.g. ("doors", 0, "swing")."""
    def walk(o: Any, path: tuple) -> Iterator[tuple]:
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, (dict, list)):
                    yield from walk(v, path + (k,))
                elif values_for(k)[0]:
                    yield path + (k,)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                yield from walk(v, path + (i,))
    yield from walk(facts, ())


def with_value(facts: dict, path: tuple, value: Any) -> dict:
    """The reading with one value changed. A room's area left unknown takes its printed width and length with it,
    since the area is worked out from them when they are there."""
    out = copy.deepcopy(facts)
    node = out
    for p in path[:-1]:
        node = node[p]
    node[path[-1]] = value
    if path[-1] == "area_sqft" and value is None:
        node["width_ft"] = node["length_ft"] = None
    return out


@lru_cache(maxsize=None)
def _plan(name: str) -> str:
    return (ROOT / "demo" / f"{name}_extraction.json").read_text(encoding="utf-8")


def run(rules: dict, business: str, facts: dict, zone: str) -> dict:
    z = zoning.classify(zone, rules, business_type=business, area_sqft=facts.get("gross_area_sqft"))
    return rules_engine.run_checks(facts, {"business_type": business}, rules, z)


def outcomes(result: dict) -> dict[str, str]:
    """Each rule's worst status in a result."""
    worst: dict[str, str] = {}
    for f in result["findings"]:
        if f["rule_id"] not in worst or ORDER[f["status"]] < ORDER[worst[f["rule_id"]]]:
            worst[f["rule_id"]] = f["status"]
    return worst


def grid(rules: dict) -> Iterator[tuple[str, tuple, list[tuple[Any, dict]], list[tuple[Any, dict]]]]:
    """(case name, path, [(known value, result)], [(unknown value, result)]) for every case and input path."""
    for business, plan, zone in CASES:
        facts = json.loads(_plan(plan))
        name = f"{business}/{plan}/{zone}"
        for path in input_paths(facts):
            known, unknown = values_for(path[-1])
            yield (name, path,
                   [(v, run(rules, business, with_value(facts, path, v), zone)) for v in known],
                   [(v, run(rules, business, with_value(facts, path, v), zone)) for v in unknown])


def fix_findings(result: dict) -> list[list]:
    return [[f["rule_id"], f["title"], f["severity"], f["detail"], f["fix"]] for f in result["findings"] if f["status"] == "fail"]


def fix_snapshot(rules: dict) -> dict[str, str]:
    """case|path -> a hash of the Fix findings under every value of that input, known and unknown."""
    out = {}
    for name, path, known, unknown in grid(rules):
        fixes = [[repr(v), fix_findings(r)] for v, r in known + unknown]
        key = f"{name}|{'.'.join(map(str, path))}"
        out[key] = hashlib.sha256(json.dumps(fixes, sort_keys=True).encode()).hexdigest()[:16]
    return out


if __name__ == "__main__":
    snap = fix_snapshot(rules_engine.load_rules())
    SNAPSHOT.write_text(json.dumps(snap, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {len(snap)} entries to {SNAPSHOT.relative_to(ROOT)}")
