"use client";
/**
 * Start: what the pre-check does, what you need, that it is not a city service, and the example plans.
 * Text only (Q5: no drawing until its rights statement is confirmed). The serif heading is Start's alone (D2).
 */
import { useState } from "react";
import Link from "next/link";
import { PageHeading } from "@/components/flow/PageHeading";
import { useMeta } from "@/components/layout/Providers";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useHydrated } from "@/lib/hydrated";
import { flow } from "@/state/flow";

export function StartPage() {
  const { meta } = useMeta();
  const hydrated = useHydrated();
  return (
    <div className="page-grid pt-12">
      <div className="col-question flex flex-col gap-8">
        <PageHeading className="start-heading">Check your floor plan before you apply</PageHeading>
        <p className="m-0 text-section-heading font-normal measure">
          Find out what a Seattle plan reviewer is likely to send back on a small-business floor plan, and which permits to expect, before you apply.
        </p>

        <section aria-labelledby="need" className="flex flex-col gap-2">
          <h2 id="need" className="m-0 text-section-heading">What you need</h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-6">
            <li>Your floor plan, as a PDF or a photo</li>
            <li>The street address in Seattle, if you have it</li>
            <li>What the business will do: the kind of business, and whether there will be cooking</li>
          </ul>
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-2">
          <h2 id="how" className="m-0 text-section-heading">How it works</h2>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-6">
            <li>Say what kind of business it is.</li>
            <li>Upload the floor plan. It is read and then deleted.</li>
            <li>Check what was read from it, and correct anything wrong.</li>
            <li>See what to fix, what to check with the city, and which permits to expect.</li>
          </ol>
        </section>

        <p className="m-0 border-l-2 border-hairline pl-4 measure">
          This is a prototype, not a City of Seattle service. It does not approve anything: the city&rsquo;s plan reviewers decide.
          It checks the things it knows about and says where it cannot tell.
        </p>

        <div className="flex flex-wrap items-center gap-6">
          <LinkButton href="/business/">Start</LinkButton>
          {hydrated ? <StartAgain /> : null}
        </div>

        <section aria-labelledby="examples" className="flex flex-col gap-2 border-t border-hairline pt-8">
          <h2 id="examples" className="m-0 text-section-heading">Try an example plan</h2>
          <p className="m-0 text-ink-muted">Invented plans, to see how the pre-check works without your own.</p>
          {meta ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {meta.demo_cases.map((c) => (
                <li key={c.id}>
                  <Link href={`/plan/reading/?example=${encodeURIComponent(c.id)}`} className="inline-flex min-h-11 items-center">{c.title}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0" aria-live="polite">Loading the examples…</p>
          )}
          {meta && !meta.features.model_api_key ? (
            <p className="m-0 text-small text-ink-muted">On this server only the example plans can be read. You can also enter your own measurements by hand.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** "Start again" when this tab holds earlier answers: clears them and the plan file. */
function StartAgain() {
  const [has, setHas] = useState(() => !!(flow.business() || flow.reading()));
  if (!has) return null;
  return (
    <Button variant="quiet" onPress={() => { flow.clear(); setHas(false); }}>
      Start again (clears your answers)
    </Button>
  );
}
