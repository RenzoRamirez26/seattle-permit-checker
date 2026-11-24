# Website deployment kit: Seattle Permit Pre-Check

21 Nov 2026 · Lorenzo. Exported from the Claude Doc of the same name.

## What this is

A real website needs **no new rules, data or AI code**. Everything that decides an answer already lives in the repo `RenzoRamirez26/seattle-permit-checker`. The website is a new front end on top of a FastAPI backend, which calls the same `checker/` code the Streamlit demo uses.

- **Reused unchanged:** the rulebook (`checker/rules/seattle.json`), the rules engine, the plan reading, the assistant, the zoning lookup, the Seattle data pipeline and the PDF output.
- **New:** a front end (React, following `docs/design_brief.md`), hosting, storage for saved checks and sign-in.
- **One rule:** no building-code number and no pass/fail logic go into the front end. It only shows what the backend returns. If the rulebook changes, you edit one JSON file, and the tests and the site follow.

The file list below comes from a copy of the repo taken during the build. The API backend (`api-backend` branch) was built on Lorenzo's laptop and isn't in that copy, so its files are described from the build report. Check both against `main` before you start.

## Data

The site needs five data pieces. Only the rulebook and the demo files are in git. The Seattle database is downloaded with one command, and zoning is looked up live.

| Data | Where in the repo | What it holds | Source | How to refresh |
| --- | --- | --- | --- | --- |
| Rulebook | `checker/rules/seattle.json` (22 KB) | Occupant load factors, egress (exits, door widths, swing, exit signs), accessibility, plumbing fixture counts, fire, health, zoning table, 16 permits, 6 business types, which Seattle reviewer checks each rule | 2021 Seattle Building Code, Seattle Plumbing Code, 2010 ADA Standards, SMC Title 23. Each check is listed in its `_meta` block | Edit by hand from the city's PDFs. Re-check the business and mercantile plumbing rows. 2024 codes take effect no sooner than May 2027 |
| Rulebook explained | `docs/rulebook.md` | Plain-language version of every rule with its citation | Same | Update with the JSON |
| Seattle permit records | `data/permits.sqlite` (not in git) | Permits, review steps and reviewer comments. The live run on 21 Nov 2026 had 1,588 permits, 11,391 review steps and 26,299 comments | Seattle open data: Building Permits `76t5-zqzr`, Plan Review `tqk8-y2z5`, Plan Comments `e285-aq8h` | `python -m pipeline.run_pipeline --seattle` (add `--refresh` to download again). Run it on a schedule, for example weekly |
| Zoning | Not stored. Looked up per address | Zone code and overlays at the address | US Census geocoder, then the city's ArcGIS layer `Current_Land_Use_Zoning_Detail_2/FeatureServer/0`. The zone meanings are in the rulebook's `zoning` block | Live, nothing to refresh. Cache answers per address if traffic grows |
| Demo plans and answer keys | `demo/` | Three invented plans (café flawed, café compliant, salon flawed) as PNG, with the true facts as JSON, and `cases.json` | Made by `demo/make_plans.py` | Keep as the site's "Try an example" and as the evaluation set |

Seattle data needs no account. A free app token (`SEATTLE_APP_TOKEN`) only raises the rate limit. Plan Comments is a sample: about 26,300 comments on 707 permits from January 2022 to September 2025. Reviewer names are dropped by the pipeline, so keep it that way.

The floor plans owners upload aren't kept in the demo. If the real site saves them, add a storage bucket, a privacy note and a deletion rule. The `api-backend` plan uses 30 days.

FloorPlanCAD isn't part of the kit. Its card says CC BY-NC 4.0 (non-commercial), it has no building-type label and it holds no measurements.

## Code

The backend imports `checker/` and `pipeline/` as they are. The Streamlit `app/` folder is not deployed with the website. Keep it as the demo and the reference for how each step should behave.

