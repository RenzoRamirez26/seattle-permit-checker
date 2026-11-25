import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { PageShell } from "@/components/flow/PageShell";
import { RuleLevels } from "@/components/help/RuleLevels";
import { CAN_AND_CANNOT, HELP } from "@/content/help";
import { LEVELS_HELP } from "@/content/verification";

export const metadata: Metadata = pageMetadata({
  title: "How the pre-check works",
  description: "What the PermitOS pre-check looks at, how far each rule is checked, what happens to your plan, and how voice works.",
  path: "/help/",
});

/** D8: the assistant's fixed help text as a page, so it can be read and linked without opening the assistant. */
export default function Page() {
  return (
    <PageShell back="/" title="How the pre-check works">
      <div className="flex flex-col gap-8">
        <p className="m-0 measure">{CAN_AND_CANNOT}</p>
        {HELP.map((h) =>
          h.id === LEVELS_HELP.id ? <RuleLevels key={h.id} /> : (  // the levels with today's counts from /api/meta
            <section key={h.id} id={h.id} aria-labelledby={`${h.id}-q`} className="flex flex-col gap-2">
              <h2 id={`${h.id}-q`} className="m-0 text-section-heading">{h.question}</h2>
              <p className="m-0 measure">{h.answer}</p>
            </section>
          ))}
        <p className="m-0"><Link href="/business/">Start the pre-check</Link></p>
      </div>
    </PageShell>
  );
}
