import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanPage } from "./PlanPage";

export const metadata: Metadata = { title: "Upload your floor plan" };

export default function Page() {
  return (
    <Suspense>
      <PlanPage />
    </Suspense>
  );
}
