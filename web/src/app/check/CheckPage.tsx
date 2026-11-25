"use client";
/**
 * Step 3, "Answers" in the header ("Check what we read from your plan"): the plan in 7 columns, the answers in 5
 * (plan first on a phone).
 * In: the reading and the facts from sessionStorage (steps 2 and 3), the step 1 answers, the API's meta.
 * Out: POST /api/checks with the confirmed facts, the business answers and the place, then the results page.
 * The answers come in three groups: "Check these first" (readings the API left empty), "Also used in the check"
 * (everything else) and "About your business" (step 1). The owner corrects anything wrong, then runs the check.
 * The decision is the API's; this page only collects, shows and sends.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiProblem, call, type Facts, type Meta } from "@/api/client";
import { errorWords } from "@/api/errors";
import { questionsFor } from "@/app/business/BusinessPage";
import { ErrorSummary, type ProblemItem } from "@/components/flow/ErrorSummary";
import { ExampleAnswersNotice } from "@/components/flow/ExampleAnswersNotice";
import { PageShell } from "@/components/flow/PageShell";
import { FactsEditor, type SelectedRow } from "@/components/plan/FactGroup";
import type { RowProblem } from "@/components/plan/FactRow";
import { PlanViewer } from "@/components/plan/PlanViewer";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { QUESTIONS } from "@/content/business";
import { ANSWERS, NOT_SURE, SOURCE_WORDS } from "@/content/facts";
import { checkRequest } from "@/state/request";
import { emptyFacts, flow, sameBusiness, type Answer, type Business, type Reading } from "@/state/flow";
import { useHydrated } from "@/lib/hydrated";
import { track } from "@/lib/analytics";
import { CheckingBar, CheckingSteps } from "@/components/flow/CheckingSteps";
import { cn } from "@/lib/utils";

export function CheckPage() {
  const hydrated = useHydrated();
  const loading = <p className="m-0 min-h-[60vh]" aria-live="polite">Loading what was read…</p>;
  return (
    <PageShell step={3} back="/plan/" title="Check what we read from your plan" wide>
      {/* Only the body reads ?enter=, so the shell and its h1 are in the static HTML. */}
      {hydrated ? <Suspense fallback={loading}><CheckBodyFromUrl /></Suspense> : loading}
    </PageShell>
  );
}

function CheckBodyFromUrl() {
  return <CheckBody enterYourself={useSearchParams().get("enter") === "yourself"} />;
}

/**
 * What was read, from sessionStorage. "?enter=yourself" always starts a new, empty manual entry, even when an
 * earlier or example reading is stored, so the owner never checks someone else's measurements by mistake.
 */
export function initialReading(enterYourself: boolean): Reading | null {
  if (enterYourself) {
    const r: Reading = { source: "manual", source_label: "", case_id: null, facts: emptyFacts() };
    flow.setReading(r);
    return r;
  }
  return flow.reading();
}

