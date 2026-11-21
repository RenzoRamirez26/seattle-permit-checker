# Seattle Permit Pre-Check: rules for Claude Code

A prototype that reads a small-business floor plan, checks it against coded rules from the Seattle
Building Code, lists the permits to expect, and answers questions about the result by text or voice.
Seattle only. Read `README.md` for the full picture and the build phases.

## Run things from the repository root

```bash
python -m pytest                                   # tests
python -m streamlit run app/streamlit_app.py       # the website
uvicorn api.main:app --reload                      # the web API for a front end (docs page at /docs)
python -m checker.audit --extraction demo/flawed_extraction.json --business cafe_restaurant --cooking --zoning "NC2-55 (M)"
python -m pipeline.run_pipeline --seattle          # download Seattle's review records
python -m evaluation.evaluate_extraction --vision  # score the vision model on the demo plans (needs a key)
```

## The rule everything else follows

    floor plan -> extract.py (model: facts only) -> rules_engine.py (code: decisions) -> agent.py (explains)

- The model never decides compliance. `extract.py` returns facts in `FLOOR_PLAN_SCHEMA`; `rules_engine.py` decides.
- Every number a rule uses lives in `checker/rules/seattle.json`. Never hard-code a code value in Python.
- When you add or change a rulebook value, say where it came from in `_meta` and in `docs/rulebook.md`.
  If it is from memory, put it under `_meta.verify`. Do not present an unchecked value as checked.
- The app holds no rules. It calls `checker/` and `pipeline/` and displays what comes back.

## Things that must stay true

- A finding that cannot be decided from the plan has status `review`, never `pass`.
- Every finding has a code citation and, where the rulebook routes it, a `reviewed_by`.
- The owner can see and correct the extraction before the check runs (step 3 of the app).
- The agent answers only from the audit result. `agent.check_grounded()` rejects answers that cite a
  rule id or code section the result does not contain. Do not bypass it.
- Text shown through `st.iframe` or `st.html` is never raw model output. `voice.browser_speech_html`
  embeds text as an escaped string.
- Statistics from Seattle's data cover tenant build-outs (additions and alterations) only, and each
  one says how many permits it is based on.
- Reviewer names from the city's data are not stored or shown.
- No real floor plans, personal data, or API keys in the repository. Demo plans are invented.
- Seattle only. Do not add other cities' rules to `seattle.json`.

## Conventions

- Python 3.12+, type hints, `from __future__ import annotations`.
- Each module starts with a docstring saying what goes in and what comes out. Parts that have not run
  against the real service say `STATUS:` in the docstring; remove the note when it is no longer true
  and update the README status table.
- Pages live in `app/pages_app/`, not `app/pages/`.
- Secrets go in `.env` (see `.env.example`). Never commit keys, `.env`, or `data/raw/`.
- New dependencies: pin the version in `requirements.txt` with a comment saying what it is for.
- Tests: one file per part in `tests/`. Model and network calls are mocked; no test needs a key.

## How to work with me (the human)

- For anything touching more than one file, show the plan before writing code.
- Run `python -m pytest` after each change and show the result.
- When something fails, explain the cause before proposing the fix.
- After writing a part, explain in a few sentences what it does and why, so I can explain it to a judge.
