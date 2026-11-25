# Launching PermitOS

What you run, in order, to put the site on the internet. Nothing here has been deployed yet: the image was built and
the site was served on one computer, and every check below that says "test" ran there (see the launch-readiness pull
request). Background: `docs/deployment_kit.md`.

```
Browser ──HTTPS──> static site (Vercel, or Netlify)        web/out: HTML, JS, CSS, fonts, the demo plans, map tiles
   │
   └─────HTTPS──> API (Docker on Render, or Fly, or Railway)  api/ + checker/ + pipeline/, ffmpeg, faster-whisper
                       ├──> Claude API (Anthropic): reads plan pictures, writes assistant answers
                       ├──> US Census geocoder, then the City of Seattle zoning layer (Esri ArcGIS)
                       └──> Cloudflare Turnstile siteverify (only if switched on)
```

The host ends HTTPS and redirects HTTP to it, for both parts. (The API answers GET, not HEAD: use `curl -s -D - -o /dev/null`
rather than `curl -I` on it.) The API's browser origin, its rate limits and its daily
model cap are set with environment variables; nothing secret is ever built into the site.

## 1. Before you start (once)

- A domain, for example `permitos.example`. Plan for the site on `permitos.example` (and `www`) and the API on
  `api.permitos.example`.
- A production Claude API key in its own workspace, with a spend limit (section 5).
- An email address for the Privacy and Terms pages.
- Optional: a Plausible site (cookieless analytics) and a Cloudflare Turnstile widget (site key and secret).

## 2. Build Seattle's records into the image (optional, about 5 minutes)

```bash
python -m pipeline.run_pipeline --seattle          # writes data/permits.sqlite (about 1,600 permits)
```

The `Dockerfile` copies `data/permits.sqlite` into the image if it is there, and the API opens it read-only. Without
it, checks still run; the results just don't show Seattle's review records. Rebuild and redeploy to refresh it (for
example monthly).

## 3. The API

### Try the image on your computer first

```bash
docker build -t permitos-api .
docker run --rm -p 8000:8000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e PERMIT_CORS_ORIGIN=http://localhost:3000 \
  permitos-api
curl -s http://localhost:8000/api/health            # {"ok":true}
curl -s -D - -o /dev/null http://localhost:8000/api/meta   # security headers, no Server header
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/docs   # 404: docs are off in production
```

### Render (recommended: one file, a disk for checks)

1. Merge this branch. In Render: **New → Blueprint**, pick the repository. It reads `render.yaml`: a Docker web
   service on the Standard plan (2 GB: the speech model and PDF rendering need more than 512 MB), a 1 GB disk at
   `/data` for stored checks and the daily model count, and `/api/health` as the health check.
2. Type the secrets when Render asks: `ANTHROPIC_API_KEY`, `PERMIT_CORS_ORIGIN` (`https://permitos.example,https://www.permitos.example`),
   and `PERMIT_TURNSTILE_SECRET` if you use Turnstile (otherwise leave it empty).
3. Deploy. `autoDeploy` is off, so a push never deploys by itself: press **Manual Deploy** for each release.
4. **Settings → Custom Domains → Add** `api.permitos.example` (section 6).

### Fly.io (instead of Render)

```bash
fly launch --no-deploy --copy-config                # uses fly.toml: region sea, 2 GB, force_https
fly volumes create permitos_data --size 1 --region sea
fly secrets set ANTHROPIC_API_KEY=sk-ant-... PERMIT_CORS_ORIGIN=https://permitos.example,https://www.permitos.example
fly deploy
fly certs add api.permitos.example
```

### Railway (instead of Render)

New project → Deploy from GitHub → it finds the `Dockerfile`. Add a volume mounted at `/data`, set the variables in
section 4 (with `PERMIT_PROXY_HOPS=1`), and add the custom domain under **Settings → Networking**.

Run **one** instance: the rate limits are counted in each server's memory. If you ever need more, move the counts to
a shared store first.

## 4. Environment variables

`.env.example` lists every variable with a comment, and a test fails if the code reads one it doesn't list.

**API (host settings; the secrets are marked):**

