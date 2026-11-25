import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { PlanPage } from "./PlanPage";

export const metadata: Metadata = pageMetadata({
  title: "Upload your floor plan",
  description: "Step 2 of the PermitOS pre-check: upload a PDF, PNG or JPG of your floor plan, or try an invented example plan.",
  path: "/plan/",
});

export default function Page() {
  return (
    <Suspense>
      <PlanPage />
    </Suspense>
  );
}
