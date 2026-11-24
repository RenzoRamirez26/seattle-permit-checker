import Link from "next/link";

/** The site name only. No seal, no city colours, no logo (brief section 1). */
export function SiteHeader() {
  return (
    <header className="border-b border-hairline">
      <div className="page-grid py-4">
        <p className="col-span-full m-0">
          <Link href="/" className="inline-flex min-h-11 items-center font-medium text-ink no-underline hover:underline" translate="no">
            PermitOS
          </Link>
        </p>
      </div>
    </header>
  );
}
