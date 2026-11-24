# Design decisions

Newest first. Each entry: date, decision, why, what was rejected, source, and who decided. The full story is in
[`design-story.md`](design-story.md); the tokens are in [`../DESIGN.md`](../DESIGN.md) and the writing rules in
[`../CONTENT.md`](../CONTENT.md).

> We used Claude and Figma to draft and build; the decisions and testing were ours.

## 2026-11-24 · Rooms of unknown use; cooking and patio permits; who wrote the rules

- **Rooms:**
  - A room marked "Other", or with no use chosen, makes the occupant load unknown. It used to count as no people.
  - Every rule that depends on the number of people then becomes Check with the city, unless a Fix holds regardless,
    and the assembly and sprinkler permits become May be needed.
  - "Add a room" starts with no use chosen and asks "What is this room used for?". "Other" stays available.
  - The unknown-input test treats "other" as unknown for room use.
- **Permits:**
  - With grease cooking unknown, the mechanical and hood-suppression permits are May be needed, whatever the cooking
    answer.
  - With outdoor seating not shown either way, the patio permit is May be needed. The test found this case once it
    also checked permits.
- **Salon licence:** a permit whose own entry is unchecked now says "This permit entry is still being checked against
  the agency's own rules." (`entry_verified`), not that a value put it on the list.
- **Words:**
  - Help says the check looks for a kitchen hood but not ventilation rates.
  - Start step 4 and the Streamlit About say our team coded the rules from Seattle's building codes and other city
    requirements, with how many are checked against the code text, counted by the API (`/api/meta`) or the rulebook.
- **Who:** owner (scope); team (how).

## 2026-11-24 · What the fourth independent scoring found, fixed

- **Urinals:** a count left as Not sure (the field present and empty) is unknown, not 0. Left out of the reading
  entirely, it still means none drawn. The Streamlit editor now keeps the urinals column, so it no longer drops the
  value.
- **Sprinkler permit:** listed as "May be needed" whenever the occupant load or floor area is unknown and a sprinkler
  rule could apply, even when the plan shows sprinklers.
- **Sign question:** answered Not sure, it now lists the sign permit as "May be needed". The API keeps an explicit
  null; an answer left out still uses the default (yes).
- **Salon licence:** the rulebook marks it `"verified": false` (it is under `_meta.verify`), and every page says it
  is listed because of a value still being checked.
- **Rule sources:** `_meta.code_basis`, the footer (now the whole code basis) and Help name the King County food code
  and the federal accessibility standards too.
- **Fire extinguishers:** the No issues found row now says the 75 ft travel distance is not measured.
- **Test:** the unknown-input grid test also fails when an unknown gives a Fix that some known value would undo.
- **Who:** found by evaluation; fixed by the team within the owner's scope.

## 2026-11-24 · Check with the city rows state the requirement; no rule counts as checked yet

- **Decision:**
  - Check with the city rows now say what the plan doesn't show, then what is needed. For example: "Your plan
    doesn't show fire extinguishers. Each floor needs at least one within 75 ft of travel." The values come from
    `seattle.json`. The 75 ft is new there and listed under `_meta.verify`, so FS-3 keeps its "still being checked"
    note.
  - EG-3 is back to unchecked, because its citation names ADA 404.2.3, entered from memory. ADA-3 cites the same
    section, so it is unchecked too. No rule counts as checked today.
  - The report PDF puts "The occupant load, occupancy group and exits required rest on values still being checked
    against the code." right under those figures. The preparation sheet marks each of the three values.
  - A permit listed because of the number of people (the assembly permit, the sprinkler permit) says "Listed because
    of a value still being checked against the code." in both PDFs and on the website. The engine marks it
    (`Permit.rule_verified`) without adding or dropping any permit.
  - "Checked by:" is now "Who to ask:" in the report PDF, the Markdown report and Streamlit, as on the website.
- **Why:** the second independent checklist scoring (T4, T5, L4).
- **Rejected:**
  - Keeping ADA-3 checked while EG-3 is not; they share the citation.
  - Marking every permit; the others come from the city's own permit lists.
- **Who:** owner (scope); team (how).

## 2026-11-24 · An unknown aisle width still gave No issues found (closed: fixed)

- **Found by:** the second independent checklist scoring on the rule-verification branch.
- **What:** with every aisle's width left empty, ADA-1 reports "Every route width on your plan is at least 36 in." as
  No issues found. With no seat count, ADA-4 disappears instead of becoming Check with the city. Both break "Unknown
  never becomes a pass".
