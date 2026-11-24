/**
 * The four steps of the pre-check as the header names them, and which page belongs to which step.
 * In: a path such as "/plan/reading/".  Out: the step's number (1 to 4), or null for pages outside the flow (help, 404).
 */
export const FLOW_STEPS = [
  { n: 1, label: "Start", href: "/" },
  { n: 2, label: "Plan", href: "/plan/" },
  { n: 3, label: "Answers", href: "/check/" },
  { n: 4, label: "Results", href: "/results/" },
] as const;

export type StepNumber = (typeof FLOW_STEPS)[number]["n"];

const ROUTES: Record<string, StepNumber> = {
  "/": 1,
  "/business": 1,
  "/plan": 2,
  "/plan/reading": 2,
  "/check": 3,
  "/results": 4,
};

/** "/plan/" and "/plan" are the same page. */
export const cleanPath = (path: string | null | undefined) => (path ?? "/").replace(/\/+$/, "") || "/";

export function stepForPath(path: string | null | undefined): StepNumber | null {
  return ROUTES[cleanPath(path)] ?? null;
}
