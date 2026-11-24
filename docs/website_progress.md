# Website progress: Seattle Permit Pre-Check

Built on the branch `website-v1` from `docs/website_plan.md`, following `docs/prompts/03-build.md`.
Started 24 November 2026. Each stage ends with `python -m pytest`, `npm test`, `npm run e2e` (which runs
axe on every page and state), the build guard, a design review against brief section 12 and the Vercel
Web Interface Guidelines, screenshots, this file, a commit and a push.

## Status

| Stage | Status | Screenshots |
|---|---|---|
| 0. Skeleton | Finished | [stage-0](screenshots/stage-0/) |
| 1. Check what we read | Finished | [stage-1](screenshots/stage-1/) |
| 2. Start, business, plan, reading | Finished | [stage-2](screenshots/stage-2/) |
| 3. Results and downloads | Finished | [stage-3](screenshots/stage-3/) |
| 4. The assistant | Not started | |
| 5. The map | Not started | |
| 6. Voice | Not started | |

## Backend changes

| Change | Files | Tests |
|---|---|---|
| Q1: intake answers accept `null` ("Not sure"). `null` is unknown, never false: the checks run with the answer as no and as yes; a finding that differs becomes `review` (citation and `reviewed_by` kept, the question named), never `pass`; a permit listed only one way is still listed with `may_be_needed` naming the question (Q9). Left out still means false. | `checker/rules_engine.py` (`UNSURE_ANSWERS`, `run_checks` wraps the old body, now `_run_checks`, and `_merge_unsure`; no rule value changes), `api/schemas.py` (six `Optional[bool]` answers; `Permit.may_be_needed`, sent only when set), `api/main.py` (`create_check` keeps `null` instead of dropping it, which had turned it into false), `checker/pdf.py` (`permit_name()`: the PDFs say "May be needed" too, brief section 10) | `tests/test_rules.py`: for each of the six answers, `null` vs `true` and `false` over five plans and business types (every finding that depends on it is `review`, with its citation, reviewer and the question; the others unchanged; summary recounted; each answer shown to matter in at least one case); the three permit-only answers list the permit as "May be needed" / as today / not at all; several unknowns at once; an omitted answer and explicit `false` give today's results (flawed café 11 / 2 / 6) for all three examples; the command-line audit is unchanged. `tests/test_api.py`: `null` accepted, stored and turned into `review`; omitted equals `false`; `"perhaps"` refused; OpenAPI shows `null` and `may_be_needed`. `tests/test_pdf.py`: both PDFs say "May be needed". |
| Q2: `_meta.edition_date` placeholder; `/api/meta` returns `rulebook: {edition_date, code_basis}`, with `edition_date` `null` while it is the placeholder | `checker/rules/seattle.json` (one `_meta` line, no rule values), `docs/rulebook.md`, `api/schemas.py` (`Rulebook`), `api/main.py` (`edition_date()`) | `tests/test_api.py::test_meta_gives_the_rulebook_edition_date_only_once_the_owner_has_set_it` |

## Decisions the plan did not cover

