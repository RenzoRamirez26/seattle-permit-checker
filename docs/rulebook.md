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

## What the checker does not look at

Travel distance and common path, corridor ratings, stairs, structural, energy, ventilation rates, electrical, parking, signage rules, landmark design review, stormwater, and anything about the building outside the tenant space.

## Changing a rule

1. Change the number in `seattle.json`, not in Python.
2. Add where it came from to `_meta.checked_against_city_sources`, or leave it under `_meta.verify`.
3. Update the table above.
4. Run `python -m pytest`. If a test fails, the test was pinning the old number: change it on purpose, in the same pull request.
