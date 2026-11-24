import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsPage } from "./ResultsPage";

export const metadata: Metadata = { title: "Your pre-check results" };

export default function Page() {
  return (
    <Suspense>
      <ResultsPage />
    </Suspense>
  );
}
