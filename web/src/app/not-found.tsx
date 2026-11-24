import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/flow/PageShell";

const TITLE = "There is no page at this address";

export const metadata: Metadata = { title: TITLE };

export default function NotFound() {
  return (
    <PageShell title={TITLE}>
      <p className="measure">
        <Link href="/">Go to the start of the pre-check</Link>
      </p>
    </PageShell>
  );
}
