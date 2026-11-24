# Verifying rules: how a rule moves from unchecked to reviewed

Every rule in `checker/rules/seattle.json` (the `rules` section) has a `check_level`:

| Level | What it means | What the owner sees under a finding |
| --- | --- | --- |
| `unchecked` | Our team coded the rule, but nobody has yet compared every number and condition with the code text. | "This rule's value is still being checked against the code." |
| `transcribed` | A person on the team read the section in the 2021 Seattle Building Code (or the other code the rule cites), compared every number and condition, and recorded who and when. | "Checked against the code text by our team." |
| `reviewed` | An expert (a licensed architect, an engineer, a plan reviewer) also reviewed the rule, and the review is recorded. | "Reviewed by {name, role}, {date}." |

A finding's level is the **lowest** level of its own rule and every rule it depends on (`depends_on`), because a
sprinkler finding is only as good as the occupant load it uses. The level never changes a finding's status: an
unchecked rule can still say Fix before you apply, and nothing unknown ever becomes No issues found.

`tests/test_rules.py` fails if:
- a `transcribed` or `reviewed` rule names a section (in `source`, separated by `;`) that is not in
  `_meta.sections_read`, or one that is there but not marked `"complete": true`;
- a `transcribed` or `reviewed` rule lacks `transcribed_by` or a `transcribed_on` date (`YYYY-MM-DD`);
- a `reviewed` rule lacks `reviewed_by` (with both `name` and `role`) or a `reviewed_on` date;
- an `unchecked` rule carries a transcription or review record.

The engine is just as strict: a level whose record is incomplete counts as the level below it.

**Today all 21 rules are `unchecked` and none is reviewed.** Four rules (EG-2, EG-4, FS-1, FS-2) used to say
`"verified": true` because an automated build session had read their sections from the code PDFs. That reading is
kept in `_meta.sections_read`, but a rule only becomes `transcribed` when a named person has compared it and dated it.

## How to transcribe a rule

1. **Get the code text.** Open the 2021 Seattle Building Code chapter PDF on seattle.gov (SDCI's "Seattle Building
   Code" page; Chapter 10 for exits, Chapter 9 for sprinklers, Chapter 29 for plumbing fixtures, Chapter 3 for
   occupancy groups). For rules that cite another code (the Seattle Fire Code, the Seattle Mechanical Code, the 2010
   ADA Standards, ICC A117.1, King County Title 5, WAC 246-215), open that code's official text instead.
