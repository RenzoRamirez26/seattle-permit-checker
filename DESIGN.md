# DESIGN.md: PermitOS website (design v3)

The design tokens and components for `web/`, with the reason for each. Change a token here first, then in
`web/src/styles/tokens.css`. The story behind them is in [`docs/design-story.md`](docs/design-story.md), the decisions
in [`docs/decisions.md`](docs/decisions.md), the writing rules in [`CONTENT.md`](CONTENT.md), and the pass/fail
checklist in [`docs/design_checklist.md`](docs/design_checklist.md). The earlier brief is `docs/design_brief.md`.

## Tone

Calm, exact and honest about what was checked. The owner is about to sign a lease. Two failures to avoid: a screen
that looks like an approval, and a screen that looks like a wall of warnings. It never looks like a City of Seattle service.

## Colour

One colour family on warm neutrals. Red is the only other colour and only marks something to fix. Every text colour is
tested against every background it is used on (`tests/test_design_rules.py` and the build guard); all reach 4.5 : 1.

| Token | Hex | Contrast | Use | Reason |
|---|---|---|---|---|
| `paper` | `#FAF7F2` | | Page background, the paper zones | Warm paper: softer than white for long reading; pure white and grey feel cold. |
| `white` | `#FFFFFF` | | The white zones, cards, panels, form cards | Lifts a group off the paper without a shadow. |
| `ink` | `#1D2430` | 14.6 on paper, 15.6 on white, 13.5 on tint | Text | Warm ink: near-black with a blue-grey cast, without the glare of pure black. |
| `ink-muted` | `#56606C` | 6.0 on paper, 6.4 on white, 5.5 on tint | Secondary text; the No issues found check | Clearly secondary, still well above 4.5 : 1. |
| `blue` | `#1F4E8C` | 7.8 on paper, 8.3 on white, 7.2 on tint | Links, the main button, the focus ring, the hero, Check with the city | Trust blue: the one accent, so "you can act here" always has one colour. |
| `tint` | `#E8EFF8` | (background) | The summary zone, the selected tab, the current rail item, "Not sure" when chosen | A pale wash of the accent marks "here" without a second colour. |
| `fix` | `#B3261E` | 6.1 on paper, 6.5 on white, 5.6 on tint | The Fix mark, the Fix count, error borders. **Never a background** | Kept for problems only, so it keeps its force. |
| `hairline` | `#E4DED3` | 1.25 (decorative) | Dividers between rows and zones | Thin lines, as on a drawing; never the only sign of a control. |
| `field` | `#8A8F96` | 3.05 on paper, 3.3 on white | Field and card borders; the No issues found circle | Meets the 3 : 1 target for control outlines. |
| `band` / `band-text` / `band-muted` | `#1D2430` / `#FFFFFF` / `#C9D3E0` | 15.6 and 10.3 | The dark records zone | A dark zone tells you this is the city's history, not your result. |
| `hero-text` / `hero-muted` | `#FFFFFF` / `#C9D8EE` | 8.3 and 5.8 on blue | Text on the blue hero | The hero holds the title and the disclaimer; both stay readable. |

Removed in v3: the amber "Check with the city" pair and the green "OK" pair (a traffic light reads as a verdict; amber
was muddy on screen), and the red tint (red is never a background). No gradients, no dark mode in version 1.

## Type

| Token | Value | Use | Reason |
|---|---|---|---|
| `title` | 3rem (48 px) / 56, Plex Sans Light 300 | The page title (`h1`) | One large, light title says where you are without shouting. |
| `heading` | 1.5rem (24 px) / 32, Plex Sans Medium 500 | Section headings, the count tiles' labels stay body size | Enough contrast with the title and the body. |
| `body` | 1.0625rem (17 px) / 24, Plex Sans Regular 400 or Medium 500 | Everything else: text, labels, buttons, tabs, captions | One reading size keeps the page quiet; 17 px clears the iOS zoom on inputs. |

- **Three sizes per screen, no more.** The guard rejects any other size token and Tailwind's own size classes. The
  count tiles' numbers use the `title` size.
- **Fonts:** IBM Plex Sans; IBM Plex Mono for code sections and measurements (same family, no size of its own);
  IBM Plex Serif 400 for the Start headline only.
- **Weights:** 300, 400 and 500. No bold.
- **No all-caps letter-spaced labels** anywhere, left-aligned text, `tabular-nums` where numbers are compared.

## Shape

| Rule | Value | Reason |
|---|---|---|
| Round means you can press it | Buttons, tabs, links that act as buttons, radio choices, example rows, step nav, the rail items and bar: pills (`rounded-full`, radius 999) | The shape tells you what is interactive before you read. |
| Single-line fields | Pills | They are pressable controls too. Multi-line fields use 16 px, since a pill cannot hold several lines. |
| Grouping containers | 12 to 16 px (`rounded-xl`, `rounded-2xl`) | Groups are soft, never pill-shaped. |
| Information | Plain: findings are rows separated by 1 px hairlines | Rows, not cards. |
| Side strips | None, anywhere | A coloured strip down every card reads as machine-made. |
| Shadows | None | Separation comes from zones, hairlines and space. |
| Focus ring | 3 px `blue`, 2 px offset | Visible on paper, white, tint and blue. |
| Spacing | 8 px unit; gaps 4, 8, 16, 24, 32, 48, 64, 96 px | Every gap is a deliberate step. |
| Control height | 48 px | Above the 44 px touch target. |

## Zones

