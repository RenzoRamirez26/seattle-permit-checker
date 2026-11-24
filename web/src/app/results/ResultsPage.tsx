"use client";
/** Step 4 (temporary, stage 1): the counts sentence for the check in the address (?check=<id>). */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiProblem, call, type Check } from "@/api/client";
import { errorWords } from "@/api/errors";
import { PageShell } from "@/components/flow/PageShell";
import { CountsSentence } from "@/components/results/CountsSentence";

export function ResultsPage() {
  const id = useSearchParams().get("check");
  const [check, setCheck] = useState<Check | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    call(() => api.GET("/api/checks/{check_id}", { params: { path: { check_id: id } } })).then(setCheck, (e) =>
      setProblem(e instanceof ApiProblem ? e.code : "network"));
  }, [id]);

  return (
    <PageShell step={4} back="/check/" title="Your pre-check results">
      {!id ? (
        <p className="m-0">There is no check to show. <Link href="/">Start a pre-check</Link>.</p>
      ) : problem ? (
        <p className="m-0" role="alert">{errorWords(problem)} <Link href="/">Start a new check</Link>.</p>
      ) : !check ? (
        <p className="m-0" aria-live="polite">Loading the results…</p>
      ) : (
        <CountsSentence summary={check.result.summary} />
      )}
    </PageShell>
  );
}
