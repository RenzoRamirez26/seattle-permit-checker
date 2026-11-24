import type { Metadata } from "next";
import { Suspense } from "react";
import { ReadingPage } from "./ReadingPage";

export const metadata: Metadata = { title: "Reading your plan" };

export default function Page() {
  return (
    <Suspense>
      <ReadingPage />
    </Suspense>
  );
}
