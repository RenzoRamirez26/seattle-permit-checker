# The rulebook: what was checked and what was not

`checker/rules/seattle.json` holds every number the checker uses. This page says where each came from, so the team knows what can be shown to a judge as checked.

## Edition date

`_meta.edition_date` is the date the website footer shows for this rulebook (`GET /api/meta` returns it as
`rulebook.edition_date`). It is still the placeholder `"TODO: the owner sets this date"`: no date has been
chosen yet. While it is the placeholder, the API returns `null` and the footer shows no date. The owner
sets the real date (as `YYYY-MM-DD`); no build session writes one.

## Checked against Seattle's published text

Read from the 2021 Seattle Building Code (SBC) chapter PDFs on seattle.gov in November 2026.

| Rule | Value | Source |
| --- | --- | --- |
| Occupant load factors | Tables and chairs 15 net; standing 5 net; business 150 gross; exercise 50 gross; commercial kitchen 200 gross; mercantile 60 gross; storage 300 gross | SBC Table 1004.5 |
| One exit allowed up to | 49 occupants, Groups A, B and M | SBC Table 1006.2.1 |
| Door clear width | 32 in. minimum | SBC 1010.1.1 |
| Exit doors swing outward | at 50 or more occupants | SBC 1010.1.2.1 |
| Exit width | 0.2 in. per occupant | SBC 1005.3.2 |
| Exit signs | not required where only one exit is required | SBC 1013.1 exception 1 |
| Sprinklers, restaurants and bars (A-2) | 100 occupants, or over 5,000 sq ft, or not on the exit level | SBC 903.2.1.2 |
| Sprinklers, gyms and studios (A-3) | 300 occupants, or over 12,000 sq ft, or not on the exit level | SBC 903.2.1.3 |
| Sprinklers, retail (M) | over 12,000 sq ft | SBC 903.2.7 |
| Toilets: restaurants | 1 per 75 each sex; lavatories 1 per 200 | SBC Table 2902.1 |
| Toilets: bars | 1 per 40 each sex; lavatories 1 per 75 | SBC Table 2902.1 |
| Toilets: A-3 | 1 per 125 men, 1 per 65 women; lavatories 1 per 200 | SBC Table 2902.1 |
| One shared toilet room allowed | up to 15 occupants (any use), 25 (business), 30 (dining and drinking), 100 (mercantile) | SBC 2902.2 exceptions 2, 4, 7, 3 |
| Service sink | struck out of the Seattle table; required by the health code for food businesses | SBC Table 2902.1; Public Health |
| Fire Department assembly permit | 100 or more people | Seattle Office of Economic Development checklist |
| Permit list and agencies | see the rulebook | Seattle food business handbook |
| Shops and restaurants in Neighborhood Residential zones | up to 2,500 sq ft, ground floor, closed 10 p.m. to 6 a.m. | Ordinance 127376, SMC 23.44.020.E |
| NC1 and NC2 size limits | 10,000 and 25,000 sq ft | SDCI Commercial Zoning Summary (October 2019, so re-check) |
| "Ordinance" is the building-code review | its comments carry subjects such as "10 Means of Egress" | Plan Comments dataset |

Two rows of Table 2902.1 came through garbled in the PDF text and should be re-read by a person: **business** (1 per 25 for the first 50, then 1 per 50; lavatories 1 per 40 for the first 80, then 1 per 80) and **mercantile** (1 per 500; lavatories 1 per 750).

## Entered from memory, not checked

Check each of these before presenting it as authoritative.

- Which occupancy group each business type gets (salon and office as B, retail as M, gym as A-3).
- The 15 sq ft per person used for waiting areas.
- Three or more exits above 500 occupants.
- The kitchen hood and fire extinguisher section numbers.
- The ADA section numbers, the 36 in. accessible route, the 60 in. turning circle and the 5% accessible seating. Washington adopts ICC A117.1 and the edition was not confirmed; its newer edition asks for a larger turning space in new buildings.
- The Washington State salon and shop licence.
- Zoning: that restaurants and shops are allowed outright in NC, C, Seattle Mixed and the downtown core zones; that bars need a conditional use in NC1 and NC2; the status of multifamily, industrial and special-review zones.
- The King County and Washington food code citation for sinks.

## Which rules are checked against the code

`seattle.json` has a `rules` section: one entry per rule id the checker reports, with `verified` (true or false),
`source` (code edition and section) and the `evidence` for that choice. A rule is `verified: true` only when every value
it uses is listed under "Checked against Seattle's published text" above; every other rule is false. Each finding
carries `rule_verified` and `rule_source`; the website, both PDFs, the Streamlit demo and the assistant say "This rule's
value is still being checked against the code." beside a finding whose rule is false. `verified` never changes a
finding's status. `tests/test_rules.py` fails if a rule lacks either field, or if a verified rule names a section that
is not listed as checked.

