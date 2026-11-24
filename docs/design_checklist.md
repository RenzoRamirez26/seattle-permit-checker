# Design checklist

Pass/fail items for every version, each naming its source. Score a version in a separate pass from designing it.
"Test" means a test in the repository checks it, so it cannot drift.

design-v3 was scored on 24 November 2026 by a separate reviewing agent that had not built the pages, from the
screenshots in `screenshots/design-v3/` and the code: 20 of 26 passed. Three failures were fixed after the scoring
(marked below); three remain.

| # | Item | Source | design-v3 |
|---|---|---|---|
| **Trust** | | | |
| T1 | No approval wording and no green tick anywhere | CONTENT.md rule 11; test (banned words) | Fail at scoring: the demo plan "Café that passes" and the zoning word "Likely allowed here" with a tick. Fixed after: "Café with no issues found", "No zoning issue found" |
| T2 | The disclaimer sits beside every result and in the PDF | decisions.md (disclaimer beside results) | Pass |
| T3 | "Check with the city" has its own calm treatment, distinct from Fix and from No issues found | decisions.md (shape-coded icons) | Pass |
| T4 | Each finding shows the measurement, the rule and the code section | CLAUDE.md (every finding has a citation) | Pass |
| T5 | Rules not yet checked against the code are marked as such | CLAUDE.md (`_meta.verify`) | **Fail**: the site, API and PDF do not yet say which rule values are unverified (`_meta.verify`); TODO in decisions.md |
| T6 | Nothing looks official: no seals, stamps or city colours | design brief section 1 | Pass |
| **Flow** | | | |
| F1 | Upload, a few questions, confirm, results | design brief | Pass |
| F2 | The least-certain readings come first and are editable in one step | decisions.md ("Check these first") | Pass |
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
| L2 | "How it works" is high on the page | design brief | **Fail**: "How it works" sits below the form, in the order the v3 spec set |
| L3 | No copy slop (em-dash chains, "leverage", marketese) | plain-language guides | Pass |
| L4 | Claims no larger than the evidence | decisions.md (proof figures) | **Fail**: "Seattle's rules decide" was larger than the evidence while values are unverified (T5). Softened after: "Some of their values are still being checked against the code." |
