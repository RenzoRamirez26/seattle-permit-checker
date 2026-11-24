import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckPage } from "./CheckPage";

export const metadata: Metadata = { title: "Check what we read from your plan" };

export default function Page() {
  return (
    <Suspense>
      <CheckPage />
    </Suspense>
  );
}
