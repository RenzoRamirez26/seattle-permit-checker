import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { CheckPage } from "./CheckPage";

export const metadata: Metadata = pageMetadata({
  title: "Check what we read from your plan",
  description: "Step 3 of the PermitOS pre-check: confirm or correct each value read from your floor plan before the rules run.",
  path: "/check/",
  index: false,
});

export default function Page() {
  return (
    <Suspense>
      <CheckPage />
    </Suspense>
  );
}
