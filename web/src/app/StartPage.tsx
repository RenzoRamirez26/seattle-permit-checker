"use client";
/**
 * Start (step 1): who the pre-check is for and what happens, an invented example plan as a drawing, the step 1 form
 * (BusinessForm) on a white card in the blue band, and "How it works" in four steps. The serif headline is Start's
 * alone (D2). In: /api/meta (through BusinessForm), /demo/plans.json for the drawing's file and size, "?deleted=1"
 * after a check was deleted.  Out: the step 1 answers, saved by BusinessForm, then /plan/.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { BusinessForm } from "@/app/business/BusinessPage";
import { PageHeading } from "@/components/flow/PageHeading";
import { startOver } from "@/components/flow/startOver";
import { useHydrated } from "@/lib/hydrated";

const EXAMPLE_PLAN = "cafe_flawed";

const HOW = [
  { title: "You upload your plan", text: "A PDF or a photo of the floor plan. The file is deleted as soon as it is read." },
  { title: "The model reads it", text: "It notes the rooms, doors, exits and fixtures it can see. It decides nothing." },
  { title: "You confirm", text: "You check each reading against your plan and correct anything that is wrong." },
  { title: "Seattle's rules decide", text: "Rules we coded from Seattle's building codes list what to fix, what to check with the city and the permits to expect. Some of their values are still being checked against the code." },
];

export function StartPage() {
  const hydrated = useHydrated();
  const generation = useSyncExternalStore(startOver.subscribe, startOver.get, () => 0);   // Start over empties the form
  const deleted = useSearchParams().get("deleted") === "1";
  return (
    <div className="flex flex-col">
      <section aria-labelledby="page-heading" className="bg-paper py-12 lg:py-16">
        <div className="page-grid gap-y-8">
          <div className="col-span-full flex min-w-0 flex-col gap-6 lg:col-span-7 lg:self-center">
            {deleted ? (
              <p role="status" className="m-0 rounded-2xl bg-tint p-4 font-medium text-ink">The check was deleted from the server.</p>
            ) : null}
            <PageHeading className="start-heading">Check your space before you sign the lease.</PageHeading>
            <p className="m-0 measure">
              For anyone opening a small business in Seattle: upload the floor plan, confirm what we read, and see what to fix
              and which permits to expect. A pre-check, not a city approval.
            </p>
          </div>
          <div className="col-span-full min-w-0 sm:col-span-6 sm:col-start-2 lg:col-span-5 lg:col-start-8">
            <ExamplePlan />
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
            {hydrated ? <BusinessForm key={generation} /> : <p className="m-0" aria-live="polite">Loading the questions…</p>}
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

type PlanPicture = { src: string; width: number; height: number };

/** The invented example plan, as a drawing. Its file and pixel size come from /demo/plans.json (scripts/copy-demo.mjs). */
function ExamplePlan() {
  const [plan, setPlan] = useState<PlanPicture | null>(null);
  useEffect(() => {
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
  }, []);
  if (!plan) return <div aria-hidden className="aspect-[1308/1494] w-full rounded-2xl bg-white" />;
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-hairline bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export: next/image would not optimise it anyway */}
      <img
        src={plan.src}
        width={plan.width}
        height={plan.height}
        alt="An example floor plan of a café, invented for this demo"
        className="block h-auto w-full"
      />
    </figure>
  );
}
