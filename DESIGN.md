# DESIGN.md: PermitOS website

The design tokens for `web/`, with the reason for each. Taken from `docs/design_brief.md`; the
research behind them is in `docs/design_research.md`, the build plan in `docs/website_plan.md`.
If a token changes, change it here first, then in `web/src/styles/tokens.css`.

**Marks:** **[changed]** means the visual direction in `docs/website_plan.md` changes the brief's
token, with the owner's approval (the departure number is given). **[owner, 24 Nov 2026]** marks the owner's
later layout and palette request (the PermitOS name, the results tabs and the palette below). **[added]** means the
brief sets nothing and this file adds a value. Everything unmarked is the brief as written.

## Tone

Calm, plain and precise, like a well-drawn floor plan: paper, dark ink, thin lines and one blue.
The owner is deciding something about money and the law, so every task page stays quiet and every
number is set so it can be trusted at a glance. It must never look like a City of Seattle service,
and it never decorates a page that asks a question.

## Colour **[owner, 24 Nov 2026]**

The palette the owner set on 24 November 2026, replacing the brief's. Contrast figures are WCAG 2 ratios, calculated
for every text colour on every background it is used on; every text pair reaches 4.5 : 1.

| Token | Hex | Contrast | Use | Reason |
|---|---|---|---|---|
| `paper` | `#FAF7F2` | | Page background | Warm paper: softer than white for long reading, and the drawing-sheet feel of the brief. |
| `white` | `#FFFFFF` | | Cards and panels | Lifts a finding or a panel off the paper without a shadow. |
| `ink` | `#1D2430` | 14.6 : 1 on paper, 15.6 on white, 13.5 on `tab-tint` | Text | Warm ink: near-black with a blue-grey cast, without the glare of pure black. |
| `ink-muted` | `#56606C` | 6.0 : 1 on paper, 6.4 on white, 5.5 on `tab-tint` | Secondary text, hints, captions | Clearly secondary while staying well above 4.5 : 1 on every background it sits on. |
| `blue` | `#1F4E8C` | 7.8 : 1 on paper, 8.3 on white, 7.2 on `tab-tint`; white on it 8.3 : 1 | The main action, links, the focus ring | Trust blue: the one accent, so "you can act here" always has the same colour. |
| `tab-tint` | `#E8EFF8` | (background) | The selected tab: `blue` text and a 3 px `blue` bottom border | A pale wash of the accent marks the open tab without a second colour; the border keeps it visible without colour. |
| `fix` on `fix-tint` | `#B3261E` on `#FBEAE7` | 6.1 : 1 on paper, 5.6 on tint | Problems only | Red is kept for problems so it keeps its force. |
| `city` on `city-tint` | `#8A5A14` on `#FBF1E2` | 5.5 : 1 on paper, 5.3 on tint | "Check with the city", including every "Not sure" | A brown-amber that reads as "not decided" without alarm; replaces the old amber. |
| `ok` on `ok-tint` | `#256B45` on `#E7F3EC` | 6.0 : 1 on paper, 5.6 on tint | Items that passed | A quiet green, so passing items do not compete with problems. |
| `field` | `#8A8F96` | 3.05 : 1 on paper, 3.3 on white | Outlines of inputs, clickable cards and cards | Meets the 3 : 1 target for control outlines. |
| `hairline` | `#E4DED3` | 1.25 : 1 | Dividers only | Decorative; never the only sign of a control. |

Rules: a status is always icon plus word ("Fix", "Check with the city", "OK"), never colour alone; a selected
tab also has its 3 px border. No second accent, no gradients, no dark mode in version 1. shadcn's variables map
onto these tokens only (`background` paper, `foreground` ink, `primary` blue, `ring` blue, `border` hairline,
`input` field, `destructive` fix; `secondary` and `accent` set to paper and ink so no new colour appears).

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
| Alignment | left; no centred paragraphs, no all-capitals. The one exception: the results page's step line and `h1` are centred **[owner, 24 Nov 2026]** | Easier to read and scan; the centred results heading marks the end of the flow. |

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
- Results **[owner, 24 Nov 2026]**: one centred column, at most 896 px wide: the summary tabs, the findings tabs,
  the permits, Seattle's records, then the rest. The sticky summary column is gone; its three parts are tabs.
- Start: text-only in version 1, in columns 1 to 7 like the question pages. **[D1, on hold]** Only if the
  owner confirms the drawing's rights: heading and text in columns 1 to 6, the drawing in 6 to 12; under the text on phones.

## Components

### Tabs **[owner, 24 Nov 2026]**

React Aria's `Tabs` (`web/src/components/results/TabRow.tsx`), used for the two rows on the results page:
"In short", "Zoning", "Downloads"; and the findings groups, each with its count ("Fix before you apply (3)").

- A row of tabs on a `hairline` bottom rule; each tab 48 px tall, Plex Sans 600, with its icon for a findings group.
- Selected: `blue` text on `tab-tint` with a 3 px `blue` bottom border; a findings tab uses its status colour on
  its status tint with a 3 px border in the status colour. Not selected: `ink` on paper; white on hover.
- Arrow keys move between tabs and select them (Home and End too); the selected tab is announced; each panel is
  labelled by its tab. Only the selected panel is in the page. Tabs wrap onto a second line on narrow screens.
- The selected tab is kept for each check in the tab's session, so a refresh keeps it; a link to a finding opens the
  finding's tab before scrolling to it. The findings row starts on "Fix before you apply", unless it is empty.

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
