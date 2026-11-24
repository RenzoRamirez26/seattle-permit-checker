/**
 * The Checking state: the real steps of the check as an ordered list, and an indeterminate progress bar.
 * In: the index of the step happening now, counted from 0: "Read the plan" on the Reading page, "Run the rules"
 * on the Answers page.  Out: the list (done steps with a check, the current one aria-current="step", later ones muted)
 * and the bar. The API sends no progress events, so the bar has no value (no aria-valuenow); it slides while the
 * work runs and stands still when reduced motion is on (DESIGN.md, Motion).
 */
import { CHECKING_STEPS } from "@/content/plan";
import { cn } from "@/lib/utils";

export function CheckingSteps({ current, label = "Where the check is" }: { current: number; label?: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0">
      {CHECKING_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "later";
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            data-step-state={state}
            className={cn(
              "flex min-h-11 items-center gap-3",
              state === "current" ? "font-medium text-blue" : state === "done" ? "text-ink" : "text-ink-muted",
            )}
          >
            <StepMark state={state} />
            <span>
              {step}
              {state === "done" ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Beside each step's words, so decorative: a check for done, a filled ring for now, an empty ring for later. */
function StepMark({ state }: { state: "done" | "current" | "later" }) {
  const common = { width: 20, height: 20, viewBox: `0 0 20 20`, "aria-hidden": true, focusable: false, className: "shrink-0" } as const;
  if (state === "done") {
    return (
      <svg {...common}>
        <circle cx={10} cy={10} r={9} className="fill-blue" />
        <path d="M6.2 10.3l2.5 2.5 5.1-5.3" className="stroke-white" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (state === "current") {
    return (
      <svg {...common}>
        <circle cx={10} cy={10} r={8.25} className="stroke-blue" strokeWidth={2.5} fill="none" />
        <circle cx={10} cy={10} r={3.5} className="fill-blue" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx={10} cy={10} r={8.5} className="stroke-field" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

/** An indeterminate bar: no value, because the API reports none. */
export function CheckingBar({ label }: { label: string }) {
  return (
    <div role="progressbar" aria-label={label} className="checking-bar">
      <span />
    </div>
  );
}
