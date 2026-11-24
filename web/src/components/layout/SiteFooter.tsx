"use client";
/**
 * The footer on every page: one line saying this is not a city service, then the code edition the rules follow and
 * the date it took effect (both from /api/meta, rulebook.code_edition and rulebook.edition_date; no date while the
 * rulebook holds the placeholder, Q2) and a link to Help.
 * In: /api/meta through useMeta().  Out: two plain lines, e.g.
 * "Rules based on the 2021 Seattle Building Code, effective November 15, 2024."
 */
import Link from "next/link";
import { useMeta } from "./Providers";
import { formatDate } from "@/lib/format";

export function SiteFooter() {
  const { meta } = useMeta();
  const edition = meta?.rulebook.edition_date;
  return (
    <footer className="mt-auto border-t border-hairline">
      {/* 96 px below the last line, so the fixed Ask button (and the results bar) never covers the footer links */}
      <div className="page-grid pt-8 pb-24">
        <div className="col-span-full flex flex-col gap-1">
          <p className="m-0">
            <span translate="no">PermitOS</span> · Not a City of Seattle service
          </p>
          <p className="m-0 text-ink-muted">
            Rules based on {meta ? `the ${meta.rulebook.code_edition}` : "Seattle's codes and the other sources each result lists"}
            {meta && edition ? <>, effective <time dateTime={edition}>{formatDate(edition)}</time></> : null}.{" "}
            <Link href="/help/" className="inline-flex min-h-11 items-center">How the pre-check works</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
