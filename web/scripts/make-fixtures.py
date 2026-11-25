"""Writes web/tests/fixtures/*.json: real API responses made with no key and no network.

In:  the API app (api/main.py) through FastAPI's TestClient, the demo plans in demo/, and the Seattle
     fixtures in tests/fixtures/. The model is never called; the city's map service is a stand-in.
Out: one JSON file per response the front-end tests read. Ids and times are fixed, so a fresh run
     gives identical files and CI can fail when the API's contract changes.

    python web/scripts/make-fixtures.py            # write
    python web/scripts/make-fixtures.py --check    # fail if a fresh run differs from the committed files
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "tests" / "fixtures"
SEATTLE = ROOT / "tests" / "fixtures"
FIXED = {"created_at": "2026-11-24T12:00:00+00:00", "expires_at": "2026-12-24T12:00:00+00:00"}

os.environ["PYTHON_DOTENV_DISABLED"] = "1"
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ["PERMIT_STT"] = "off"
for _bucket in ("PLAN_READ", "ASK", "TRANSCRIBE", "ZONING", "CHECKS", "PDF"):
    os.environ[f"PERMIT_RATE_{_bucket}"] = "10000/60"      # the fixtures make many requests in a row; the limits have their own tests
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from api import main as api_main  # noqa: E402
from checker import audit, voice, zoning  # noqa: E402


@contextmanager
def patched(obj, name, value):
    old = getattr(obj, name)
    setattr(obj, name, value)
    try:
        yield
    finally:
        setattr(obj, name, old)


@contextmanager
def env(**values):
    old = {k: os.environ.get(k) for k in values}
    os.environ.update({k: v for k, v in values.items()})
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def fake_city(url, params=None, timeout=None):
    """The same stand-in for the Census geocoder and the city's zoning layer that tests/test_api.py uses."""
    ring = [[-122.3301, 47.6101], [-122.3301, 47.6111], [-122.3291, 47.6111], [-122.3291, 47.6101], [-122.3301, 47.6101]]

    class Reply:
        def __init__(self, data): self.data = data
        def raise_for_status(self): pass
        def json(self): return self.data

    if "geocoder" in url:
        return Reply({"result": {"addressMatches": [{"coordinates": {"x": -122.3296, "y": 47.6106}}]}})
    if (params or {}).get("returnGeometry") == "true":
        return Reply({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"ZONING": "NC2-55 (M)"},
                                                                 "geometry": {"type": "Polygon", "coordinates": [ring]}}]})
    return Reply({"features": [{"attributes": {"ZONING": "NC2-55 (M)", "ZONELUT": "NC2", "ZONELUT_DESC": "Neighborhood Commercial 2"}}]})


def png() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (250, 250, 250)).save(buf, format="PNG")
    return buf.getvalue()


def pdf(pages: int) -> bytes:
    import pypdfium2 as pdfium

    doc = pdfium.PdfDocument.new()
    for _ in range(pages):
        doc.new_page(612, 792)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def fixed(check: dict, name: str) -> dict:
    return check | FIXED | {"id": f"fixture-{name}"}