| # | Decision | Why |
|---|---|---|
| B1 | shadcn's `init` was **not** run. The React Aria components are written by hand in `web/src/components/ui/`; `components.json` records the "aria" base so the CLI can be used later. | The shadcn CLI fetches its registry from `ui.shadcn.com`, which this environment's network blocks (HTTP 403 from the proxy). Writing the parts by hand gives the same result the CLI would (components copied in and owned) without its extra packages (`clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css`), which the plan does not name. A 3-line `cn()` in `src/lib/utils.ts` stands in for theirs. |
| B2 | `web/` was made with `create-next-app` 16.4.6, then every package was pinned to the plan's versions. `create-next-app` had chosen `eslint` 9 and `@tailwindcss/turbopack`; the plan's `eslint` 10.15.0 and `@tailwindcss/postcss` 4.3.5 are used instead. The template's `cacheComponents` and `partialPrefetching` options were removed. | The plan's table. `eslint-config-next` 16.4.6's plugins declare peers up to eslint 9 and print warnings on install, but lint runs and both `no-restricted-imports` and `react/no-danger` were checked to fire. The two Next options are for server rendering; this is a static export. |
| B3 | `trailingSlash: true` in `next.config.ts`, so pages are `out/<page>/index.html` and URLs end in `/` (`/results/?check=…`). | Works on any static host without rewrite rules. |
| B4 | Extra devDependency types: `@types/node` 22.20.5, `@types/react` and `@types/react-dom` 19.3.0. | TypeScript needs them; create-next-app adds them. They only describe types and ship nothing to the browser. |
| B5 | The guard's code-number rule skips `.css` files, and does not count digits preceded by `-` (Tailwind class names such as `gap-2`). | CSS holds sizes (`100%`), not sentences; class-name digits are not code values. Every other rule still scans CSS. |
| B6 | E2E runs on ports 8765 (API) and 3765 (site), from a fresh `npm run build`, served by `scripts/serve-out.mjs` (no dependency). | Keeps the tests off the ports a person uses for `npm run dev` and `uvicorn`, and tests the same static files a host would serve. |
| C1 | A fact row is one thing on the plan (a door, a room, a restroom, the kitchen, fire safety, the seats, the overall size) with its facts listed and one Change, not one Change per number. | 18 rows for the café instead of about 70 buttons. Change still edits in place and keeps every other value. |
| C2 | Rooms, doors, aisles and restrooms can be added ("Add a door") and removed (with Undo). | Manual entry starts with no doors or rooms; without Add the owner could not describe the plan, so "the owner can always finish without the model" would not hold. Remove has Undo (Vercel: confirm destructive actions or offer Undo). |
| C3 | Manual entry is the URL `/check/?enter=yourself`. | The URL reflects the state (Vercel); stage 2's error page links to it. |
| C4 | The main button turns Ink on hover instead of a darker blue. | A darker blue would be a new colour (DESIGN.md: no new colour). White on Ink is 16.6 to 1, so hover raises contrast (Vercel). |
| C5 | On wide screens the plan stays in view (sticky) while the facts scroll. | The owner compares each fact with the drawing. |
| C6 | `scripts/copy-demo.mjs` also writes `public/demo/plans.json`, the picture file for each example plan id. | `/api/meta` names the example plans but not their pictures; the browser needs the file name. It holds ids and file names only. |
| C7 | "Changed by you" compares a row with the reading by its position. After removing a door, the doors after it are marked changed. | Facts have no ids (plan finding 3 is the same issue for findings). Wording stays true: the values differ from what was read at that position. |
| D2-1 | Questions a business type does not ask are sent as `false` (a salon is not asked about cooking or alcohol); only a question asked and answered "Not sure", or an optional question left unanswered, is sent as `null`. | Otherwise every salon check would ask the city about a kitchen hood. The API's business types say which questions apply (`serves_food`, `serves_alcohol`). |
| D2-2 | Step 1 also has "Zone from the zoning map (optional)" beside the address. | The API takes an address or a zone; the end-to-end tests and the examples use a zone so no geocoder is called. Entering both is an error ("Enter an address or a zone, not both"). |
| D2-3 | The zoning lookup with the pin is left to stage 5 (the map). In stage 2 the address is sent with the check, which screens the zoning. | "Is this the right place?" needs the map to mean anything. |
| D2-4 | Step 2's four states are empty, chosen, read, failed. The "uploading" state is the Reading page, where the file is sent. | The file is sent only by "Read my plan"; the Reading page is where it is in flight. A fifth state, "refused before sending", is shown in the screenshots. |
| D2-5 | An example plan opens through the Reading page (`/plan/reading/?example=<id>`) and sets that example's own answers (its business type, cooking, zone; the rest no). | Same path as an upload, and the example gives the same result as `python -m checker.audit` (11 / 2 / 6). |
| D2-6 | Step 1 keeps a draft as it is typed (`precheck.business.draft`), so a refresh before Continue keeps the answers, and an unanswered question stays unanswered rather than turning into "Not sure". | Brief section 2: refresh keeps the work. |
| D2-7 | "Take a photo of the plan" is shown on touch screens only (`pointer: coarse`). | On a laptop `capture` is ignored and the button would just open the file picker under a misleading name. |
| D3-1 | "Ask about this" on each finding card is added in stage 4, with the assistant it opens. | A link that does nothing until stage 4 would be a dead control in the stage 3 commit. |
| D3-2 | On phones the summary (counts, downloads, zoning) comes before the findings; on wide screens it is the sticky right-hand column (columns 9 to 12). | The main button, "Download the fix list (PDF)", would otherwise be below thirteen finding cards on a phone. |
| D3-3 | Record lines are written from `local_review_data` as "Of N … , X (P%) …", with X = share × N rounded, which is the API's own share applied to the API's own count. | The brief's form ("Of 529 similar projects, 462 were sent back at least once"). It is arithmetic for display, not a decision. |
| D3-4 | The zoning status words ("Likely allowed here", "Check with the city", "Not allowed here", "Could not tell") map the API's four zoning statuses, in `status.ts`. | The API sends codes, not words. |
| D3-5 | React Aria's `isPending` is not used on buttons. The button shows a spinner and its label changes ("Running the check…"), announced by a polite live region. | axe found React Aria's pending announcement left a `role="img"` pointing at a label that no longer exists once the page changes (`role-img-alt`). |
| D3-6 | Dates and numbers use the reader's own locale (`Intl` with no locale given). | Vercel: locale-aware dates. The plan's example "24 December 2026" is how a British-English browser shows it; a US browser shows "December 24, 2026". |
| D3-7 | The delete confirmation's backdrop is Ink at 40% opacity. | A modal needs a scrim; it uses the ink token, not a new colour. |
| B7 | `tests/test_web_guard.py` also checks the generated types (`openapi.sh --check`) and the fixtures (`make-fixtures.py --check`). | So a backend change that would break the front end fails `python -m pytest` too, not only CI. |

