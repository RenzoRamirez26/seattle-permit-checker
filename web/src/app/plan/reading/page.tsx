import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "Reading your plan" };

export default function Page() {
  return <PageShell step={2} title="Reading your plan" />;
}