| Folder or file | Does | Model? | Deploy? |
| --- | --- | --- | --- |
| `checker/extract.py` | Vision step: turns a plan image or PDF into facts (rooms and areas, doors and widths, fixtures). Reports only what it reads. Unknown stays unknown | Yes, `claude-sonnet-5-5` | Yes |
| `checker/rules_engine.py` | Deterministic checks: occupant load, exits, door width and swing, accessible route, plumbing counts, fire, health. Every number comes from the rulebook. Status is pass, fail or review | No | Yes |
| `checker/zoning.py` | Geocodes the address and reads the zone from the city's layer, then classifies the use | No | Yes |
| `checker/audit.py` | Runs the whole check: facts + intake answers + zoning + Seattle records, giving one audit result | No | Yes |
| `checker/agent.py` | Assistant: answers questions only from the audit result. `check_grounded()` rejects answers that aren't supported | Yes, `claude-sonnet-5-5` | Yes |
| `checker/voice.py` | Speech to text (faster-whisper `base.en`) and optional Kokoro text to speech | Local models | Optional. The browser's own voice can replace both |
| `pipeline/` | Downloads Seattle's three datasets into SQLite, sorts permits into business categories and answers the statistics questions (`query.py`) | No | Yes, as a scheduled job |
| `evaluation/evaluate_extraction.py` | Scores the vision step against the answer keys. `--saved` re-scores without model calls | Yes, when run | No. Run before each model change |
| `api/` (`api-backend` branch) | FastAPI: `/api/meta`, `/api/plans/read`, `/api/zoning`, `/api/checks`, `/api/checks/{id}` (GET, DELETE), two PDF routes, `/api/checks/{id}/ask`. JSON errors, 10 MB uploads, 30-day expiry, CORS. No sign-in yet | Through `checker/` | Yes |
| `tests/` | 98 tests on `main`, 109 on `api-backend`. Seattle fixtures, so no network or API key is needed | No | CI only |
| `docs/` | Rulebook, data sources, voice, design brief, demo script | No | No |
| `app/` | Streamlit demo | Through `checker/` | No |

Deploy from `main`, never from an old copy. The fix for the model call (`tool_choice` set to `auto`, plus a prompt sentence and one retry) is on `main` from the `fix-vision-call` branch.

## How the deployed site fits together

The browser only shows results; the backend decides.

```
Website (browser)            Backend (FastAPI, api/)                         Outside services and data
-----------------            -----------------------                         -------------------------
1 Upload plan, address       Read the plan            checker/extract.py      -> Claude API (vision)
2 Owner confirms facts       Decide pass/fix/review   checker/rules_engine.py -> Rulebook, rules/seattle.json (no model)
3 Shows fix list, permits    Zoning screen            checker/zoning.py       -> Census geocoder + city zoning layer
4 Owner asks questions       Combine into one result  checker/audit.py        -> Seattle permit DB (SQLite, weekly pipeline/)
No rules, no API key         Answer from the result   checker/agent.py        -> Claude API (assistant, same key)
Calls /api over HTTPS
```

The browser sends the plan and the owner's answers to the backend and shows what comes back. The backend runs the same five steps as the demo, top to bottom. Only reading the plan and answering questions call a model, and the rulebook alone decides pass, fix or review. Saved checks need a small database next to the backend (not drawn), kept for 30 days.

## Keys, settings and dependencies

Only one paid key is needed: `ANTHROPIC_API_KEY`. Set it on the server only, never in the front end. Everything is listed in `.env.example`.

| Variable | Needed? | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Plan reading and the assistant. From console.anthropic.com |
| `SEATTLE_APP_TOKEN` | No | Raises the rate limit on the Seattle download. Free from data.seattle.gov |
| `PERMIT_VISION_MODEL`, `PERMIT_AGENT_MODEL` | No | Default `claude-sonnet-5-5`. Re-run the evaluation before changing them |
| `PERMIT_STT`, `PERMIT_STT_MODEL` | No | `faster-whisper` or `off`; `base.en` by default (`tiny.en` is faster, `small.en` more accurate) |
| `PERMIT_TTS` | No | `browser` (default) or `kokoro` |
| `PERMIT_CORS_ORIGIN` | Yes for the website | The front end's address, so the browser may call the API |
| `PERMIT_CHECK_DAYS` | No | Days a saved check is kept. Default 30 |

