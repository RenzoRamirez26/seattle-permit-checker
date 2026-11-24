# DESIGN.md: Seattle Permit Pre-Check website

The design tokens for `web/`, with the reason for each. Taken from `docs/design_brief.md`; the
research behind them is in `docs/design_research.md`, the build plan in `docs/website_plan.md`.
If a token changes, change it here first, then in `web/src/styles/tokens.css`.

**Marks:** **[changed]** means the visual direction in `docs/website_plan.md` changes the brief's
token, with the owner's approval (the departure number is given). **[added]** means the brief sets nothing
and this file adds a value. Everything unmarked is the brief as written.

## Tone

Calm, plain and precise, like a well-drawn floor plan: paper, dark ink, thin lines and one blue.
The owner is deciding something about money and the law, so every task page stays quiet and every
number is set so it can be trusted at a glance. It must never look like a City of Seattle service,
and it never decorates a page that asks a question.

## Colour

Contrast figures are WCAG 2 ratios against Paper, recalculated on 24 November 2026; they match the brief.

| Token | Hex | Contrast | Use | Reason |
|---|---|---|---|---|
| `paper` | `#FAF8F3` | | Page background | Warm off-white of drawing paper; softer than white for long reading. |
| `ink` | `#1B1F24` | 15.6 : 1 | Text | Near-black with a cool cast, like drafting ink; avoids the glare of pure black on paper. |
| `ink-muted` | `#55606B` | 6.1 : 1 | Hints, captions | Clearly secondary while still well above 4.5 : 1. |
| `blue` | `#1F4E8C` | 7.8 : 1 | Links, the main button, the focus ring | Blueprint blue: the one accent. White on it is 8.3 : 1. One colour for "you can act here". |
| `fix` on `fix-tint` | `#B3261E` on `#FBE9E7` | 6.2 : 1 (5.6 on tint) | Problems only | Red is kept for problems so it keeps its force. |
| `city` on `city-tint` | `#7A4F00` on `#FBF0D9` | 6.7 : 1 (6.3 on tint) | "Check with the city" | A brown-amber that reads as "not decided" without alarm. |
| `ok` on `ok-tint` | `#1E6B3A` on `#E4F2E8` | 6.2 : 1 (5.6 on tint) | Items that passed | Quiet green; OK items are collapsed by default. |
| `field` | `#7C8691` | 3.5 : 1 | Outlines of inputs and clickable cards | Meets the 3 : 1 target for control outlines. |
| `hairline` | `#D9D4C8` | 1.4 : 1 | Dividers only | Decorative; never the only sign of a control. |

Rules: a status is always icon plus word ("Fix", "Check with the city", "OK"), never colour alone.
No second accent, no gradients, no dark mode in version 1. shadcn's variables map onto these tokens
only (`background` paper, `foreground` ink, `primary` blue, `ring` blue, `border` hairline, `input`
field, `destructive` fix; `secondary` and `accent` set to paper and ink so no new colour appears).

## Type

| Token | Value | Reason |
|---|---|---|
| `font-text` | IBM Plex Sans | Open licence, a drafting-office feel, excellent at small sizes. |
| `font-mono` | IBM Plex Mono | Code sections, permit numbers and measurements: the same family, so it sits in a sentence without jumping. |
| `font-heading` | IBM Plex Sans 600 | The `h1` on every task page, as the brief has it. |
| `font-heading-start` **[changed, D2]** | IBM Plex Serif 400 (SIL Open Font License 1.1), Start page `h1` only | A quiet title-block voice on the one page that is not a question. Same family and proportions as Plex Sans. Loaded on Start only. |
| Weights | 400 and 600 only | Hierarchy from size and space, not from many weights. The Start serif uses 400. |
| `text-small` | 14 / 20 px | Small print, captions, the credit line. |
| `text-body` | 18 / 24 px | Body. 133% line height; three 8 px units per line, so text and boxes share one rhythm. Also clears the 16 px minimum that stops iOS zooming into inputs. |
| `text-section` | 24 / 32 px, 600 | Section headings. |
| `text-page` | 32 / 40 px phones, 40 / 48 px from 1024 px | The `h1`, which is the page's question. |
| Measure | at most about 80 characters | Comfortable reading; the 7-column question column gives about 75. |
| Figures | `tabular-nums` wherever numbers are compared | Columns of numbers line up. |
| Alignment | left; no centred paragraphs, no all-capitals | Easier to read and scan. |

## Spacing

| Token | Value | Reason |
|---|---|---|
| Unit | 8 px | Taken from the body line height (24 = 3 × 8). |
| Allowed gaps | 4, 8, 16, 24, 32, 48, 64, 96 px | Nothing else, so every gap is a deliberate step. |
| Control height | 48 px (inputs and the main button) | Six units; above the 44 px touch target. |
| Focus ring | 3 px `blue`, 2 px offset **[added: offset]** | Visible on paper and on every tint. |
| Corner radius **[added, D11]** | 2 px | Precise, not soft. |
| Rules and borders **[added]** | 1 px hairline; 1 px field on controls | Thin lines, as on a drawing. |
| Shadows **[added, D11]** | none | A drawing has no shadows; separation comes from hairlines and space. |

## Grid

| Screen width | Columns | Gutter | Side margin |
|---|---|---|---|
| under 640 px | 4 | 16 px | 16 px |
| 640 to 1023 px | 8 | 24 px | 32 px |
| 1024 px and up | 12 | 24 px | centred, content at most 1200 px |

Reason: the web form of Müller-Brockmann's method; one column grid per width, every block starting
and ending on a column edge.

- Question pages: one column, columns 1 to 7.
- Assistant panel on wide screens: columns 9 to 12, so the form stays visible.
- Check what we read: plan in 7 columns, facts in 5. Plan first on phones.
- Results: findings in 8 columns, a sticky summary in 4.
- Start: text-only in version 1, in columns 1 to 7 like the question pages. **[D1, on hold]** Only if the
  owner confirms the drawing's rights: heading and text in columns 1 to 6, the drawing in 6 to 12; under the text on phones.

## Motion

As the brief has it (D3 rejected): only the assistant panel moves. It slides in over 150 to 200 ms,
with a CSS transition on `transform`, and appears without sliding when the reduced-motion setting is
on. Pages, the Reading page and the results counts do not animate. The Reading page shows "Reading
your plan" and a Cancel link, with no stage names, because the plan is read in one request (D4).

## Imagery **[D1, on hold]**

Version 1 has no images: Start is text-only until the owner confirms the drawing's rights statement.
If it is confirmed: one public-domain measured drawing on Start only, in ink on paper, with a visible credit. No images,
illustrations or icons as decoration on any task page. Icons appear only beside words (status, back,
microphone).
