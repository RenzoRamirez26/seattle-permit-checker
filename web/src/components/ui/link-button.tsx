import Link from "next/link";
import { cn } from "@/lib/utils";

/** A link that looks like the main button: for "Start", which goes to a page rather than doing something. */
export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link href={href} data-main-action={variant === "primary" || undefined} className={cn(
      "inline-flex min-h-12 items-center justify-center gap-2 rounded-sm px-6 text-body font-semibold no-underline",
      variant === "primary" ? "border border-blue bg-blue text-white hover:border-ink hover:bg-ink" : "border border-field bg-paper text-ink hover:border-ink hover:bg-white",
      className,
    )}>
      {children}
    </Link>
  );
}
