"use client";
import { PageShell } from "@/components/flow/PageShell";
import { useHydrated } from "@/lib/hydrated";
import { BusinessForm } from "./BusinessPage";

export function BusinessPage() {
  const hydrated = useHydrated();
  return (
    <PageShell step={1} back="/" title="What kind of business is it?">
      {hydrated ? <BusinessForm /> : <p className="m-0" aria-live="polite">Loading the questions…</p>}
    </PageShell>
  );
}
