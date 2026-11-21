"""The Seattle data pipeline: classifier, mappers, download paging, database and the review queries."""
import json
from types import SimpleNamespace

import pytest

from checker import audit as audit_mod
from checker import rules_engine
from pipeline import classify, db, query, run_pipeline, schema, seattle
from tests.conftest import FIXTURES as FX


def test_business_categories():
    c = classify.business_category
    assert c("Change of use from office to restaurant for Blue Ridge Coffee") == "food_drink"
    assert c("Tenant improvement to existing office including new break room kitchen and lounge") is None
    assert c("Install grab bar in restroom of cafeteria") is None
    assert c("Tenant improvements for a hair salon") == "salon" and c("New barbershop, occupy per plan") == "salon"
    assert c("Alterations for yoga studio") == "fitness" and c("Interior alterations to retail store") == "retail"
    assert c("Establish cafe inside existing retail bookstore") == "food_drink"     # food wins over retail
    assert c(None) is None and c("") is None
    assert classify.CATEGORY_FOR_BUSINESS["bar_taproom"] == "food_drink" and classify.CATEGORY_FOR_BUSINESS["office_studio"] is None
    assert set(classify.CATEGORY_FOR_BUSINESS) == set(rules_engine.load_rules()["business_types"])


def test_permit_mapper_on_a_real_record():
    rows = json.loads((FX / "seattle_building_permits.json").read_text())
    p = seattle.permit_from_row(rows[0])
    assert p.permit_number == "6998648-CN"
    assert (p.applied_date, p.issued_date, p.estimated_cost) == ("2024-07-22", "2025-01-13", 60000.0)
    assert (p.review_rounds, p.days_in_review, p.days_with_applicant, p.days_with_city) == (3, 175.0, 77.0, 97.0)
    assert (p.permit_class, p.is_alteration, p.category) == ("Non-Residential", 1, "food_drink")
    assert p.completed_date == seattle._parse_date(rows[0].get("completeddate"))      # filled from the city's completeddate
    assert p.record_url.endswith("altId=6998648-CN") and round(p.latitude, 3) == 47.701
    assert seattle.permit_from_row(rows[1]).category is None          # an office with a kitchen
    assert seattle.permit_from_row(rows[5]).category == "salon"
    # only additions and alterations count as tenant build-outs; every stored name is lower case
    assert [seattle.permit_from_row(r).is_alteration for r in rows] == \
        [int(schema.work_from_text(r.get("permittypedesc")) == schema.ALTER) for r in rows]
    assert all(c == c.lower() for c in schema.COLUMNS + schema.REVIEW_COLUMNS + schema.COMMENT_COLUMNS)
    assert not {"owner_name", "owner_address", "county", "jurisdiction"} & set(schema.COLUMNS)


def test_review_and_comment_mappers():
    r = seattle.review_from_row(json.loads((FX / "seattle_plan_review.json").read_text())[3])   # real row
    assert (r["permit_number"], r["review_round"], r["review_type"], r["result"]) == \
        ("6537517-CN", 1, "Ordinance/Structural", "Corrections Required")
    assert (r["assigned_date"], r["finished_date"], r["category"]) == ("2018-10-26", "2018-10-28", "food_drink")
    assert list(r) == schema.REVIEW_COLUMNS
    assert "reviewer" not in {k.lower() for k in r}                   # reviewer names are not stored
    n = seattle.normalize_subject
    assert n("10 Means of Egress") == (10, "Ch. 10 Means of Egress")
    assert n("16 Gravity Design") == (16, "Ch. 16 Structural Design") and n("SBC Ch29") == (29, "Ch. 29 Plumbing Systems")
    assert n("00 Code Edition") == (None, "General") and n("0") == (None, "General") and n("General") == (None, "General")
    assert n("23.47A.008 Street-level uses") == (None, "23.47A.008 Street-level uses") and n(None) == (None, "General")
    c = seattle.comment_from_row(json.loads((FX / "seattle_plan_comments.json").read_text())[0])
    assert (c["chapter"], c["review_round"], c["letter_date"]) == (11, 1, "2024-08-20")
    assert c["letter_url"].startswith("https://") and list(c) == schema.COMMENT_COLUMNS


