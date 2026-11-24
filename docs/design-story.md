# How PermitOS looks and talks, and why

PermitOS is for someone about to sign a lease on a café, a salon or a small shop in Seattle. They have a floor plan and a deadline, and they're probably nervous. They want to know whether the space will pass a permit review before they commit money to it.

That person can be hurt by a careless design in two ways. A screen that looks like an approval can send them into a lease the city later blocks. A screen that looks like a wall of warnings can scare them off a space that was fine. Every decision below comes back to that: **the design has to be calm, exact and honest about what we checked and what we didn't.**

The product's core rule shapes the design too. A model reads facts off the plan. The owner confirms them. Written rules decide. Anything unknown is never reported as fine. The interface has to make that order visible.

This document tells the story of how we got from the hackathon version to the current one, including the mistakes. The tokens and components themselves are in [`DESIGN.md`](../DESIGN.md), the writing rules are in [`CONTENT.md`](../CONTENT.md), and the short decision log is in [`decisions.md`](decisions.md).

---

## Language

### Where we started

The first versions said too much. A results summary read: *"2 things to fix before you apply, and 3 to confirm with the city. Everything else on your plan looks OK for a café this size. Fix the two items first; they would stop a permit review."* A finding was titled *"Restroom too small to turn a wheelchair."* One section even carried a design note meant for us: *"Always shown, never behind a tab."*

None of it was wrong. It was just more than a nervous reader needs, and some of it judged where it should have described.

### What we read

We looked for evidence rather than taste, in four places:

- **Writing for screens.** Nielsen and Morkes found that most people scan web pages, and that a version of a site rewritten to be concise, scannable and objective scored 124% better in measured usability, using about half the words.
- **Behavioural science.** The Behavioural Insights Team's EAST framework says a message works when it is easy: put the key message first, use simple words, state one specific action, and give one contact point. Specific facts beat general warnings.
- **Nonviolent communication.** Marshall Rosenberg separates an *observation* (what happened) from an *evaluation* (a judgment about it). Mixing them makes people hear criticism. Nielsen Norman Group, Google and GOV.UK say the same about error messages: say what went wrong and how to fix it, and never blame the person.
- **Plain-language guides and books.** The US Federal Plain Language Guidelines, GOV.UK's content design guidance, Strunk, Zinsser, Joseph Williams and Orwell all point the same way: cut words, use people and things as the subjects of sentences, and prefer short everyday words.

### What we changed

| Before | After | Why |
|---|---|---|
| "Second exit needed" | **Add a second exit** | Lead with the action. |
| "Restroom too small to turn a wheelchair" | **Widen the restroom to 60 in.** | A specific action with a number, not a judgment. |
| "The plan shows 54 in. of clear floor. A 60 in. turning circle is needed." | "Your plan shows 54 in. of clear floor. A wheelchair needs 60 in. to turn." | Observation first, then the need. |
| "OK (9)" | **No issues found (9)** | "OK" reads like a pass. We only know what we checked. |
| "Tables on the sidewalk" | **Ask about sidewalk tables** | Every finding says what to do next. |
| A whole "What PermitOS is not" section | One line beside the results | Say a caveat once, where it matters. |

We also dropped *please*, *sorry* and *oops*, and words like *invalid*, *illegal* and *fail*. Every results page now ends with one next step and one place to go for help.

### A mistake we corrected

At first we read "say each caveat once" as "put the disclaimer in the footer". Our own evaluation checklist caught it: the disclaimer has to sit **next to the result**, because that is where someone decides whether to trust it. The results heading now carries *"A pre-check from the checks we ran, not a city approval."*

---

## Colour

### Version one: a colour for everything

We started from a design brief with a paper background, ink text, a blueprint blue, and a separate colour for each result: red for Fix, amber for Check with the city, green for OK. On screen the amber looked muddy. In the first Figma pages, every status also got its own full-width coloured band, so the page read like a traffic light.

### What we looked at

Research on trust and colour points the same way. Blue is the common choice where people need to trust a service, as in banking, health care and government. A restrained palette builds more trust than a varied one. Pure white and grey feel cold, so the neutrals should carry a trace of warmth. A health-care design article we read made the same point about physical spaces: soft blues on warm neutrals, with warm accents used sparingly.

The sites we admired did the same. The CalArts menu uses one family of blues, with a single brown for actions. Harvard GSD separates zones with greys and one strong accent. A studio site we looked at uses one blue and its tint for everything.

### Version two and three: one family

The site now uses one blue, its light tint, warm paper, white and dark ink. **Red is the only other colour, and it only marks something that must be fixed.** It's never a background.

Removing the traffic light created a new problem we only saw afterwards: "Check with the city" and "No issues found" turned the same blue. We fixed that with shape rather than more colour:

- **Fix:** a solid red circle with an exclamation mark.
- **Check with the city:** a hollow blue circle with a question mark.
- **No issues found:** a thin grey check, the quietest mark on the page.