## Not testable in this environment

- `vercel.com/design/guidelines` could not be reached; the review uses `AGENTS.md` from `vercel-labs/web-interface-guidelines` (main branch, fetched 24 November 2026 from raw.githubusercontent.com), as the plan did.
- CI itself: the `web` job is written in `.github/workflows/tests.yml` but runs only once pushed to GitHub.
- A manual keyboard pass with a real screen reader: the keyboard checks here are Playwright runs.

---

## Stage 0: Skeleton (finished)

**Built.** `web/` as a static export; tokens from `DESIGN.md` in `web/src/styles/tokens.css` (Tailwind 4
`@theme`, shadcn variable names mapped onto the tokens only); self-hosted IBM Plex Sans and Mono 400/600,
Plex Serif 400 loaded on Start only; the root layout with a skip link, the header (site name only), and the
footer drawn as a drawing's title block (who runs it, Q7 wording; the rulebook basis; the edition date once
the owner sets it, Q2; a link to help); `PageShell`, `PageHeading` (focus moves to the `h1` on navigation),
`StepLine`, `BackLink`; a placeholder for every route with the plan's `h1` and `<title>`; `scripts/openapi.sh`
and the generated `src/api/schema.d.ts`; the typed client `src/api/client.ts`; `src/api/errors.ts` with a
sentence for every API error code; `scripts/make-fixtures.py` (29 fixtures, deterministic); `scripts/guard.mjs`
and `scripts/guard-allow.json` (empty); ESLint with the guard's import rules and `react/no-danger`; Vitest;
Playwright with axe; a `web` CI job.

**Tested.**
- `python -m pytest`: 135 passed (122 before the stage plus 13 in `tests/test_web_guard.py`).
  - `/api/meta` has `rulebook.edition_date`: `null` with the placeholder, the date with a patched rulebook, and the OpenAPI document includes it.
  - The guard passes on `web/src` and fails, naming file and line, on nine planted files: a code number, a code section, a status decided in TypeScript, a status literal, an `@anthropic-ai/sdk` import, a request to another host, `webkitSpeechRecognition`, `dangerouslySetInnerHTML`, a rulebook import; and on a key-shaped string in a built page.
  - The generated types match a fresh dump of the OpenAPI document; the fixtures match a fresh run.
- `npm test` (Vitest): 3 passed (every error code in the fixtures has a sentence; no "please", "sorry", "invalid", "oops").
- `npm run e2e` (Playwright): 10 passed. Every route has its `h1` and `<title>`, the footer wording, no "TODO"; axe at 375 and 1280 with zero violations; no sideways scroll at 320 px; every target at least 44 px at 375 px; the skip link moves focus to `main`; the footer shows the code basis from `/api/meta` and no date.
- `npm run build` writes `out/` with no network (fonts from `node_modules`); the guard runs before and after it.
- `npm run lint`, `npm run typecheck`: clean.

**Design review, brief section 12** (pages touched: all seven placeholders).

