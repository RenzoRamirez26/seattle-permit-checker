import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { BusinessPage } from "./BusinessShell";

export const metadata: Metadata = pageMetadata({
  title: "What kind of business is it?",
  description: "Step 1 of the PermitOS pre-check: the kind of business, a few yes or no questions, and the address or zone in Seattle.",
  path: "/business/",
});

export default function Page() {
  return <BusinessPage />;
}
