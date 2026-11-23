# Design brief: Seattle Permit Pre-Check website

For the React front end (Stage 2 onward). The Streamlit app is not affected.

**Status.** These are starting recommendations. Nobody has tested them with a business owner.
The colour contrast figures were calculated; everything else is a judgment to revisit after
watching people use the site. The research behind each rule, with links, is in the doc
"Website design reference for the permit pre-check".

## 1. What the site is

A short guided flow with one task per page. The assistant sits beside the flow as help. An
owner can finish the whole check without opening it.

    Start -> Your business -> Your floor plan -> Check what we read -> Results

Tone: calm, plain and precise, like a well-drawn floor plan. Paper background, dark ink, thin
lines, one blue. No gradients, glass panels or decorative illustration on the task pages.

The site must not look like a City of Seattle or government service: no seals, no city
colours, no city logo. The footer on every page says who runs it, that it is not a city
service, and the date of the rulebook.

## 2. Flow rules

| Rule | On this site |
|---|---|
| One thing per page | Each page asks one question or one closely related group. The question is the page heading (`h1`). |
| Buttons say what happens | "Read my plan", "Run the check". Never "Next" or "Submit". |
| Always a way back | Back link at the top of every step. Going back keeps what was entered. |
| "I don't know" is allowed | Offer "Not sure" wherever an owner may not know. It becomes "Check with the city" in the results (the `review` status). |
| Optional fields say so | Write "(optional)". No asterisks. |
| Each step stands alone | Everything needed to answer is on the page. |
| Help sits beside the form | The assistant panel never covers the fields or the main button. |
| Refresh keeps the work | Each step has its own URL. Entries survive a refresh. |
| Show what is happening | While the plan is read, name the stage ("Finding doors and exits"). No bare spinner. |
| Owner's words | "Restroom", "sent back for corrections". Code sections go behind "Show the code reference". |
| No dead ends | Every page, error and empty state offers a next action. |
| Step line | "Step 2 of 4: Your floor plan". No larger progress bar unless testing shows a need. |

### Error messages

- Say what went wrong and how to fix it, in the same words as the question.
- Show the message next to the field and repeat it in a summary box at the top of the page.
- Keep what the person typed.
- Do not use "please", "sorry", "invalid" or "oops".

Examples:

- "The file must be a PDF, PNG or JPG."
- "Enter a street address in Seattle, for example 1420 5th Ave."
- "We could not read this plan. Upload a clearer copy, or enter the measurements yourself."

When the model fails, the owner must still be able to finish by entering values by hand.

## 3. Grid and spacing

| Screen width | Columns | Gutter | Side margin |
|---|---|---|---|
| under 640 px | 4 | 16 px | 16 px |
| 640 to 1023 px | 8 | 24 px | 32 px |
| 1024 px and up | 12 | 24 px | centred, content at most 1200 px wide |

- Spacing unit: 8 px. Allowed gaps: 4, 8, 16, 24, 32, 48, 64, 96 px. Nothing else.
- Every block starts and ends on a column edge.
- Question pages: one column of text and fields, 7 of 12 columns wide (about 690 px, roughly
  75 characters a line at the body size). It starts at column 1.
- Columns 9 to 12 are where the assistant panel opens on a wide screen, so the form stays visible.
- "Check what we read": plan image in 7 columns, the list of facts in 5. On a phone the plan
  comes first and can be zoomed.
- Results: findings in 8 columns, a summary in 4 (counts, zoning with the small map, downloads).
  The summary stays in view while the findings scroll.

## 4. Type

- Text: IBM Plex Sans. Code sections, permit numbers and measurements: IBM Plex Mono. Both are
  open-licence fonts. This is a starting choice; if it changes, change it here first.
- Two weights only: 400 and 600.
- Sizes (font size / line height): 14/20 small print, 18/24 body, 24/32 section heading,
  32/40 page heading on phones, 40/48 page heading on wide screens.
- Lines of text no longer than about 80 characters.
- Numbers in tables use tabular figures so columns line up.
- Left-aligned text. No centred paragraphs. No all-capitals sentences.

## 5. Colour

| Role | Hex | Contrast on paper | Use |
|---|---|---|---|
| Paper | `#FAF8F3` | | Page background |
| Ink | `#1B1F24` | 15.6 to 1 | Text |
| Muted ink | `#55606B` | 6.1 to 1 | Hints, captions |
| Blueprint blue | `#1F4E8C` | 7.8 to 1 | Links, the main button, focus ring. White text on it is 8.3 to 1. |
| Fix | `#B3261E` on tint `#FBE9E7` | 6.2 to 1 (5.6 on its tint) | Problems only |
| Check with the city | `#7A4F00` on tint `#FBF0D9` | 6.7 to 1 (6.3 on its tint) | Items that could not be decided |
| OK | `#1E6B3A` on tint `#E4F2E8` | 6.2 to 1 (5.6 on its tint) | Items that passed |
| Field border | `#7C8691` | 3.5 to 1 | Outlines of inputs and cards that can be clicked |
| Hairline | `#D9D4C8` | decorative | Dividers only, never the only sign of a control |

