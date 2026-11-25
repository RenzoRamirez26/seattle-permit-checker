import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { ReadingPage } from "./ReadingPage";

export const metadata: Metadata = pageMetadata({
  title: "Reading your plan",
  description: "PermitOS is reading your floor plan for rooms, doors, exits and fixtures.",
  path: "/plan/reading/",
  index: false,
});

export default function Page() {
  return (
    <Suspense>
      <ReadingPage />
    </Suspense>
  );
}
