# Design decisions

Newest first. Each entry: date, decision, why, what was rejected, source, and who decided. The full story is in
[`design-story.md`](design-story.md); the tokens are in [`../DESIGN.md`](../DESIGN.md) and the writing rules in
[`../CONTENT.md`](../CONTENT.md).

> We used Claude and Figma to draft and build; the decisions and testing were ours.

## 2026-11-24 · The v3 Figma pages stop at the results page

- **Decision:** The v3 Figma pages stop at the results page because the free Figma plan ran out of tool calls; the
  remaining v3 screens were specified in writing and built directly in code.
- **Why:** The Starter plan allows about 20 Figma tool calls a month, and the results page used them up.
- **Rejected:** waiting a month; redrawing the remaining screens by hand in Figma before building.
- **Source:** Figma plan limits; the v3 Figma file (https://www.figma.com/design/PVw8XgzSLPe2q9TR8mbbhj).
- **Who:** team.

## 2026-11-24 · Proof figures on Start only from real data

- **Decision:** The Start page shows figures from Seattle's permit records only when an API endpoint provides them.
  Until then the slot stays empty; no number is written into the front end.
- **Why:** A claim must be no larger than its evidence, and the front end holds no business numbers.
- **Rejected:** hard-coding "88% of food and drink build-outs were sent back" from the README.
- **Source:** design checklist (Landing: claims no larger than the evidence); CONTENT.md rule 8.
- **Who:** team.
- **TODO:** add a read-only endpoint (for example `GET /api/seattle/summary`) that returns `pipeline.query.review_summary`
  with its permit count, then show it on Start. No such endpoint exists yet.

## 2026-11-24 · "Check these first" uses the readings the API left empty

- **Decision:** On the Answers page, "Check these first" lists the readings the API returned empty (shown as "Not
  sure"), with the reader's own list of what it was unsure about. Everything else is "Also used in the check".
- **Why:** The API has no per-reading confidence field. An empty value is the only per-reading signal it gives, and an
  empty reading becomes "Check with the city", so it is the one the owner most needs to look at.
- **Rejected:** guessing confidence in the browser (the front end decides nothing); keeping one long list.
- **Source:** design brief (least-certain readings first); `FLOOR_PLAN_SCHEMA` in `checker/extract.py`.
- **Who:** team.
- **TODO:** if `extract.py` gains a confidence per reading, sort "Check these first" by it.

## 2026-11-24 · Copy rewrite

- **Decision:** Every string a person reads follows CONTENT.md: titles start with an action, observation before need,
  no blame words, one caveat beside the result, three fixed status names.
- **Why:** Concise, scannable and objective copy scored 124% better in measured usability at about half the words; the
  EAST framework and plain-language guides point the same way.
- **Rejected:** keeping the hackathon wording ("Not enough exits", "OK", "MUST FIX", design notes in the copy).
- **Source:** research in [`design-story.md`](design-story.md), section Language.
- **Who:** team.

## 2026-11-24 · Zones as full-width bands; round means pressable

- **Decision:** Each part of a page is a full-width band (blue hero, tint summary, white Fix, paper questions, dark
  records). Pills (radius 999) mark anything you can press; grouping containers use radius 12 to 16; information is plain.
- **Why:** The bands group content without boxes and borders, and the shape tells you what is interactive before you read.
- **Rejected:** cards with borders and side strips for every finding; rounded information boxes.
- **Source:** references [CalArts](https://calarts.edu) and [Harvard GSD](https://www.gsd.harvard.edu) (links only).
- **Who:** team.

## 2026-11-24 · Shape-coded status icons

- **Decision:** Fix is a solid red circle with "!"; Check with the city a hollow blue circle with "?"; No issues found a
  thin grey circle with a check. Always icon plus words.
- **Why:** With one colour family, "Check with the city" and "No issues found" turned the same blue; shape keeps them apart.
- **Rejected:** a green tick (reads as approval); bringing back amber and green.
- **Source:** design story, Colour; WCAG 1.4.1 (not colour alone).
- **Who:** team.

## 2026-11-24 · Disclaimer beside the results, not only in the footer

- **Decision:** The results hero carries "A pre-check from the checks we ran, not a city approval."
- **Why:** That is where someone decides whether to trust the result.
- **Rejected:** the disclaimer in the footer only (our first reading of "say each caveat once").
- **Source:** our own evaluation checklist caught it.
- **Who:** correction after evaluation.

## 2026-11-24 · Three type sizes; no side strips or all-caps kickers

- **Decision:** 48 (page title, Light), 24 (section heading, Medium), 17 (everything else). No coloured strips down the
  side of rows, no small all-caps letter-spaced labels.
- **Why:** Fewer sizes and weights make the page quieter and the content louder; strips and kickers read as machine-made.
- **Rejected:** the five-size scale of v1 and v2; side strips on every finding card.
- **Source:** evaluation checklist (Visual restraint).
- **Who:** evaluation checklist.

## 2026-11-24 · "On this page" rail

- **Decision:** A rail lists the five results sections: current tinted, seen ticked, later hollow. A bar replaces it on phones.
- **Why:** The results page is long; the rail shows where you are and what is left.
- **Rejected:** a table of contents at the top only; no navigation.
- **Source:** team review of the long results page.
- **Who:** team.

## 2026-11-24 · Fix never behind a tab

- **Decision:** "Fix before you apply" is always shown; only "Check with the city" and "No issues found" share tabs.
- **Why:** A problem hidden behind a tab is a problem someone can miss.
- **Rejected:** three tabs (Fix / Check / OK) with Fix selected first.
- **Source:** team review.
- **Who:** team.

## 2026-11-24 · "No issues found" replaces OK

- **Decision:** The third status is "No issues found", in every place, including the PDFs.
- **Why:** "OK" reads like a pass; we only know what we checked.
- **Rejected:** OK, Pass, Compliant, Looks good.
- **Source:** CONTENT.md rule 11; design story, Language.
- **Who:** team.

## 2026-11-24 · One colour family; red only for Fix

- **Decision:** Warm paper, white, ink, one trust blue and its tint. Red #B3261E is the only other colour and only marks
  something to fix, never a background.
- **Why:** A restrained palette builds more trust; blue is the common choice where people must trust a service.
- **Rejected:** the amber "Check with the city" (muddy on screen) and the red/amber/green traffic-light palette.
- **Source:** design story, Colour.
- **Who:** team, after rejecting the amber and the traffic-light palette.

## 2026-11-24 · The name PermitOS

- **Decision:** The site is called PermitOS everywhere a person sees it. Repo, packages and folders keep their names.
- **Why:** Short and memorable; "Seattle Permit Pre-Check" sounded like a city service.
- **Rejected:** Seattle Permit Pre-Check.
- **Source:** team.
- **Who:** team.
