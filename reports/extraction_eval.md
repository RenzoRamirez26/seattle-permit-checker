# Plan-reading evaluation

Extractions scored: vision model claude-sonnet-5-5, run on 21 November 2026 (three model calls); scored from the saved readings.

| Plan | Facts checked | Read correctly | Accuracy | Real problems | Caught as a problem | Flagged to confirm | Missed | False alarms |
|---|---|---|---|---|---|---|---|---|
| Café with planted problems | 38 | 35 | 92% | 11 | 9 | 2 | 0 | 0 |
| Café that passes | 44 | 44 | 100% | 0 | 0 | 0 | 0 | 0 |
| Hair salon with planted problems | 25 | 24 | 96% | 3 | 3 | 0 | 0 | 0 |

A real problem is one the rules find on the hand-written correct reading of the plan. "Flagged to confirm" means the model's reading produced an item to confirm for the same rule and item, not a problem: the owner is still pointed at it, with less certainty. A fact whose correct value is 0 and which the model left as "not stated" counts as misread.

## Café with planted problems

- Misread kitchen: hand_sinks: read None, should be 0
- Misread fire_safety: exit_signs_shown: read None, should be 0
- Misread fire_safety: fire_extinguishers_shown: read None, should be 0
- Flagged to confirm, not as a problem: Missing exit signs
- Flagged to confirm, not as a problem: No handwashing sink in the food prep area

## Hair salon with planted problems

- Misread Door 1: swing: read 'outward', should be 'inward'

How the model's items were paired with the ground truth's before comparing values: 23 by same label, 12 by type and number, 5 by shared words. A model may label an item more fully than the ground truth ("Door 1 - Main Entry / Exit" for "Door 1"); that is not counted as a misreading.

_The plans are fictional demo drawings with printed dimensions. Real drawings are harder._
