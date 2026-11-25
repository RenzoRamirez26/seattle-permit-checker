import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/flow/PageShell";
import { LegalSections } from "@/components/legal/LegalSections";
import { CONTACT_EMAIL, LEGAL_UPDATED, TERMS, TERMS_INTRO } from "@/content/legal";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description: "The terms for using PermitOS: a pre-check, not a city approval or professional advice, and not a City of Seattle service.",
  path: "/terms/",
});

/** The terms of use, in plain words (CONTENT.md). Not reviewed by a lawyer. */
export default function Page() {
  return (
    <PageShell back="/" title="Terms">
      <div className="flex flex-col gap-8">
        <p className="m-0 measure">{TERMS_INTRO}</p>
        <p className="m-0 text-ink-muted">Last updated <time dateTime={LEGAL_UPDATED}>{formatDate(LEGAL_UPDATED)}</time>.</p>
        <LegalSections sections={TERMS} />
        <section aria-labelledby="terms-contact-h" className="flex flex-col gap-2">
          <h2 id="terms-contact-h" className="m-0 text-section-heading">Questions</h2>
          <p className="m-0 measure">Write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. How we handle what you send is on the <Link href="/privacy/">Privacy</Link> page.</p>
        </section>
        <p className="m-0"><Link href="/">Start the pre-check</Link></p>
      </div>
    </PageShell>
  );
}
