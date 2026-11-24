# Website design reference for the permit pre-check

2026-11-21 · Lorenzo

## Bottom line

The site should be a short guided flow with one task per page, and the assistant should sit beside that flow as help. Every strong source I read points the same way, and the visual choices (grid, type, colour) follow from that structure.

- **The best guidance on flow comes from the UK government's design system, not from a university.** Its rules for question pages, error messages and a "check your answers" page fit this product almost exactly: a task people do rarely, with no training, where a mistake costs them time. Nielsen Norman Group's advice on step-by-step flows agrees with it.
- **Yale has the most useful university material.** The *Web Style Guide* by Patrick Lynch and Sarah Horton is a full book on web design, free to read online. Yale also publishes plain accessibility rules and the code for its own component library.
- **MIT gives two small, practical things:** contrast rules inside its colour guide, and a short accessibility checklist its library developers run on every pull request. That checklist is worth copying into this repo.
- **RISD publishes no web rulebook that I could open.** Its identity site blocked my reader. What RISD does offer is a "Web Type" course whose reading list argues for designing to the web's own nature instead of copying print.
- **For the AI parts,** Microsoft's 18 guidelines for human-AI interaction and the pattern library *The Shape of AI* give names to what this product already does: say what the system can do, let the owner correct it, show where an answer came from.
- **For building with Claude Code,** three things in the repo will do more than any amount of reading: a `DESIGN.md` file with the design decisions, Vercel's interface rules written for coding agents, and Anthropic's `frontend-design` skill.
- **Müller-Brockmann's grid** translates to the web as a 12-column layout, one spacing unit, and sizes derived from the body text. The brief in this doc sets those numbers.

Three gaps to know about. I could not open RISD's identity site or the chapter list of Google's *People + AI Guidebook*. I found no page that sets out Müller-Brockmann's construction method step by step, so that part is from my own knowledge of the book and is marked as such. And the colours, fonts and screen layouts in the brief are my recommendations: nobody has tested them with a business owner yet.

## Flow first

The owner's path has five stops: start, about your business, your floor plan, check what we read, results. The rules below decide how each stop behaves.

### Why a step-by-step flow is the right shape

Nielsen Norman Group calls this pattern a wizard and says it suits tasks people do rarely, in a subject they don't know, where the system can steer ([NN/g, Wizards](https://www.nngroup.com/articles/wizards/)). A first permit check is that task. The same article says a wizard is wrong for work people repeat often or need to compare across steps, which is a reason to keep the results on one page instead of spreading them over several.

### Rules for every step