- A status is never shown by colour alone. It always has an icon and its words: "Fix",
  "Check with the city", "OK".
- Red appears only on problems, so it keeps its force.
- Targets: 4.5 to 1 for text, 3 to 1 for large text and control outlines.
- No dark mode in the first version.

## 6. Components

- **Main button:** one per page. Blue background, white text, 48 px tall, left-aligned under the form.
- **Text field:** visible label above, hint under the label, 48 px tall, 3 px blue focus ring.
  Placeholder text is never the label.
- **Business type:** six radio cards. The whole card is clickable.
- **File upload:** a large drop area plus a "Choose a file" button. On a phone, offer the camera.
  States: empty, uploading, read, failed.
- **Fact row** (check page): what was read, where on the plan, and a Change control. Unknown
  values show "Not sure" and can be filled in or left.
- **Finding card:** status tag, plain title, what was measured, what the rule needs, how to fix
  it, a "Show the code reference" disclosure, and an "Ask about this" link.
- **Record line:** a sentence with its count, for example "Of 529 similar projects, 462 were
  sent back at least once." Every statistic shows how many permits it is based on.
- **Error summary:** a box at the top listing each error as a link to its field.

## 7. Screens

| Screen | Heading | Contains | Main button |
|---|---|---|---|
| Start | Check your floor plan before you apply | What it does, what you need (a floor plan as a PDF or photo, the address), that it is not a city service, a link to try an example plan | Start |
| Step 1 | What kind of business is it? | The six types, whether there is cooking, the address with a small map to confirm the place | Continue |
| Step 2 | Upload your floor plan | Accepted file types, what a usable plan shows, a note that plans are not saved | Read my plan |
| Reading | Reading your plan | The current stage by name, a way to cancel | |
| Step 3 | Check what we read from your plan | The plan beside the facts read from it, each with Change | Run the check |
| Step 4 | Your pre-check results | One sentence with the counts; Fix, Check with the city, OK (collapsed); permits to expect; what Seattle's records show; zoning; downloads | Download the fix list (PDF) |

Do not state how long the check takes until it has been timed.

## 8. The assistant

- A round button fixed at the bottom right, at least 44 px across, with the visible word "Ask".
- Wide screens: opens a panel in columns 9 to 12. Phones: opens as a sheet from the bottom. Closed,
  it must not cover the page's main button.
- It offers three or four ready-made questions that fit the current step.
- Before results exist it answers only from fixed help text about how the check works. After
  results exist it answers only from the audit result, through `agent.check_grounded()`.
- Each answer links to the finding it came from and scrolls the page to it.
- It says once, in a fixed place, what it can and cannot do: it explains the pre-check and does
  not approve permits.
- Voice is a microphone button inside the panel. The words heard and the words spoken are
  always shown as text. One setting turns voice off.
- It never opens by itself.
- Keyboard: focus moves into the panel on open and back to the button on close. Escape closes it.
- No name, face or personality.

## 9. The map

- It appears in two places only: the address step (a pin and "Is this the right place?") and
  the zoning card in the results (the pin, the outline of the zone, the zone's name).
- No layer switcher, no search box, no other data on it.
- The same information is written in words beside it: address, zone, overlays.
- The zone is never identified by colour alone.

## 10. Downloads

- PDF only. Buttons name the content: "Download the fix list (PDF)", "Download the permit
  preparation sheet (PDF)".
- The PDFs use the same status words as the site.

## 11. Motion

- The assistant panel slides in over 150 to 200 ms. Nothing else needs to move.
- Animate only `transform` and `opacity`.
- Respect the reduced-motion setting.
- Nothing animates on question pages.

## 12. Checks before a front-end pull request merges

- [ ] Every action can be done with the keyboard alone, and focus is always visible.
- [ ] An accessibility checker (WAVE or axe) reports no new errors.
- [ ] Every field has a visible label. Errors show next to the field and in the summary.
- [ ] Text contrast is at least 4.5 to 1; large text and control outlines at least 3 to 1.
- [ ] Touch targets are at least 44 px on phones.
- [ ] The page works at 320 px wide with no sideways scrolling.
- [ ] The flow can be completed with the assistant closed, and with voice off.
- [ ] A refresh on any step keeps what was entered.
- [ ] Screenshots at 375 px and 1280 px wide are attached.

## 13. Do not

- Call a model from the browser. All model calls go through the backend.
- Show raw model output as HTML.
- Show an accuracy figure for the plan reading before it has been measured.
- Put a rule or a code value in the front end. It displays what `checker/` returns.
- Use the city's logo, seal or colours, or wording that suggests approval by the city.
- Add a second accent colour, a gradient background or a hero image to the task pages.

## 14. Test with people

Ask three to five people who have not seen the site to do one task: "Find out what you would
need to fix before applying." Do not help. Write down where each one stops or asks a question,
and fix those places first.
