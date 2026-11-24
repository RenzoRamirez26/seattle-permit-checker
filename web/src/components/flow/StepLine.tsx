/** "Step 2 of 4: Your floor plan". No progress bar (brief section 2). */
const STEPS = ["Your business", "Your floor plan", "Check what we read", "Results"] as const;

export function StepLine({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <p className="m-0 text-small text-ink-muted nums">
      Step {step} of {STEPS.length}: {STEPS[step - 1]}
    </p>
  );
}