def build(tmp: Path) -> dict[str, object]:
    out: dict[str, object] = {}
    with env(PERMIT_CHECKS_DB=str(tmp / "checks.sqlite"), PERMIT_SEATTLE_DB=str(tmp / "missing.sqlite"),
             PERMIT_CORS_ORIGIN="http://localhost:3000"):
        app = api_main.create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            out["meta"] = c.get("/api/meta").json()
            for case in api_main.demo_cases().values():
                reading = c.post("/api/plans/read", data={"case_id": case["id"]}).json()
                out[f"reading_{case['id']}"] = reading
                intake = {"business_type": case["intake"]["business_type"], "cooking_on_site": bool(case["intake"].get("cooking_on_site")),
                          "food_prep": False, "serves_alcohol": False, "outdoor_seating": False, "upper_floor": False,
                          "historic_district": False}
                r = c.post("/api/checks", json={"facts": reading["facts"], "intake": intake, "zoning": {"zone": case["zoning"]}})
                assert r.status_code == 201, r.text
                check = r.json()
                out[f"check_{case['id']}"] = fixed(check, case["id"])
                for q_name, q in (("load", "Why is the occupant load what it is?"), ("first", "What should I fix first?")):
                    a = c.post(f"/api/checks/{check['id']}/ask", json={"question": q}).json()
                    out[f"ask_{case['id']}_{q_name}"] = {"question": q, "answer": a}

            # Q1: answers left as "Not sure" are sent as null; the result marks what depends on them
            reading = out["reading_cafe_flawed"]
            r = c.post("/api/checks", json={"facts": reading["facts"], "zoning": {"zone": "NC2-55 (M)"},
                                            "intake": {"business_type": "cafe_restaurant", "cooking_on_site": True, "food_prep": None,
                                                       "serves_alcohol": None, "outdoor_seating": None, "upper_floor": None,
                                                       "historic_district": None}})
            assert r.status_code == 201, r.text
            out["check_cafe_flawed_unsure"] = fixed(r.json(), "cafe_flawed_unsure")

            with patched(zoning.requests, "get", fake_city):
                out["zoning_address"] = c.post("/api/zoning", json={"address": "123 Example St, Seattle, WA",
                                                                    "business_type": "cafe_restaurant", "area_sqft": 2400}).json()
            out["zoning_zone"] = c.post("/api/zoning", json={"zone": "NC2-55 (M)", "business_type": "cafe_restaurant"}).json()

            errors = {
                "plan_needed": c.post("/api/plans/read", data={}),
                "demo_case_not_found": c.post("/api/plans/read", data={"case_id": "nope"}),
                "unknown_business_type": c.post("/api/zoning", json={"zone": "NC2-55 (M)", "business_type": "zoo"}),
                "unsupported_file_type": c.post("/api/plans/read", files={"file": ("plan.gif", b"GIF89a", "image/gif")}),
                "empty_file": c.post("/api/plans/read", files={"file": ("plan.png", b"", "image/png")}),
                "no_model_key": c.post("/api/plans/read", files={"file": ("plan.png", png(), "image/png")}),
                "check_not_found": c.get("/api/checks/no-such-check"),
                "invalid_request": c.post("/api/checks", json={"facts": {}, "intake": {}}),
                "not_found": c.get("/api/nothing-here"),
                "method_not_allowed": c.put("/api/meta"),
            }
            with env(PERMIT_MAX_UPLOAD_MB="0.001"):
                errors["file_too_large"] = c.post("/api/plans/read", files={"file": ("plan.png", png() + b"\0" * 4000, "image/png")})

            class Broken:
                messages = type("M", (), {"create": staticmethod(lambda **k: (_ for _ in ()).throw(RuntimeError("model down")))})()

            app.dependency_overrides[api_main.model_client] = lambda: Broken()
            errors["plan_reading_failed"] = c.post("/api/plans/read", files={"file": ("plan.png", png(), "image/png")})
            # the launch limits (api/limits.py, api/uploads.py): each is an error the site words for the owner
            from api import limits as api_limits

            class Reads:
                messages = type("M", (), {"create": staticmethod(lambda **k: (_ for _ in ()).throw(RuntimeError("unused")))})()

            app.dependency_overrides[api_main.model_client] = lambda: Reads()
            with env(PERMIT_DAILY_PLAN_READS="0"):
                errors["reading_paused"] = c.post("/api/plans/read", files={"file": ("plan.png", png(), "image/png")})
            with env(PERMIT_TURNSTILE_SECRET="fixture-secret"):
                errors["verification_needed"] = c.post("/api/plans/read", files={"file": ("plan.png", png(), "image/png")})
            with env(PERMIT_MAX_IMAGE_MEGAPIXELS="0.0001"):
                errors["image_too_large"] = c.post("/api/plans/read", files={"file": ("plan.png", png(), "image/png")})
            with env(PERMIT_MAX_PDF_PAGES="1"):
                errors["too_many_pages"] = c.post("/api/plans/read", files={"file": ("plan.pdf", pdf(2), "application/pdf")})
            errors["request_too_large"] = c.post("/api/checks", content=b" " * (1024 * 1024),
                                                 headers={"content-type": "application/json"})
            with env(PERMIT_RATE_ZONING="1/600"):
                api_limits.limiter.reset()
                c.post("/api/zoning", json={"zone": "NC2-55 (M)", "business_type": "salon"})
                errors["rate_limited"] = c.post("/api/zoning", json={"zone": "NC2-55 (M)", "business_type": "salon"})
            api_limits.limiter.reset()
            app.dependency_overrides.clear()
            with patched(audit, "audit", lambda *a, **k: 1 / 0):
                errors["server_error"] = c.post("/api/checks", json={"facts": {}, "intake": {"business_type": "salon"}})
            # /api/transcribe: a patched success with the fixture clip, and each error (no model is ever loaded)
            clip = (SEATTLE / "question.wav").read_bytes()
            say = lambda data, name="question.wav", kind="audio/wav": c.post("/api/transcribe", files={"audio": (name, data, kind)})
            errors["no_speech_to_text"] = say(clip)
            with patched(voice, "stt_available", lambda: True):
                with patched(voice, "transcribe", lambda audio, **k: "Why do I need a second exit for my cafe?"):
                    out["transcribe"] = say(clip).json()
                    errors["audio_needed"] = say(b"")
                    errors["audio_not_supported"] = say(png(), "q.png", "image/png")
                    with env(PERMIT_MAX_AUDIO_MB="0.05"):
                        errors["audio_too_large"] = say(clip)
                with patched(voice, "transcribe", lambda audio, **k: None):
                    errors["speech_not_understood"] = say(clip)
            for code, r in errors.items():
                body = r.json()
                assert body["error"]["code"] == code, (code, body)
                out[f"error_{code}"] = {"status": r.status_code, "body": body}

    # one check with Seattle's review records, from a database built from tests/fixtures/seattle_*.json
    from pipeline import db, seattle

    records = tmp / "permits.sqlite"
    con = db.connect(records)
    db.upsert(con, seattle.parse_permits(SEATTLE / "seattle_building_permits.json"))
    db.upsert_reviews(con, seattle.parse_reviews(SEATTLE / "seattle_plan_review.json"))
    db.replace_comments(con, seattle.parse_comments(SEATTLE / "seattle_plan_comments.json"))
    con.close()
    with env(PERMIT_CHECKS_DB=str(tmp / "checks2.sqlite"), PERMIT_SEATTLE_DB=str(records)):
        with TestClient(api_main.create_app()) as c:
            reading = c.post("/api/plans/read", data={"case_id": "cafe_flawed"}).json()
            r = c.post("/api/checks", json={"facts": reading["facts"], "zoning": {"zone": "NC2-55 (M)"},
                                            "intake": {"business_type": "cafe_restaurant", "cooking_on_site": True}})
            out["check_cafe_flawed_with_records"] = fixed(r.json(), "cafe_flawed_with_records")
    return out


def main(argv: list[str]) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        fixtures = build(Path(tmp))
    text = {f"{name}.json": json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n" for name, data in fixtures.items()}
    if "--check" in argv:
        stale = [n for n, t in text.items() if not (OUT / n).exists() or (OUT / n).read_text(encoding="utf-8") != t]
        extra = sorted(p.name for p in OUT.glob("*.json") if p.name not in text)
        if stale or extra:
            print("web/tests/fixtures is out of date; run python web/scripts/make-fixtures.py", stale, extra, file=sys.stderr)
            return 1
        print(f"{len(text)} fixtures match the API")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, t in text.items():
        (OUT / name).write_text(t, encoding="utf-8")
    print(f"wrote {len(text)} fixtures to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