**Python 3.12 or newer** (tested on 3.13). Pinned in `requirements.txt`: `anthropic` 2.12.0, `pillow` 13.0.0, `pypdfium2` 5.15.2 (PDF plan to image), `requests` 2.34.2, `pandas` 3.1.1, `python-dotenv` 1.2.4, `pytest` 9.2.0, plus `streamlit` and `matplotlib` for the demo only. `requirements-voice.txt` adds `faster-whisper` 1.2.1 and `kokoro` 0.7.16, which weren't tested in the build sandbox. The FastAPI and server packages are on the `api-backend` branch.

Outside services the server must reach: `api.anthropic.com`, `cos-data.seattle.gov`, `services.arcgis.com`, `geocoding.geo.census.gov`, and `huggingface.co` on first use of the voice models. None of them need a key except Anthropic.

## Deployment steps

Deploy the backend first and check it with plain requests, then put the front end on top. Any host that runs a Python container and a static site works.

1. **Start from `main`.** Merge `api-backend` into it with a pull request once its 109 tests pass. Don't deploy from a laptop copy.
2. **Build the Seattle database.** Run `python -m pipeline.run_pipeline --seattle` and check the counts it prints (about 1,588 permits). Ship `data/permits.sqlite` with the backend, or rebuild it on the server.
3. **Package the backend.** Make a container with Python 3.13, `requirements.txt`, the `api-backend` packages, `checker/`, `pipeline/`, `api/` and the database. Add `requirements-voice.txt` only if the server transcribes speech.
4. **Set the variables** from the table above in the host's secret settings. `ANTHROPIC_API_KEY` and `PERMIT_CORS_ORIGIN` are the two that must be set.
5. **Check the backend by hand.** `GET /api/meta` returns the rulebook date. `POST /api/checks` with `demo/flawed_plan.png` returns the same findings as the Streamlit app. The zoning route returns a zone for 1420 5th Ave.
6. **Build the front end** to `docs/design_brief.md` and the teammate handoff PDF. Point it at the backend's address. It holds no rule numbers and calls no model.
7. **Host the front end** as a static site on its own address, and put that address in `PERMIT_CORS_ORIGIN`.
8. **Schedule the data refresh.** Re-run the pipeline weekly and restart the backend on the new database.
9. **Add what a public site needs** before real users: sign-in, a limit on checks per user (each check costs API calls), storage for saved checks with the 30-day deletion, a privacy note, and the footer saying it isn't a city service.
10. **Watch it.** Log errors and API cost per check. Keep the model's raw output out of the logs if plans may hold personal details.

## Checks before launch, and known gaps

The website is ready when it gives the same answers as the Streamlit demo on the three demo plans, and a person can finish a check with the assistant and voice off.

- [ ] `python -m pytest` passes on `main` with the backend merged (GitHub runs it on every pull request).
- [ ] The three demo plans give the same findings on the website as in Streamlit.
- [ ] `python -m evaluation.evaluate_extraction --vision` still scores about 103 of 107 facts, with no missed planted problems. Run it again after any model or prompt change.
- [ ] Grep the front end for any code number or rule. There should be none.
- [ ] The API key is in no file the browser downloads.
- [ ] When the model fails, the owner can still enter the measurements by hand and finish.
- [ ] The design brief's front-end checklist passes (keyboard, contrast, 320 px width, refresh keeps work).

**Known gaps**, so nobody claims more than was measured:

- The plan reading was measured on three invented plans only. Real architect drawings haven't been tested.
- The quality of the assistant's answers hasn't been scored.
- The voice test used ten machine-spoken questions, not real voices. The mic input fails in Safari.
- The rulebook's business and mercantile plumbing rows need a re-check against the code PDF.
- The backend has no sign-in yet, and `photo-notes` isn't merged.
- Lead customer and price aren't agreed yet.