def test_soda_paging_and_download(monkeypatch, tmp_path):
    pages = {0: [{"permitnum": "A"}, {"permitnum": "B"}], 2: [{"permitnum": "C"}]}
    seen = []

    def fake_get(url, params=None, **kw):
        seen.append(params)
        return SimpleNamespace(json=lambda: pages.get(params["$offset"], []))

    monkeypatch.setattr(seattle, "get", fake_get)
    assert [r["permitnum"] for r in seattle.soda("x", where="a='b'", page=2)] == ["A", "B", "C"]
    assert [p["$offset"] for p in seen] == [0, 2] and seen[0]["$where"] == "a='b'" and seen[0]["$order"] == ":id"
    dest = seattle.download("x", tmp_path / "seattle" / "x.jsonl")
    assert len(list(seattle.read_jsonl(dest))) == 2          # one page of 2 < default page size, so it stops
    w = seattle.build_where("2022-01-01")
    assert "applieddate >= '2022-01-01T00:00:00'" in w and "like '%COFFEE%'" in w and "like '%SALON%'" in w
    assert "like" not in seattle.build_where(small_business_only=False)
    n_calls = len(seen)
    seattle.download("x", tmp_path / "seattle" / "x.jsonl")  # already there: no new request
    assert len(seen) == n_calls
    monkeypatch.setattr(seattle, "get", lambda *a, **k: SimpleNamespace(json=lambda: {"message": "bad query"}))
    try:
        list(seattle.soda("x"))
        assert False, "expected an error"
    except RuntimeError as e:
        assert "bad query" in str(e)


def _load_fixtures(path):
    con = db.connect(path)
    assert db.upsert(con, seattle.parse_permits(FX / "seattle_building_permits.json")) == 6
    assert db.upsert_reviews(con, seattle.parse_reviews(FX / "seattle_plan_review.json")) == 6
    assert db.replace_comments(con, seattle.parse_comments(FX / "seattle_plan_comments.json")) == 7
    return con


def test_database_and_review_queries(tmp_path):
    con = _load_fixtures(tmp_path / "s.sqlite")
    assert db.upsert_reviews(con, seattle.parse_reviews(FX / "seattle_plan_review.json")) == 6      # idempotent
    assert db.replace_comments(con, seattle.parse_comments(FX / "seattle_plan_comments.json")) == 7
    assert con.execute("SELECT COUNT(*) FROM plan_reviews").fetchone()[0] == 6
    assert con.execute("SELECT COUNT(*) FROM plan_comments").fetchone()[0] == 7
    assert query.category_counts(con) == {"food_drink": 4, "salon": 1}

    s = query.review_summary(con)           # three food/drink build-outs: 3, 1 and 2 rounds; 175, 45, 120 days
    assert s["permits"] == 3 and s["median_days_in_review"] == 120 and s["median_days_with_applicant"] == 50
    assert s["median_review_rounds"] == 2 and s["share_two_or_more_rounds"] == 0.667 and s["share_one_round"] == 0.333
    assert set(s) == {"permits", "share_one_round", "share_two_or_more_rounds", "median_review_rounds",
                      "median_days_in_review", "median_days_with_city", "median_days_with_applicant"}
    assert query.review_summary(con, alterations_only=False)["permits"] == 4          # adds the new mixed-use building
    assert query.review_summary(con, alterations_only=False)["median_days_in_review"] == 147.5
    assert query.review_summary(con, "salon")["permits"] == 1 and query.review_summary(con, "fitness")["permits"] == 0
    assert query.review_summary(con, None)["permits"] == 4                             # every category; never the office

    by_type = {r["review_type"]: r for r in query.corrections_by_review_type(con, min_permits=1)}
    assert by_type["Ordinance"]["permits"] == 2 and by_type["Ordinance"]["share_corrections"] == 0.5
    assert by_type["Zoning"]["share_corrections"] == 0 and by_type["Ordinance/Structural"]["share_corrections"] == 1
    assert query.corrections_by_review_type(con, "salon", min_permits=1)[0]["share_corrections"] == 1

    subjects = query.top_comment_subjects(con)
    assert subjects[0] == {"subject": "Ch. 10 Means of Egress", "chapter": 10, "comments": 2, "permits": 1}
    assert {r["subject"] for r in subjects} == {"Ch. 10 Means of Egress", "Ch. 11 Accessibility", "Ch. 29 Plumbing Systems"}
    assert [r["subject"] for r in query.top_comment_subjects(con, "salon")] == ["Ch. 11 Accessibility"]
    assert len(query.example_comments(con, 10)) == 2 and query.example_comments(con, 10)[0]["review_round"] == 2
    assert query.example_comments(con, 16) == []                                       # that permit is not a small business
    assert [e["permit_number"] for e in query.slowest_examples(con)] == ["6998648-CN", "TEST-0003-CN", "TEST-0002-CN"]

    d = query.review_data(con)
    assert d["city"] == "Seattle" and d["category_label"] == "food and drink" and d["summary"]["permits"] == 3
    assert query.review_data(con, "fitness") is None
    md = "\n".join(rules_engine.local_data_markdown(d))
    assert "3 food and drink tenant build-out permits" in md and "67% needed two or more review rounds" in md


