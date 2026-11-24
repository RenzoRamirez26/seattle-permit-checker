# Design checklist

Pass/fail items for every version, each naming its source. Score a version in a separate pass from designing it.
"Test" means a test in the repository checks it, so it cannot drift.

| # | Item | Source | design-v3 |
|---|---|---|---|
| **Trust** | | | |
| T1 | No approval wording and no green tick anywhere | CONTENT.md rule 11; test (banned words) | |
| T2 | The disclaimer sits beside every result and in the PDF | decisions.md (disclaimer beside results) | |
| T3 | "Check with the city" has its own calm treatment, distinct from Fix and from No issues found | decisions.md (shape-coded icons) | |
| T4 | Each finding shows the measurement, the rule and the code section | CLAUDE.md (every finding has a citation) | |
| T5 | Rules not yet checked against the code are marked as such | CLAUDE.md (`_meta.verify`) | |
| T6 | Nothing looks official: no seals, stamps or city colours | design brief section 1 | |
| **Flow** | | | |
| F1 | Upload, a few questions, confirm, results | design brief | |
| F2 | The least-certain readings come first and are editable in one step | decisions.md ("Check these first") | |
| F3 | Progress is visible on every step | design brief | |
| F4 | The assistant opens beside the findings | design brief section 11 | |
| F5 | Voice falls back to typing | website plan, stage 6 | |
| **States** | | | |
| S1 | First visit | trust-UI states list | |
| S2 | Plan could not be read | trust-UI states list | |
| S3 | No zoning result | trust-UI states list | |
| S4 | Nothing to fix | trust-UI states list | |
| S5 | Many findings | trust-UI states list | |
| S6 | Microphone unavailable | trust-UI states list | |
| **Visual restraint** | | | |
| V1 | At most three type sizes per screen | decisions.md; test (type scale) | |
| V2 | No side strips, all-caps kickers, decorative badges or gradients | decisions.md | |
| V3 | Every text colour reaches 4.5:1 on its background | WCAG 1.4.3; test (contrast pairs) | |
| V4 | A quiet interface: one accent, red only for Fix | decisions.md (one colour family) | |
| V5 | One component library (React Aria) | website plan | |
| **Landing** | | | |
| L1 | Says who it is for, what it does, and that it is a pre-check | CONTENT.md | |
| L2 | "How it works" is high on the page | design brief | |
| L3 | No copy slop (em-dash chains, "leverage", marketese) | plain-language guides | |
| L4 | Claims no larger than the evidence | decisions.md (proof figures) | |
