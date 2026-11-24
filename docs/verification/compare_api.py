"""Session 4, check 2: for each demo plan, run the check through the running API and compare with checker.audit.audit() directly.

Run from the repository root, with the API running:
    python docs/verification/compare_api.py [api_base] [out.json]
In: the three demo cases (demo/cases.json). Out: per case, the counts and every difference, as JSON.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from api import schemas  # noqa: E402
from checker import audit  # noqa: E402

API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
OUT = sys.argv[2] if len(sys.argv) > 2 else None
cases = json.loads(Path("demo/cases.json").read_text())


def post(path: str, body: dict | None = None, form: dict | None = None) -> dict:
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        req = urllib.request.Request(API + path, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    else:
        req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def get(path: str) -> dict:
    with urllib.request.urlopen(API + path) as r:
        return json.load(r)


def norm(x):
    return json.loads(json.dumps(x, sort_keys=True, default=str))


def diff(a, b, path="") -> list[str]:
    out: list[str] = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append(f"{path}.{k}: only in API ({json.dumps(b[k])[:120]})")
            elif k not in b:
                out.append(f"{path}.{k}: only in audit ({json.dumps(a[k])[:120]})")
            else:
                out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: length audit {len(a)} vs API {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{path}[{i}]")
    elif a != b:
        out.append(f"{path}: audit {json.dumps(a)[:120]} vs API {json.dumps(b)[:120]}")
    return out


report = {}
for c in cases:
    reading = post("/api/plans/read", form={"case_id": c["id"]})
    extraction = json.loads((Path("demo") / c["extraction"]).read_text())
    # The API returns the facts validated through schemas.Facts (nulls filled in); compare against the same validation.
    expected_facts = norm(schemas.Facts.model_validate(extraction).model_dump())
    reading_diff = diff(expected_facts, norm(reading["facts"]), "facts")

    intake = dict(c["intake"])
    check = post("/api/checks", {"facts": reading["facts"], "intake": intake, "zoning": {"zone": c["zoning"]}})
    stored = get(f"/api/checks/{check['id']}")
    direct = audit.audit(None, intake, extraction=extraction, zoning_override=c["zoning"], db_path=None)
    api_result = norm(stored["result"])
    direct_n = norm(direct)
    keys = ["summary", "findings", "permits_likely_required", "zoning", "code_basis", "disclaimer"]
    d = []
    for k in keys:
        d += diff(direct_n.get(k), api_result.get(k), k)
    d_ext = diff(norm(schemas.Facts.model_validate(direct["extraction"]).model_dump()), api_result.get("extraction"), "extraction") \
        if "extraction" in api_result else ["extraction: not in API result"]
    other = sorted(set(direct_n) ^ set(api_result))
    s = direct["summary"]
    report[c["id"]] = {
        "counts_audit": [s["fails"], s["reviews"], s["passes"]],
        "counts_api": [stored["result"]["summary"]["fails"], stored["result"]["summary"]["reviews"], stored["result"]["summary"]["passes"]],
        "findings": len(direct["findings"]), "permits": len(direct["permits_likely_required"]),
        "reading_differences": reading_diff,
        "result_differences": d,
        "extraction_differences": d_ext,
        "top_level_keys_only_in_one": other,
        "notices": stored["notices"],
        "check_id": check["id"],
    }

print(json.dumps(report, indent=2))
if OUT:
    Path(OUT).write_text(json.dumps(report, indent=2))