2. **Find the section** the rule's `source` names. If the rule names several sections, every one of them must be read.
3. **Compare every number and condition.** For each value the rule uses in `seattle.json` (the table above each rule
   in `docs/rulebook.md` lists them), check the number, the unit, the boundary (is it "50 or more" or "more than
   50"?), the occupancy groups it applies to, and every exception. If anything differs, fix `seattle.json` first
   (and the evidence in `docs/rulebook.md`), run `python -m pytest`, and only then mark the rule.
4. **Record the section** in `_meta.sections_read`, if it is not there yet:
   ```json
   {"section": "SBC 2021 1010.1.2.1", "read_from": "2021 SBC Chapter 10 PDF", "read_on": "2026-12-01",
    "read_by": "Your Name", "complete": true}
   ```
   `section` must match the rule's `source` exactly. Use `"complete": false` (with a `note`) when part of the section
   could not be read; a rule that names it cannot be transcribed until it is complete.
5. **Mark the rule** in the `rules` section:
   ```json
   "EG-2": {"check_level": "transcribed", "source": "SBC 2021 1010.1.2.1",
            "transcribed_by": "Your Name", "transcribed_on": "2026-12-01", "evidence": "...", "depends_on": ["OL-0"]}
   ```
6. **Run the tests**: `python -m pytest`.
7. **Commit with the section in the message**, one rule per commit, for example:
   `Rulebook: transcribe EG-2 (SBC 2021 1010.1.2.1)`.

The site, both PDFs, the Markdown report, Streamlit and the assistant pick the new level up on the next check. The
counts on Start, In short and Help come from `GET /api/meta`.

## How an expert review is recorded

1. The rule must already be `transcribed`.
2. The expert reads the rule's values in `seattle.json` (or the row in the table below and in `docs/rulebook.md`)
   against the code, and says it is right, or what to change. Changes go in first, as above.
3. Record the review on the rule:
   ```json
   "check_level": "reviewed",
   "reviewed_by": {"name": "Jane Doe", "role": "licensed architect, Washington"},
   "reviewed_on": "2027-01-15",
   "review_note": "Optional: what was checked, or a condition the reviewer attached."
   ```
4. Ask the reviewer whether their name may be shown: the finding says "Reviewed by Jane Doe, licensed architect,
   Washington, 2027-01-15." Do not record a review without their agreement to be named.
5. Run `python -m pytest`, and commit: `Rulebook: EG-2 reviewed by Jane Doe (licensed architect)`.

## The 21 rules

Do the **foundations first**: almost every other rule uses the occupant load (OL-0), the occupancy group (OCC-1) or
the number of exits (EG-1), so no rule that depends on them can rise above their level.

| ID | What it checks | Source | Level | Depends on | Order |
| --- | --- | --- | --- | --- | --- |
| OL-0 | Occupant load: people per room from its area and use | SBC 2021 Table 1004.5 | unchecked | - | **do first** |
| OCC-1 | Occupancy group (A-2, A-3, B, M) for the business type and load | SBC 2021 303.1.1; SBC 2021 Chapter 3 | unchecked | OL-0 | **do first** |
| EG-1 | Number of exits for the load | SBC 2021 Table 1006.2.1; SBC 2021 1006.3 | unchecked | OL-0 | **do first** |
| EG-2 | Exit doors swing outward at 50 or more people | SBC 2021 1010.1.2.1 | unchecked | OL-0 | after OL-0 |
| EG-3 | Door clear width | SBC 2021 1010.1.1 | unchecked | - | any time |
| EG-4 | Exit width per occupant | SBC 2021 1005.3.2 | unchecked | OL-0 | after OL-0 |
| FS-1 | Exit signs | SBC 2021 1013.1 | unchecked | EG-1 | after EG-1 |
| FS-2 | Sprinklers (A-2, A-3, M triggers) | SBC 2021 903.2.1.2; SBC 2021 903.2.1.3; SBC 2021 903.2.7 | unchecked | OL-0, OCC-1 | after OL-0, OCC-1 |
| FS-3 | Fire extinguishers | SFC 2021 906.1; SFC 2021 906.4 | unchecked | - | any time |
| ADA-1 | Accessible route and aisle width | SBC 2021 Chapter 11; ICC A117.1; 2010 ADA 403.5.1 | unchecked | - | any time |
| ADA-2 | Restroom wheelchair turning space | SBC 2021 Chapter 11; ICC A117.1; 2010 ADA 304.3.1, 603.2.1 | unchecked | - | any time |
| ADA-3 | Restroom door clear width | SBC 2021 1010.1.1 | unchecked | - | any time |
| ADA-4 | Accessible seating share | SBC 2021 Chapter 11; 2010 ADA 226.1 | unchecked | - | any time |
| PL-1 | Toilets for the load and group (and urinals) | SBC 2021 Table 2902.1; SBC 2021 2902.1.1; SBC 2021 2902.2 | unchecked | OL-0, OCC-1 | after OL-0, OCC-1; re-read the business and mercantile rows |
| PL-2 | Lavatories (restroom sinks) | SBC 2021 Table 2902.1 | unchecked | OL-0, OCC-1 | after OL-0, OCC-1 |
| PL-3 | Service sink (struck out in Seattle) | SBC 2021 Table 2902.1 | unchecked | OCC-1 | after OCC-1 |
| MECH-1 | Kitchen exhaust hood where cooking makes grease or smoke | SMC 2021 507; SFC 2021 904 | unchecked | - | any time |
| HLTH-1 | Handwashing sink in food prep | King County Board of Health Code Title 5; WAC 246-215 | unchecked | - | any time |
| HLTH-2 | Three-compartment sink (warewashing) | King County Board of Health Code Title 5; WAC 246-215 | unchecked | - | any time |
| HLTH-3 | Mop sink (health code) | King County Board of Health Code Title 5; WAC 246-215 | unchecked | - | any time |
| ZN-1 | Zoning: is the business allowed in the zone | SMC Title 23 | unchecked | - | any time |

Already in `_meta.sections_read` (read by an automated session in November 2026, so a person still has to compare
and sign): Table 1004.5, Table 1006.2.1, 1010.1.1, 1010.1.2.1, 1005.3.2, 1013.1, 903.2.1.2, 903.2.1.3, 903.2.7,
2902.2, SMC 23.44.020.E, and Table 2902.1 (marked incomplete: two rows were garbled). Being in the record does not
make a rule transcribed; it only means the section has been located.

Keep this table in step with `seattle.json` when a level changes.