| Variable | Set it to | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret.** The production key | none: uploads can't be read, the assistant uses its templates |
| `PERMIT_CORS_ORIGIN` | `https://permitos.example,https://www.permitos.example` | none in production: no browser may call |
| `PERMIT_ENV` | `production` (the image sets it) | `development` |
| `PERMIT_PROXY_HOPS` | `1` on Render, Fly and Railway | `0` |
| `PERMIT_DAILY_PLAN_READS` | Model calls that read uploads per UTC day: `6` for a $10-a-month spend limit (section 5, Budget) | `6` |
| `PERMIT_DAILY_ASK_CALLS` | Model calls that answer questions per UTC day: `5` (section 5, Budget) | `5` |
| `PERMIT_TURNSTILE_SECRET` | **Secret.** Only with Turnstile | off |
| `PERMIT_RATE_PLAN_READ`, `_ASK`, `_TRANSCRIBE`, `_ZONING`, `_CHECKS`, `_PDF` | `requests/seconds` per address | `10/600`, `30/600`, `30/600`, `30/600`, `30/600`, `60/600` |
| `PERMIT_CHECK_DAYS` | Days a check is kept | `30` |
| `PERMIT_MAX_UPLOAD_MB`, `PERMIT_MAX_PDF_PAGES`, `PERMIT_MAX_IMAGE_MEGAPIXELS`, `PERMIT_MAX_AUDIO_MB` | Upload limits | `10`, `10`, `40`, `2` |
| `PERMIT_API_DOCS` | `1` only to show `/docs` in production | off |
| `PERMIT_CHECKS_DB`, `PERMIT_SEATTLE_DB` | Set by the image | `/data/checks.sqlite`, `/app/data/permits.sqlite` |
| `SEATTLE_APP_TOKEN`, `PERMIT_VISION_MODEL`, `PERMIT_AGENT_MODEL`, `PERMIT_STT*`, `PERMIT_TTS*`, `PERMIT_MODEL_DIR` | Leave as they are | see `.env.example` |

**Site (build settings; none is secret, all are built into the pages, so change one and rebuild):**

| Variable | Set it to |
|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://api.permitos.example` |
| `NEXT_PUBLIC_SITE_URL` | `https://permitos.example` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | The address for Privacy and Terms (until set, the pages say "[contact email]") |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `permitos.example`, or leave empty for no analytics |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | Only for a self-hosted Plausible |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Only with Turnstile (with `PERMIT_TURNSTILE_SECRET` on the API) |

The build writes `NEXT_PUBLIC_API_BASE` (and Plausible and Turnstile, when set) into each page's
Content-Security-Policy, so the site can only talk to those addresses.

## 5. Spend cap and alerts at Anthropic

Three layers, from the outside in:

1. **In the Claude Console** (console.anthropic.com): make a workspace for production (**Settings → Workspaces**)
   and create the production key in it, so its spend is separate from development. Set that workspace's **spend
   limit** to the most you are willing to pay in a month; calls stop when it is reached. Under **Settings → Limits**
   check your organization's limit and rate limits, and set up email notifications for usage if your account offers
   them. Check these menu names when you do it: the console changes. For this site, set the limit to **$10 a month**
   (the budget below).
2. **`PERMIT_DAILY_PLAN_READS`** and **`PERMIT_DAILY_ASK_CALLS`** (defaults 6 and 5, from the budget below) on the
   API, counted separately per UTC day so questions can never block uploads. When the plan reads are used, the site
   says "Reading uploaded plans is paused for today" and offers the example plans and typing the measurements. When
   the asks are used, the assistant answers from its templates. Reading a plan is up to two calls; an answer is one.
3. **Rate limits** per address (section 4) stop one visitor or script from using the day's calls.

Look at the Console's usage page daily for the first week and adjust the caps.

### Budget

The account's Anthropic spend limit is **$10 a month**. The daily caps are chosen so that a month at both caps stays
under **$9**, leaving $1 for development calls and for calls dearer than the ones measured.

**Which calls the API makes.** Each goes through `limits.counted` and counts against its own daily cap:

| Call | Code | Model | `max_tokens` | Thinking | Daily cap |
|---|---|---|---|---|---|
| Plan reading (one picture, one `record_floor_plan` tool) | `checker/extract.py` | `claude-sonnet-5-5` (`PERMIT_VISION_MODEL`) | 4,000 | the model's default (adaptive) | `PERMIT_DAILY_PLAN_READS` |
| Assistant answer (the audit as context, up to 6 earlier turns) | `checker/agent.py` | `claude-sonnet-5-5` (`PERMIT_AGENT_MODEL`) | 1,000 | off: `{"type": "between_tools"}` | `PERMIT_DAILY_ASK_CALLS` |