| Check | Result | How |
|---|---|---|
| Keyboard alone, focus visible | Yes | Skip link test; 3 px blue `:focus-visible` ring with 2 px offset on every element. |
| axe: no errors | Yes | 0 violations on 7 pages at 2 widths. No `incomplete` results. |
| Every field has a visible label | Not applicable | No fields yet. |
| Contrast | Yes | Only `DESIGN.md` pairs are used: ink and muted ink on paper, blue links on paper. No new pair. |
| 44 px targets on phones | Yes | Playwright measures every interactive element at 375 px (the header link was 24 px tall; fixed to 44). |
| 320 px, no sideways scroll | Yes | Playwright, every page. |
| Assistant closed, voice off | Not applicable | Not built yet. |
| Refresh keeps entries | Not applicable | No entries yet. |
| Screenshots 375 and 1280 | Yes | `docs/screenshots/stage-0/`. |

**Vercel `AGENTS.md`, rules that apply.** Met: `:focus-visible` rings; skip link; `<title>` per page;
`scroll-margin-top` on headings and ids; `touch-action: manipulation`; tap highlight set to the blue;
mobile text 18 px (above 16); zoom not disabled; safe areas (`viewport-fit=cover`, padding with
`env(safe-area-inset-*)`); `theme-color` matches paper; `overscroll-behavior: none` on `html` for fine
pointers only; `Intl.DateTimeFormat` for the edition date; `translate="no"` on the site name; explicit
`select` colours; no `transition: all`; hierarchical headings. Not applicable yet: forms, loading
buttons, unsaved-changes warning, URL state. Departure: shadows (D11) and WCAG 2 contrast instead of APCA (D10).

**Screenshots.** The empty Start page with header and footer: [375](screenshots/stage-0/start-empty-375.png),
[1280](screenshots/stage-0/start-empty-1280.png).

---

## Stage 1: Check what we read (finished)

**Built.** `/check/`: the plan in 7 columns and the facts in 5 (plan first on phones, sticky on wide
screens). `PlanViewer` shows an example plan from `/demo/`, an uploaded PNG or JPG from memory, or an
uploaded PDF drawn by PDF.js (lazy-loaded, worker from `public/`), with Zoom out, Zoom in and Fit buttons
(keyboard and one hand) and pinch. After a refresh an uploaded plan is gone and the page says so, with a
"Choose the plan file" button that shows it again without sending it anywhere. `FactsEditor` groups the facts
as the schema does; `FactRow` shows what was read, where it is on the plan in words, and Change, which opens a
form in place (React Aria fields, react-hook-form, zod for shape only). An empty value shows "Not sure" (in the
city colour) and is sent as `null`. "Changed by you. The check will use these values" after a change (HAX G16).
"What the reader was unsure about" lists `uncertainties`; the source is said once. The error summary lists each
error as a link that focuses its field; the field shows the error next to it and gets focus on Save. Leaving
with an unsaved change warns. "Run the check" posts to `POST /api/checks` and opens `/results/?check=<id>`,
which for now shows the counts sentence only. Manual entry: `/check/?enter=yourself`.

