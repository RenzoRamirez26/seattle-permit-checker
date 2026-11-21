"""Download Seattle's permit and plan-review records into data/permits.sqlite.

  python -m pipeline.run_pipeline --seattle                            # download and load
  python -m pipeline.run_pipeline --seattle --since 2022-01-01
  python -m pipeline.run_pipeline --seattle --refresh                  # download again
  python -m pipeline.run_pipeline --files data/raw/seattle             # load files already downloaded
  python -m pipeline.run_pipeline --seattle --export data/permits.csv

Needs no key. Set SEATTLE_APP_TOKEN (free, from data.seattle.gov) if downloads get throttled.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from . import db, query, seattle
from .classify import CATEGORIES

FILE_STEMS = {"permits": "building_permits", "reviews": "plan_review", "comments": "plan_comments"}


def load(con, files: dict) -> None:
    steps = (("Building permits", "permits", seattle.parse_permits, db.upsert),
             ("Plan reviews", "reviews", seattle.parse_reviews, db.upsert_reviews),
             ("Reviewer comments", "comments", seattle.parse_comments, db.replace_comments))
    for label, key, parse, store in steps:
        if not files.get(key):
            continue
        try:
            print(f"{label}: {store(con, parse(files[key]))} rows")
        except Exception as e:  # one bad file shouldn't stop the others
            print(f"{label}: FAILED - {e}")


def find_files(folder: Path) -> dict:
    found = {}
    for key, stem in FILE_STEMS.items():
        for ext in (".jsonl", ".json"):
            if (folder / f"{stem}{ext}").exists():
                found[key] = folder / f"{stem}{ext}"
                break
    return found


def print_summary(con) -> None:
    counts = query.category_counts(con)
    total = con.execute("SELECT COUNT(*) FROM permits").fetchone()[0]
    print(f"\n{total} permits: " + ", ".join(f"{counts.get(c, 0)} {c}" for c in CATEGORIES))
    for category in CATEGORIES:
        review = query.review_data(con, category)
        if not review:
            continue
        sm = review["summary"]
        print(f"\n{review['category_label'].capitalize()} tenant build-outs with plan review: {sm['permits']}")
        print(f"  passed in one round: {sm['share_one_cycle']:.0%}; two or more rounds: {sm['share_two_or_more_cycles']:.0%}")
        print(f"  median days in plan review: {sm['median_days_plan_review']}; "
              f"median days out for corrections: {sm['median_days_out_corrections']}")
        for r in review["corrections_by_review_type"]:
            print(f"  {r['share_corrections']:>5.0%} sent back in round 1 by {r['review_type']} ({r['permits']} projects)")
        for r in review["top_comment_subjects"]:
            print(f"  {r['permits']:>4} projects, {r['comments']:>5} comments: {r['subject']}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default="data/permits.sqlite")
    ap.add_argument("--raw-dir", default="data/raw")
    ap.add_argument("--seattle", action="store_true",
                    help="download small-business permits, their plan reviews, and reviewer comments")
    ap.add_argument("--since", default=seattle.DEFAULT_SINCE, metavar="YYYY-MM-DD",
                    help="earliest application date to download (default %(default)s)")
    ap.add_argument("--refresh", action="store_true", help="download again even if the files exist")
    ap.add_argument("--all-commercial", action="store_true",
                    help="with --seattle: download every commercial building permit (hundreds of MB)")
    ap.add_argument("--files", metavar="DIR",
                    help="load building_permits / plan_review / plan_comments (.jsonl or .json) already in DIR")
    ap.add_argument("--export", help="write the permits table to this CSV when done")
    a = ap.parse_args(argv)
    if not (a.seattle or a.files):
        ap.error("give --seattle to download, or --files DIR to load files you already have")

    raw = Path(a.raw_dir); raw.mkdir(parents=True, exist_ok=True)
    Path(a.db).parent.mkdir(parents=True, exist_ok=True)
    con = db.connect(a.db)

    if a.seattle:
        try:
            load(con, seattle.download_all(raw, a.since, a.refresh, small_business_only=not a.all_commercial))
        except Exception as e:
            print(f"Seattle download: FAILED - {e}")
    if a.files:
        found = find_files(Path(a.files))
        if not found:
            print(f"Nothing found in {a.files} (expected building_permits, plan_review, plan_comments)")
        load(con, found)

    print(f"\nDatabase: {a.db}")
    print_summary(con)
    if a.export:
        print(f"\nExported {db.export_csv(con, a.export)} rows to {a.export}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
