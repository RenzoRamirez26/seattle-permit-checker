# Test fixtures

- `seattle_building_permits.json`: the first record (6998648-CN) is a real row from Seattle's Building
  Permits dataset, copied in November 2026 so the field names and value formats are the real ones.
  The `TEST-` records are invented.
- `seattle_plan_review.json`: the 6537517-CN row is a real row from the Plan Review dataset with the
  reviewer's name replaced. The `TEST-` rows are invented.
- `seattle_plan_comments.json`: field names and subject formats ("10 Means of Egress", "SBC Ch29",
  "00 Code Edition") are the real ones. The comment text is paraphrased, not copied.
- `question.wav`: an invented question spoken by a machine voice (espeak-ng, voice `en-us`, 150 words a
  minute), resampled to 16 kHz mono 16-bit WAV, 3.1 seconds, 100 KB. No real person's voice. The words:
  "Why do I need a second exit for my cafe?" Used by `tests/test_api.py` (with `voice.transcribe` patched)
  and by the website's Playwright tests as a fake microphone.