def test_a_database_with_the_old_column_names_says_to_rebuild(tmp_path):
    """No migration: a file built before the rename is refused with the command that rebuilds it."""
    import sqlite3

    path = tmp_path / "old.sqlite"
    raw = sqlite3.connect(path)
    raw.executescript((FX / "old_database_schema.sql").read_text(encoding="utf-8"))
    raw.commit(); raw.close()
    with pytest.raises(db.OutdatedDatabase) as error:
        db.connect(path)
    message = str(error.value)
    assert "different column names" in message and "python -m pipeline.run_pipeline --seattle" in message
    assert str(path) in message
    # the old file is left exactly as it was: nothing added, nothing dropped
    raw = sqlite3.connect(path)
    assert raw.execute("SELECT COUNT(*) FROM permits").fetchone()[0] == 1
    assert "permit_number" not in {r[1] for r in raw.execute("PRAGMA table_info(permits)")}
    raw.close()

    # a fresh file, and a file this code built, both open normally
    fresh = db.connect(tmp_path / "new.sqlite")
    assert db.upsert(fresh, seattle.parse_permits(FX / "seattle_building_permits.json")) == 6
    fresh.close()
    again = db.connect(tmp_path / "new.sqlite")
    assert again.execute("SELECT COUNT(*) FROM permits").fetchone()[0] == 6
    assert [r["name"] for r in again.execute("PRAGMA table_info(permits)")] == schema.COLUMNS


def test_command_line_loads_files_and_prints_a_summary(tmp_path, capsys):
    raw = tmp_path / "raw"; raw.mkdir()
    for stem, name in (("building_permits", "seattle_building_permits"), ("plan_review", "seattle_plan_review"),
                       ("plan_comments", "seattle_plan_comments")):
        (raw / f"{stem}.json").write_text((FX / f"{name}.json").read_text())
    assert run_pipeline.main(["--db", str(tmp_path / "p.sqlite"), "--raw-dir", str(tmp_path / "dl"), "--files", str(raw),
                              "--export", str(tmp_path / "out.csv")]) == 0
    out = capsys.readouterr().out
    assert "Building permits: 6 rows" in out and "4 food_drink, 1 salon, 0 fitness, 0 retail" in out
    assert "Food and drink tenant build-outs with plan review: 3" in out and "two or more rounds: 67%" in out
    assert (tmp_path / "out.csv").read_text().count("\n") == 7


def test_audit_report_uses_the_category_of_the_business(tmp_path, load):
    _load_fixtures(tmp_path / "s.sqlite").close()
    db_path = str(tmp_path / "s.sqlite")
    cafe = audit_mod.audit(None, {"business_type": "cafe_restaurant", "cooking_on_site": True}, extraction=load("flawed"),
                           zoning_override="NC2-55 (M)", db_path=db_path)
    assert cafe["local_review_data"]["summary"]["permits"] == 3
    assert "plan-review records show for food and drink projects" in rules_engine.to_markdown(cafe)
    salon = audit_mod.audit(None, {"business_type": "salon"}, extraction=load("salon_flawed"), zoning_override="NR3", db_path=db_path)
    assert salon["local_review_data"]["category"] == "salon" and salon["local_review_data"]["summary"]["permits"] == 1
    gym = audit_mod.audit(None, {"business_type": "fitness"}, extraction=load("salon_flawed"), db_path=db_path)
    assert "local_review_data" not in gym                 # no gym permits in the fixture, so no section
    none = audit_mod.audit(None, {"business_type": "salon"}, extraction=load("salon_flawed"), db_path=str(tmp_path / "missing.sqlite"))
    assert "local_review_data" not in none