| Rule | Own values verified | Depends on | Counts as checked | Source | Evidence |
| --- | --- | --- | --- | --- | --- |
| OL-0 | no | - | no | SBC 2021 Table 1004.5 | Table 1004.5 was read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources), but the 15 sq ft per person used for waiting areas is from memory (_meta.verify). |
| OCC-1 | no | OL-0 | no | SBC 2021 303.1.1; SBC 2021 Chapter 3 | The occupancy group for each business type is from memory (_meta.verify). Group B under 50 occupants comes from an SDCI review comment, not the code text. |
| EG-1 | no | OL-0 | no | SBC 2021 Table 1006.2.1; SBC 2021 1006.3 | One exit up to 49 occupants was read from Table 1006.2.1, but three exits above 500 occupants is from memory (_meta.verify). |
| EG-2 | yes | OL-0 | no | SBC 2021 1010.1.2.1 | Door swing at 50 occupants was read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources). |
| EG-3 | yes | - | yes | SBC 2021 1010.1.1 | The 32 in. door clear width was read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources). The ADA 404.2.3 cross-reference in the citation is from memory. |
| EG-4 | yes | OL-0 | no | SBC 2021 1005.3.2 | 0.2 in. of exit width per occupant was read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources). |
| FS-1 | yes | EG-1 | no | SBC 2021 1013.1 | Exit signs not required where only one exit is required (1013.1 exception 1) was read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources). |
| FS-2 | yes | OL-0, OCC-1 | no | SBC 2021 903.2.1.2; SBC 2021 903.2.1.3; SBC 2021 903.2.7 | The A-2, A-3 and M sprinkler triggers were read from the SBC Chapter 9 PDF (_meta.checked_against_city_sources). |
| FS-3 | no | - | no | SFC 2021 906.1; SFC 2021 906.4 | The fire extinguisher section numbers are from memory (_meta.verify). |
| ADA-1 | no | - | no | SBC 2021 Chapter 11; ICC A117.1; 2010 ADA 403.5.1 | The 36 in. accessible route and the ADA section numbers are from memory, and the A117.1 edition was not confirmed (_meta.verify). |
| ADA-2 | no | - | no | SBC 2021 Chapter 11; ICC A117.1; 2010 ADA 304.3.1, 603.2.1 | The 60 in. turning circle and the ADA section numbers are from memory (_meta.verify). |
| ADA-3 | yes | - | yes | SBC 2021 1010.1.1 | Uses the 32 in. door clear width read from the SBC Chapter 10 PDF (_meta.checked_against_city_sources). |
| ADA-4 | no | - | no | SBC 2021 Chapter 11; 2010 ADA 226.1 | The 5% accessible seating and the ADA section number are from memory (_meta.verify). |
| PL-1 | no | OL-0, OCC-1 | no | SBC 2021 Table 2902.1; SBC 2021 2902.1.1; SBC 2021 2902.2 | Read from the SBC Chapter 29 PDF, but the business and mercantile rows of Table 2902.1 were garbled in the extract and still need a person to re-read them (docs/rulebook.md). |
| PL-2 | no | OL-0, OCC-1 | no | SBC 2021 Table 2902.1 | Lavatory ratios come from the same table; the business and mercantile rows still need re-reading (docs/rulebook.md). |
| PL-3 | no | OCC-1 | no | SBC 2021 Table 2902.1 | The service sink is struck out of Seattle's table, so this rule does not run in Seattle; nothing confirms the row's other uses. |
| MECH-1 | no | - | no | SMC 2021 507; SFC 2021 904 | The kitchen hood section numbers are from memory (_meta.verify). |
| HLTH-1 | no | - | no | King County Board of Health Code Title 5; WAC 246-215 | The food code citation for sinks is from memory (_meta.verify). |
| HLTH-2 | no | - | no | King County Board of Health Code Title 5; WAC 246-215 | The food code citation for sinks is from memory (_meta.verify). |
| HLTH-3 | no | - | no | King County Board of Health Code Title 5; WAC 246-215 | The food code citation for sinks is from memory (_meta.verify). |
| ZN-1 | no | - | no | SMC Title 23 | Neighborhood Residential limits were read from SMC 23.44.020.E, but the status of most other zones and of bars and gyms in each zone is from memory (_meta.verify). |

`depends_on` names the rules whose results a rule uses. A finding counts as checked only when its own rule and every
rule it depends on are verified, so a sprinkler finding built on an occupant load with an unverified factor says its
value is still being checked. The occupant-load table in the PDFs carries the same mark (OL-0).

## Values used only in fix text

Numbers in a finding's title, message or fix come from `seattle.json` or from the plan; `tests/test_rules.py` reads the
source of `rules_engine.py` and `zoning.py` and fails on any number written there.

| Value | Where | Status |
| --- | --- | --- |
| 36 in. door, suggested to get 32 in. clear | `egress.door_nominal_width_in` (EG-3 and ADA-3 fixes) | Trade practice, not a code value |
| 28 to 34 in. accessible table surface height | `accessibility.table_surface_height_in` (ADA-4 fix) | From memory (`_meta.verify`) |
| 5 to 7 months for a land use approval | `zoning.land_use_approval_time` (zoning fix) | From memory (`_meta.verify`) |

## What the checker does not look at

Travel distance and common path, corridor ratings, stairs, structural, energy, ventilation rates, electrical, parking, signage rules, landmark design review, stormwater, and anything about the building outside the tenant space.

## Changing a rule

1. Change the number in `seattle.json`, not in Python.
2. Add where it came from to `_meta.checked_against_city_sources`, or leave it under `_meta.verify`.
3. Update the table above, and the rule's `verified`, `source` and `evidence` in the `rules` section.
4. Run `python -m pytest`. If a test fails, the test was pinning the old number: change it on purpose, in the same pull request.
