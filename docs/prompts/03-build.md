# Session 3: build the website

First, state which model you are running on. If it is not Claude Opus 5.5, stop and tell me.

Before starting, check that `main` contains `docs/website_plan.md` and `DESIGN.md`. If either is missing, stop: the plan has not been merged.

## The job

Build the website on the branch `website-v1`. If the branch already exists, check it out and continue from `docs/website_progress.md`. Otherwise create it from `main`.

Follow `docs/website_plan.md` stage by stage. `DESIGN.md`, `docs/design_brief.md` and `docs/deployment_kit.md` are the reference. Obey `CLAUDE.md`. Use the `frontend-design` skill for visual work. For the checks, use a design review of each page against section 12 of `docs/design_brief.md` and the Vercel Web Interface Guidelines, plus an axe accessibility scan.

## Rules

- The front end lives in `web/` and only calls the FastAPI backend in `api/`.
- No building-code numbers, no pass/fail logic and no model calls in `web/`.
- Do not change `checker/rules/seattle.json` or `checker/rules_engine.py`. If the backend needs a change, keep it small, add a test, and list it in the progress file.
- There is no API key and no Seattle database here. Use the demo plans and the test fixtures.
- Add only the dependencies the plan names. If you need another one, write down why.

## After every stage

1. Run `python -m pytest` and the front-end tests. Fix failures. Do not weaken or delete a test to make it pass.
2. Run the guard check, then a design review of each page against section 12 of `docs/design_brief.md` and the Vercel Web Interface Guidelines, plus an axe accessibility scan. Fix what they find.
3. Save screenshots at 375 px and 1280 px wide under `docs/screenshots/<stage>/`.
4. Update `docs/website_progress.md`: each stage marked finished, partly finished or not started; what was tested; what could not be tested here; any decision you made that the plan did not cover.
5. Commit and push.

If a stage is blocked, write down why in the progress file and move to the next one.

## Finish

Open a pull request from `website-v1` to `main`. Put the contents of `docs/website_progress.md` in the description, and link the screenshots.
