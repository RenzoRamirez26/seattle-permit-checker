import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "Check what we read from your plan" };

export default function Page() {
  return <PageShell step={3} back="/plan/" title="Check what we read from your plan" />;
}
