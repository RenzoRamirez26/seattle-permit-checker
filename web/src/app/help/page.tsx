import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "How the pre-check works" };

export default function Page() {
  return <PageShell back="/" title="How the pre-check works" />;
}
