"use client";
/**
 * Step 3, "Check what we read from your plan": the plan in 7 columns, the facts in 5 (plan first on a phone).
 * The owner corrects anything wrong, then "Run the check" sends the confirmed facts, the business answers and
 * the place to POST /api/checks. The decision is the API's; this page only collects and sends.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiProblem, call, type Facts } from "@/api/client";
import { errorWords } from "@/api/errors";
import { ErrorSummary, type ProblemItem } from "@/components/flow/ErrorSummary";
import { PageShell } from "@/components/flow/PageShell";
import { FactsEditor } from "@/components/plan/FactGroup";
import type { RowProblem } from "@/components/plan/FactRow";
import { PlanViewer } from "@/components/plan/PlanViewer";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { SOURCE_WORDS } from "@/content/facts";
import { checkRequest } from "@/state/request";
import { emptyFacts, flow, type Reading } from "@/state/flow";
import { useHydrated } from "@/lib/hydrated";

export function CheckPage() {
  const hydrated = useHydrated();
  const enterYourself = useSearchParams().get("enter") === "yourself";
  return (
    <PageShell step={3} back="/plan/" title="Check what we read from your plan" wide>
      {hydrated ? <CheckBody enterYourself={enterYourself} /> : <p className="m-0" aria-live="polite">Loading what was read…</p>}
    </PageShell>
  );
}

/** What was read, from sessionStorage. "?enter=yourself" with nothing read starts with every fact empty. */
function initialReading(enterYourself: boolean): Reading | null {
  let r = flow.reading();
  if (!r && enterYourself) {
    r = { source: "manual", source_label: "", case_id: null, facts: emptyFacts() };
    flow.setReading(r);
  }
  return r;
}

function CheckBody({ enterYourself }: { enterYourself: boolean }) {
  const router = useRouter();
  const { meta } = useMeta();
  const [reading] = useState<Reading | null>(() => initialReading(enterYourself));
  const [facts, setFacts] = useState<Facts | null>(() => (reading ? (flow.facts() ?? reading.facts) : null));
  const [editing, setEditing] = useState<string | null>(null);
  const [rowProblems, setRowProblems] = useState<RowProblem[]>([]);
  const [runProblems, setRunProblems] = useState<ProblemItem[]>([]);
  const [running, setRunning] = useState(false);
  const summary = useRef<HTMLDivElement>(null);

  // Warn before leaving with a change that has not been saved.
  useEffect(() => {
    if (!editing) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing]);

  const change = useCallback((next: Facts) => {
    setFacts(next);
    flow.setFacts(next);
    setRunProblems([]);
  }, []);

  const run = async () => {
    const problems: ProblemItem[] = [];
    const business = flow.business();
    if (!business) problems.push({ text: "Answer what kind of business it is first.", href: "/business/" });
    if (editing) problems.push({ text: "Save or cancel the change you are making first.", href: `#${editing}` });
    if (problems.length || !facts || !business) {
      setRunProblems(problems);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setRunning(true);
    setRunProblems([]);
    try {
      const check = await call(() => api.POST("/api/checks", { body: checkRequest(facts, business) }));
      flow.setCheckId(check.id);
      router.push(`/results/?check=${encodeURIComponent(check.id)}`);
    } catch (e) {
      const p = e instanceof ApiProblem ? e : new ApiProblem("network", 0, "");
      const items: ProblemItem[] = [{ text: errorWords(p.code) }];
      for (const f of p.fields ?? []) items.push({ text: `${f.field.replace(/\./g, " ")}: ${f.problem}` });
      setRunProblems(items);
      setRunning(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  };

  const caseTitle = meta?.demo_cases.find((c) => c.id === reading?.case_id)?.title ?? null;
  const problems: ProblemItem[] = [...rowProblems.map((p) => ({ id: p.id, text: p.text, href: `#${p.id}` })), ...runProblems];

  return (
    <>
      <ErrorSummary ref={summary} items={problems} />
      {!reading || !facts ? (
        <NothingRead />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <div className="lg:sticky lg:top-6">
              <PlanViewer caseId={reading.case_id} caseTitle={caseTitle} manual={reading.source === "manual"} fileName={reading.file_name} />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <div className="flex flex-col gap-4">
              <p className="m-0 measure">
                {SOURCE_WORDS[reading.source]} Change anything that is wrong. Anything left as{" "}
                <span className="font-semibold text-city">Not sure</span> becomes something to check with the city.
              </p>
              {facts.uncertainties.length ? (
                <section aria-labelledby="unsure-heading" className="border-l-2 border-city bg-city-tint p-4">
                  <h2 id="unsure-heading" className="m-0 text-body font-semibold">What the reader was unsure about</h2>
                  <ul className="m-0 mt-2 list-disc pl-5">
                    {facts.uncertainties.map((u) => <li key={u}>{u}</li>)}
                  </ul>
                </section>
              ) : null}
            </div>
            <div className="mt-8">
              <FactsEditor facts={facts} original={reading.source === "manual" ? null : reading.facts} editing={editing}
                setEditing={setEditing} onChange={change} onProblems={setRowProblems} />
            </div>
            <div className="mt-12 flex flex-col items-start gap-4 border-t border-hairline pt-8">
              <p className="m-0 measure">The check uses the values above, including any you changed.</p>
              <Button variant="primary" onPress={run} pending={running} isDisabled={running}>
                {running ? "Running the check…" : "Run the check"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NothingRead() {
  return (
    <div className="flex max-w-[80ch] flex-col items-start gap-4">
      <p className="m-0">No plan has been read in this browser tab yet.</p>
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
        <li><Link href="/plan/">Upload your floor plan</Link></li>
        <li><Link href="/check/?enter=yourself">Enter the measurements yourself</Link></li>
      </ul>
    </div>
  );
}