Each part of a page is a full-width band; the bands group content instead of boxes and borders. Content sits in a
column at most 880 px wide when the rail shows (1200 px pages otherwise). Titles and the closing next step are centred;
everything people read and compare is left-aligned.

| Zone | Background | Used for | Reason |
|---|---|---|---|
| Hero | `blue`, white text | The results title, facts line, disclaimer and tabs; the Start form band | The place you start reading. |
| Tint | `tint` | "In short" on results; "How it works" on Start | A calm summary before the detail. |
| White | `white` | "Fix before you apply"; permits | The things to act on, on the plainest ground. |
| Paper | `paper` | "Check with the city" / "No issues found"; the questions | Secondary groups, a step quieter. |
| Dark | `band` | What Seattle's records show | Context from other businesses, set apart from your own result. |

## Status icons

Inline SVG components (`web/src/components/results/StatusIcon.tsx`), always beside their words:

| Status | Icon | Words | Reason |
|---|---|---|---|
| Fix | Solid `fix` circle with a white "!" | Fix before you apply | The only red on the page, and the heaviest mark. |
| Check with the city | Hollow `blue` circle with "?" | Check with the city | A question, not a warning. |
| No issues found | Thin `field` circle with an `ink-muted` check | No issues found | The quietest mark; no green tick, because a tick reads as approval. |

Shape, not colour, tells them apart (WCAG 1.4.1). Never "OK", "pass", "approved" or "compliant" (CONTENT.md).

## Components

### Header

"PermitOS" with "OS" in blue, at 24 Medium; an outlined capsule step nav "1 Start · 2 Plan · 3 Answers · 4 Results"
(current step blue Medium, done steps ink, later steps muted); Help and Start over as plain links.

### Tabs

React Aria `Tabs` (`TabRow.tsx`). Pill tabs on the blue hero (In short / Zoning / Downloads); underline tabs for
"Check with the city (n)" and "No issues found (n)", each with its icon. The selected tab has the `tint` background
and a 3 px `blue` underline. Arrow keys, Home and End move and select; each panel is labelled by its tab; the selection
survives a refresh; a link to a finding opens its tab first. "Fix before you apply" is never a tab.

### On this page

`OnThisPage.tsx`, a nav landmark. From 1024 px: a white panel (radius 16) right of the results column, sticky. The
current item has the `tint` background and blue Medium text, no side bar, and `aria-current="location"`; items already
passed have the grey check and "(seen)" for screen readers; later items a hollow dot. "2 of 5 sections seen" at the top.
Choosing an item jumps there and moves focus to its heading. Below 1024 px: a pill bar at the bottom left, clear of the
Ask button, that opens the list in a popover. Position from IntersectionObserver; nothing animates.

### Findings

Plain rows with 1 px hairlines: the icon, an action title, the observation, the code section from the API and
"Ask about this →". Lists longer than five show five, then "Show all N".

### Voice

The assistant takes a spoken question one of three ways; the browser decides which (`web/src/voice/`). No audio ever
goes to Google, Apple or any third party.

| Path | When | What the owner sees |
|---|---|---|
| A, on this device | The browser's SpeechRecognition has `processLocally` and `available()` says `available` or `downloadable` | Words appear live in the question box; final words replace the interim ones |
| B, recorded | No on-device option, and the server has speech to text (faster-whisper and ffmpeg) and the browser can record WebM, MP4 or Ogg | The recording goes to our API only; then the words appear in the box |
| C, none | Neither | "Voice isn't available in this browser. Type your question instead." and a disabled button |

States of the one toggle button (`aria-pressed`, keyboard focus stays on it):

| State | Button | Line under the box (`role="status"`, or `alert` for a problem) |
|---|---|---|
| Idle | "Start voice input", mic icon, secondary | none |
| Getting ready (A, first time) | disabled | "Getting voice ready on this device. This happens once." |
| Listening | "Stop voice input", square icon, 2 px ink border, `aria-pressed="true"` | "Listening… 3 s of 30. Press Stop voice input when you have finished." |
| Turning into text (B) | disabled | "Turning your speech into text…" |
| Heard | "Start voice input" | In an `aria-live="polite"` line: "We heard: "…". Correct it if needed, then press Send." Focus moves to the box |
| Microphone blocked | "Start voice input" | "The microphone is blocked. Allow it in your browser settings, or type your question." |
| On-device voice stopped | "Start voice input" (Path B next time) | "Voice on this device stopped. Press Start voice input to record instead, or type your question." |

No new colour, icon or size: the states use `ink`, `ink-muted`, the `fix` red only for a problem line, and body text.
Nothing is sent until Send. Help's "Voice" section says where speech is processed.

## Grid

| Screen width | Columns | Gutter | Side margin |
|---|---|---|---|
| under 640 px | 4 | 16 px | 16 px |
| 640 to 1023 px | 8 | 24 px | 32 px |
| 1024 px and up | 12 | 24 px | centred, content at most 1200 px |

Results: the column at most 880 px with the 220 px rail to its right from 1024 px (`.results-frame`); the hero's
title is centred over that column.

## Motion

Only the assistant panel moves: it slides in over 180 ms with a CSS transition on `transform`, and appears without
sliding when reduced motion is on. Progress on the Checking state is an indeterminate bar that stands still when
reduced motion is on. Nothing else animates.

## Imagery

Start shows one of our own invented demo floor plans, as a drawing, beside the form. No other images, illustrations
or decorative icons. Icons appear only beside words.
