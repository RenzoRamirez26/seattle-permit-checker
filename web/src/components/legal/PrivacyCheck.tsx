"use client";
/** "Your check" on the Privacy page, with how many days a check is kept from /api/meta (PERMIT_CHECK_DAYS). */
import { useMeta } from "@/components/layout/Providers";
import { LegalSections } from "@/components/legal/LegalSections";
import { PRIVACY_CHECK } from "@/content/legal";

export function PrivacyCheck() {
  const { meta } = useMeta();
  return <LegalSections sections={[PRIVACY_CHECK(meta ? meta.limits.check_days : null)]} />;
}
