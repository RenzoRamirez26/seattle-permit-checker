# Website plan: Seattle Permit Pre-Check

24 November 2026. A plan only: no application code is written in this branch. Every item under
[Departures](#7-departures) and [Open questions](#9-open-questions) waits for your answer before the
stage that needs it starts.

## What was read for this plan

| Source | Read? | Notes |
|---|---|---|
| `CLAUDE.md` | Yes | |
| `docs/design_brief.md` | Yes | Contrast figures recalculated: all match (field border is 3.49 to 1, just above 3). |
| `docs/design_research.md` | Yes | |
| `docs/deployment_kit.md` | Yes | Says `GET /api/meta` returns the rulebook date. It does not; see Q2. |
| `docs/website_handoff.pdf` | Yes, all 5 pages | |
| `api/` | Yes, every file | Eight routes in `api/main.py`; the contract in `api/schemas.py`. |
| Audit result | Yes, by running it | `checker.audit.audit()` on `demo/flawed_extraction.json`: 19 findings (11 fail, 2 review, 6 pass), 12 permits. |
| Vercel Web Interface Guidelines | **Yes** | `AGENTS.md` from `vercel-labs/web-interface-guidelines`, commit `434b7f9`, fetched today from raw.githubusercontent.com. `vercel.com/design/guidelines` could not be reached from this environment; the repository file is the source the site cites, so nothing depends on it. |
| Library of Congress, Wikimedia Commons | **No** | Both hosts are blocked by this environment's network. This affects the hero image; see section 6. |

What the code showed that the documents do not say:

1. **Intake answers cannot be "Not sure".** `Intake` in `api/schemas.py` has `cooking_on_site`, `serves_alcohol` and five other answers as plain booleans that default to `false`. A "Not sure" sent as `false` would let an unknown become a pass. Only `new_signage` accepts `null`. See D7 and Q1.
2. **`/api/meta` has no rulebook date**, and `checker/rules/seattle.json` `_meta` has no date field either, so the footer cannot show "the date of the rulebook" from the backend today. See Q2.
3. **`rule_id` is not unique across findings.** The flawed café returns `EG-3` twice and `ADA-2` twice. Anchors and "Ask about this" links must use the finding's position, not its rule id.
4. **A finding has one `detail` sentence**, not separate "measured" and "required" fields. See D5.
5. **Facts have no position on the drawing.** Doors carry a `location` string; nothing has coordinates. See D6.
6. **Plan reading is one request with no progress events**, so the front end cannot truthfully name the current stage. See D4 and Q3.
7. **No route serves the demo plan images**, and an uploaded plan is deleted after reading, so the plan image on step 3 must come from the browser. See section 2, "Check what we read".

---

## 1. Stack and folder layout

Versions were checked against the npm registry today (24 November 2026). Each is the current
`latest` unless the reason says otherwise. Pin them exactly (no `^`) in `web/package.json`, and commit
`web/package-lock.json`.

| Package | Version | Released | Decision and reason |
|---|---|---|---|
| Node.js | 22 LTS (22.23.x in this environment) | | `pdfjs-dist` needs 22.13 or newer, `jsdom` 22.22.2 or newer. Pin with `web/.nvmrc` and `engines`. |
| `next` | 16.4.6 | 9 Nov | **Use, as a static export** (`output: "export"`). The handoff names Next.js; it gives file routing, per-page `<title>`, and font loading. A static export has no server code at all, so nothing in `web/` *can* hold a key or call a model: the browser talks to FastAPI and nothing else. Cost: no dynamic route segments, so the results page reads the check id from the query string (`/results?check=…`). |
| `react`, `react-dom` | 19.3.1 | 14 Oct | Required by Next 16. |
| `typescript` | **5.9.3** (not 7.0.2) | | `openapi-typescript` 7.13.0 declares `typescript ^5.x` as a peer. TypeScript 7 is not worth a peer conflict for this project. Revisit when `openapi-typescript` supports it. |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.5 | 6 Nov | Needed by shadcn/ui. Tokens are defined once in CSS (`@theme`) from `DESIGN.md`. |
| `shadcn` (CLI, dev only) | 4.23.0 | 27 Oct | **Use, with the React Aria base.** Its `init` prompt offers "Base UI", "React Aria" and "Radix UI" (checked in the CLI source). Components are copied into `web/src/components/ui/`, so we own and restyle them. |
| `react-aria-components` | 1.22.1 | 9 Oct | **Use**, as the base under shadcn. Adobe's library has the most complete keyboard, focus and screen-reader behaviour for exactly the parts this site needs: radio groups (business type), a file drop zone with a "Choose a file" button, disclosure ("Show the code reference"), dialog and modal sheet (assistant), number fields with units, and a focus scope that returns focus on close. It also follows the WAI-ARIA patterns the Vercel guidelines require. |
| `motion` | 14.14.0 | 13 Nov | **Use, narrowly**, for the three animations in section 6. One `<MotionConfig reducedMotion="user">` at the root, `LazyMotion` with the `domAnimation` feature set to keep it small. The Vercel guidelines say *prefer CSS*; page transitions and the stage list could be CSS alone, but the count-up on results needs a JS value animation, and one library with one reduced-motion switch is simpler to audit than three mechanisms. If you reject D3, drop Motion entirely and use one CSS transition for the assistant panel. |
| `maplibre-gl` | 6.19.0 | 17 Nov | **Use** for the two maps. BSD-3-Clause, WebGL vector maps, draws the GeoJSON outline that `/api/zoning` returns. Lazy-loaded only on the two pages with a map. Leaflet would also work; MapLibre is chosen because it renders crisp vector tiles that can be restyled to paper and ink. Tile source: Q4. |
| `pdfjs-dist` | 6.5.438 | 1 Nov | **Use** to show an uploaded PDF plan on step 3, from the file the owner still has in the browser. Apache-2.0. Worker loaded from `web/public/`, lazy-loaded only when the plan is a PDF. PNG and JPG plans use a plain `<img>`. |
| `react-hook-form` | 7.92.0 | 11 Nov | **Use** for step 1 and the fact rows on step 3. Uncontrolled inputs (a Vercel SHOULD), errors per field, focus to the first error on submit. |
| `zod` | 4.6.7 | 12 Oct | **Use, for form shape only**: required fields, "is a number", trimming. Zod schemas in `web/` never contain a code value (no minimum door width, no maximum area). The guard in section 5 enforces this. |
| `@hookform/resolvers` | 7.0.8 | 20 Nov | Connects the two. |
| `@assistant-ui/react` | 0.15.38 | 22 Nov | **Do not use.** It pulls in `radix-ui` (a second component base beside React Aria), `zustand` and `assistant-cloud`; it is built around streaming chat runtimes; and the panel's distinctive parts (answers linked to findings, the grounding result, ready-made questions per step, voice transcript) are custom whichever way. The handoff says a hand-built panel is enough. **A plain custom panel**: a React Aria `Dialog` (wide screens, non-modal side panel) or `Modal` sheet (phones), a message list rendered as text, a `<textarea>`, and the suggestion buttons. |
| `openapi-typescript` | 7.13.0 | 11 Feb | Generates `web/src/api/schema.d.ts` from FastAPI's OpenAPI document, so the front end cannot drift from `api/schemas.py`. |
| `openapi-fetch` | 0.17.0 | 11 Feb | A typed `fetch` over those types. 6 KB, no runtime magic. |
| `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@fontsource/ibm-plex-serif` | 5.3.0 each | 19 Jul | Self-hosted fonts from `node_modules`, so the build needs no network. Latin subset, weights 400 and 600 only. Serif only if D2 is approved. |
| `lucide-react` | 1.78.0 | 23 Nov | Status icons (Fix, Check with the city, OK), back arrow, microphone. ISC licence. Always beside words, never alone. |
| `vitest` | 5.1.1 | 18 Nov | **Use** for unit and component tests. Needs `vite` 8.3.8 and `@vitejs/plugin-react` 6.3.0. |
| `@testing-library/react` | 16.3.3 | 27 Aug | Component tests by role and label, which doubles as an accessibility check on names. |
| `jsdom` | 31.0.1 | 13 Nov | Test DOM for Vitest. |
| `@playwright/test` | 1.65.1 | 13 Nov | **Use** for end-to-end flows, screenshots at 375 and 1280 px, keyboard-only runs. In cloud sessions, launch with `executablePath: "/opt/pw-browsers/chromium"` because the project pins its own version. |
| `@axe-core/playwright` | 4.14.0 | 15 Oct | **Use**: an axe scan of every page and state, inside the Playwright run. |
| `eslint`, `eslint-config-next` | 10.15.0, 16.4.6 | | Lint, plus `no-restricted-imports` and `react/no-danger` as part of the guards. |

Not used: AI Elements (being folded into shadcn/ui, deprecated end of November 2026 per the research
doc), CopilotKit (too large), Chainlit (chat as the whole page), `tw-animate-css` (not needed).

### Folder layout

```
web/
├── package.json  package-lock.json  .nvmrc  next.config.ts  tsconfig.json  eslint.config.mjs
├── components.json                 shadcn config: base "aria", aliases to src/components/ui
├── public/
│   ├── hero/                       the landing drawing and its CREDIT.txt (section 6)
│   └── pdf.worker.min.mjs          copied from pdfjs-dist at build
├── scripts/
│   ├── openapi.sh                  dumps FastAPI's schema, runs openapi-typescript
│   ├── make-fixtures.py            writes tests/fixtures/*.json from the real API with no key (section 4)
│   ├── copy-demo.mjs               copies demo/*.png into public/demo/ (git-ignored) for "Try an example"
│   └── guard.mjs                   the build guard (section 5)
├── src/
│   ├── app/                        one folder per page (section 2); layout.tsx holds header, footer, Ask button
│   ├── api/                        schema.d.ts (generated), client.ts (openapi-fetch), errors.ts (error code -> owner's words)
│   ├── components/
│   │   ├── ui/                     shadcn/React Aria parts, restyled to DESIGN.md
│   │   ├── flow/                   StepLine, BackLink, ErrorSummary, MainButton, NotSure
│   │   ├── plan/                   PlanViewer (img or PDF.js), FactRow, FactGroup
│   │   ├── results/                CountsSentence, FindingCard, PermitList, RecordLine, ZoningCard, Downloads
│   │   ├── map/                    PlaceMap (MapLibre, lazy)
│   │   └── assistant/              AskButton, Panel, Suggestions, Message
│   ├── content/                    every fixed sentence the site shows: page copy, help text, suggested questions.
│   │                               Words only, no code values (section 5 checks this)
│   ├── state/                      flow state in sessionStorage, one key per step; the uploaded file kept in memory only
│   └── styles/tokens.css           DESIGN.md tokens as CSS variables and Tailwind @theme
├── tests/
│   ├── unit/                       Vitest
│   ├── e2e/                        Playwright: flows, keyboard, refresh, axe, screenshots
│   └── fixtures/                   API responses generated by scripts/make-fixtures.py
└── README.md                       how to run it, with and without the API
```

`web/node_modules`, `web/.next`, `web/out`, `web/public/demo/`, `web/test-results/` and
`web/screenshots/` go in `.gitignore`. Screenshots are attached to pull requests, not committed.

## 2. Pages

Each page is a folder in `web/src/app/` and its own URL, so a refresh keeps the step and the Back
button works. What the owner entered is kept in `sessionStorage` (this tab only, cleared by "Start
again"). The step line counts four steps, as the brief does: Reading is part of step 2.

| URL | Brief screen (§7) | `h1` | API routes it calls | Main button |
|---|---|---|---|---|
| `/` | Start | Check your floor plan before you apply | `GET /api/meta` (demo cases for "Try an example plan"; `features` to say whether uploads can be read) | Start |
| `/business` | Step 1 | What kind of business is it? | `GET /api/meta` (the six types, which ones serve food); `POST /api/zoning` when an address is entered (pin, "Is this the right place?") | Continue |
| `/plan` | Step 2 | Upload your floor plan | `GET /api/meta` (`limits.upload_types`, `limits.max_upload_mb` for the hint and for checking before sending) | Read my plan |
| `/plan/reading` | Reading | Reading your plan | `POST /api/plans/read` (a demo `case_id`, or the file). Cancel aborts the request and returns to `/plan`. | (none; Cancel link) |
| `/check` | Step 3 | Check what we read from your plan | None on load (the facts come from the reading, kept in `sessionStorage`). "Run the check" calls `POST /api/checks` with the confirmed facts, the intake and the zoning input. | Run the check |
| `/results?check=<id>` | Step 4 | Your pre-check results | `GET /api/checks/{id}`; `POST /api/zoning` once, for the map point and outline, when the check used an address; the two PDF links; `DELETE /api/checks/{id}` ("Delete this check now") | Download the fix list (PDF) |
| `/help` | (new, small) | How the pre-check works | None. The fixed help text, so the assistant's pre-result answers are also readable as a page. | (none) |
| Assistant panel | §8 | (dialog title "Ask about the pre-check") | `POST /api/checks/{id}/ask` once a result exists; before that, fixed text from `web/src/content/help` only, no request | (send button) |

Notes on the harder pages:

- **`/check`, "Check what we read".** The plan in 7 columns, the facts in 5; on a phone the plan first, zoomable (pinch, plus buttons for keyboard and one-handed use). The image comes from the browser: a demo plan from `/demo/<file>.png` (copied in at build), an uploaded PNG or JPG as an object URL, an uploaded PDF rendered by PDF.js. The file is held in memory only, never in storage, to keep the promise that plans are not saved. After a refresh the facts are still there and the plan area says "The plan is not kept after a refresh. Choose the file again to see it here," with a file button. Facts are grouped as the schema groups them (overall size, rooms, doors, aisles, restrooms, kitchen, fire safety, seats); each row has the value, where it is on the plan in words (a door's `location`, a room's name), and Change. A `null` shows "Not sure" and can be filled in or left. The model's `uncertainties` list is shown as "What the reader was unsure about". `source_label` is shown once ("Read by the vision model" or "The saved reading for this example plan"). Changing a value says that the check will use the new value (HAX G16).
- **Manual entry.** When `POST /api/plans/read` fails (`502 plan_reading_failed`, `503 no_model_key`), the error page offers "Enter the measurements yourself", which opens `/check` with every fact empty ("Not sure"). That is how the owner can always finish without the model.
- **`/results`.** Findings in 8 columns, the summary in 4 and sticky. One sentence of counts from `summary.fails`, `reviews`, `passes`, worded "11 things to fix before you apply, 2 to check with the city, 6 fine". Then Fix, then Check with the city, then OK collapsed. Each finding card has an id `finding-<index>`. Then permits (`permits_likely_required`), what Seattle's records show (`local_review_data`, or a plain line that they are not loaded on this server), zoning with the map, `notices`, `code_basis`, `disclaimer`, `expires_at` ("This check is kept until 24 December 2026"), downloads.

## 3. Stages in build order

Each stage is one branch and one pull request into `main`. Every stage ends with the same three
gates: `python -m pytest` passes, `npm test` and `npm run e2e` pass in `web/`, and the stage review
in section 5 is attached. Screenshots are taken by Playwright at 375 and 1280 px wide
(`deviceScaleFactor: 2`) and attached to the pull request.

### Stage 0: Skeleton

- **Built:** `web/` from `create-next-app` 16.4.6, static export, shadcn init with the React Aria base, `tokens.css` from `DESIGN.md`, fonts, root layout (skip link, header with the site name, footer with who runs it, "not a City of Seattle service", rulebook date per Q2), `openapi.sh` and the generated client, `make-fixtures.py`, `guard.mjs` and `tests/test_web_guard.py`, Playwright and axe configured, a CI job for `web/` beside the existing pytest job. One placeholder page per route with the correct `h1` and `<title>`.
- **Tests:** the guard passes on the skeleton and *fails* on three planted test files (a code number, a status decided in TypeScript, an `anthropic` import); the generated types match a fresh dump of the OpenAPI document; axe on each placeholder; no horizontal scroll at 320 px.
- **Done when:** `npm run build` writes `web/out/` with no network; `npm run dev` shows every route; CI is green.
- **Screenshots:** the empty Start page with header and footer, 375 and 1280.

### Stage 1: Check what we read

First real page, as the brief and handoff ask. Built against the fixtures so it needs neither the
plan upload nor the business step to exist yet.

- **Built:** `PlanViewer` (image, zoom, keyboard zoom buttons; PDF.js path), `FactRow` and `FactGroup` for every field in `Facts`, Change in place with a form per row, "Not sure" for every nullable fact, `uncertainties`, `source_label`, the refresh state without the file, the manual-entry state with all facts empty, "Run the check" posting to `POST /api/checks`, the error summary, and a temporary results page that only shows the counts sentence.
- **Tests:** Vitest: every `Facts` field has a row and a label; a `null` shows "Not sure" and is sent back as `null`, never `0` or `false`; Change keeps the other values; an emptied number is sent as `null`; the error summary lists each error as a link to its field. Playwright: the three demo readings render; the flawed café, unchanged, gives `fails: 11, reviews: 2, passes: 6`, the same as `python -m checker.audit` on the same input; correcting the exit count changes the result; refresh keeps edited facts; keyboard-only run from the first Change to "Run the check".
- **Done when:** you can open `/check` with the flawed café reading, correct a door width, run the check and see the counts change, with the keyboard alone, on a phone and a laptop.
- **Screenshots:** the café reading; one row in Change state; the manual-entry state; the refresh state without the plan; an error summary.

### Stage 2: Start, your business, your floor plan, reading

- **Built:** Start (with the hero per section 6 if approved), "Try an example plan" for the three demo cases, step 1 (six radio cards, the food-related questions per Q1, the address field), step 2 (drop area, Choose a file, the camera on phones via `accept` and `capture`, size and type checked before sending using `/api/meta` limits, states empty, uploading, read, failed), the Reading page and Cancel, every API error code mapped to the brief's wording.
- **Tests:** each `error.code` the API can return has a sentence in `errors.ts` that names the fix and avoids "please", "sorry", "invalid", "oops"; a 12 MB file is refused before upload; with no key the upload path shows the `no_model_key` message and offers the example plans and manual entry; Back from each step keeps the entries; refresh on each step keeps them; the demo flow runs Start to `/check`.
- **Done when:** a person can go from Start to `/check` with an example plan, and with an uploaded file on a server that has a key.
- **Screenshots:** Start; step 1 empty and with errors; step 2 in each of its four states; Reading.

### Stage 3: Results and downloads

- **Built:** the counts sentence, finding cards (status tag with icon and word, title, `detail`, `fix`, `reviewed_by`, "Show the code reference" disclosure with `citation` in Plex Mono, "Ask about this"), OK collapsed, permits, record lines from `local_review_data` (each with its permit count), `notices`, zoning in words (district, status, detail, overlays), the two PDF downloads, "Delete this check now" with a confirmation, sticky summary.
- **Tests:** status words and icons for each of `pass`, `fail`, `review`; `review` is never shown as OK; the order is Fix, Check with the city, OK; two findings with the same `rule_id` get different anchors; every record line includes "Of N"; with no `local_review_data` a sentence says the city's records are not loaded; PDF links point at the right routes; delete confirms, then returns to Start; the salon demo and the compliant café both render.
- **Done when:** a person can go from an example plan to a downloaded fix list PDF on a phone and a laptop.
- **Screenshots:** flawed café results (top, a card with the code reference open, the summary); compliant café; with and without Seattle records.

### Stage 4: The assistant

- **Built:** the Ask button, the side panel (columns 9 to 12) and the bottom sheet, three or four suggestions per step from `content/`, fixed help answers before a result, `POST /api/checks/{id}/ask` after, each answer linking to the finding(s) in `cited_rules` and scrolling there, the one fixed line on what it can and cannot do, `generated_by` shown quietly ("Written from your result by a template" or by the model), conversation cleared from the panel menu.
- **Tests:** never opens by itself; Escape closes and returns focus to the button; focus moves in on open; closed, it never covers the main button at 320 to 1280 px; the flow finishes with it closed; answers render as text (a planted `<img onerror>` answer shows as characters); a cited rule with two findings links to both.
- **Done when:** the handoff's stage 3 conditions hold.
- **Screenshots:** panel open on step 1 and on results, at both widths.

### Stage 5: The map

- **Built:** `PlaceMap` on step 1 (pin, "Is this the right place?") and in the zoning card (pin, outline, the zone's name as a label), restyled to paper and ink, attribution shown, the same facts written beside it, no map at all when there is no `point`.
- **Tests:** renders the fixture outline with no network (blank style); the zone name is on the map as text, not only a colour; with `outline: null` the card still shows the zoning in words; keyboard users can skip the map.
- **Done when:** a wrong address is obvious before the check runs.
- **Screenshots:** step 1 with a pin; the zoning card.

### Stage 6: Voice (only after the backend has a speech route)

The microphone needs a new API route that wraps `checker/voice.py`; it is backend work and is not
part of this plan. The front-end stage starts once that route exists: a microphone button in the
panel, the heard text always shown, the browser's own voice for answers, one setting to turn voice
off, tested in Chrome and Safari.

## 4. Running without secrets

Nothing in `web/` ever needs a key. The backend needs one only to read an uploaded plan and for
model-written answers, and both have a path without it.

- **Types:** `scripts/openapi.sh` runs `python -c "import json; from api.main import app; print(json.dumps(app.openapi()))"` and feeds the result to `openapi-typescript`. It imports the app; it calls nothing. The generated file is committed, and CI fails if a fresh run differs.
- **Fixtures:** `scripts/make-fixtures.py` uses FastAPI's `TestClient` with no key, exactly as `tests/test_api.py` does, and writes to `web/tests/fixtures/`: `/api/meta`; `/api/plans/read` for each demo case (the saved readings); `/api/checks` for each demo case with the demo zone entered by hand; `/ask` answers (the template answers); every error body the API can return; and one check with `local_review_data`, built from a temporary SQLite loaded from `tests/fixtures/seattle_*.json` the way `tests/test_pipeline.py` does. For the map, one `/api/zoning` response is written with the point and outline from the mocked city layer used in `tests/test_api.py`. CI regenerates the fixtures and fails if they differ, so the front-end tests can never run against an out-of-date contract.
- **Unit tests (Vitest)** read the fixtures. No server.
- **End-to-end tests (Playwright)** start `uvicorn api.main:app` with no key, `PERMIT_CHECKS_DB` in a temporary folder, `PERMIT_SEATTLE_DB` pointing at a missing file, and `PERMIT_CORS_ORIGIN` set to the test server, then run the real flow with the three demo plans. Zone is entered by hand, so no geocoder call. The two cases that would need the network or a key are served by Playwright request interception from the fixtures: `/api/zoning` for an address, and the Seattle-records version of a check. The upload path is tested for real up to the `503 no_model_key` reply, then with an intercepted `200` reply.
- **The map** uses a blank MapLibre style in tests, so no tile requests.
- **The demo plan images** are copied from `demo/` by `scripts/copy-demo.mjs` before `dev`, `build` and tests.

## 5. Guards

### The build guard

`web/scripts/guard.mjs` runs before `build` and in CI, and `tests/test_web_guard.py` runs the same
check from `python -m pytest`, so it holds whichever test command is run. It scans `web/src/`
(not `tests/fixtures/`) and the built `web/out/`, and fails with the file, line and reason.

| What it stops | How |
|---|---|
| A building-code number | (a) Every number in `checker/rules/seattle.json` that sits next to a unit or a code key (door widths, areas, load factors, fixture ratios, distances) is collected, and any of them in `web/src/` beside a unit word (`in`, `inch`, `"`, `ft`, `sq ft`, `occupants`, `persons`, `%`) fails. (b) Code-section patterns fail anywhere in `web/src/`: `SBC`, `IBC`, `IFC`, `UPC`, `SMC`, `ADA`, `Table 10…`, `Section 10…`, `§`. Text that cites the code may only arrive from the API. |
| Pass/fail logic | Fails on: a comparison involving a `Facts` field name (`clear_width_in`, `area_sqft`, `water_closets` and the rest, taken from the generated types) with `<`, `>`, `<=`, `>=`; assigning or returning the literals `"pass"`, `"fail"` or `"review"` outside `components/results/status.ts`, which maps a status the API sent to its word and icon and nothing else; any import of `seattle.json` or any path under `checker/`. |
| A model call | Fails on: `anthropic`, `@anthropic-ai/`, `api.anthropic.com`, `ANTHROPIC_API_KEY`, `x-api-key`, `claude-` model ids, `openai`, `@ai-sdk/`, `ai/` imports, any `fetch` to a host other than the configured API base; and, in `web/out/`, the strings `sk-ant` and `ANTHROPIC`. |
| Model output as HTML | Fails on `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`. ESLint `react/no-danger` as well. |

Allowed exceptions live in `web/scripts/guard-allow.json`, each with a reason, and the guard prints
them on every run so they stay visible. ESLint `no-restricted-imports` repeats the import rules so
the editor shows them while typing.

### The stage review

At the end of every stage, before the pull request:

1. **Brief section 12**, every page touched, each box answered yes or no with how it was checked: keyboard-only run (Playwright test plus one manual pass), axe result, labels, contrast (from `DESIGN.md`; any new colour pair is calculated), 44 px targets on phones (a Playwright check that measures every interactive element at 375 px), 320 px with no sideways scroll (a Playwright check), assistant closed and voice off, refresh on each step, screenshots.
2. **Vercel `AGENTS.md`**, the rules that apply to what was built, each marked met, not met, or not applicable with a reason. The ones most likely to bite here: focus rings with `:focus-visible`, nothing fixed covering focus (the Ask button), mobile input text at least 16 px (the brief's 18 px body meets it), hit targets, `autocomplete` and `inputmode` on the address and number fields, focus to the first error on submit, warn before leaving unsaved changes, the URL reflecting state, `tabular-nums`, the `…` character, `scroll-margin-top` on headings and finding anchors, `<title>` per page, no `transition: all`, safe areas, `overscroll-behavior: contain` on the sheet, `Intl` date formatting for `expires_at`.
3. **axe**: `@axe-core/playwright` with tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` on every page and every state the stage added (errors, open disclosures, open panel), at 375 and 1280. Zero violations to pass. Any `incomplete` result is listed in the pull request for a manual look.

The review is written into the pull request description under "Interface changes", which the
template already has.

## 6. Visual direction

The site should read like a good set of construction documents: everything measured, nothing
ornamental, the hierarchy carried by size, weight and space rather than colour. Craft is in the
details a careful reader notices: tabular figures that line up, hairlines that sit on the 8 px grid,
a focus ring that matches the blue exactly, status words that never wrap away from their icon.

### Landing hero (Start page only)

A measured drawing from the Historic American Buildings Survey (HABS), whose drawings are made by
the U.S. government and are generally public domain.

- **Candidate:** Fox Theater, Seventh Avenue and Olive Way, Seattle (later the Music Hall), HABS
  record with sheet files named `WASH,17-SEAT,11-52` to `11-62`, which include first-floor,
  mezzanine and balcony plans. Found by web search; the files are mirrored on Wikimedia Commons in
  the category "Music Hall (Seattle, Washington)".
- **Not yet verified.** This environment cannot reach `loc.gov` or `commons.wikimedia.org`, so I
  have **not** opened the item page, the sheet, its delineator or its rights statement. The usual
  Library of Congress statement for HABS items is "No known restrictions on images made by the U.S.
  Government; images copied from other sources may be restricted." That is from memory and must be
  read on the item page itself before the image is used.
- **Before stage 2 uses it:** open the Library of Congress item for the first-floor-plan sheet,
  copy its rights statement and call number into `web/public/hero/CREDIT.txt`, and show a credit on
  the page: "Fox Theater, Seattle. First floor plan, Historic American Buildings Survey, Library of
  Congress, HABS WASH,17-SEAT,11-[sheet]." If the statement is anything other than no known
  restrictions, pick another HABS sheet. See Q5.
- **Treatment:** cropped to a fragment of the plan (walls, a stair, the lobby doors), converted to
  one colour, Ink at about 85% on Paper, no tint, no shadow, no gradient, `alt=""` with the credit as
  visible text (it is decorative). Columns 6 to 12 on wide screens, beside the heading in columns 1 to
  6; under the heading on phones, cropped short so Start stays above the fold. Served as AVIF and PNG
  at two widths with explicit dimensions (no layout shift), preloaded.
- It appears only on Start. No image on any task page.

### Heading typeface

**Proposal: IBM Plex Serif 400 for the page heading (`h1`) only.** Everything else stays as the brief
has it: IBM Plex Sans 400/600 for text and section headings, IBM Plex Mono for code sections,
measurements and permit numbers.

Checked against the brief:

| Brief rule | Plex Serif for `h1` |
|---|---|
| §4 Plex Sans for text, Plex Mono for code | Changes the `h1` face only. **A departure (D2).** |
| §4 Two weights only, 400 and 600 | Met. The serif is used at 400. |
| §4 Sizes 32/40 phone, 40/48 wide | Unchanged. |
| §4 Left-aligned, no all-capitals | Met. |
| §1 Calm, plain, precise; drafting office | Same family, same proportions and x-height logic as Plex Sans, so it sits with it without contrast for its own sake. A serif at 400 reads as considered and quiet, which suits a page that asks about money and the law; it is how a title block on a drawing set reads, not how a marketing page reads. |
| Open licence | SIL Open Font License, like the rest of Plex. |
| §13 No decoration | It is a typeface, not decoration. |

The alternative, if you want no new face: Plex Sans 600 as the brief says. Both are written into
`DESIGN.md`; the serif is marked as a change.

### Components restyled to the brief

shadcn's CSS variables are set once from the brief's tokens: `--background` Paper, `--foreground`
Ink, `--muted-foreground` Muted ink, `--primary` Blueprint blue with white text, `--ring` Blueprint
blue, `--border` Hairline, `--input` Field border, `--destructive` Fix. No secondary accent; the
shadcn `secondary` and `accent` variables are set to Paper and Ink so nothing introduces a new
colour. Corners at 2 px (the brief sets none; added in `DESIGN.md`). No shadows on task pages;
panels and cards are separated by a 1 px hairline. Status tags are words plus icon on their tint.

### Motion

Limited to three places, each under 250 ms, `transform` and `opacity` only, and **off when the
reduced-motion setting is on** (`MotionConfig reducedMotion="user"`, and a CSS
`prefers-reduced-motion` fallback):

1. **Page transitions:** the new page's content fades in and rises 8 px over 180 ms. No exit
   animation, so nothing delays a button press. Focus moves to the `h1` on arrival.
2. **The plan-reading stages:** the list of what the reader looks for appears one line at a time.
   It is not a progress bar and does not claim a stage is finished (see D4).
3. **The results counts:** the three numbers count up from zero over 400 ms once, on first view.
   The final numbers are in the HTML from the start, so screen readers and reduced-motion users get
   them at once; only the visible digits animate (`aria-hidden` on the animated copy).

The assistant panel slide (brief §11) stays as the brief has it.

## 7. Departures

Each one can be approved or rejected on its own. Rejecting one changes only the part named.

| # | Departure | From | Why | If rejected |
|---|---|---|---|---|
| D1 | A hero drawing on the Start page. | Brief §13 "no hero image on the task pages"; Start is listed with the task screens in §7. | Your prompt for this session asks for it. Start is the one page that is not a question. | No image; Start is text only. |
| D2 | IBM Plex Serif 400 for `h1`. | Brief §4 (Plex Sans for text). | Section 6. | Plex Sans 600 for `h1`. |
| D3 | Motion on page transitions, the reading list and the results counts, including on question pages. | Brief §11 "Nothing else needs to move", "Nothing animates on question pages". | Your prompt for this session asks for these three. Kept to 180 to 400 ms, off with reduced motion. | Only the assistant slide moves; Motion is not installed. |
| D4 | The Reading page lists what the reader looks for, without claiming which stage is under way. | Brief §2 "name the stage", §7 "the current stage by name". | The API reads a plan in one request with no progress events. Naming a current stage would be invented. | Needs a backend change (Q3) before the page can be honest. |
| D5 | Finding cards show the API's `detail` sentence as one line, not separate "what was measured" and "what the rule needs". | Brief §6, Finding card. | The result has one `detail` field. Splitting it in the browser would mean parsing rule text, which is logic in the front end. | Needs `measured` and `required` fields from `rules_engine.py` (backend change). |
| D6 | Fact rows say where on the plan in words (a door's `location`, a room's name), with no highlight on the drawing. | Brief §6 Fact row "where on the plan". | Facts have no coordinates. | Needs boxes from `extract.py` (a schema change and a new evaluation). |
| D7 | "Not sure" is offered for every fact that can be `null`, but **not** for intake questions (cooking, alcohol and the rest) until the API accepts it. | Brief §2 "'I don't know' is allowed". | The API stores those as `false`. A "Not sure" sent as `false` could turn an unknown into a pass, which `CLAUDE.md` forbids. | See Q1. |
| D8 | A small `/help` page holding the assistant's fixed pre-result text. | Not in the brief. | The same words are then readable without opening the assistant, and linkable. | Help text lives only in the panel. |
| D9 | A "Delete this check now" control and the expiry date on results. | Not in the brief. | The API stores each check for 30 days; the owner should be told and able to remove it (HAX G17, and the deployment kit's privacy note). | Not shown. |
| D10 | Contrast is judged by WCAG 2 (the brief's 4.5 and 3 to 1). APCA values are reported for information only. | Vercel `AGENTS.md` "Prefer APCA over WCAG 2". | The brief, MIT's guide and axe all use WCAG 2. | Adopt APCA targets and re-check every colour. |
| D11 | 2 px corner radius and no shadows. | The brief sets neither; Vercel suggests layered shadows. | Precision and restraint: a drawing has no shadows. | shadcn defaults. |
| D12 | The upload is held in memory only, so after a refresh on step 3 the plan image is gone (the facts stay). | Brief §2 "Refresh keeps the work". | The brief also says plans are not saved; storing the file in the browser would break that promise. | Keep it in IndexedDB on the owner's device until "Start again", and change the wording to "not saved on our server". |

## 8. Out of scope for version 1

- **Sign-in.** No accounts. Each check is reached by its unguessable id in the URL.
- **Hosting.** The site runs locally (`npm run dev` beside `uvicorn`). No deployment, domain or CDN work. The static export keeps hosting simple later.
- **Saved-check storage.** No list of past checks, no projects, no comparison. The API's own 30-day storage of one check is used as it is, and only reached through the current tab's link.
- Also not in version 1: voice (until the backend route exists), the tool-using assistant, photo notes, dark mode.

## 9. Open questions

| # | Question | My default if you do not answer |
|---|---|---|
| Q1 | The API's intake booleans have no "unknown". Should the backend accept `null` for `cooking_on_site`, `food_prep`, `serves_alcohol`, `outdoor_seating`, `upper_floor` and `historic_district`, with the rules engine treating `null` as review? It is a backend and rules-engine change, so it needs your approval. | Ask them as plain Yes / No with help text, and no "Not sure" (D7). |
| Q2 | The footer must show the rulebook's date, but neither `seattle.json` `_meta` nor `/api/meta` has one. Add `_meta.as_of` to the rulebook and `rulebook: {as_of, code_basis}` to `/api/meta`? | Footer shows "Rules from the 2021 Seattle codes" from the first result's `code_basis`, and no date, until the field exists. |
| Q3 | Should `/api/plans/read` report stages (for example server-sent events: "Finding rooms", "Finding doors and exits", "Counting fixtures")? Only true if `extract.py` actually works in stages; today it is one model call. | No; D4 stands. |
| Q4 | Map tiles: which provider? Options: OpenFreeMap (free, no key, OpenStreetMap data), a self-hosted Protomaps file for Seattle only (no third party at runtime), or a commercial provider with a key. | Protomaps, Seattle extract, served from `web/public/`, no runtime third party. |
| Q5 | Are you able to open the Library of Congress page for the Fox Theater first-floor-plan sheet and confirm its rights statement, or should I do it in a session that can reach `loc.gov`? Do you want a Seattle building specifically, or any well-drawn HABS plan? | Hold the hero until it is verified; Start ships text-only meanwhile. |
| Q6 | Step 1 asks about cooking. Should it also ask the other intake questions (alcohol, outdoor seating, upper floor, historic district, new signage)? Each changes the permit list. The brief lists only business type, cooking and address. | Ask cooking for food businesses and alcohol for food and bar types; the rest on one "A few more questions (optional)" disclosure on the same page. |
| Q7 | Who runs the site, as the footer should say? | "A prototype by the Seattle Permit Pre-Check team. Not a City of Seattle service." |
| Q8 | The handoff's rule for the presentation day ("do not merge into `main`") was for 21 November. Can stage pull requests merge into `main` now? | Yes, one stage at a time, after you approve each. |
