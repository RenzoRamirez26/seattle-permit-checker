/**
 * The three status marks, coded by shape so they never rely on colour (DESIGN.md, Status icons):
 * Fix, a solid red circle with "!"; Check with the city, a hollow blue circle with "?"; No issues found, a thin grey
 * circle with a check. Always shown beside the words, so each is decorative (aria-hidden).
 */
import { cn } from "@/lib/utils";

export type Mark = "fix" | "city" | "none";

export function StatusIcon({ mark, size = 20, className }: { mark: Mark; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: `0 0 20 20`, "aria-hidden": true, focusable: false, className: cn("shrink-0", className) } as const;
  if (mark === "fix") {
    return (
      <svg {...common} data-mark="fix">
        <circle cx={10} cy={10} r={9.25} className="fill-fix" />
        <path d={`M10 5.25v6`} className="stroke-white" strokeWidth={2.25} strokeLinecap="round" fill="none" />
        <circle cx={10} cy={14.5} r={1.3} className="fill-white" />
      </svg>
    );
  }
  if (mark === "city") {
    return (
      <svg {...common} data-mark="city">
        <circle cx={10} cy={10} r={8.75} className="stroke-blue" strokeWidth={1.75} fill="none" />
        <path d={`M7.6 7.7a2.4 2.4 0 1 1 3.3 2.2c-.6.25-.9.7-.9 1.3v.4`} className="stroke-blue" strokeWidth={1.75} strokeLinecap="round" fill="none" />
        <circle cx={10} cy={14.4} r={1.1} className="fill-blue" />
      </svg>
    );
  }
  return (
    <svg {...common} data-mark="none">
      <circle cx={10} cy={10} r={9} className="stroke-field" strokeWidth={1} fill="none" />
      <path d={`M6.4 10.3l2.4 2.4 4.8-5.1`} className="stroke-ink-muted" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
