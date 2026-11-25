import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/flow/PageShell";
import { LegalSections } from "@/components/legal/LegalSections";
import { PrivacyCheck } from "@/components/legal/PrivacyCheck";
import {
  CONTACT_EMAIL, LEGAL_UPDATED, PRIVACY, PRIVACY_ANALYTICS_OFF, PRIVACY_ANALYTICS_ON, PRIVACY_CONTACT, PRIVACY_INTRO,
  PRIVACY_NOT_SOLD, PRIVACY_TURNSTILE,
} from "@/content/legal";
import { analyticsOn } from "@/lib/analytics";
import { turnstileOn } from "@/lib/turnstile";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: "What happens to your floor plan, answers, address and voice on PermitOS: what is sent where, and how long it is kept.",
  path: "/privacy/",
});

/** What the site does with what people send, matching the code (each sentence's source is noted in content/legal.ts). */
export default function Page() {
  const [first, ...rest] = PRIVACY;
  return (
    <PageShell back="/" title="Privacy">
      <div className="flex flex-col gap-8">
        <p className="m-0 measure">{PRIVACY_INTRO}</p>
        <p className="m-0 text-ink-muted">Last updated <time dateTime={LEGAL_UPDATED}>{formatDate(LEGAL_UPDATED)}</time>.</p>
        <LegalSections sections={[first, rest[0]]} />
        <PrivacyCheck />
        <LegalSections sections={rest.slice(1)} />
        <LegalSections sections={[analyticsOn ? PRIVACY_ANALYTICS_ON : PRIVACY_ANALYTICS_OFF, ...(turnstileOn ? [PRIVACY_TURNSTILE] : [])]} />
        <p className="m-0 measure">{PRIVACY_NOT_SOLD}</p>
        <section aria-labelledby="contact-h" className="flex flex-col gap-2">
          <h2 id="contact-h" className="m-0 text-section-heading">{PRIVACY_CONTACT.heading}</h2>
          <p className="m-0 measure">
            {PRIVACY_CONTACT.text} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. {PRIVACY_CONTACT.after}
          </p>
        </section>
        <p className="m-0"><Link href="/">Start the pre-check</Link></p>
      </div>
    </PageShell>
  );
}
