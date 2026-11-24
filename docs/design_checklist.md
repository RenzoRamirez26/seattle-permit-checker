# Design checklist

Pass/fail items for every version, each naming its source. Score a version in a separate pass from designing it.
"Test" means a test in the repository checks it, so it cannot drift.

design-v3 was scored on 24 November 2026 by a separate reviewing agent that had not built the pages, from the
screenshots in `screenshots/design-v3/` and the code: 20 of 26 passed. Three failures were fixed after the scoring
(marked below).

Re-scored the same day after three more fixes (a "How it works" line on Start, the example plans listed once on Plan,
and the empty-reading line on Answers). This re-score was done by the agent that made the fixes, not a separate one; it
rechecked L2, F2, S1, V1, V3 and L3 against the new screenshots and tests and carried the other items over. Result:
24 of 26 pass. Two remain: T5 and L4, which both wait on a backend field for unverified rule values.

**Rule verification (branch rule-verification), 24 November 2026.** After the backend field was added, a separate
reviewing agent that had not built it re-scored all 26 items from the screenshots, the code, both generated PDFs and
the assistant's template answers: **23 of 26 passed; T4, T5 and L4 failed.** The fixes made after that scoring are
noted in each row; they were not re-scored by a separate agent. Standing now: T5 fixed; T4 and L4 still open.

**Second rule-verification scoring, 24 November 2026**, after the No issues found messages, the numbers guard, the
per-reading Answers line and the wording change. A new separate agent re-scored all 26 items: **23 of 26 passed; T4,
T5 and L4 failed.** It confirmed the No issues found rows and the Zoning tab now pass T4's test, and found new gaps:
Check with the city rows without the requirement (T4); the occupant-load table unmarked in the preparation sheet and
Streamlit, and EG-3 citing an ADA section from memory (T5); and the Not sure claims on Answers and Help (L4). The last
of these is true only because the engine reports a pass for an aisle with no width (ADA-1), which breaks "Unknown never
becomes a pass"; that is a logic change, left for the owner. Fixed after this scoring, not re-scored: the
occupant-load note in the preparation sheet and Streamlit, and the Answers and Help copy now say a few checks don't yet
turn Not sure into Check with the city.

| # | Item | Source | design-v3 |
|---|---|---|---|
| **Trust** | | | |
| T1 | No approval wording and no green tick anywhere | CONTENT.md rule 11; test (banned words) | Fail at scoring: the demo plan "Café that passes" and the zoning word "Likely allowed here" with a tick. Fixed after: "Café with no issues found", "No zoning issue found" |
| T2 | The disclaimer sits beside every result and in the PDF | decisions.md (disclaimer beside results) | Pass |
| T3 | "Check with the city" has its own calm treatment, distinct from Fix and from No issues found | decisions.md (shape-coded icons) | Pass |
| T4 | Each finding shows the measurement, the rule and the code section | CLAUDE.md (every finding has a citation) | **Fail** (second rule-verification scoring): No issues found rows and the Zoning tab now pass. Still open: Check with the city rows such as "Your plan doesn't show fire extinguishers." give no requirement, and EG-3's missing-width row never states 32 in.; a zoning found again after the check shows no code section |
| T5 | Rules not yet checked against the code are marked as such | CLAUDE.md (`_meta.verify`) | **Fail** (second rule-verification scoring). Fixed after: the occupant-load note in the preparation sheet and Streamlit. Still open: EG-3 counts as checked but cites ADA 404.2.3 from memory; the assembly permit and the sheet's "Group A-2" and "106 people" rest on unverified rules with only the first-page line |
| T6 | Nothing looks official: no seals, stamps or city colours | design brief section 1 | Pass |
| **Flow** | | | |
| F1 | Upload, a few questions, confirm, results | design brief | Pass |
| F2 | The least-certain readings come first and are editable in one step | decisions.md ("Check these first") | Pass. Re-score: each empty reading now says "We couldn't read this from your plan." |
| F3 | Progress is visible on every step | design brief | Pass |
| F4 | The assistant opens beside the findings | design brief section 11 | Pass |
| F5 | Voice falls back to typing | website plan, stage 6 | Pass |
| **States** | | | |
| S1 | First visit | trust-UI states list | Pass |
| S2 | Plan could not be read | trust-UI states list | Pass |
| S3 | No zoning result | trust-UI states list | Pass |
| S4 | Nothing to fix | trust-UI states list | Pass |
| S5 | Many findings | trust-UI states list | Pass |
| S6 | Microphone unavailable | trust-UI states list | Pass |
| **Visual restraint** | | | |
| V1 | At most three type sizes per screen | decisions.md; test (type scale) | Fail at scoring: the map's zone label used 14 px and weight 600. Fixed after; the size test now reads the CSS `font:` shorthand too |
| V2 | No side strips, all-caps kickers, decorative badges or gradients | decisions.md | Pass |
| V3 | Every text colour reaches 4.5:1 on its background | WCAG 1.4.3; test (contrast pairs) | Pass |
| V4 | A quiet interface: one accent, red only for Fix | decisions.md (one colour family) | Fail at scoring: red on the Delete and Remove buttons. Fixed after: they are ink |
| V5 | One component library (React Aria) | website plan | Pass |
| **Landing** | | | |
| L1 | Says who it is for, what it does, and that it is a pre-check | CONTENT.md | Pass |
| L2 | "How it works" is high on the page | design brief | Fail at scoring: "How it works" sat below the form, in the order the v3 spec set. Fixed after: the four steps as one line directly under the intro sentence; the full section stays below the form. Test: flow.spec.ts (Start) |
| L3 | No copy slop (em-dash chains, "leverage", marketese) | plain-language guides | Pass |
| L4 | Claims no larger than the evidence | decisions.md (proof figures) | **Fail** (second rule-verification scoring): Answers and Help said a Not sure value is never counted as meeting a rule, but an aisle with no width gets No issues found (ADA-1, an engine bug). Fixed after: the copy says a few checks don't yet. Still open: the engine bug itself; "Checked by:" in the report PDF and Streamlit reads as if the city checked the finding; the footer says every rule is from Seattle codes while the food rules cite King County and WAC |
