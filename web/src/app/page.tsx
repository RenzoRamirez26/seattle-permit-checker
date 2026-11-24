import type { Metadata } from "next";
import "@fontsource/ibm-plex-serif/latin-400.css";
import { Suspense } from "react";
import { StartPage } from "./StartPage";

export const metadata: Metadata = { title: { absolute: "Check your space before you sign the lease | PermitOS" } };

export default function Page() {
  return (
    <Suspense>
      <StartPage />
    </Suspense>
  );
}
