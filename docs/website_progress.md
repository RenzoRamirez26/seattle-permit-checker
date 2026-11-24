# Website progress: Seattle Permit Pre-Check

Built on the branch `website-v1` from `docs/website_plan.md`, following `docs/prompts/03-build.md`.
Started 24 November 2026. Each stage ends with `python -m pytest`, `npm test`, `npm run e2e` (which runs
axe on every page and state), the build guard, a design review against brief section 12 and the Vercel
Web Interface Guidelines, screenshots, this file, a commit and a push.

## Status

| Stage | Status | Screenshots |
|---|---|---|
| 0. Skeleton | Finished | [stage-0](screenshots/stage-0/) |
| 1. Check what we read | Not started | |
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
