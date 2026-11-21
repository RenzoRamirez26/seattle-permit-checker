# Demo script (about three minutes)

Run `python -m streamlit run app/streamlit_app.py` before you start. If the Seattle data is downloaded, the numbers in steps 4 and 6 are real; if not, skip the lines marked (data).

1. **The problem (20 s).** "Most small-business build-outs in Seattle do not pass plan review the first time. Each extra round is weeks of rent with no revenue." Open *Seattle's review records* and point at **Passed in one round**. (data)
2. **The plan (20 s).** Back on *Check a floor plan*, choose *Café with planted problems* and open the drawing. "This is a 2,400 square foot café. We planted nine kinds of problems in it."
3. **Reading (30 s).** Press **Read the plan**. "A vision model reads the drawing. It only reports facts. Here is what it read, and the owner can correct any of it." Change one door width, then change it back.
4. **Checking (40 s).** Press **Run the check**. "Eleven problems. Each has the fix, the code section, and who at the city would catch it." Open *Not enough exits*. Scroll to the permits. Point at the Seattle numbers under the permits. (data)
5. **A different business (30 s).** Choose *Hair salon with planted problems*. Read, check. "Different rules: one shared restroom is allowed, no kitchen checks, and a state salon licence appears. It is in a residential zone that allows small shops, so zoning says confirm, not fail." Switch the business to *Bar* and re-run: "A bar is not allowed there."
6. **Ask (30 s).** Type or say "Is my restroom OK?" Then press **Read my results aloud**. "The agent answers only from this result. If it cites a rule the result does not contain, the answer is thrown away."
7. **Evidence (20 s).** Open *How we know it works*. "Reading and rules are tested separately. Here is the reading accuracy on plans where we know the right answer, and here every planted problem is caught."
8. **Limits (10 s).** "This is a pre-check for one city and a short list of rules. A licensed professional still signs."

## Questions to expect

- **Who is liable if it misses something?** It is a pre-check. The architect who stamps the drawings and the city's reviewer decide. The tool says so on every report.
- **Did you train a model?** No. A general vision model reads the drawing, and the rules are code. We measured the reading instead of training it.
- **Why Seattle?** It publishes each permit's review rounds, review times and the reviewers' comments. Most cities do not.
- **How does it make money?** See the project brief. The repeat customers are contractors, architects and landlords, and a lender has its own reason to offer it to borrowers.
- **What about other cities?** A new city is a new rulebook file and, if it publishes review data, a new data module. That work has not been done.
