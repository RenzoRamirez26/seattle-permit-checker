import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Always a way back. Going back keeps what was entered (it is in sessionStorage). */
export function BackLink({ href, children = "Back" }: { href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-body">
      <ArrowLeft aria-hidden size={18} strokeWidth={1.75} />
      {children}
    </Link>
  );
}
