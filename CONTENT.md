# CONTENT.md: how PermitOS writes

The writing rules for every string a person reads: the website, the assistant, and the two PDFs. They sit beside
[`DESIGN.md`](DESIGN.md) (how it looks). The research behind them is in [`docs/design-story.md`](docs/design-story.md);
the decisions are logged in [`docs/decisions.md`](docs/decisions.md). The build guard and `tests/test_content.py`
reject the banned words below, so the rules cannot drift.

The reader is about to sign a lease and is probably nervous. Write so they can act, and never so the page reads as an
approval or a telling-off.

## Rules

1. **Lead with the action.** Titles start with a verb: "Add a second exit", not "Second exit needed".
2. **Observation, then the need.** "Your plan shows 54 in. of clear floor. A wheelchair needs 60 in. to turn." No
   judging adjectives such as "too small".
3. **No blame words:** invalid, illegal, forbidden, fail, violation, you forgot, must. No please, sorry or oops.
4. **Each caveat once per screen, next to the result** it qualifies, not only in the footer.
5. **Numbers over adjectives:** "8 to 14 weeks", not "a while".
6. **People and things as subjects:** you, your plan, the city.
7. **A results page ends with one next step and one contact.**
8. **Comparisons with other businesses only when true and useful,** and always with how many permits they are based on.
9. **No design notes in user copy** ("Always shown, never behind a tab" is for us, not the owner).
10. **Half the words,** then check that nothing the reader needs is missing.
11. **Three status names, always these:** "Fix before you apply", "Check with the city", "No issues found". Never OK,
    pass, approved or compliant: we only know what we checked.

Words the tests reject in interface copy and the PDF templates: *approved, compliant, invalid, illegal, please, sorry,
oops*, and *pass* or *OK* used as a status label. The API's own status values (`pass`, `fail`, `review`) are data, not
copy, and stay as they are.

## Values still being checked

Say what is not yet checked, once, next to what it affects (rules 4 and 11):
- under a finding whose rule value is not yet read from the code: "This rule's value is still being checked against
  the code."
- once beside the results and on the first page of each PDF: "Some rule values are still being checked against the
  code."
- on Start's strip, saying the same as step 4: "Rules based on Seattle's code decide (none checked against the code text
  yet)" while no rule is checked, "(some values still being checked)" while some are.
- beside the occupant load, the occupancy group and the exits required in the PDFs, and beside a permit listed because
  of the number of people (website and PDFs): "Listed because of a value still being checked against the code."
- under the occupant-load table in the PDFs: "Some of these square-feet-per-person values are still being checked
  against the code."

A rule that uses another rule's result (the occupant load, the occupancy group) counts as checked only when that rule
is checked too.

The API decides which rules these are (`rule_verified`, `/api/meta` `rules_unverified`); the pages only show the words.

## Before and after

| Before | After | Rule |
|---|---|---|
| Second exit needed | Add a second exit | 1 |
| Not enough exits | Add a second exit | 1 |
| Restroom too small to turn a wheelchair | Widen the restroom so a wheelchair can turn | 1, 2 |
| The plan shows 54 in. of clear floor. A 60 in. turning circle is needed. | Your plan shows 54 in. of clear floor. A wheelchair needs 60 in. to turn. | 2, 6 |
| 1 exit(s) shown; 2 required for an occupant load of 106. | Your plan shows 1 exit. A space for 106 people needs 2. | 2, 5, 6 |
| OK (9) | No issues found (9) | 11 |
| MUST FIX | (removed: the red "!" icon and "Fix before you apply" say it) | 3, 9 |
| Tables on the sidewalk | Ask about sidewalk tables | 1 |
| A whole "What PermitOS is not" section | One line beside the results: "A pre-check from the checks we ran, not a city approval." | 4 |
| Always shown, never behind a tab | (removed) | 9 |
| This server cannot read uploaded plans yet. | This server can't read uploaded plans yet. | 10 |
| Invalid file | We can't read this kind of file. Upload a PDF, PNG or JPG. | 3 |
| Exit signs: Your plan shows 3 exit signs. | Your plan shows 3 exit signs. Each of the 2 exits needs one. | 2: every No issues found row says what the plan shows and what it meets |
| Checked by: SDCI Ordinance review | Who to ask: SDCI Ordinance review | claims no larger than the evidence: the city has not checked anything |
| Your plan doesn't show fire extinguishers. | Your plan doesn't show fire extinguishers. Each floor needs at least one within 75 ft of travel. | 2: Check with the city rows state the requirement too |
| Rules we coded from Seattle's building codes list what to fix… | Our team coded these rules from Seattle's building and plumbing codes, the federal accessibility standards, and the King County and Washington State food codes. … None of the 21 rules is checked against the code text yet. | claims no larger than the evidence (the count comes from the API) |
| It does not look at … ventilation | It checks for a kitchen exhaust hood where there is cooking, but not ventilation rates … | say what is checked |
| May be needed · May be needed: check with the city. It depends on … | May be needed · Check with the city. It depends on … | say it once |
| Also used in the check | Also read from your plan (values no rule reads say "not checked") | claims no larger than the evidence |
| Every exit door on your plan swings outward (with a sliding door) | Check the exit door: your plan shows this exit door as sliding, not swinging. … | 2: observation first, nothing the plan doesn't show |
| Seattle's rules decide | Rules based on Seattle's code decide | claims no larger than the evidence: the rules are our coding of the code, not the city's own |
| Run Seattle's rules (Checking) | Run the rules | the same |
| Read by the vision model. Check every value against your plan. | The model read your plan. Check each value against the drawing. | 6, 10 |
| You are entering the measurements yourself. Leave anything you are not sure of empty. | You're entering the measurements yourself. Leave anything you're not sure of empty. | 10 |
| No plan has been read in this browser tab yet. | We haven't read a plan in this browser tab yet. | 6 |
| We're not sure we read this right. (under every empty reading) | We couldn't read this from your plan. | 2 |
| These would stop a permit review. | These are likely to stop a permit review. | claims no larger than the evidence |
| Anything left as Not sure is listed under Check with the city. | A value left as Not sure is never counted as meeting a rule. | claims no larger than the evidence |