- **Decision for now:** the owner allowed only message changes in `rules_engine.py` this round, so the logic is
  unchanged. The Answers intro and Help no longer claim that a Not sure value is never counted as meeting a rule.
- **Fixed (owner allowed this logic change only):**
  - ADA-1: an aisle with no width is Check with the city.
  - ADA-4: no seat count is Check with the city.
- **The audit of every rule found more of the same pattern, all fixed:**
  - EG-2: an exit door with no swing, or a door not marked exit or not, is Check with the city.
  - EG-4: an exit with no width is Check with the city.
  - ADA-3: a restroom door with no width is Check with the city.
  - PL-1 and PL-2: a restroom with no toilet or sink count, or no men/women designation where that matters, is Check
    with the city. This includes the Fix these rules used to report by counting an unknown as 0 ("Your plan shows no
    toilets"). That was caught by the third independent scoring.
  - EG-1 and EG-4: a door not marked as exit or not, or an exit with no width, could be what is missing, so the
    shortfall is Check with the city, not Fix.
  - A Fix stays a Fix only when it holds whatever the unknown value turns out to be. For example, more people than a
    room with no area shows can only make a shortfall worse.
  - Permits: when a room's area or use, the seat count or the floor area is unknown, the assembly and sprinkler
    permits are listed as "May be needed", not dropped.
  - MECH-1 and FS-3: unknown grease cooking is Check with the city.
  - Zoning: no floor area in a zone with a size limit is Check with the city.
  - Rules that depend on the number of people (OCC-1, EG-1, EG-2, EG-4, FS-1, FS-2, PL-1, PL-2): a room with no area
    or use, or no seat count, turns their No issues found into Check with the city, or adds a finding where the rule
    would otherwise not appear.
- **Tests:** `tests/unknown_inputs.py` sets every plan input of five demo cases to a spread of known values and then
  to unknown. `test_an_unknown_input_never_gives_no_issues_found_and_never_drops_a_finding` fails if unknown ever gives
  a better outcome than the worst known value. `test_unknown_handling_leaves_every_fix_finding_as_it_was` compares
  every Fix finding over the same grid with a snapshot written by the engine before the change (commit 7dc74cf). Under
  known values they are identical. Under an unknown value a Fix is only removed, only for EG-1, EG-4, PL-1 and PL-2,
  and only by becoming Check with the city for the same rule.
- **Not changed:**
  - Urinals left empty count as 0, as before. The reading schema makes them optional, and 0 is already the worst case.
  - A room marked "other" still has no load. It is a known use, not an unknown one.
- **Who:** found by evaluation; fixed with the owner's approval.

## 2026-11-24 · No issues found rows name the requirement; numbers only from the rulebook

- **Decision:** Every "No issues found" message has two sentences: what the plan shows, then what it meets ("Your plan
  shows 3 exit signs. Each of the 2 exits needs one."). Requirement numbers come from `seattle.json`. The 36 in. door
  in two fix texts, the 28 to 34 in. table height and the 5 to 7 months for a land use approval moved into the
  rulebook. A test reads the engine's and zoning's source and fails on any number written into a message, title or
  fix. On Answers, "We couldn't read this from your plan." sits under each reading the API left empty, not under the
  row's title. "Seattle's rules decide" became "Rules based on Seattle's code decide", and "Run Seattle's rules" became
  "Run the rules".
- **Why:** The independent re-score failed T4 (the requirement was missing from No issues found rows) and L4 (the line
  covered whole rows that were mostly read, and the wording credited the city with our coding).
- **Rejected:** a runtime check of every number in every message against the rulebook. Messages also carry numbers
  from the plan and from arithmetic (106 people, 21.2 in.), so the source check is the reliable one. Also rejected:
  one line per row listing the empty readings, which is shorter but reads less clearly beside each "Not sure".
- **Who:** owner (wording and scope); team (how).

## 2026-11-24 · Rules not yet checked against the code are marked

- **Decision:** The rulebook gives every rule id a `verified` (true or false) and a `source` (code edition and
  section), plus the `evidence` for the choice. A rule is true only when every value it uses is listed in
  `_meta.checked_against_city_sources`: EG-2, EG-3, EG-4, FS-1, FS-2 and ADA-3 (6 of 21). The other 15 are false.
  `depends_on` names the rules whose results a rule uses (the occupant load OL-0, the occupancy group OCC-1, the exit
  count EG-1). A finding counts as checked only when its rule and every rule it depends on are verified
  (`rules_engine.rule_checked`). Today that leaves EG-3 and ADA-3, the door widths. Each finding carries
  `rule_verified` and `rule_source` from the engine through the API, and the occupant-load table carries its own. Where `rule_verified` is
  false, the website shows "This rule's value is still being checked against the code." after the code section, in
  muted body text with no new colour or icon. The PDFs, the Streamlit demo and the assistant's answers say it too.
  The In short band and the first page of each PDF say "Some rule values are still being checked against the code."
  once. Start's strip ends "Seattle's rules decide (some values still being checked)" while `/api/meta` counts any
  unverified rule.
- **Why:** A claim must be no larger than its evidence (checklist T5 and L4). A finding built on a value entered from
  memory looked exactly like one read from the code.
- **Rejected:**
  - Marking per value instead of per rule, which is more exact but needs the engine to track which value produced
    each finding.
  - Counting a rule as checked when only some of its values were read. EG-1 stays false because three exits above
    500 occupants is from memory, and PL-1 stays false because two rows of Table 2902.1 still need re-reading.
  - A new colour or icon, which would add a fourth status look.
  - Letting `verified` lower a finding to "Check with the city". The status comes from the plan and the rule; whether
    the rule was read from the code is a separate fact.
- **Corrected after the independent re-score:** the first version flagged rules on their own values only. FS-2
  ("Add a sprinkler system") showed no note although the 106-person load behind it uses a factor from memory; without
  the counter's 16 people the load is 90, under the trigger. Dependencies now count, the Zoning tab and the
  assistant's template answers carry the note, and the PDFs mark the occupant-load table.
- **Unknown is careful:** a finding without the field, a rulebook with no `rules` section, or a Start page whose
  `/api/meta` has not loaded all get the "still being checked" wording.
- **Source:** design checklist (T5, L4); CLAUDE.md (`_meta.verify`); `docs/rulebook.md`.
- **Who:** team.

## 2026-11-24 · Three fixes after the checklist re-score

- **Decision 1, Start:** the four steps of "How it works" as one line under the intro sentence ("You upload your plan ·
  The model reads it · You confirm · Seattle's rules decide"); the full section stays below the form.
  **Why:** the checklist wants how it works high on the page (L2), and the form had pushed it below the fold.
  **Rejected:** moving the whole section above the form, which would push the form below the fold on a phone.
- **Decision 2, Plan:** with no API key, the example plans are listed once, as the pill rows under "Try an example
  plan". The no-key notice and "Other ways to go on" now link down to them ("Try an example plan below") instead of
  repeating the list. This also applies when reading failed for another reason, since the rows are on the page then too.
  **Why:** the same three links twice on one screen is noise. **Rejected:** hiding the pill rows when there is no key.
- **Decision 3, Answers:** a reading the API left empty says "We couldn't read this from your plan." The line "We're not
  sure we read this right." is gone: the API marks no single reading as uncertain (`uncertainties` is a free-text list,
  shown as "Noted while reading your plan"), so that sentence claimed something the data does not say.
  **Rejected:** keeping "not sure" for every empty reading. **TODO:** bring the line back if `extract.py` gains a
  per-reading uncertainty or confidence mark.
- **Decision 4, three kept strings rewritten:** of the four strings design-v3 had kept because tests asserted them, three
  did not follow CONTENT.md and were changed with their tests: "Read by the vision model. Check every value against your
  plan." (passive, jargon), "You are entering the measurements yourself. Leave anything you are not sure of empty."
  (no contractions, unlike CONTENT.md's own example), and "No plan has been read in this browser tab yet." (passive).
  The page title "Check what we read from your plan" follows the rules and stays.
- **Source:** design checklist (L2, F2); CONTENT.md rules 6 and 10. **Who:** team.

## 2026-11-24 · Unverified rule values are not marked yet (closed: see "Rules not yet checked against the code are marked")

- **Decision:** None yet. The checklist scoring found that findings built on rulebook values listed under
  `_meta.verify` (entered from memory, not yet checked against the code) look the same as checked ones.
- **Why it matters:** a claim must be no larger than its evidence (Landing L4; Trust T5).
- **Rejected for now:** marking them in the front end, which would need the front end to know rule values.
- **Source:** design checklist scoring of design-v3.
- **Who:** evaluation checklist.
- **TODO:** have `rules_engine.py` add `verified: false` to a finding whose numbers come from `_meta.verify`, return it
  through the API, and show "This rule's value is still being checked" beside such findings and in the PDF.

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