function CheckBody({ enterYourself }: { enterYourself: boolean }) {
  const router = useRouter();
  const { meta } = useMeta();
  const [reading] = useState<Reading | null>(() => initialReading(enterYourself));
  const [facts, setFacts] = useState<Facts | null>(() => (reading ? (flow.facts() ?? reading.facts) : null));
  const [business, setBusiness] = useState<Business | null>(() => flow.business());
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedRow | null>(null);
  const [rowProblems, setRowProblems] = useState<RowProblem[]>([]);
  const [runProblems, setRunProblems] = useState<ProblemItem[]>([]);
  const [running, setRunning] = useState(false);
  const summary = useRef<HTMLDivElement>(null);

  // The empty entry is stored now; drop "?enter=yourself" so a refresh keeps what the owner types instead of emptying it again.
  useEffect(() => {
    if (enterYourself) router.replace("/check/", { scroll: false });
  }, [enterYourself, router]);

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

  // "Keep my answers" in the example notice puts the owner's step 1 answers back, then moves focus to its message:
  // read the answers again when that happens, so "About your business" shows the ones the check will use.
  const rereadBusiness = () => {
    const now = flow.business();
    setBusiness((b) => (b && now && sameBusiness(b, now)) || b === now ? b : now);
  };

  const run = async () => {
    const problems: ProblemItem[] = [];
    const answers = flow.business();
    if (!answers) problems.push({ text: ANSWERS.needBusiness, href: "/business/" });
    if (editing) problems.push({ text: ANSWERS.saveFirst, href: `#${editing}` });
    if (problems.length || !facts || !answers) {
      setRunProblems(problems);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setRunning(true);
    setRunProblems([]);
    try {
      const check = await call(() => api.POST("/api/checks", { body: checkRequest(facts, answers) }));
      flow.setCheckId(check.id);
      // Two counts only, no content: a check ran, and whether the owner changed what was read from a plan first.
      if (reading && reading.source !== "manual" && JSON.stringify(facts) !== JSON.stringify(reading.facts)) track("Reading corrected");
      track("Check completed");
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
        <>
        {reading.case_id ? (
          <div onFocus={rereadBusiness}>
            <ExampleAnswersNotice meta={meta} />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <div className="lg:sticky lg:top-6">
              <PlanViewer caseId={reading.case_id} caseTitle={caseTitle} manual={reading.source === "manual"} fileName={reading.file_name}
                selected={selected} />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <p className="m-0 measure">
              {SOURCE_WORDS[reading.source]} {ANSWERS.intro}
            </p>
            <div className="mt-8">
              <FactsEditor facts={facts} original={reading.source === "manual" ? null : reading.facts} editing={editing}
                setEditing={setEditing} onChange={change} onProblems={setRowProblems} onSelect={setSelected} />
            </div>
            <AboutBusiness business={business} meta={meta} />
            <div className="mt-12 flex flex-col items-start border-t border-hairline pt-8">
              <p className="m-0 measure">{ANSWERS.runNote}</p>
              <Button variant="primary" className="mt-4" onPress={run} pending={running} isDisabled={running}>
                {running ? ANSWERS.running : ANSWERS.run}
              </Button>
              {/* Said while the API runs the rules. Always in the page (empty when idle) so it is announced. */}
              <p role="status" className="m-0 not-empty:mt-4">{running ? ANSWERS.runningStatus : null}</p>
              {running ? (
                <div className="mt-4 flex flex-col gap-4" data-testid="checking">
                  <CheckingSteps current={3} />
                  <CheckingBar label="Running the rules" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );
}

const answerWord = (a: Answer | undefined) => (a === true ? "Yes" : a === false ? "No" : NOT_SURE);

/** The step 1 answers the check will use, as rows, with one way back to change them. */
export function AboutBusiness({ business, meta }: { business: Business | null; meta: Meta | null }) {
  const rows: { label: string; value: string; unsure?: boolean }[] = [];
  if (business) {
    const type = meta?.business_types.find((t) => t.key === business.business_type)?.label ?? business.business_type;
    rows.push({ label: ANSWERS.businessType, value: type });
    const { required, optional } = questionsFor(meta, business.business_type);
    for (const k of [...required, ...optional]) {
      const a = business[k];
      rows.push({ label: QUESTIONS[k].label, value: answerWord(a), unsure: a === null || a === undefined });
    }
    if (business.address) rows.push({ label: ANSWERS.address, value: business.address });
    else if (business.zone) rows.push({ label: ANSWERS.zone, value: business.zone });
    else rows.push({ label: ANSWERS.noPlace, value: ANSWERS.notGiven });
  }
  return (
    <section aria-labelledby="group-business" className="mt-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="group-business" className="m-0 text-section-heading">{ANSWERS.business}</h2>
        {business ? (
          <Link href="/business/" aria-label={ANSWERS.changeLabel}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-field bg-white px-5 font-medium text-blue no-underline hover:border-ink">
            {ANSWERS.change}
          </Link>
        ) : null}
      </div>
      {business ? (
        <dl className="m-0" data-testid="business-answers">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4 border-t border-hairline py-3">
              <dt className="min-w-0 text-ink-muted">{r.label}</dt>
              <dd className={cn("m-0 max-w-[55%] text-right break-words", r.unsure && "font-medium text-blue")}>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 border-t border-hairline pt-4">
          {ANSWERS.noBusiness} <Link href="/business/">{ANSWERS.answerThem}</Link>
        </p>
      )}
    </section>
  );
}

function NothingRead() {
  return (
    <div className="flex max-w-[80ch] flex-col items-start gap-4">
      <p className="m-0">We haven&apos;t read a plan in this browser tab yet.</p>
      <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
        <li><Link href="/plan/">Upload your floor plan</Link></li>
        <li><Link href="/check/?enter=yourself">Enter the measurements yourself</Link></li>
      </ul>
    </div>
  );
}
