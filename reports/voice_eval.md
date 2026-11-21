# Voice evaluation: spoken question -> text

Run on 20 November 2026: Darwin 23.6.0 (x86_64), CPU only, Python 3.13.13. Text to speech: Kokoro, voice `af_heart`, file `kokoro-v1.0.onnx`. Speech to text: faster-whisper `base.en`. Loading the models took 2.9 s (Kokoro) and 1.3 s (Whisper), once per session.

**9 of 10 questions came back word for word, and 10 of 10 would get the same answer from the agent.** Speaking a question took 0.8 s on average and transcribing it 0.7 s (models already loaded).

> **These questions were machine-spoken.** Kokoro's voice is clear, with no accent, hesitation, background noise or laptop microphone. Real voices will do worse than this table. It shows the two models work together on this computer; it does not show how well the app hears people.

| # | Question spoken by Kokoro | Heard by faster-whisper | Same words | Same answer | Audio (s) | Speak (s) | Transcribe (s) |
|---|---|---|---|---|---|---|---|
| 1 | Do I need a second exit? | Do I need a second exit? | yes | yes | 1.6 | 0.7 | 0.6 |
| 2 | Is my restroom door wide enough? | Is my restroom door wide enough? | yes | yes | 1.7 | 0.8 | 0.6 |
| 3 | What is my occupant load? | What is my occupant load? | yes | yes | 1.5 | 0.7 | 0.7 |
| 4 | How many lavatories do I need? | How many lavatories do I need? | yes | yes | 1.8 | 0.9 | 0.7 |
| 5 | Do I need sprinklers? | Do I need sprinklers? | yes | yes | 1.3 | 0.7 | 0.6 |
| 6 | Does the egress door swing the right way? | Does the egress door swing the right way? | yes | yes | 2.0 | 0.8 | 0.7 |
| 7 | What permits do I need? | What permits do I need? | yes | yes | 1.4 | 0.7 | 0.7 |
| 8 | How long will plan review take? | How long will plan review take? | yes | yes | 1.7 | 0.8 | 0.7 |
| 9 | Is my business allowed in this zoning? | Is my business allowed in the zoning? | **no** | yes | 2.0 | 1.2 | 0.8 |
| 10 | What occupancy group is my restaurant? | What occupancy group is my restaurant? | yes | yes | 2.2 | 1.0 | 0.7 |

"Same words" ignores capitals and punctuation. "Same answer" means the template agent gives the identical answer to the heard text and to the real question, on the demo plan `cafe_flawed`.

## Does the code-word vocabulary help?

`transcribe()` gives Whisper a short list of expected words (egress, lavatory, occupancy and so on). The same ten clips, as spoken and with hiss added 5 dB below the speech:

| Audio | With vocabulary | Without |
|---|---|---|
| As spoken | 9 of 10 | 9 of 10 |
| With hiss | 8 of 10 | 7 of 10 |

What was misheard:

- "Does the egress door swing the right way?" (with hiss, with vocabulary): heard "Does the egress doors swing the right way?"
- "Does the egress door swing the right way?" (with hiss, without): heard "Does the egress doors swing the right way?"
- "How long will plan review take?" (with hiss, without): heard "How long a plan will you take?"
- "Is my business allowed in this zoning?" (as spoken, with vocabulary): heard "Is my business allowed in the zoning?"
- "Is my business allowed in this zoning?" (as spoken, without): heard "Is my business allowed in the zoning?"
- "Is my business allowed in this zoning?" (with hiss, with vocabulary): heard "Is my business allowed in the zoning?"
- "Is my business allowed in this zoning?" (with hiss, without): heard "is my business allowed in the zoning."

_Ten questions is a small sample: one question is ten percentage points. The hiss is added by the script, so it is a rough stand-in for a noisy room, not a recording of one._
