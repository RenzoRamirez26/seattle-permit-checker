"use client";
/**
 * The header on every page: the name "PermitOS" (a link to Start), the step nav "1 Start · 2 Plan · 3 Answers ·
 * 4 Results" in an outlined capsule, and Help and Start over as plain links. No seal, no city colours, no logo.
 * In: the current path, and what this tab has kept (sessionStorage, read only once the page is in the browser).
 * Out: links. Done steps link to their page; the current step is marked aria-current="step"; later steps are plain.
 * On pages outside the flow (help, 404) no step is current, and the steps this tab has reached are links.
 * Under 640 px the nav shrinks to "Step 2 of 4: Plan", so it never runs off a 320 px screen.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FLOW_STEPS, stepForPath, type StepNumber } from "@/components/flow/steps";
import { startOver } from "@/components/flow/startOver";
import { useHydrated } from "@/lib/hydrated";
import { cn } from "@/lib/utils";
import { flow } from "@/state/flow";

type Kind = "done" | "current" | "later";

/** Where a done step's link goes, or null when it cannot be a link (the results need a stored check id). */
function hrefFor(n: StepNumber, checkId: string | null): string | null {
  if (n === 4) return checkId ? `/results/?check=${encodeURIComponent(checkId)}` : null;
  return FLOW_STEPS[n - 1].href;
}

/** Outside the flow: the steps this tab has reached. Start is always reached. */
function reached(n: StepNumber, hydrated: boolean): boolean {
  if (n === 1) return true;
  if (!hydrated) return false;
  if (n === 2) return !!flow.business();
  if (n === 3) return !!flow.reading();
  return !!flow.checkId();
}

export function SiteHeader() {
  const path = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  useSyncExternalStore(startOver.subscribe, startOver.get, () => 0);   // draw again after Start over
  const current = stepForPath(path);
  const checkId = hydrated ? flow.checkId() : null;
  const currentStep = current ? FLOW_STEPS[current - 1] : null;

  const kind = (n: StepNumber): Kind => {
    if (current === null) return reached(n, hydrated) ? "done" : "later";
    return n < current ? "done" : n === current ? "current" : "later";
  };

  // Clears this tab's answers; Start's form starts again empty (it is keyed by the start-over count).
  const onStartOver = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    startOver.run();
    router.push("/");
  };

  return (
    <header className="border-b border-hairline">
      <div className="page-grid py-3">
        <div className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/" translate="no" className="inline-flex min-h-11 items-center text-section-heading text-ink no-underline hover:underline">
            <span>Permit<span className="text-blue">OS</span></span>
          </Link>

          <nav aria-label="Steps" className="order-last w-full lg:order-none lg:mx-auto lg:w-auto">
            {currentStep ? (
              <p className="m-0 inline-flex min-h-11 items-center rounded-full border border-field px-4 sm:hidden">
                <span>
                  Step <span className="nums">{currentStep.n}</span> of {FLOW_STEPS.length}:{" "}
                  <span className="font-medium text-blue">{currentStep.label}</span>
                </span>
              </p>
            ) : null}
            <ol className="m-0 hidden list-none items-center rounded-full border border-field px-3 py-0 sm:inline-flex">
              {FLOW_STEPS.map((s, i) => {
                const k = kind(s.n);
                const href = k === "done" ? hrefFor(s.n, checkId) : null;
                const words = (
                  <>
                    <span className="nums">{s.n}</span>&nbsp;{s.label}
                  </>
                );
                return (
                  <li key={s.n} className="flex items-center">
                    {i > 0 ? <span aria-hidden className="px-1 text-ink-muted">·</span> : null}
                    {href ? (
                      <Link href={href} className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-ink no-underline hover:underline">
                        {words}
                      </Link>
                    ) : (
                      <span
                        aria-current={k === "current" ? "step" : undefined}
                        className={cn(
                          "inline-flex min-h-11 items-center px-2",
                          k === "current" ? "font-medium text-blue" : k === "done" ? "text-ink" : "text-ink-muted",
                        )}
                      >
                        {words}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="ml-auto flex items-center gap-4 lg:ml-0">
            <Link href="/help/" className="inline-flex min-h-11 min-w-11 items-center justify-center">
              Help
            </Link>
            <Link href="/" onClick={onStartOver} className="inline-flex min-h-11 min-w-11 items-center justify-center">
              Start over
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
