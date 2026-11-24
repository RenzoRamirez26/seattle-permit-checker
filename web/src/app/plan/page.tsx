import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "Upload your floor plan" };

export default function Page() {
  return <PageShell step={2} back="/business/" title="Upload your floor plan" />;
}
