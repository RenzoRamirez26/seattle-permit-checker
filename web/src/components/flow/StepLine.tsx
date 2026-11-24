/** "Step 2 of 4" above a task page's h1. The step's name is in the header's step nav, so it is not repeated here. */
import { FLOW_STEPS } from "./steps";

export function StepLine({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <p className="m-0 text-ink-muted nums">
      Step {step} of {FLOW_STEPS.length}
    </p>
  );
}
