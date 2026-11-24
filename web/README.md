# web/: the Seattle Permit Pre-Check website

A static Next.js site (`output: "export"`) that talks to the FastAPI backend in `../api/` and nowhere else.
It holds no rules, no code values and no key: it displays what the API returns. The plan is
`../docs/website_plan.md`; the design tokens are `../DESIGN.md`; progress is in `../docs/website_progress.md`.

## Run it on your computer

Needs Node 22.22.2 or newer. On the project's Intel Mac, Node is in `~/.local/node-v22.23.5-darwin-x64/bin`; if `npm`
is not found, run `export PATH="$HOME/.local/node-v22.23.5-darwin-x64/bin:$PATH"` first.

```bash
# once
cd web && npm ci

# the API (from the repository root, in its own terminal)
uvicorn api.main:app --reload            # http://localhost:8000, allows http://localhost:3000

# the site
cd web && npm run dev                    # http://localhost:3000
```

Without a Claude API key the API still serves the three example plans, runs checks and answers
questions from templates. Reading an uploaded plan needs `ANTHROPIC_API_KEY` on the server (never here).
Point the site at another API with `NEXT_PUBLIC_API_BASE=https://… npm run build`.

## Tests and checks

| Command | What it does |
|---|---|
| `npm test` | Vitest unit and component tests, reading `tests/fixtures/` (no server) |
| `npm run e2e` | Playwright: starts uvicorn with no key, builds and serves `out/`, runs the flows and axe |
| `npm run screenshots` | The same, and writes screenshots at 375 and 1280 px to `../docs/screenshots/<stage>/` |
| `npm run guard` | The build guard (also runs before and after `npm run build`, and from `python -m pytest`) |
| `npm run lint`, `npm run typecheck` | ESLint (with the guard's import rules) and TypeScript |
| `sh scripts/openapi.sh` | Regenerates `src/api/schema.d.ts` from the API (`--check` to compare) |
| `python scripts/make-fixtures.py` | Regenerates `tests/fixtures/` from the API with no key (`--check` to compare) |

The guard fails on: a rulebook number next to a unit, a code section, a comparison on a measured fact,
the status literals outside `components/results/status.ts`, an import of the rulebook or `checker/`,
anything that calls a model, a request to a host other than the API, browser speech recognition,
and any way to insert HTML. Exceptions live in `scripts/guard-allow.json`, each with a reason.