`max_tokens` covers thinking and the reply together. Sonnet 5.5 thinks by default and rejects
`thinking: {"type": "disabled"}`. `between_tools` is its documented lowest setting (no other field, effort `high` or
below; <https://platform.claude.com/docs/en/build-with-claude/thinking>). `checker/agent.py` sends it only to
`claude-sonnet-5-5`, because other models reject it. The system prompt asks for at most 120 words, in plain language,
starting with what to do (CONTENT.md). `max_tokens` is 1,000 so that a longer reply is not cut off mid-sentence.

A plan reading is up to two calls: if the model does not call the tool, the request is sent once more. The example
plans never call the model: they always use their saved readings, and the API no longer accepts a flag to read them
with the model (`tests/test_api_security.py`).

**Measured on 24 November 2026**, one call of each against the real API. Token counts are from the response's `usage`
field; prompt caching was not used (cache reads and writes were 0):

| Call | What was sent | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| Plan reading | `demo/flawed_plan.png` (1308 x 1494 px), cafe with cooking | 4,971 | 1,685 | $0.0268 |
| Assistant answer | "What should I fix first, and which permits will I need?" about `demo/flawed_extraction.json`, cafe with cooking, NC2-55 (M), with Seattle's review data | 7,695 | 210 (101 words, ended on its own: `end_turn`) | $0.0175 |

Earlier answers that day, now fixed, are kept here for the record:

- Before thinking was switched off: 7,652 in, 500 out ($0.0203). All 500 tokens went to thinking, so the reply had no
  text and the site used the template. A reply with no text is now logged (model, stop reason and block types; never
  the question or the answer) and still falls back to the template.
- With thinking off but `max_tokens` 500 and no length limit in the prompt: 7,592 in, 500 out ($0.0202). The text
  was grounded but stopped mid-sentence.

**Price:** Claude Sonnet 5.5 is $2 per million input tokens and $10 per million output tokens (Anthropic's pricing
page, read 24 November 2026: <https://platform.claude.com/docs/en/about-claude/pricing>). So:

    plan reading call          4,971 x $2/M + 1,685 x $10/M = $0.0099 + $0.0169 = $0.026792
    answer as measured         7,695 x $2/M +   210 x $10/M = $0.0154 + $0.0021 = $0.017490
    answer at max_tokens       7,695 x $2/M + 1,000 x $10/M = $0.0154 + $0.0100 = $0.025390

The plan reading is still the dearest call, even against an answer that uses all 1,000 tokens. So one combined cap
would have stayed at floor($9 / ($0.026792 x 31)) = **10**. The cap is now split in two instead.

**The two caps.** Questions can never use up the calls that read uploads, because each kind has its own counter:

    plan_reads x $0.026792 x 31  +  asks x $0.025390 x 31  <=  $9
    6 x $0.026792 x 31 = $4.98     5 x $0.025390 x 31 = $3.94     total $8.92

| Variable | Default | When it is used up |
|---|---|---|
| `PERMIT_DAILY_PLAN_READS` | 6 | Reading an upload says "Reading uploaded plans is paused for today" and offers the example plans and typing the measurements |
| `PERMIT_DAILY_ASK_CALLS` | 5 | The assistant answers from its templates, still only from the result |

One more of either goes over $9 (7 and 5: $9.75; 6 and 6: $9.71), so this is the largest split that fits. Another
split also fits, for example 7 and 4 ($8.96) or 5 and 6 ($8.88). This one favours uploads: **6 plan-reading calls are
at least 3 uploaded plans a day** (a plan is up to two calls), and up to 6 when each is read on the first try.
**5 answers** a day come from the model, and every question after that gets a template answer. The example plans
and typed measurements don't count against either cap.

`tests/test_budget.py` records these numbers. It prices an answer at the agent's own `MAX_TOKENS`, and it fails if a
month at the default caps reaches $9, if one more of either cap would still fit, or if an answer gets dearer than a
plan reading. Measure again and update the test and this section when the model, its price, a prompt or a
`max_tokens` changes.

Limits of this estimate:

- It is one measured call of each. A bigger or busier plan, a longer conversation, or a reading that uses more of
  its 4,000 output tokens costs more. If every plan-reading call used all 4,000 (4,971 x $2/M + 4,000 x $10/M =
  $0.0499), a month at both caps would be 6 x $0.0499 x 31 + $3.94 = $13.23. The Console spend limit (step 1) is what
  stops that; the daily caps only keep an ordinary month under it.

**Where the assistant's input comes from (a later cost lever).** Every question sends about **7,700 input tokens**:
88% of the measured answer's cost, and 61% of an answer that uses all 1,000 output tokens. Counted with the
token-counting endpoint for the check measured above (19 findings), it is the system prompt plus the check as JSON
(`agent.build_context`):

| Part | Tokens | What it is |
|---|---|---|
| System prompt (`agent.SYSTEM`) | 619 | The instructions: answer only from the audit, cite rule ids, no new numbers, at most 120 words |
| Findings | 4,360 | Each of the 19 findings: title, status, severity, detail, fix, citation, check level, reviewer. The rulebook (`checker/rules/seattle.json`) is not sent itself: its wording, numbers and citations reach the model through these findings |
| Permits likely required | 942 | The permit list with agencies |
| Seattle's review records | 750 | Review data for similar build-outs |
| Occupant load by space | 376 | |
| Zoning | 165 | |
| Summary, code basis, toilets, rule levels, disclaimer | 462 | |
| Question and tags | about 20 | |

Earlier turns add up to about 6 x 1,000 characters more. None of these has been done yet:

- send only the findings that are not a pass
- drop the `indent` from the JSON
- cache the system prompt and the check. The check is the same for every question about it. On Sonnet 5.5 a cache
  read is $0.10 per million tokens and a 5-minute write is $2.50.

Each one changes what the model sees, so measure answers again before and after.

## 6. DNS and the custom domain

1. **Site on Vercel:** Project → Settings → Domains → add `permitos.example` and `www.permitos.example`. At your DNS
   provider, add the records Vercel shows (usually an `A` record for the bare domain and a `CNAME` for `www`). Vercel
   issues the certificate and redirects HTTP to HTTPS. Choose one of the two as the main address and redirect the other.
   **Netlify instead:** Domain management → Add a domain, then the records Netlify shows.
2. **API:** at your DNS provider, a `CNAME` from `api.permitos.example` to the address Render (or Fly, or Railway)
   shows for the service. Wait until the host says the certificate is issued.
3. Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_API_BASE` to the new addresses and redeploy the site; set
   `PERMIT_CORS_ORIGIN` to the site's addresses and redeploy the API.
4. Optional, after a month without problems: HSTS preload (hstspreload.org). It is hard to undo, so it is not on now.

## 7. The site

### Vercel (recommended)

New Project → import the repository → **Root Directory `web`**. Framework: Next.js (detected); the build command
and output are the defaults (`npm run build`, the static export in `out/`). Add the site variables from section 4
for Production, then deploy. `web/vercel.json` adds the security headers to every response.

### Netlify (instead of Vercel)

New site → import the repository → **Base directory `web`**. `web/netlify.toml` sets the build command, the `out/`
folder, Node 22 and the same headers.

`npm run build` runs the guard before and after the build; a build with a key-shaped string, a code number or a
model call in the site fails.

## 8. Ten-minute smoke test after each deploy

Use a real plan you are allowed to share, and a real Seattle address.

```bash
SITE=https://permitos.example; API=https://api.permitos.example
curl -sI $SITE/ | grep -iE "^(HTTP|content-security-policy|strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy)"
curl -s $SITE/ | grep -o '<meta http-equiv="Content-Security-Policy"[^>]*' | head -c 300; echo
curl -sI http://permitos.example/ | head -3                       # 301 or 308 to https
curl -s -D - -o /dev/null $API/api/meta | grep -iE "^(HTTP|content-security-policy|strict-transport|x-content-type|cache-control)"
curl -s $API/api/health                                            # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" $API/docs                 # 404
curl -s -D - -o /dev/null -H "Origin: https://evil.example" $API/api/meta | grep -i access-control || echo "no CORS for other sites: good"
curl -s $SITE/robots.txt; curl -s $SITE/sitemap.xml | head -5
curl -s -o /dev/null -w "%{http_code}\n" $SITE/no-such-page/      # 404, and the page says "There is no page at this address"
```

Then in a browser:

1. **Chrome, desktop.** Start → "Start the pre-check" → upload the real plan → check the readings, correct one →
   Run the check. Results show; the PDFs download. Open the assistant and ask "What should I fix first?".
2. **Address.** On step 1, a real Seattle address shows a zone and the map; results have a Zoning tab.
3. **Voice in Chrome.** Start voice input, ask a question: the words appear live (on this device). Answer read aloud.
4. **Voice in Safari (Mac or iPhone).** Start voice input: Safari records, the words appear after a moment (our
   server). Allow the microphone when asked.
5. **Privacy and Terms** in the footer: the contact address is yours, not "[contact email]".
6. **Delete** the check from the results page; its link then says the check is no longer kept.
7. **Analytics**, if switched on: Plausible shows the page views and one "Check completed".
8. DevTools console on each page: no "Content Security Policy" errors.

If anything fails: roll back the site in Vercel (Deployments → Promote the previous one) and the API in Render
(Events → Rollback), then look.

## 9. What only you can do

- Set `NEXT_PUBLIC_CONTACT_EMAIL`, the spend limit and the domain.
- Have a lawyer read the Terms (they have not been reviewed by one) and confirm the Privacy page's description of
  Anthropic, Plausible, Cloudflare and your hosts against their current terms.
- Name your hosts and their log retention on the Privacy page if you want to be more specific than "their own
  periods".
- Run the Claude Security plugin's scan from `/claude-security` (it needs your own confirmation of its cost).
