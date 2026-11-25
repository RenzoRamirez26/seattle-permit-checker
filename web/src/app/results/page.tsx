import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { ResultsPage } from "./ResultsPage";

export const metadata: Metadata = pageMetadata({
  title: "Your pre-check results",
  description: "Your PermitOS results: what to fix before you apply, what to check with the city, and the permits to expect.",
  path: "/results/",
  index: false,
});

export default function Page() {
  return (
    <Suspense>
      <ResultsPage />
    </Suspense>
  );
}