**Tested.**
- `python -m pytest`: 135 passed (no backend change in this stage).
- `npm test`: 12 passed. Every field of `Facts` and of each thing on the plan has a row and a label (checked against the API's own reading); every thing read from the café has a Change; a `null` shows "Not sure" and is sent back as `null` (facts and intake answers); an emptied number and a "Not sure" answer become `null`; manual entry sends empty facts; Change keeps every other value; an error is reported next to the field and as a problem linking to it; the summary lists each error as a link.
- `npm run e2e`: 20 passed. The three example readings render with their plan picture; axe at 375 and 1280 (reading, Change state, error summary, manual entry, refresh state), zero violations and no `incomplete`; no sideways scroll at 320; 44 px targets. The flawed café, unchanged, gives `11 / 2 / 6`, compared in the test with `python -m checker.audit` run on the same input. Adding a second exit changes the result. A refresh keeps the edited facts. Keyboard only from the first Change, through editing a value (Enter saves, focus returns to Change), to Run the check and the results page. Manual entry runs a check. An uploaded plan is gone after a refresh and can be chosen again and zoomed.
- `npm run lint`, `npm run typecheck`, guard: clean.

**Design review, brief section 12** (page: `/check/`, and the temporary `/results/`).

| Check | Result | How |
|---|---|---|
| Keyboard alone, focus visible | Yes | Playwright keyboard-only run; radios show the ring through React Aria's `data-focus-visible`. |
| axe: no errors | Yes | 0 violations in every state at both widths. One `incomplete` (contrast of labels inside `display: contents`) was removed by changing the markup so axe can measure them. |
| Visible labels; errors next to the field and in the summary | Yes | Every input has a `Label`; Vitest and Playwright check the error in both places. |
| Contrast | Yes | Only `DESIGN.md` pairs. "Not sure" uses the city colour on paper (6.7 to 1). |
| 44 px targets | Yes | Playwright, every state. |
| 320 px, no sideways scroll | Yes | Playwright. The plan scrolls inside its own region when zoomed. |
| Assistant closed, voice off | Not applicable | Not built yet. |
| Refresh keeps entries | Yes | Playwright: an added door survives a reload. The plan file does not, by design (D12), and the page says so. |
| Screenshots | Yes | `docs/screenshots/stage-1/`. |

**Vercel `AGENTS.md`.** Met: Enter submits the focused field (saves the row); errors inline and focus to the
first error on Save; `inputmode="decimal"`/`"numeric"` and `autocomplete="off"` on fact fields; paste allowed;
values trimmed; warn before leaving with an unsaved change; the loading button keeps a spinner and the label
("Running the check…"); `…` in loading text; `tabular-nums` and Plex Mono on measurements; `Intl.NumberFormat`
for values; the scrollable plan region is focusable and has a name; `overscroll-behavior: contain` on it; Undo
for Remove; long names wrap (`break-words`, `min-w-0`); empty groups say "None read from the plan.". Not met,
with reason: "Back/Forward restores scroll position" is left to the browser's default for a static export (not
tested). Not applicable: autofocus (several fields).

**Not tested here.** Pinch zoom on a real phone; a real multi-page PDF (the PDF path is built and type-checked;
the tests use PNG plans because no PDF plan exists in `demo/`).

**Screenshots.** [Café reading 375](screenshots/stage-1/cafe-reading-375.png), [1280](screenshots/stage-1/cafe-reading-1280.png)
(full page: [375](screenshots/stage-1/cafe-reading-full-375.png), [1280](screenshots/stage-1/cafe-reading-full-1280.png));
one row in Change state [375](screenshots/stage-1/row-change-375.png), [1280](screenshots/stage-1/row-change-1280.png);
manual entry [375](screenshots/stage-1/manual-entry-375.png), [1280](screenshots/stage-1/manual-entry-1280.png);
refresh without the plan [375](screenshots/stage-1/refresh-without-plan-375.png), [1280](screenshots/stage-1/refresh-without-plan-1280.png);
error summary [375](screenshots/stage-1/error-summary-375.png), [1280](screenshots/stage-1/error-summary-1280.png).

---

## Stage 2: Start, your business, your floor plan, reading (finished)

**Built.** Start (text only, Q5; serif heading, D2): what it does, what you need, how it works, that it is not
a city service, Start, "Start again (clears your answers)" when the tab holds answers, and the example plans from
`/api/meta`. Step 1: six radio cards from `/api/meta`; cooking for food businesses and alcohol for food and bar
types, each Yes / No / Not sure; address or zone; "A few more questions (optional)" (React Aria Disclosure) with
the other questions; errors next to each field and in the summary; focus to the first error. Step 2: drop area,
Choose a file, Take a photo (phones), type and size checked against `/api/meta` limits before sending; states
empty, chosen, read, failed with "Other ways to go on" (manual entry and every example plan). Reading: "Reading
<file>" and Cancel (aborts the request), no stage names (D4). Every API error code has a sentence in
`src/api/errors.ts`. Backend: Q1 and Q9 (see Backend changes).

