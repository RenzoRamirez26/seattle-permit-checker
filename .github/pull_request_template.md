## What this changes

<!-- One or two sentences. Which part: checker, pipeline, app, evaluation? -->

## Checklist

- [ ] `python -m pytest` passes locally
- [ ] If I changed a number in `checker/rules/seattle.json`, I checked it against the Seattle code and updated `_meta` and `docs/rulebook.md`
- [ ] No API keys, `.env` files, downloaded data or real floor plans are in this pull request
- [ ] If I finished something marked `STATUS:` in a docstring, I updated the note and the README status table
- [ ] Any new number I report (an accuracy, a share, a count) says what data it came from

## Interface changes

- [ ] An accessibility checker (axe or WAVE) reports no new errors
- [ ] Every action works with the keyboard alone, and focus is visible
- [ ] Every form field has a visible label
- [ ] Screenshots at 375 px and 1280 px wide are attached
