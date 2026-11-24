# Session 4: check the website

First, state which model you are running on. If it is not Claude Opus 5.5, stop and tell me.

Check out `website-v1`. Write the results to `docs/website_verification.md`. Never print an API key.

## Checks

1. Run `python -m pytest` and the front-end tests. Record the counts.
2. Start the backend and the front end. For each of the three demo plans, run the check through the API and compare the findings with what `checker/audit.py` returns directly. List every difference.
3. Walk each page with Playwright at 375 px and 1280 px wide. Save screenshots. Complete the whole flow with the assistant closed, and again using only the keyboard.
4. Search `web/` and the built front-end files for building-code numbers, pass/fail logic, model calls or an API key. List what you find.
5. Check every item in section 12 of `docs/design_brief.md` and every guard in `docs/website_plan.md`. Mark each pass, fail or could not check.
6. Run a design review of each page against section 12 of `docs/design_brief.md` and the Vercel Web Interface Guidelines, plus an axe accessibility scan. List the findings.
7. If the environment variable `ANTHROPIC_API_KEY` is set, read `demo/flawed_plan.png` once with the real model through the API, compare the facts with `demo/flawed_extraction.json`, and ask the assistant two questions about the result. If it is not set, say that the real-model check was not run.

## Then fix

Fix test failures, accessibility errors, and any rule number, model call or key found in `web/`. Commit each fix separately and note it in the report. Leave design judgment calls for me: list them with a recommendation.

## Finish

Commit the report and push. Summarise it as a comment on the `website-v1` pull request: what passed, what failed, what was fixed, what still needs me.