**Tested.**
- `python -m pytest`: 149 passed (135 before the stage, plus 12 rules-engine test cases from 5 new tests, 1 API test and 1 PDF test; the guard and fixture checks now cover the new contract and a "Not sure" fixture). The strengthened summary test was checked to fail against an earlier version of the merge that miscounted `passes`.
- `npm test`: 19 passed. Cooking and alcohol are asked exactly for the types the API marks; "Not sure" is sent as `null`, never `false`; an unanswered optional question is `null`; a question not asked is `false`; address trimmed; a 12 MB file is refused using the API's 10 MB limit; a GIF is refused in the brief's words; every API error code has a sentence with no "please", "sorry", "invalid", "oops".
- `npm run e2e`: 29 passed (9 new). Start lists the API's examples and has no image; an example plan runs Start to step 3 and gives 11 / 2 / 6; step 1 errors in both places, summary links focus the field, refresh and Back keep every answer, and the request carries `null` for "Not sure" and unanswered optional questions; step 2 in each state, a 12 MB file refused with no request sent; with no key the real API's `503 no_model_key` shows the message and offers the examples and manual entry; an intercepted `200` reading opens step 3 with the uploaded plan beside the facts (and the request is multipart with the file and business type); Cancel returns to step 2 with the file still chosen; refresh on Reading explains the file is gone; Start again clears everything. axe at 375 and 1280 on every page and state: zero violations, no `incomplete`.

**Design review, brief section 12** (Start, step 1, step 2, Reading).

| Check | Result | How |
|---|---|---|
| Keyboard alone, focus visible | Yes | Radio groups use arrow keys (React Aria); the drop area has a "Choose a file" button; summary links focus the field; the new page's `h1` takes focus. |
| axe | Yes | 0 violations, every state, both widths. |
| Labels; errors next to the field and in the summary | Yes | Playwright checks both places for step 1 and step 2. |
| Contrast | Yes | `DESIGN.md` pairs only; the no-key note is ink on the city tint (14 to 1 or better). |
| 44 px targets | Yes | Playwright on Start, step 1, step 2. |
| 320 px | Yes | Playwright. Long file names break (`break-all`). |
| Assistant closed, voice off | Not applicable | Not built yet. |
| Refresh keeps entries | Yes | Step 1 (draft), step 2 (read state), Reading (says the file is gone; D12). |
| Screenshots | Yes | `docs/screenshots/stage-2/`. |

**Vercel `AGENTS.md`.** Met: `autocomplete="street-address"` and `spellcheck=false` on the address and zone;
placeholder text not used as labels; Enter submits step 1; focus to the first error; incomplete submission allowed
to show errors; "Read my plan" stays enabled until pressed; no dead ends (every error offers a next step); radio
label and control share one target (whole card); URL reflects state (`?problem=`, `?example=`); `…` in loading
text; the drop area has a keyboard and click alternative. Not applicable: unsaved-changes warning on step 1
(answers are saved as typed).

