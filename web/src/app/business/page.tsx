import type { Metadata } from "next";
import { PageShell } from "@/components/flow/PageShell";

export const metadata: Metadata = { title: "What kind of business is it?" };

export default function Page() {
  return <PageShell step={1} back="/" title="What kind of business is it?" />;
}
