# Lighthouse, mobile (launch-readiness branch, 24 November 2026)

Lighthouse 12, Chrome headless, default mobile settings (Moto G Power emulation, simulated slow 4G, 4x CPU
slowdown). The built site (`npm run build`) served by `web/scripts/serve-out.mjs`, which compresses and caches like the
static host and sends `vercel.json`'s headers; the API on the same computer with no key. Results used a check made from
the café example. Median of three runs; single runs moved by up to 10 points.

| Page | URL | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Start | `/` | 55 → **85** | 100 | 100 | 100 | 8.1 → 3.5 s | 0.369 → 0.008 | 263 ms |
| Plan | `/plan/` | 54 → **87** | 100 | 100 | 100 | 8.6 → 3.6 s | 0.361 → 0 | 193 ms |
| Answers | `/check/?enter=yourself` | 57 → **87** | 100 | 100 | 66 (noindex) | 7.7 → 3.3 s | 0.362 → 0 | 230 ms |
| Results | `/results/?check=…` | 52 → **92** | 100 | 100 | 66 (noindex) | 8.3 → 2.6 s | 0.369 → 0 | 269 ms |

"Before" is the first run on this branch, with the server not yet compressing; part of that gain is compression, which
Vercel and Netlify already do. What changed in the site:

- Each page's heading and frame are in the static HTML. `useSearchParams()` sat under the page-level `<Suspense>`,
  which in a static export makes the whole page render only in the browser: the HTML had an empty `<main>`, and
  everything, the footer included, moved when the script ran. Now only the part that reads the URL waits.
- Fonts load through `next/font` (same IBM Plex files): preloaded, with metric-matched fallbacks, so text does not
  jump when the font arrives.
- Start's example plan is an SVG drawing (27 KB compressed, against 160 KB for the PNG), in the HTML with its size and
  `fetchpriority="high"`.
- The loading states hold the space their content will take.

Why Performance is not yet 90 on Start, Plan and Answers: LCP waits for hydration. About 240 KB of compressed
JavaScript (React, Next, React Aria, the assistant and its voice code, on every page) has to run on the simulated slow
phone before the first screen finishes. On Plan and Answers the main text also depends on `/api/meta` and on this
tab's session storage, by design. The next step is to load the assistant's panel and voice code only when Ask is
pressed, then measure again on the real host with PageSpeed Insights.

SEO 66 on Answers and Results is the "page is blocked from indexing" audit alone: both are `noindex` because they show
one person's own check. Every other SEO audit passes.
