# Website verification (session 4)

24 November 2026. Carried out from `docs/prompts/04-verify.md` on `website-v1` at `d8c5509` ("Website stage 6:
voice"). Model check: this session reports `claude-opus-5-5` (configured and last served), so the session went ahead.

**Branch.** The work started from `website-v1`. This environment may push only to
`claude/verify-prompt-docs-8e5w32`, so the report and the one fix are on that branch, which is `website-v1` plus
two commits. Merge or cherry-pick them into `website-v1`, or let a session with permission push there.

**In short.** Every test suite passes. For all three demo plans, the API's result is the same as calling
`checker/audit.py` directly, and the website shows the same counts. axe reports no violations and no
"incomplete" results on 26 page states (13 states × 2 widths), best-practice rules included. Nothing in `web/` or
the built site contains a building-code number, pass/fail logic, a model call or a key. One accessibility issue was
fixed: the Ask button could partly cover the control that has keyboard focus. Two defects and a few design questions
were left for you (see [What still needs you](#what-still-needs-you)); the owner's choices were then made, and both
defects and F2–F7 are fixed (see [Fixes after the report](#fixes-after-the-report)). The real-model check was **not run**:
`ANTHROPIC_API_KEY` is not set in this environment.

| # | Check | Result |
|---|---|---|
| 1 | Test suites | Pass. pytest 154 passed, 1 skipped; Vitest 38; Playwright 56 before, 57 after the fix |
| 2 | API vs `checker/audit.py`, three demo plans | Pass: no differences in findings, permits, summary, zoning or facts |
| 3 | Every page at 375 and 1280 px; flow with the assistant closed; keyboard only | Pass, with two defects found (D1, D2) |
| 4 | Code numbers, pass/fail logic, model calls, keys in `web/` and `web/out/` | Pass: none found |
| 5 | Brief §12 and the website plan's guards | 8 of 9 pass. Fails: "every action by keyboard" (fixed); D2 is a flow defect |
| 6 | Design review and axe | axe clean; one guideline issue fixed (F1); D1, D2 and seven smaller findings listed |
| 7 | Real model through the API | **Not run**: no `ANTHROPIC_API_KEY` in this environment |

---

## 1. Test suites

Run on `website-v1` before any change, then again after the fix.

| Command | Before | After the fix |
|---|---|---|
| `python -m pytest` | 154 passed, 1 skipped (real faster-whisper test: not installed here) | 154 passed, 1 skipped |
| `npm test` (Vitest) | 38 passed | 38 passed |
| `npm run e2e` (Playwright, real API with no key) | 56 passed | **57 passed** (1 new test, see F1) |
| `npm run lint`, `npm run typecheck` | clean | clean |
| `npm run guard` (src), guard on `out/` | clean, clean | clean, clean |
| `python scripts/make-fixtures.py --check` | 36 fixtures match the API | |
| `sh scripts/openapi.sh --check` | `schema.d.ts` matches the API | |

## 2. Through the API vs `checker/audit.py`

The backend ran as `uvicorn api.main:app` with no key, no Seattle database and a temporary check store. The front end
was the static export served on port 3000. For each demo case, `docs/verification/compare_api.py` does four things:

1. Reads the plan through `POST /api/plans/read`.
2. Posts the returned facts to `POST /api/checks` with the case's own intake and zone.
3. Fetches the result again with `GET /api/checks/{id}`.
4. Compares every field with `checker.audit.audit()` called directly on the same extraction.

It also ran `python -m checker.audit --extraction demo/flawed_extraction.json --business cafe_restaurant --cooking --zoning "NC2-55 (M)"`.

| Case | audit (fix / city / OK) | API | Website counts sentence | Findings | Permits | Differences |
|---|---|---|---|---|---|---|
| Café with planted problems | 11 / 2 / 6 | 11 / 2 / 6 | "11 things to fix before you apply, 2 to check with the city, 6 fine." | 19 (19 cards shown) | 12 | none |
| Café that passes | 0 / 0 / 17 | 0 / 0 / 17 | "0 things to fix …, 0 to check with the city, 17 fine." | 17 (17 shown) | 12 | none |
| Hair salon with planted problems | 3 / 2 / 5 | 3 / 2 / 5 | "3 things to fix …, 2 to check with the city, 5 fine." | 10 (10 shown) | 7 | none |

**Every difference found:**

- The reading from `/api/plans/read` equals the saved extraction once both go through `schemas.Facts`: no difference.
- `summary`, `findings` (every field, in order), `permits_likely_required`, `zoning`, `code_basis`, `disclaimer` and
  the stored `extraction` are identical.
- The only key that differs is `local_review_data`. The API's response model always includes it (`null` here, since
  this server has no Seattle database); `audit()` leaves it out. The value carries no information either way.
- The command-line run gives the same 11 / 2 / 6 for the flawed café.

The website numbers come from the flow in check 3: Start, step 1 answered, a real upload, then the example plan, the
check, and the results. They were run at 375 and 1280 px, six runs in all. Each fix-list PDF link returned
`200 application/pdf`.

## 3. Pages, flow, keyboard

Screenshots are in [`docs/screenshots/verify/`](screenshots/verify/), each at 375 and 1280 px, full page, 2×
(quantized to 256 colours to keep the repository small). The script is `docs/verification/walk.mjs`.

| Page or state | 375 | 1280 |
|---|---|---|
| Start | [375](screenshots/verify/start-375.png) | [1280](screenshots/verify/start-1280.png) |
| Step 1 | [375](screenshots/verify/business-375.png) | [1280](screenshots/verify/business-1280.png) |
| Step 1 with errors | [375](screenshots/verify/business-errors-375.png) | [1280](screenshots/verify/business-errors-1280.png) |
| Step 1, assistant open | [375](screenshots/verify/business-assistant-open-375.png) | [1280](screenshots/verify/business-assistant-open-1280.png) |
| Step 2 | [375](screenshots/verify/plan-375.png) | [1280](screenshots/verify/plan-1280.png) |
| Reading, opened with no file | [375](screenshots/verify/reading-no-file-375.png) | [1280](screenshots/verify/reading-no-file-1280.png) |
| Step 3 (café reading) | [375](screenshots/verify/check-375.png) | [1280](screenshots/verify/check-1280.png) |
| Step 3, "Enter the measurements yourself" | [375](screenshots/verify/check-enter-yourself-375.png) | [1280](screenshots/verify/check-enter-yourself-1280.png) |
| Results | [375](screenshots/verify/results-375.png) | [1280](screenshots/verify/results-1280.png) |
| Results, code reference open | [375](screenshots/verify/results-code-reference-375.png) | [1280](screenshots/verify/results-code-reference-1280.png) |
| Results, assistant open | [375](screenshots/verify/results-assistant-open-375.png) | [1280](screenshots/verify/results-assistant-open-1280.png) |
| Help | [375](screenshots/verify/help-375.png) | [1280](screenshots/verify/help-1280.png) |
| Not found | [375](screenshots/verify/not-found-375.png) | [1280](screenshots/verify/not-found-1280.png) |
| D2: enter yourself after an example (viewport) | | [1280](screenshots/verify/enter-yourself-after-example-1280.png) |

**The whole flow with the assistant closed:** pass, for all three demo plans at both widths. The steps were:

1. Start, then Start.
2. Step 1: business type, cooking, alcohol No, zone.
3. Continue.
4. Step 2: choose the plan PNG and press Read my plan. The real API answers `503 no_model_key`, and the page shows
   "This server cannot read uploaded plans yet. Try an example plan, or enter the measurements yourself."
5. "Try the example plan: …"
6. Step 3, then Run the check.
7. Results, then the fix-list PDF (200).

No request went to `/ask` and the panel never opened. Voice was never used. This server has no faster-whisper, so
the microphone is hidden.

**Keyboard only:** pass. Every step used only Tab, Space, arrow keys, Enter, typing and Escape, at 1280 px:

| Step | Keys |
|---|---|
| Start | 3 Tabs to Start, then Enter |
| Business type | Tab, Space on "Café or restaurant" |
| Cooking | Tab, Space on Yes |
| Alcohol | Tab, then the right arrow for No |
| Zone | 2 Tabs to the zone field, then type it |
| Continue | Enter |
| Step 2 | Tab to "try an example plan", Enter, then Tab and Enter on the café example on Start |
| Step 3 | 26 Tabs through every Change button to Run the check, then Enter |
| Results | Tab to "Show the code reference" and Enter; Tab to "Download the fix list (PDF)" and Enter (opens in a new tab) |
| Assistant | Tab to Ask and Enter: focus moves into the panel. Escape closes it and focus returns to Ask. |

Every Tab stop had a visible focus ring. The one exception is the page `h1`, which receives focus from the script
when a page arrives (`tabindex="-1"`); you cannot Tab to it. Before the fix, several stops were partly under the
Ask button (F1).

## 4. Search of `web/` and the built site

The project's guard (`npm run guard`, `guard.mjs out`) passed. A separate search with `grep` over `web/src`,
`web/scripts`, the config files, `web/public` and `web/out` found:

| Looked for | Found |
|---|---|
| `anthropic`, `sk-ant`, `x-api-key`, `openai`, `@ai-sdk`, `api_key`, `apikey`, `SpeechRecognition` | Only the **name** of the boolean feature flag `features.model_api_key` from `/api/meta` (`StartPage.tsx:74`, `PlanPage.tsx:107`, `schema.d.ts`, two built chunks). The flag says whether the *server* has a key, not the key itself. One doc comment in MapLibre's bundled dev build (`'X-Api-Key': 'my-key'`, a library example). No key, no model client, no model id. |
| Code sections (`SBC`, `IBC`, `IFC`, `UPC`, `SMC`, `ADA`, `Table 10xx`, `Section 10xx`, `§`) | None in `src/`. In `out/`, only byte matches inside PNG and font files. |
| A number next to a unit (`in`, `ft`, `sq ft`, `occupants`, `%` …) | Only the CSS width `max-w-[90%]` (`Assistant.tsx:427`). The one other number in `src/content` is the example address "1420 5th Ave". |
| `"pass"`, `"fail"`, `"review"` literals | Only in `components/results/status.ts`, which maps a status sent by the API to its word and icon. An unknown status maps to `review` ("Check with the city"), never to OK. |
| Comparisons on measured facts | None. |
| Requests to hosts other than the API | None; the only URL in `src/` is the default API base `http://localhost:8000`. |

Nothing to fix.

## 5. Brief §12 and the plan's guards

### Brief section 12

| Item | Result | How it was checked |
|---|---|---|
| Every action with the keyboard alone, focus always visible | **Failed, fixed** | Keyboard-only run (check 3). The run passed, but tabbing on `/check` (both widths) and on `/plan` and `/results` at 375 px stopped on controls up to 62% under the fixed Ask button. Fixed in F1, with a new e2e test. |
| No accessibility checker errors | Pass | axe 4.x with `wcag2a/aa`, `wcag21a/aa`, `wcag22aa` and `best-practice`: 0 violations, 0 incomplete on all 26 states. |
| Every field has a visible label; errors beside the field and in the summary | Pass | Step 1 error state: summary links plus a message above the group (screenshot). No input relies on a placeholder. |
| Contrast 4.5:1 text, 3:1 large text and outlines | Pass | axe `color-contrast` passes everywhere. The colours are the ones `DESIGN.md` lists with calculated ratios; no new pairs were found. |
| Touch targets ≥ 44 px on phones | Pass | Every visible control measured at 375 px on all 13 states (inline links in sentences excepted, per WCAG 2.5.8). |
| 320 px with no sideways scroll | Pass | `scrollWidth − clientWidth = 0` at 320 px on all 13 states. |
| Flow completes with the assistant closed and voice off | Pass | Check 3, all three demo plans, both widths. |
| A refresh keeps what was entered | Pass | Covered by the e2e suite (step 1, step 3 edited facts); the repro in check 3 also reloaded `/plan` with the answers kept. |
| Screenshots at 375 and 1280 px | Pass | `docs/screenshots/verify/`. |

### Guards in `docs/website_plan.md` section 5

Each guard was tested by planting a violating file in `web/src/` (or `web/out/`), running the guard, and removing it.

| Guard | Planted | Result |
|---|---|---|
| A building-code number | `"door must be 32 inches"` | Pass: caught ("code-number") |
| A code section | `"SBC 1006.2.1"` | Pass: caught ("code-section") |
| Pass/fail logic | `f.clear_width_in < 32 ? "fail" : "pass"` | Pass: caught ("decision") |
| Rulebook / `checker/` import | `import rules from "../../checker/rules/seattle.json"` | Pass: caught ("rulebook-import") |
| A model call | `import Anthropic from "@anthropic-ai/sdk"` | Pass: caught ("model-call") |
| A request to another host | `fetch("https://example.com/x")` | Pass: caught ("other-host") |
| A key in the build | `"sk-ant-xxxx"` in `out/` | Pass: caught ("key-in-build") |
| Audio sent anywhere but our backend | `webkitSpeechRecognition` | Pass: caught ("speech-recognition") |
| Model output as HTML | `el.innerHTML = t` | Pass: caught ("raw-html"); Vitest also renders a planted `<img onerror>` answer as text |
| `guard-allow.json` exceptions | | Pass: the file is empty (`[]`) |
| Generated types and fixtures match the API (§4) | | Pass: both `--check` commands match |
| Stage review (brief §12, Vercel, axe) | | Pass: see the table above and check 6 |
| Unknown never becomes a pass | | Pass: `status.ts` maps unknown statuses to "Check with the city"; pytest covers `null` intake answers → `review` |
| The assistant never opens by itself | | Pass: e2e test, and no `/ask` request in any flow run |

## 6. Design review and axe

**axe:** 0 violations and 0 incomplete on every page and state, at both widths, with the WCAG 2.2 AA and
best-practice tags. Nothing needs a manual look.

**Automated measurements (all 26 states).** No `transition: all`. No text input under 16 px. Every page has exactly
one `h1` and no skipped heading levels. `lang` is set. No "please", "sorry", "invalid" or "oops". No `...` (`…` is
used). No "Next", "Submit" or "Click here" buttons. Only weights 400 and 600. Fonts are Plex Sans everywhere, Plex
Serif only on Start, and Plex Mono for measurements and codes. No centred paragraphs. A Back link on every step. One
main button per page.

Findings, against brief §12 and the Vercel Web Interface Guidelines:

| # | Finding | Where | Kind | Status |
|---|---|---|---|---|
| F1 | A focused control could sit partly (up to 62%) under the fixed Ask button. WCAG 2.4.11 (AA) still passed because nothing was fully hidden; Vercel "nothing fixed covers focus" and WCAG 2.4.12 (AAA) did not. | `/check` at 375 and 1280; `/plan` and `/results` at 375 | Accessibility | **Fixed** (`751bbff`) |
| D1 | **A value breaks in the middle of a word**: "Ye / s" for "Cooking that makes grease or smoke (fryer, grill, range)". In `FactRow.tsx:96–98` both `<dt>` and `<dd>` are `min-w-0` with `break-words`, so a long label squeezes the value narrower than one word. | `/check`, kitchen row, 1280 (and any long label) | Layout defect | **Fixed** (`afc5528`) |
| D2 | **"Enter the measurements yourself" can open someone else's facts.** If an example plan was read earlier in the tab, then the owner uploads their own plan and the upload fails, "Enter the measurements yourself" opens `/check` with the *example café's* facts. They are still labelled "The saved reading for this example plan", not an empty form. `CheckPage.tsx:35–37` only starts empty when nothing is stored. Running the check would check the café's plan, not the owner's. | step 2 → `/check/?enter=yourself` | Flow defect | **Fixed** (`16d6307`) |
| F2 | An example plan chosen on step 2 replaces the owner's step-1 answers with the example's own (`ReadingPage.tsx:26–27`), with no message. Also, on a server with no key, step 2's "try an example plan" link goes back to Start rather than listing the examples. | step 2 | Design | **Partly fixed** (`366379b`): the notice. The no-key link to Start is unchanged |
| F3 | No favicon: every first page load logs a 404 for `/favicon.ico`. | all pages | Polish | **Fixed** (`74e3f13`) |
| F4 | The not-found page's `<title>` is just "Seattle Permit Pre-Check"; Vercel asks for a title per page. | 404 | Polish | **Fixed** (`9fbdcb3`) |
| F5 | The plan `<img>` on step 3 has no `width`/`height`, so the layout can shift when the image arrives. | `/check` | Polish | **Fixed** (`47155a5`) |
| F6 | The build emits MapLibre's development bundles (`maplibre-gl-dev…mjs` 2.5 MB, `maplibre-gl-worker-dev…mjs` 1.3 MB) beside the production ones. This session did not check whether any page requests them. | `web/out/_next/static/media/` | Size | **Fixed** (`fb30fcf`): no page requested them |
| F7 | Step 1 with an error outlines all six business cards in red, plus the message and the summary. That meets the brief, but it is a lot of red for one missing choice. | step 1 errors | Design | **Fixed** (`27605fa`) |
| F8 | Page navigation shows an empty `<main>` for about 0.3–0.8 s while the next page hydrates; the heading then receives focus. Keys pressed in that moment are lost. That is how this session's first keyboard script failed, before it waited for the heading. No error results. | every client-side step change | Observation | No action suggested |

## 7. Real model

**Not run.** `ANTHROPIC_API_KEY` is not set in this environment, so `demo/flawed_plan.png` was not read with the real
model and the assistant was not asked questions through the model. The assistant's template answers are covered by
the e2e suite. Still outstanding from stage 6: a spoken question with a real microphone in Chrome and Safari, on a
server with faster-whisper.

## Fixes made

| Commit | What | Why |
|---|---|---|
| `751bbff` | `scroll-padding-bottom: 96px` on `html` in `web/src/styles/tokens.css` (the Ask button is 64 px tall and 16 px from the edge). New e2e test in `tests/e2e/assistant.spec.ts`: tab through `/check` at 375 and 1280 px and assert that no focused control overlaps the Ask button. The test fails without the fix (7 covered controls at 375 px) and passes with it. | F1. After the fix, re-measured on every page at 375×812, 1280×900 and 1280×640: nothing covered. |

No test failures, no axe errors, and no rule numbers, model calls or keys needed fixing.

## What still needs you

*Written before the fixes. Items 1 to 6 have since been done as listed in
[Fixes after the report](#fixes-after-the-report), with two exceptions: item 1's second change (clearing the stored
reading when a new file is chosen) was not made, since the first fixes D2 on its own; and the second half of item 3
(step 2's no-key link) is unchanged. Item 7 is still open.*

Recommendations, in order:

1. **D2, stale facts (correctness).** Make `?enter=yourself` always start from empty facts, and clear the stored
   reading when the owner chooses a new file. The second change alone would also fix it. Without this, an owner can
   unknowingly check an example plan's measurements.
2. **D1, broken word.** In `FactRow.tsx:98`, remove `min-w-0` from the `<dd>`. A flex item then cannot shrink below
   its longest word, so the label wraps instead. Add a Vitest or Playwright check that a short value never wraps.
3. **F2.** Keep the owner's step-1 answers when they pick an example from step 2, or say on the link that the example
   uses its own answers. On a no-key server, list the three examples on step 2 directly, as the failed-upload state
   already does.
4. **F3–F5.** Add a plain favicon. Give the 404 page "There is no page at this address | Seattle Permit Pre-Check".
   Set the plan image's `width`/`height` (or `aspect-ratio`) once it loads.
5. **F6.** Check whether any page requests the MapLibre `-dev` bundles. If none does, configure the bundler to stop
   emitting them (about 3.8 MB of the 11 MB `out/`).
6. **F7.** My recommendation is to keep the red on the group's message and the summary, and use the normal field
   border on the cards. It is your call.
7. **Real-model check** (check 7), on a machine with a key. **Voice in Chrome and Safari** with a real microphone
   (from stage 6).

## Fixes after the report

23 November 2026, on `website-v1` after merging this branch (`c36a453`), from the owner's list. One commit per fix,
each with a test; every new test except F3's and F4's was also run against the old code and failed there. F3 (favicon)
and F4 (404 title) assert something that did not exist before.

| Commit | Item | What changed | Test |
|---|---|---|---|
| `16d6307` | D2 | `?enter=yourself` always starts a new, empty manual entry, even when an earlier or example reading is stored, then drops the parameter so a refresh keeps what was typed (`CheckPage.tsx`). | e2e `check.spec.ts` "D2": example café read, upload fails, "Enter the measurements yourself": empty facts, no example plan; a door added survives a refresh. |
| `afc5528` | D1 | `min-w-0` removed from the value `<dd>` in `FactRow.tsx`; the label wraps and the value cannot shrink below its longest word. Checked by eye at 375 px: "Cooking that makes grease or smoke (fryer, grill, range)" wraps over two lines, "Yes" stays whole. | e2e "D1", all three demo readings at 375 and 1280 px: every one-word value is on one line; no sideways scroll at 320 px. |
| `366379b` | F2 | When an example plan replaces answers the owner gave on step 1, the owner's answers are kept aside in sessionStorage (`flow.setExampleBusiness`). Step 3 shows "The example plan uses its own answers", naming them (business type, the questions that type must answer, the zone or address), with a link to step 1 and **Keep my answers**, which puts the owner's answers back and says so. A second example never overwrites the owner's kept answers with the first example's; answering step 1 again forgets them. Screenshots: [375](screenshots/verify/check-example-answers-notice-375.png), [1280](screenshots/verify/check-example-answers-notice-1280.png). | Vitest `example-answers.test.tsx` (7). e2e "F2" (2): retail + NC3-75, then the café example: the notice, axe, Keep my answers, and the check request then carries `retail` and `NC3-75`; no notice when step 1 was never answered. |
| `74e3f13` | F3 | A plain floor-plan mark in blueprint blue: `src/app/icon.svg`, and the same mark as `src/app/favicon.ico`. `serve-out.mjs` serves `.ico` as `image/x-icon`. | e2e "F3": both icons 200; a first load has no 404. |
| `9fbdcb3` | F4 | `not-found.tsx` exports its title: "There is no page at this address \| Seattle Permit Pre-Check". | e2e "F4": status 404, h1, title. |
| `47155a5` | F5 | `copy-demo.mjs` writes each example plan's pixel size into `public/demo/plans.json` (from the PNG header); an uploaded picture is decoded first. The `<img>` always has `width` and `height`. | e2e "F5": example and uploaded picture: attributes equal the natural size. |
| `fb30fcf` | F6 | No page requested the `-dev` bundles. They were copied because Turbopack follows MapLibre's own worker lookup (a `new URL()` built from a template path) and copies every `.mjs` file it could match. MapLibre's production `maplibre-gl.mjs` is now copied into `public/` beside its worker and imported from `/maplibre-gl.mjs`, outside the bundle. `out/` falls from 14 MB to 6.8 MB. | e2e "F6": the map draws from `/maplibre-gl.mjs`, nothing with `-dev` is requested, `out/` holds only the two production MapLibre files. |
| `27605fa` | F7 | As recommended: the cards keep their usual border; the message above the group and the summary still say what is missing. Screenshots: [375](screenshots/verify/business-errors-fixed-375.png), [1280](screenshots/verify/business-errors-fixed-1280.png). | e2e "F7": the message appears once in the group, the six card borders do not change, axe passes. |

**Suites after the fixes** (macOS, Node 22.23.5, Playwright's Chromium headless shell):

| Command | Result |
|---|---|
| `python -m pytest` | 154 passed, 1 skipped |
| `npm test` (Vitest) | 45 passed (38 + 7) |
| `npm run e2e` | 68 passed (57 + 11) |
| `npm run lint`, `npm run typecheck` | clean |
| guard on `src/` and `out/` (part of the build) | clean |

On the first, baseline run on this Mac, 4 voice tests failed: pressing Speak never started a recording, and a bare
`getUserMedia` call with Chromium's fake-microphone flags hung. That points at the macOS microphone permission for the
test browser, not the code. The same 4 tests passed in the full run after the fixes, with no change to voice code.

**Still open:** step 2's "try an example plan" link on a server with no key still goes to Start (the second half of
F2), the real-model check (check 7), and voice with a real microphone in Chrome and Safari.

## Reproducing

```bash
# terminal 1, from the repository root: the API with no key
PYTHON_DOTENV_DISABLED=1 ANTHROPIC_API_KEY= PERMIT_STT=off PERMIT_CHECKS_DB=/tmp/v/checks.sqlite \
  PERMIT_SEATTLE_DB=/tmp/v/none.sqlite PERMIT_CORS_ORIGIN=http://127.0.0.1:3000 \
  python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
# terminal 2: the static site
cd web && NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000 npm run build && node scripts/serve-out.mjs 3000
# terminal 3, from the repository root
python docs/verification/compare_api.py http://127.0.0.1:8000
node docs/verification/walk.mjs http://127.0.0.1:3000 http://127.0.0.1:8000 /tmp/v/shots /tmp/v/walk.json
```
