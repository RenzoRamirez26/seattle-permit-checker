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
| 2. Start, business, plan, reading | Not started | |
| 3. Results and downloads | Not started | |
| 4. The assistant | Not started | |
| 5. The map | Not started | |
| 6. Voice | Not started | |

## Backend changes

| Change | Files | Tests |
|---|---|---|
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
