import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "Your pre-check results" };

export default function Page() {
  return <PageShell step={4} title="Your pre-check results" />;
}
