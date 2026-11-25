"use client";
/**
 * Start (step 1): who the pre-check is for, the four steps as one short line under the intro, an invented example plan
 * as a drawing, the step 1 form (BusinessForm) on a white card in the blue band, and "How it works" in four steps. The
 * last step gives /api/meta's counts: how many rules are checked against the code text and how many reviewed. The serif headline is Start's alone (D2). In: /api/meta, /demo/plans.json for the drawing's file and size,
 * "?deleted=1" after a check was deleted.  Out: the step 1 answers, saved by BusinessForm, then /plan/.
 */
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessForm } from "@/app/business/BusinessPage";
import { PageHeading } from "@/components/flow/PageHeading";
import { startOver } from "@/components/flow/startOver";
import { useHydrated } from "@/lib/hydrated";
import { useMeta } from "@/components/layout/Providers";
import { DECIDE, DECIDE_TEXT, decideStrip, rulesCheckedWords } from "@/content/verification";

const EXAMPLE_PLAN = "cafe_flawed";


/** The four steps. The last one gives /api/meta's counts of rules checked against the code text and reviewed. */
function howSteps(strip: string, checked: string) {
  return [
    { title: "You upload your plan", strip: "You upload your plan", text: "A PDF or a photo of the floor plan. The file is deleted as soon as it is read." },
    { title: "The model reads it", strip: "The model reads it", text: "It notes the rooms, doors, exits and fixtures it can see. It decides nothing." },
    { title: "You confirm", strip: "You confirm", text: "You check each reading against your plan and correct anything that is wrong." },
    { title: DECIDE, strip, text: `${DECIDE_TEXT} ${checked}`.trim() },
  ];
}

/** The notice after a check was deleted. Only this reads the URL, so the rest of Start is in the static HTML. */
function DeletedNotice() {
  if (useSearchParams().get("deleted") !== "1") return null;
  return <p role="status" className="m-0 rounded-2xl bg-tint p-4 font-medium text-ink">The check was deleted from the server.</p>;
}

/** plan: the example drawing's file and size, read when the site is built (page.tsx), so the picture is in the HTML. */
export function StartPage({ plan = null }: { plan?: PlanPicture | null } = {}) {
  const hydrated = useHydrated();
  const generation = useSyncExternalStore(startOver.subscribe, startOver.get, () => 0);   // Start over empties the form
  const { meta } = useMeta();
  const HOW = howSteps(decideStrip(meta), rulesCheckedWords(meta));
  return (
    <div className="flex flex-col">
      <section aria-labelledby="page-heading" className="bg-paper py-12 lg:py-16">
        <div className="page-grid gap-y-8">
          <div className="col-span-full flex min-w-0 flex-col gap-6 lg:col-span-7 lg:self-center">
            <Suspense fallback={null}><DeletedNotice /></Suspense>
            <PageHeading className="start-heading">Check your space before you sign the lease.</PageHeading>
            <p className="m-0 measure">
              For anyone opening a small business in Seattle: upload the floor plan, confirm what we read, and see what to fix
              and which permits to expect. A pre-check, not a city approval.
            </p>
            <ol aria-label="How it works, in short" className="m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 font-medium">
              {HOW.map((s, i) => (
                <li key={s.title} className={i < HOW.length - 1 ? "flex gap-2 sm:whitespace-nowrap" : "flex gap-2"}>
                  {i > 0 ? <span aria-hidden className="text-blue">·</span> : null}
                  {s.strip}
                </li>
              ))}
            </ol>
          </div>
          <div className="col-span-full min-w-0 sm:col-span-6 sm:col-start-2 lg:col-span-5 lg:col-start-8">
            <ExamplePlan initial={plan} />
          </div>
        </div>
      </section>

      <section aria-labelledby="start-form" className="bg-blue py-12 text-hero-text lg:py-16">
        <div className="page-grid gap-y-6">
          <div className="col-span-full flex min-w-0 flex-col gap-2 lg:col-span-8 lg:col-start-3">
            <h2 id="start-form" className="m-0 text-section-heading">What kind of business is it?</h2>
            <p className="m-0 text-hero-muted">A few answers about the business. Then you upload the plan.</p>
          </div>
          <div className="col-span-full min-w-0 rounded-2xl bg-white p-6 text-ink sm:p-8 lg:col-span-8 lg:col-start-3">
            {hydrated ? <BusinessForm key={generation} submitLabel="Start the pre-check" /> : <p className="m-0" aria-live="polite">Loading the questions…</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="bg-tint py-12 lg:py-16">
        <div className="page-grid gap-y-8">
          <h2 id="how" className="col-span-full m-0 text-section-heading">How it works</h2>
          <ol className="col-span-full m-0 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {HOW.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2">
                <span aria-hidden className="text-title font-light text-blue nums">{i + 1}</span>
                <h3 className="m-0 font-medium"><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
                <p className="m-0">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

export type PlanPicture = { src: string; width: number; height: number };

/** The invented example plan, as a drawing. Its file and pixel size come from /demo/plans.json (scripts/copy-demo.mjs). */
function ExamplePlan({ initial }: { initial: PlanPicture | null }) {
  const [plan, setPlan] = useState<PlanPicture | null>(initial);
  useEffect(() => {
    if (initial) return;
    let live = true;
    fetch("/demo/plans.json")
      .then((r) => r.json())
      .then((plans: Record<string, { file: string; width: number; height: number }>) => {
        const p = plans[EXAMPLE_PLAN];
        if (live && p) setPlan({ src: `/demo/${p.file}`, width: p.width, height: p.height });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial]);
  if (!plan) return <div aria-hidden className="aspect-[1308/1494] w-full rounded-2xl bg-white" />;
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-hairline bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export: next/image would not optimise it anyway */}
      <img
        src={plan.src}
        width={plan.width}
        height={plan.height}
        alt="An example floor plan of a café, invented for this demo"
        fetchPriority="high"
        className="block h-auto w-full"
      />
    </figure>
  );
}
