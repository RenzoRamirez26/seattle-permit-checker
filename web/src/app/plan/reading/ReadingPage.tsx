"use client";
/**
 * "Reading your plan": sends the plan to POST /api/plans/read and opens step 3 with what came back.
 * The API reads a plan in one request with no progress events, so no stage is named (D4): the page says
 * what it is reading and offers Cancel, which stops the request and returns to step 2.
 * "?example=<id>" reads an example plan instead and sets the example's business answers.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiProblem, call, type Meta, type PlanReading } from "@/api/client";
import { PageShell } from "@/components/flow/PageShell";
import { loadMeta } from "@/components/layout/Providers";
import { useHydrated } from "@/lib/hydrated";
import { flow, planFile, type Business } from "@/state/flow";

export function ReadingPage() {
  const hydrated = useHydrated();
  return (
    <PageShell step={2} title="Reading your plan">
      {hydrated ? <Reading /> : null}
    </PageShell>
  );
}

/** The answers an example plan was made for (its business type, cooking, zone); everything else no. */
function exampleBusiness(meta: Meta, caseId: string): Business | null {
  const c = meta.demo_cases.find((x) => x.id === caseId);
  if (!c) return null;
  return {
    business_type: c.business_type, cooking_on_site: c.cooking_on_site, food_prep: false, serves_alcohol: false,
    outdoor_seating: false, upper_floor: false, historic_district: false, new_signage: null, address: "", zone: c.zone ?? "",
  };
}

function Reading() {
  const router = useRouter();
  const example = useSearchParams().get("example");
  const [file] = useState(() => planFile.get());
  const controller = useRef<AbortController | null>(null);
  const what = example ? "the example plan" : file?.name;

  useEffect(() => {
    if (!example && !file) return;
    const abort = new AbortController();
    controller.current = abort;
    (async () => {
      try {
        let reading: PlanReading;
        if (example) {
          const meta = await loadMeta();
          reading = await call(() => api.POST("/api/plans/read", {
            body: { case_id: example } as never,
            bodySerializer: () => form({ case_id: example }),
            signal: abort.signal,
          }));
          const b = exampleBusiness(meta, example);
          if (b) {
            flow.setBusiness(b);
            flow.clearBusinessDraft();
          }
          planFile.clear();
        } else {
          const business = flow.business();
          reading = await call(() => api.POST("/api/plans/read", {
            body: {} as never,
            bodySerializer: () => form({ file: file!, ...(business?.business_type ? { business_type: business.business_type } : {}) }),
            signal: abort.signal,
          }));
        }
        if (abort.signal.aborted) return;
        flow.setReading({ ...reading, file_name: file && !example ? file.name : null, file_type: file && !example ? file.type : null });
        router.replace("/check/");
      } catch (e) {
        if (abort.signal.aborted) return;
        const code = e instanceof ApiProblem ? e.code : "network";
        router.replace(`/plan/?problem=${encodeURIComponent(code)}`);
      }
    })();
    return () => abort.abort();
  }, [example, file, router]);

  if (!example && !file) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0">There is no plan to read. The plan file is not kept after a refresh.</p>
        <p className="m-0"><Link href="/plan/">Choose your floor plan</Link></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-6">
      <p className="m-0" role="status">
        Reading {what === "the example plan" ? what : <span className="break-all font-semibold">{what}</span>}. The next page shows what was read, for you to check.
      </p>
      <Link href="/plan/" className="inline-flex min-h-11 items-center" onClick={() => controller.current?.abort()}>
        Cancel
      </Link>
    </div>
  );
}

function form(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}
