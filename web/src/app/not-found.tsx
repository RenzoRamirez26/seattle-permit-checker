import Link from "next/link";
import { PageShell } from "@/components/flow/PageShell";

export default function NotFound() {
  return (
    <PageShell title="There is no page at this address">
      <p className="measure">
        <Link href="/">Go to the start of the pre-check</Link>
      </p>
    </PageShell>
  );
}