| Rule | What it means on this site | Source |
| --- | --- | --- |
| One thing per page | Each page asks one question or one closely related group, and the question is the page heading. | [GOV.UK question pages](https://design-system.service.gov.uk/patterns/question-pages) |
| Buttons say what happens | "Read my plan" and "Run the check", not "Next". | [NN/g, Wizards](https://www.nngroup.com/articles/wizards/) |
| Always a way back | A Back link on every page, and going back never loses what was typed. | GOV.UK question pages |
| Let people say "I don't know" | A missing ceiling height or zone becomes "check with the city" in the results. The rules engine already has a `review` status for this. | GOV.UK question pages |
| Mark optional fields in words | Write "(optional)". No asterisks. | GOV.UK question pages |
| Each step stands alone | Anything the owner needs to answer is on that page: what counts as a floor plan, where to find the address format. | NN/g, Wizards |
| Keep help beside the form | Help opens next to the fields and never covers them. This is the rule the assistant panel has to follow. | NN/g, Wizards |
| Save and resume | A refresh or a closed tab should not wipe the work. Each step gets its own web address. | NN/g, Wizards; [Vercel guidelines](https://github.com/vercel-labs/web-interface-guidelines) |
| Show what the system is doing | While the plan is being read, name the stage ("Finding doors and exits") instead of showing a bare spinner. | [NN/g heuristic 1](https://www.nngroup.com/articles/ten-usability-heuristics/) |
| Use the owner's words | "Restroom", "sent back for corrections". Code terms and section numbers go behind a "Show the code reference" link. | NN/g heuristic 2 |
| No dead ends | Every page, including errors and empty states, offers a next action. | Vercel guidelines |

### Progress indicator: the sources disagree

NN/g says to show the list of steps with the current one highlighted. GOV.UK says to test without one first, and reports that a team removed a 12-step indicator with no effect on completion. With only four or five steps, a plain line such as "Step 2 of 4: Your floor plan" costs little and I would start there. This is a judgment call to settle by watching a few people use it.

### "Check what we read" is the most important page

GOV.UK's check-answers pattern shows everything back before submission, with a Change link beside each item that returns to the summary afterwards ([GOV.UK check answers](https://design-system.service.gov.uk/patterns/check-answers)). On this site that page carries more weight than usual, because the items were read from the drawing by a model and the owner is confirming them. It is also where three of Microsoft's AI guidelines apply at once: make clear how well the system can do its job, support efficient correction, and make clear why it did what it did.

### Error messages

GOV.UK's rules: say what went wrong and how to fix it, use the same words as the question, put the message next to the field and repeat it in a summary at the top, keep what the person typed, and avoid "please", "sorry", "invalid" and "oops" ([GOV.UK error message](https://design-system.service.gov.uk/components/error-message)). Applied here:

- "The file must be a PDF, PNG or JPG."
- "Enter a street address in Seattle, for example 1420 5th Ave."
- "We could not read this plan. Upload a clearer copy, or enter the measurements yourself."

The third message matters most. When the model fails, the owner still needs a way to finish.

### The results page

Order it by what the owner does next. Lead with one sentence that counts the outcome ("3 things to fix before you apply, 2 to check with the city, 14 fine"). List the problems first, then the items to check, then everything that passed, collapsed. Jon Yablonski's *Laws of UX* gives three reasons for this order: the item that stands out is the one remembered, more choices mean slower decisions, and people judge an experience by its peak and its end ([Laws of UX](https://lawsofux.com/)). So use one accent for problems only, one main button per screen, and end with a clear next step and the PDF.

## MIT, Yale and RISD

| School | What exists | What to take from it |
| --- | --- | --- |
| Yale | [*Web Style Guide*](https://webstyleguide.com/)[, 4th edition](https://webstyleguide.com/), by Patrick Lynch and Sarah Horton. Free online under a non-commercial Creative Commons licence. Twelve chapters: Strategy, Research, Process, Information Architecture, Site Structure, Page Structure, Interface Design, Graphic Design, Typography, Editorial Style, Images, Video. It began as Yale's own web style guide. | Read chapter 7, Interface Design, before building. Its main points are below. |
| Yale | [Usability & Web Accessibility: visual design](https://usability.yale.edu/usability-best-practices/visual-design) | A clear hierarchy with the page title as the largest heading. Body text of about 16 pixels with generous line spacing, left-aligned, in lines of about 80 characters or fewer. Strong contrast between text and background, including hover states. |
| Yale | [YaleSites on GitHub](https://github.com/yalesites-org): the university's site platform, a component library with Storybook, and a theme | It is built for Drupal, so the code cannot be reused in React. It is a good model for how to organise a component library: tokens, then small parts, then page sections. |
| MIT | [brand.mit.edu colour guide](https://brand.mit.edu/color) | Contrast rules stated plainly: 4.5 to 1 for normal text and 3 to 1 for large text, with 7 to 1 as the stricter target. The brand site has no web or digital section and no code. |
| MIT | [MIT Libraries developer guides: accessibility](https://mitlibraries.github.io/guides/basics/a11y.html) | A checklist for developers: WCAG 2.1 AA, semantic HTML, logical tab order, a skip link, an automated checker (WAVE or ANDI) on every pull request that touches the interface, and regular passes using only a keyboard and with a screen reader. |
| RISD | [identity.risd.edu](https://identity.risd.edu/), the school's identity system | Not opened: the site blocks automated readers. I cannot say what it contains. |
| RISD | ["Web Type" course syllabus, 2021](https://risd-web.github.io/webtype-spring2020/syllabus2021) | A reading list of essays on typography made for the browser, including Frank Chimero's "The Web's Grain" and Robin Rendle's "A New Web Typography". Useful as the counterweight to Müller-Brockmann: a web page has no fixed edges, so layouts should grow from the content. That one-line summary of the essays is mine, from memory. |

### What chapter 7 of the *Web Style Guide* says

From [the chapter itself](https://webstyleguide.com/7-interface-design.html):

- People often arrive deep inside a site from a search, so every page needs a title, a way home, and a cue for where they are.
- Follow familiar conventions. Use the browser's own buttons, menus and form controls before building custom ones.
- Never depend on hover, because touch and keyboard users cannot do it.
- Give every field a visible label. Placeholder text inside the box is not a label.
- Mark required fields with more than colour.
- Prevent errors where possible. When one happens, explain it in plain words next to the field and say what to do next.
- Every page should say who made it, what it is, and when it was last revised. For this product that means a visible line saying who runs it, that it is not a city service, and the date of the rulebook.

### What to copy into the repo

The MIT Libraries checklist is short enough to adopt as it stands. Add it to the pull request template: run an accessibility checker on any change to the interface, tab through the page with the keyboard only, and confirm every form field has a label.

Neither MIT nor RISD publishes a general guide to building good websites. For that purpose the two government design systems are stronger than any university source: the UK one cited above, and the [U.S. Web Design System](https://designsystem.digital.gov/design-principles/), whose five principles are start with real user needs, earn trust, embrace accessibility, promote continuity, and listen.

## Designing the AI parts

### Keep the clickable flow as the main route

Jakob Nielsen argues that chat interfaces make people put their needs into written prose, and that many people cannot do that well enough to get good results. He calls this the articulation barrier. He expects the systems that work to be hybrids that keep buttons, forms and other visible controls, and he doubts conversation suits tasks like filling in long forms ([NN/g, AI as a new UI paradigm](https://www.nngroup.com/articles/ai-paradigm/), 2023).

For this site that settles the role of the assistant circle. An owner can finish the whole check without ever opening it. When they do open it, it offers ready-made questions for the step they are on, so nobody has to work out what to type.

### Microsoft's 18 guidelines, applied

The guidelines come from a 2019 research paper by Microsoft and are listed in the [HAX Design Library](https://www.microsoft.com/en-us/haxtoolkit/library/). The ones that bear on this product:

| Guideline | What it means here |
| --- | --- |
| G1 Make clear what the system can do | The start page and the assistant both say it: reads a floor plan, checks it against coded Seattle rules, lists likely permits. It does not approve anything. |
| G2 Make clear how well the system can do what it can do | Say that the plan reading can be wrong and that the owner confirms it. Until the vision model has been scored on real plans, do not show any accuracy figure. |
| G4 Show contextually relevant information | The assistant's suggested questions change with the step. |
| G7 and G8 Support efficient invocation and dismissal | One click opens the assistant, Escape or one click closes it, and the page underneath is unchanged. |
| G9 Support efficient correction | Every value the model read has a Change control on the "check what we read" page. |
| G10 Scope services when in doubt | When a question falls outside the audit result, the assistant says so and points to the city, instead of guessing. The grounding check already enforces this. |
| G11 Make clear why the system did what it did | Each finding shows the measurement it used, the rule, and the code section. |
| G16 Convey the consequences of user actions | Changing a value on the check page says the check will run again. |
| G17 Provide global controls | One place to turn voice off and to clear the conversation. |

G12 to G15 and G18 are about learning from the user over time. They do not apply until there are accounts and saved projects.

### Patterns from *The Shape of AI*

[The Shape of AI](https://www.shapeof.ai/) is Emily Campbell's library of interface patterns for AI products, grouped into six families. The patterns worth using here:

- **Suggestions and follow-ups** (wayfinders): three or four tappable questions per step, such as "What counts as a floor plan?" before the upload and "What should I fix first?" on the results.
- **Citations** (governors): each answer links to the finding it came from, and the link scrolls the results page to that finding.
- **Verification** (governors): the owner confirms the reading before anything is decided. This is the "check what we read" page.
- **Caveat and disclosure** (trust builders): one plain line that this is a pre-check and not a decision by the city. Say it once in a fixed place. Repeating it under every answer trains people to ignore it.
- **Name, avatar and personality** (identifiers): keep these minimal. A labelled circle is enough. A named character with a personality would suggest more judgment than the system has.

Google's [People + AI Guidebook](https://pair.withgoogle.com/guidebook) covers the same ground. I could not open its chapters, so nothing here relies on it.

### Specification for the assistant circle

- A round button, fixed at the bottom right, at least 44 pixels across, with the visible word "Ask". An icon alone is not enough.
- On a wide screen it opens a panel at the side so the form stays visible. On a phone it opens as a sheet from the bottom, and it must not cover the page's main button when closed.
- Before results exist, it answers only from fixed help text about how the check works. After results exist, it answers only from the audit result. This keeps the rule that the model explains and code decides.
- Voice is a microphone button inside the panel. The transcript of what was heard and what was said is always shown as text.
- It never opens by itself and never interrupts a step.
- Keyboard: focus moves into the panel on open and returns to the button on close.

## Repos and toolkits

### Design instructions a coding agent can read

These matter most, because Claude Code will write the front end. Left alone, a model drifts toward the most common look in its training data. Anthropic's own article names the result: the same few fonts, purple gradients on white, predictable layouts ([Improving frontend design through Skills](https://claude.com/resources/articles/improving-frontend-design-through-skills), November 2025). The fix is to write the design decisions down where the agent will read them.

| Item | What it is | How to use it |
| --- | --- | --- |
| `DESIGN.md` | A file in the repo holding the design tokens (colours, type, spacing) and the reasons behind them. Google Labs published a draft standard with a checker, at `google-labs-code/design.md`, according to [this write-up](https://trilogyai.substack.com/p/fixing-visual-ai-slop). [VoltAgent's collection](https://github.com/VoltAgent/awesome-design-md) has worked examples. | Turn the brief in this doc into `DESIGN.md` at the repo root before the first front-end prompt. |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) | About a hundred must, should and never rules written for agents: keyboard and focus, touch target sizes, forgiving forms with inline errors, the web address reflecting state, reduced motion, alignment to a grid, no dead ends. | Reference its `AGENTS.md` from this repo's `CLAUDE.md` and ask Claude Code to review each screen against it. |
| Anthropic `frontend-design` skill | A short instruction set that pushes the model to commit to a specific look: distinctive type, one cohesive theme, deliberate motion. | Install it in Claude Code for the front-end work. See the caution below. |
| Other agent skills named in the same write-up | Impeccable (`pbakaus/impeccable`) for anti-pattern checks; Addy Osmani's `web-quality-skills` for accessibility and page speed; Vercel's `agent-skills` for React practice. | Optional. I have read the description of each, not the contents. A skill is a set of instructions your agent will follow, so read one before installing it. |

A caution on the `frontend-design` skill. It asks for bold choices: unusual fonts, atmospheric backgrounds, staged animation. That suits a landing page. A form that a worried owner fills in on a phone needs calm and legibility first. Tell Claude Code the tone in `DESIGN.md` so the skill has a direction to be bold in, and keep decoration off the question pages.

### Components for the site

| Item | What it is | Fit |
| --- | --- | --- |
| shadcn/ui with Tailwind CSS | Accessible React components that are copied into your repo, so you own and restyle them. | My suggested base. This comes from my own knowledge, not from a page opened for this doc. |
| [AI Elements](https://github.com/vercel/ai-elements) | Vercel's chat components (conversation, message, input box), released August 2025 and built on shadcn/ui. | Not the one to start on. Its repo lists Vercel's AI SDK as a requirement, and says the project is moving into shadcn/ui and this repo will be deprecated at the end of November 2026. If you want these components, take the shadcn/ui version once it is out. |
| assistant-ui | An open-source React library for chat interfaces. | MIT licence. Its own page says it connects to a custom HTTP backend as well as to Vercel's AI SDK and LangGraph, which makes it the likelier fit for a FastAPI backend. |
| CopilotKit | A framework for putting an assistant inside an existing app, MIT licence. | Larger than needed for one panel. |
| Chainlit | A Python framework for a chat app, Apache 2.0. | Only if you drop the React plan. It makes the chat the whole page, which is the opposite of this design. |

The comparison article where I found several of these was published by a company that sells templates, so I have not repeated its rankings.

### Open design systems to borrow patterns from

- [GOV.UK Design System](https://design-system.service.gov.uk/patterns/question-pages): the patterns in the flow section. Borrow the behaviour and the wording rules. Do not borrow the look, since the site must not appear to be a government service.
- [U.S. Web Design System](https://github.com/uswds/uswds): the American counterpart, with open code.
- [YaleSites component library](https://github.com/yalesites-org): how a university lays out tokens and components.

## Grids and typography

### What Müller-Brockmann's book argues

Josef Müller-Brockmann was one of the Swiss designers who, with Max Bill and Karl Gerstner, turned the grid into a complete working method after the Second World War ([University of Washington handout](https://courses.washington.edu/image211/handouts/Grids.pdf)). *Grid Systems in Graphic Design* is the book that spread that method ([Wikipedia, Grid (graphic design)](https://en.wikipedia.org/wiki/Grid_(graphic_design))).

In an excerpt from the book he presents the grid as a way to make design systematic and clear. Working inside one means accepting rules that hold everywhere, in place of personal taste. He lists the aims: reduce to essentials, prefer the objective to the subjective, make production rational, and integrate colour, form and material ([excerpt, CUNY](https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/MullerBrockmann_Grid_Des-Phil.pdf)). That is the same value this product rests on: every decision can be traced to a rule.

### The parts of a grid

From the University of Washington handout:

- **Margins:** the space between the edge and the content.
- **Columns:** vertical divisions that set where text and pictures start and stop.
- **Gutters:** the gaps between columns.
- **Flowlines:** horizontal lines that divide the space into bands.
- **Modules:** the units formed where columns and bands cross. Müller-Brockmann calls them fields.
- **Markers:** fixed places for recurring items such as page numbers.

### His method, as I understand it

This part is from my own knowledge of the book. I found no page that sets it out, so check it against a copy before quoting it.

1. Start from the content and the reading conditions, then choose the body type size and the line spacing.
2. Set the text area so that it holds a whole number of lines.
3. Divide the area into columns, then into fields. Each field is a whole number of lines tall.
4. The gap between fields is one or more empty lines, so text in neighbouring columns stays level.
5. Pictures, headings and captions are sized to whole fields.
6. More fields give more freedom. The book works through grids of 8, 20 and 32 fields.

The idea that carries over to a screen is that everything is measured in units of the body text.

### Translating it to a web page

A printed page has fixed edges and a screen does not. Wikipedia notes that web grids can be fluid or fixed and that CSS Grid Layout now handles both. The Interaction Design Foundation's guide adds that a responsive grid sets its columns, gutters and margins separately for each screen width, and that a baseline grid comes from the type size and line spacing ([IxDF, How to use grid systems](https://ixdf.org/literature/article/how-to-use-grid-systems)).

So the web version of the method is:

- Choose the body text first.
- Take one spacing unit from its line height and make every gap a multiple of it.
- Set a column grid for each screen width.
- Align every block to a column edge. Vercel's guidelines ask for the same thing: deliberate alignment to a grid.

### Numbers for body text

Matthew Butterick's *Practical Typography* gives ranges that are easy to apply: body text of 15 to 25 pixels on the web, line spacing of 120 to 145 percent of the type size, and lines of 45 to 90 characters ([Typography in ten minutes](https://practicaltypography.com/typography-in-ten-minutes.html)). He also says to get the body text right before anything else, which is Müller-Brockmann's first step.

The brief below uses body text of 18 pixels on a 24 pixel line, which is 133 percent, with an 8 pixel spacing unit. Three units make one line of text, so boxes and text share one rhythm.

## Reading list

The last column says whether I opened a page about the book for this doc. Where it says "from memory", the description is my own knowledge of the book and the details are worth a quick check before you cite them.

### Flow and usability

| Book | Author | Why it helps here | Checked |
| --- | --- | --- | --- |
| *Don't Make Me Think* | Steve Krug | Short and plain. The case for obvious pages, and a method for testing a site by watching a few people use it. | From memory |
| *Form Design Patterns* | Adam Silver | Works through real multi-step forms one at a time, in the same spirit as the UK government patterns. The closest book to this product's flow. | From memory |
| *Forms that Work* | Caroline Jarrett and Gerry Gaffney | How to decide which questions to ask at all, and how to word them. | From memory |
| *Web Form Design* | Luke Wroblewski | Labels, field layout, inline validation, with test results behind the advice. | From memory |
| *The Design of Everyday Things* | Don Norman | The vocabulary under everything else: what an object signals you can do, feedback, and why errors are usually the design's fault. | From memory |
| *Laws of UX* | Jon Yablonski | Thirty short principles from psychology, each with a one-line statement. The [website](https://lawsofux.com/) is free. | Site opened |
| *Designing Interfaces* | Jenifer Tidwell and co-authors | A catalogue of interface patterns to look things up in. | From memory |
| *Web Style Guide* | Patrick Lynch and Sarah Horton | The Yale book. [Free online](https://webstyleguide.com/). | Chapter 7 opened |

### Looks, layout and type

| Book | Author | Why it helps here | Checked |
| --- | --- | --- | --- |
| *Refactoring UI* | Adam Wathan and Steve Schoger | Written for developers. Fifty short chapters of specific fixes on hierarchy, spacing, type and colour. Its line is "design with tactics, not talent". By the makers of Tailwind CSS. | [Site opened](https://www.refactoringui.com/) |
| *Practical Typography* | Matthew Butterick | Free online. The [ten-minute summary](https://practicaltypography.com/typography-in-ten-minutes.html) is enough to set body text well. | Page opened |
| *Thinking with Type* | Ellen Lupton | The standard introduction to letters, text and grids. | From memory |
| *Grid Systems in Graphic Design* | Josef Müller-Brockmann | The source for the grid method. First published in 1981, in German and English side by side. | Excerpt opened; publication details from memory |
| *The Vignelli Canon* | Massimo Vignelli | A short statement of the same disciplined approach, with grids for books and signs. Vignelli released it as a free PDF. | Mentioned in the IxDF article; the rest from memory |

### Essays from RISD's reading list

These are on the "Web Type" syllabus cited above. I opened the syllabus, not the essays.

- Frank Chimero, "The Web's Grain"
- Robin Rendle, "A New Web Typography"
- Laurel Schwulst, "My website is a shifting house next to a river of knowledge. What could yours be?"
- Nick Sherman, "Variable Fonts for Responsive Design"

### If there is only time for a little

1. The three UK government pattern pages on question pages, error messages and checking answers. About half an hour.
2. Butterick's ten-minute typography summary.
3. *Refactoring UI*, the chapters on hierarchy and on layout and spacing.
4. Krug, for the chapter on testing with real people.
5. Chapter 7 of the *Web Style Guide*.

Müller-Brockmann is worth reading for its own sake and makes a good slide. It will not change how the site works.

## Design brief for this site

These are starting recommendations for the React front end. Nobody has tested them with a business owner. The contrast figures were calculated; the rest is judgment to revisit after watching people use the site. The same brief is in the file `design_brief.md`, written for Claude Code to follow, with the flow rules from earlier in this doc included.

### Tone

Calm, plain and precise, like a well-drawn floor plan: a paper background, dark ink, thin lines and one blue. No gradients, glass panels or decorative illustration on the task pages.

The site must not look like a City of Seattle service. No seals, city colours or city logo. The footer on every page says who runs it, that it is not a city service, and the date of the rulebook.

### Grid and spacing

| Screen width | Columns | Gutter | Side margin |
| --- | --- | --- | --- |
| Under 640 px | 4 | 16 px | 16 px |
| 640 to 1023 px | 8 | 24 px | 32 px |
| 1024 px and up | 12 | 24 px | Centred, content at most 1200 px wide |

- The spacing unit is 8 px. Allowed gaps are 4, 8, 16, 24, 32, 48, 64 and 96 px.
- Every block starts and ends on a column edge.
- Question pages use one column, 7 of the 12 wide. That is about 690 px, or roughly 75 characters a line.
- Columns 9 to 12 are where the assistant panel opens on a wide screen, so the form stays visible.
- "Check what we read" puts the plan in 7 columns and the facts in 5. On a phone the plan comes first.
- Results put the findings in 8 columns and a summary in 4: the counts, the zoning card with its small map, and the downloads.

### Type

- IBM Plex Sans for text. IBM Plex Mono for code sections, permit numbers and measurements. Both are open-licence fonts with a drafting-office feel. This is my pick and it is easy to change.
- Two weights only, 400 and 600.
- Sizes, as font size over line height: 14/20 for small print, 18/24 for body, 24/32 for section headings, 32/40 for page headings on phones and 40/48 on wide screens.
- Left-aligned text, in lines of about 80 characters at most.

### Colour

| Role | Hex | Contrast on the paper colour | Use |
| --- | --- | --- | --- |
| Paper | `#FAF8F3` |  | Page background |
| Ink | `#1B1F24` | 15.6 to 1 | Text |
| Muted ink | `#55606B` | 6.1 to 1 | Hints and captions |
| Blueprint blue | `#1F4E8C` | 7.8 to 1 | Links, the main button, the focus ring |
| Fix | `#B3261E` | 6.2 to 1 | Problems only |
| Check with the city | `#7A4F00` | 6.7 to 1 | Items that could not be decided |
| OK | `#1E6B3A` | 6.2 to 1 | Items that passed |
| Field border | `#7C8691` | 3.5 to 1 | Outlines of inputs |

A status always has an icon and its words ("Fix", "Check with the city", "OK"), never colour alone. Red appears only on problems. All the text colours clear the 4.5 to 1 target with room to spare.

### Screens

| Screen | Heading | Contains | Main button |
| --- | --- | --- | --- |
| Start | Check your floor plan before you apply | What it does, what you need, that it is not a city service, a link to try an example plan | Start |
| Step 1 | What kind of business is it? | The six types, whether there is cooking, the address with a small map to confirm the place | Continue |
| Step 2 | Upload your floor plan | Accepted file types, what a usable plan shows, a note that plans are not saved | Read my plan |
| Reading | Reading your plan | The current stage by name, a way to cancel |  |
| Step 3 | Check what we read from your plan | The plan beside the facts read from it, each with Change | Run the check |
| Step 4 | Your pre-check results | One sentence with the counts, then Fix, Check with the city, OK (collapsed), permits to expect, what Seattle's records show, zoning, downloads | Download the fix list (PDF) |

Do not tell owners how long the check takes until it has been timed.

### The map

You asked for a map only where it helps. Two places qualify:

- The address step, with a pin and the question "Is this the right place?". This catches a wrong address before the zoning lookup runs.
- The zoning card in the results, with the pin, the outline of the zone, and the zone's name.

No layer switcher, no search box and no other data. The same facts are written in words beside the map, so nobody has to read it to get the answer.

### Checks before a front-end pull request merges

- Every action works with the keyboard alone, and focus is always visible.
- An accessibility checker reports no new errors.
- Every field has a visible label. Errors show next to the field and in a summary at the top.
- Touch targets are at least 44 px on phones.
- The page works at 320 px wide with no sideways scrolling.
- The flow can be completed with the assistant closed and with voice off.
- A refresh on any step keeps what was entered.

### Handing it to Claude Code

1. Put `design_brief.md` in the repo's `docs/` folder. If you adopt the `DESIGN.md` convention, copy it to the repo root under that name.
2. Add one line to `CLAUDE.md`: front-end work follows the design brief and Vercel's Web Interface Guidelines.
3. Build "Check what we read" first. It is the hardest screen and the one that shows what makes the product different.
4. Ask for screenshots at phone and laptop widths with each pull request.

### Test with people

Ask three to five people who have not seen the site to do one task: "Find out what you would need to fix before applying." Do not help them. Note where each one stops or asks a question, and fix those places first.

## Sources

Pages opened for this doc, on 20 and 21 November 2026.

### Flow and usability

- [GOV.UK Design System: question pages](https://design-system.service.gov.uk/patterns/question-pages)
- [GOV.UK Design System: check answers](https://design-system.service.gov.uk/patterns/check-answers)
- [GOV.UK Design System: error message](https://design-system.service.gov.uk/components/error-message)
- [Nielsen Norman Group: Wizards, definition and design recommendations](https://www.nngroup.com/articles/wizards/) (Raluca Budiu, 2017)
- [Nielsen Norman Group: 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) (Jakob Nielsen, 1994, reviewed 2024)
- [Laws of UX](https://lawsofux.com/) (Jon Yablonski)
- [U.S. Web Design System: design principles](https://designsystem.digital.gov/design-principles/)

### Universities

- [Web Style Guide, 4th edition](https://webstyleguide.com/) and [chapter 7, Interface Design](https://webstyleguide.com/7-interface-design.html) (Lynch and Horton)
- [Yale Usability & Web Accessibility: visual design](https://usability.yale.edu/usability-best-practices/visual-design)
- [YaleSites on GitHub](https://github.com/yalesites-org)
- [MIT brand: colour](https://brand.mit.edu/color)
- [MIT Libraries developer guides: accessibility](https://mitlibraries.github.io/guides/basics/a11y.html)
- [RISD Web Type syllabus, Spring 2021](https://risd-web.github.io/webtype-spring2020/syllabus2021) (Marie Otsuka)

### AI interfaces

- [Microsoft HAX Design Library](https://www.microsoft.com/en-us/haxtoolkit/library/) and [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)
- [The Shape of AI](https://www.shapeof.ai/) (Emily Campbell)
- [Nielsen Norman Group: AI, first new UI paradigm in 60 years](https://www.nngroup.com/articles/ai-paradigm/) (Jakob Nielsen, 2023)

### Repos and toolkits

- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines)
- [VoltAgent: awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
- [Anthropic: Improving frontend design through Skills](https://claude.com/resources/articles/improving-frontend-design-through-skills)
- [Trilogy AI: Fixing visual AI slop](https://trilogyai.substack.com/p/fixing-visual-ai-slop) (Leonardo Gonzalez, May 2026)
- [assistant-ui](https://github.com/assistant-ui/assistant-ui)
- [Vercel: introducing AI Elements](https://vercel.com/changelog/introducing-ai-elements) and [the repo](https://github.com/vercel/ai-elements)

### Grids and type

- [Wikipedia: Grid (graphic design)](https://en.wikipedia.org/wiki/Grid_(graphic_design))
- [Müller-Brockmann excerpt, "Grid and design philosophy"](https://openlab.citytech.cuny.edu/langecomd3504fa2019/files/2018/10/MullerBrockmann_Grid_Des-Phil.pdf) (hosted by a CUNY course)
- [University of Washington course handout: Grids](https://courses.washington.edu/image211/handouts/Grids.pdf)
- [Interaction Design Foundation: How to use grid systems](https://ixdf.org/literature/article/how-to-use-grid-systems)
- [Practical Typography: typography in ten minutes](https://practicaltypography.com/typography-in-ten-minutes.html) (Matthew Butterick)
- [Refactoring UI](https://www.refactoringui.com/) (Wathan and Schoger)

### Tried and not opened

- [identity.risd.edu](https://identity.risd.edu/): blocks automated readers.
- [People + AI Guidebook](https://pair.withgoogle.com/guidebook): the pages returned no readable content.
- GOV.UK's task list pattern: the page has been archived and renamed.
- A publisher page for *Grid Systems in Graphic Design*: the link led to a shop front page.

### From my own knowledge, not from a page

Müller-Brockmann's step-by-step method and the book's publication details; the descriptions of the books marked "from memory" in the reading list; the one-line summary of the RISD essays; the suggestion of shadcn/ui, Tailwind and the IBM Plex fonts; the grouping of Microsoft's guidelines by phase.
