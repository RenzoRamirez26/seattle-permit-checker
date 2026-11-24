# Session 2: write the website plan

First, state which model you are running on. If it is not Claude Opus 5.5, stop and tell me.

Before starting, check that `main` contains the `api/` folder and `.claude/skills/`. If either is missing, stop: the pull requests from session 1 have not been merged.

This session writes two documents on a new branch `website-plan`. Write no application code.

## Read first

`CLAUDE.md`, `docs/design_brief.md`, `docs/design_research.md`, `docs/deployment_kit.md`, `docs/website_handoff.pdf`, every route in `api/`, and the shape of the audit result returned by `checker/audit.py`.

Also read the Vercel Web Interface Guidelines, which are in the GitHub repository `vercel-labs/web-interface-guidelines`. The plan must say whether you read them, and if not, why not.

## Context

This is the high-end version of a hackathon project. High-end means craft: type, spacing, precision and restraint. The owner is deciding something about money and the law, so the task pages must stay calm. Build the front end from scratch in `web/`. Do not reuse code from any other repository or from the Streamlit pages in `app/`. The rulebook, the plan reader, the pipeline and the backend are reused as they are.

## Document 1: `docs/website_plan.md`

1. **Stack and folder layout**, with a reason for each choice and pinned versions that you have checked are current. Evaluate: shadcn/ui with the React Aria base for components; Motion for animation; MapLibre GL JS for the map; PDF.js for the plan viewer; React Hook Form with Zod for forms; assistant-ui against a plain custom panel for the assistant; Vitest, Playwright and axe for tests.
2. **Pages**, each mapped to the API routes it calls and to the screen in the design brief.
3. **Stages in build order.** The "Check what we read" page is the first stage after the project skeleton. For each stage: what is built, its tests, how I can tell it is done, and the screenshots to attach (375 px and 1280 px wide).
4. **Running without secrets.** How the site is built and tested with no API key and no Seattle database, using the demo plans and the test fixtures.
5. **Guards.** A check that fails the build if a building-code number, pass/fail logic or a model call appears in `web/`. At the end of each stage, a design review of each page against section 12 of `docs/design_brief.md` and the Vercel Web Interface Guidelines, plus an axe accessibility scan.
6. **Visual direction.** A landing page with a public-domain architectural drawing as the hero image (name the source, the item and its rights statement). A heading typeface proposal checked against the design brief. Components restyled to the brief's colour tokens. Motion limited to page transitions, the plan-reading stages and the results counts, with the reduced-motion setting respected.
7. **Departures.** Every place the plan departs from `docs/design_brief.md` or `docs/design_research.md`, each as a separate item I can approve or reject.
8. **Out of scope for version 1:** sign-in, hosting and saved-check storage.
9. **Open questions for me.**

## Document 2: `DESIGN.md` at the repo root

The design tokens from the brief (colour, type, spacing, grid) and the reason for each, plus the tone in three sentences. Mark any token the visual direction changes.

## Finish

Commit both documents, push `website-plan`, and open a pull request to `main`. In the pull request description, list the departures and the open questions so I can answer them there.