There's deliberately no green tick. A green tick reads as an approval, which is exactly what this product must never imply.

Every text colour passes WCAG AA contrast on its background. For example, dark ink on paper is 14.6:1, secondary text is 6.0:1, blue on paper is 7.8:1, Fix red on paper is 6.1:1, and blue on its own tint is 7.2:1.

---

## Space, zones and shape

### Zones instead of boxes

Following GSD, each section of the results page is a full-width band. The blue hero holds the heading and the tabs. A light-blue band holds the summary. A white band holds what to fix. Paper holds the questions for the city, and a dark band holds what Seattle's records show. You can tell where you are before reading a word, and the bands do the grouping that cards and borders used to do.

### Room to breathe

Negative space carries the hierarchy. Sections have generous padding, findings are separated by thin lines, and the main column is narrow enough to read comfortably. The hero and the final next step are centred, like a title page and a closing line. Everything in between is left-aligned, because that's where people read and compare.

### Round and sharp

We borrowed one rule from the references: **round means you can press it.** Buttons, tabs, example plans and the step navigation are pills. Information is plain: findings are rows, not cards. Our checklist flagged the patterns that make a page look machine-made: a coloured strip down every card, small all-caps labels above headings, decorative badges, and too many cards. We removed all four.

### Nothing important behind a tab

Tabs let us show one thing at a time. But a problem hidden behind a tab is a problem someone can miss. So "Fix before you apply" is always fully visible, and only "Check with the city" and "No issues found" share a pair of tabs, with their counts in the labels. An "On this page" rail shows which section you're in and which ones you have already seen.

---

## Type

We use IBM Plex Sans throughout. IBM Plex Serif appears only in the headline on the start page, where a little warmth helps. Each screen uses no more than three sizes: 48 for the page title, 24 for section headings and 17 for everything else. Weights stay regular or medium, with bold kept rare. Fewer sizes and weights made the page quieter, and the content louder.

---

## What we left out on purpose

- **No seals, stamps or anything that looks official.** PermitOS isn't a City of Seattle service, and the footer says so.
- **No motion,** except the assistant panel sliding in from the right.
- **No proof we can't back up.** The start page has room for figures from Seattle's permit records, and those slots stay empty until the numbers come from the real data.

---

## How we worked

We designed in Figma and kept each version on its own page: v1 used a colour for every status, v2 one blue family with plainer words, and v3 applied the checklist fixes. Screenshots of the built site are in [`screenshots/design-v3/`](screenshots/design-v3/), and the Figma file is at https://www.figma.com/design/PVw8XgzSLPe2q9TR8mbbhj. We read the research first, then scored every version against a pass/fail checklist instead of judging by eye. The rules that matter most are also tested in code, so they can't quietly drift:

- no code numbers in the front end
- no approval words in the copy
- no more than three type sizes
- no text below 4.5:1 contrast

## What we still want to learn

We haven't watched real owners use it yet. The next step is a short usability test with five café or shop owners. We want to know three things:

1. whether "No issues found" in grey feels too quiet to trust
2. whether anyone misses a finding
3. whether anyone reads the results as an approval

---

## Sources

- Jakob Nielsen and John Morkes, [How users read on the web](https://www.nngroup.com/articles/how-users-read-on-the-web/) and [the concise, scannable, objective study](https://www.nngroup.com/articles/concise-scannable-and-objective-how-to-write-for-the-web/)
- Behavioural Insights Team, [EAST: Four simple ways to apply behavioural insights](https://www.bi.team/publications/east-four-simple-ways-to-apply-behavioural-insights/)
- Marshall Rosenberg, *Nonviolent Communication: A Language of Life*
- Nielsen Norman Group, [Error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- GOV.UK, [Writing for GOV.UK](https://www.gov.uk/guidance/content-design/writing-for-gov-uk) and [Error message component](https://design-system.service.gov.uk/components/error-message/)
- Google, [Technical Writing courses](https://developers.google.com/tech-writing)
- Center for Plain Language, [Federal Plain Language Guidelines](https://centerforplainlanguage.org/learning-training/tools-training/)
- William Strunk Jr., [*The Elements of Style* (1918)](https://www.gutenberg.org/ebooks/37134), public domain
- William Zinsser, *On Writing Well*; Joseph M. Williams, *Style: Lessons in Clarity and Grace*; George Orwell, "Politics and the English Language"
- Figma, [Color combinations](https://www.figma.com/resource-library/color-combinations/); Adobe, [Color combinations that build trust](https://www.adobe.com/express/learn/blog/best-color-combinations-that-build-trust)
- American Med Spa Association, [Understanding color psychology in health care design](https://www.americanmedspa.org/news/understanding-color-psychology-in-health-care-design/)
- Visual references: [CalArts](https://calarts.edu), [Harvard GSD](https://www.gsd.harvard.edu)