**Not tested here.** A real upload read by the model (no key in this environment); the camera button on a real
phone; drag and drop from the desktop (React Aria's DropZone is used; Playwright chose files through the button).

**Screenshots.** [Start 375](screenshots/stage-2/start-375.png), [1280](screenshots/stage-2/start-1280.png);
step 1 empty [375](screenshots/stage-2/business-empty-375.png), [1280](screenshots/stage-2/business-empty-1280.png);
step 1 with errors [375](screenshots/stage-2/business-errors-375.png), [1280](screenshots/stage-2/business-errors-1280.png);
step 2 empty [375](screenshots/stage-2/plan-empty-375.png), [1280](screenshots/stage-2/plan-empty-1280.png);
chosen [375](screenshots/stage-2/plan-chosen-375.png), [1280](screenshots/stage-2/plan-chosen-1280.png);
read [375](screenshots/stage-2/plan-read-375.png), [1280](screenshots/stage-2/plan-read-1280.png);
failed [375](screenshots/stage-2/plan-failed-375.png), [1280](screenshots/stage-2/plan-failed-1280.png);
refused before sending [375](screenshots/stage-2/plan-refused-375.png), [1280](screenshots/stage-2/plan-refused-1280.png);
Reading [375](screenshots/stage-2/reading-375.png), [1280](screenshots/stage-2/reading-1280.png).

---

## Stage 3: Results and downloads (finished)

**Built.** `/results/?check=<id>`: the counts sentence from `summary`; findings grouped Fix, Check with the city,
then OK collapsed (React Aria Disclosure), each card with its status tag (icon and word on its tint), title,
`detail`, "How to fix it", "Checked in Seattle's plan review by", and "Show the code reference" with the citation in
Plex Mono; every card anchored `finding-<index>`. A sticky summary on wide screens: counts, business, occupant
load, occupancy group, exits shown of required, the two PDF downloads (the main button is "Download the fix list
(PDF)"), zoning in words (status tag, zone, address, detail, overlays, what to do). Then permits (with "May be
needed" and the API's sentence when an answer was Not sure), Seattle's records as record lines (or a sentence that
they are not loaded), notices, the disclaimer and code basis, and "This check is kept until <date>" with "Delete
this check now…" (an alert dialog: Keep it, which has focus, or Delete the check; then Start says it was deleted).
`components/results/status.ts` is the one file with the status literals.

**Tested.**
- `python -m pytest`: 149 passed (no backend change).
- `npm test`: 30 passed. Each status has its word and icon; an unknown status shows "Check with the city", never OK; groups ordered Fix, Check with the city, OK, keeping each finding's position; counts wording; the page renders the groups in that order with OK collapsed (13 cards shown, 19 after opening); two `EG-3` findings get different anchors; the code reference is hidden until asked; both PDF links point at their API routes; "not loaded" sentence without records; three "May be needed" permits in the Not-sure fixture; the salon and the compliant café render; every record line starts "Of N".
- `npm run e2e`: 35 passed (6 new). From an example plan through the real API: counts 11 / 2 / 6; group order; OK collapsed; code reference opens; both PDFs are served as `application/pdf` starting `%PDF-`; the summary stays in view while the findings scroll at 1280; the compliant café (0 to fix) and the salon (zone NR3) render; with Seattle's records (the API fixture served by interception) every line says how many permits it is based on; Not-sure answers show three "May be needed" permits and three items to check with the city; delete: the dialog focuses Keep it, Escape closes it and returns focus, Delete returns to Start with a status message, and the old address then says the check is no longer kept. axe at 375 and 1280 on every state (top, code reference and OK open, compliant, salon, records, Not sure, the dialog): zero violations, no `incomplete`.

**Design review, brief section 12** (`/results/`, Start's deleted message).

| Check | Result | How |
|---|---|---|
| Keyboard alone, focus visible | Yes | Disclosures and the dialog are React Aria; Escape closes the dialog and focus returns to its button (Playwright). |
| axe | Yes | 0 violations. The one found on the way (`role-img-alt` from React Aria's pending announcement) is fixed (D3-5). |
| Labels | Not applicable | No fields on this page. |
| Contrast | Yes | Status words on their tints are the brief's pairs (5.6 to 1 or more); the zoning tag uses the same pairs. |
| 44 px targets | Yes | Playwright; the quiet button got a 44 px minimum width after the check found "Fit" at 38 px wide. |
| 320 px | Yes | Playwright. |
| Assistant closed, voice off | Yes | The whole flow, Start to PDF, runs with no assistant (it does not exist yet). |
| Refresh keeps entries | Yes | The results are reached by their URL (`?check=<id>`); a refresh fetches the same check. |
| Screenshots | Yes | `docs/screenshots/stage-3/`. |

**Vercel `AGENTS.md`.** Met: status never colour only (icon and word, `whitespace-nowrap` so the word stays with
its icon); destructive action confirmed; `…` on "Delete this check now…" (it opens a follow-up); `Intl` for the
expiry date and numbers; `tabular-nums` and Plex Mono for the figures; the URL carries the check id; headings and
anchors have `scroll-margin-top`; `overscroll-behavior: contain` on the sticky summary and the dialog; long
API text wraps (`break-words`). Not applicable: forms.

**Not tested here.** Opening the PDFs in a phone's browser (they are served `inline`; the tests check the response).

**Screenshots.** Flawed café: top [375](screenshots/stage-3/cafe-flawed-top-375.png), [1280](screenshots/stage-3/cafe-flawed-top-1280.png),
full page [375](screenshots/stage-3/cafe-flawed-full-375.png), [1280](screenshots/stage-3/cafe-flawed-full-1280.png);
a card with the code reference open [375](screenshots/stage-3/card-code-reference-375.png), [1280](screenshots/stage-3/card-code-reference-1280.png);
the summary in view after scrolling [375](screenshots/stage-3/summary-sticky-375.png), [1280](screenshots/stage-3/summary-sticky-1280.png);
compliant café [375](screenshots/stage-3/cafe-compliant-375.png), [1280](screenshots/stage-3/cafe-compliant-1280.png);
with Seattle's records [375](screenshots/stage-3/with-records-375.png), [1280](screenshots/stage-3/with-records-1280.png)
(without them: the top screenshots above, "not loaded on this server");
delete confirmation [375](screenshots/stage-3/delete-confirm-375.png), [1280](screenshots/stage-3/delete-confirm-1280.png).
