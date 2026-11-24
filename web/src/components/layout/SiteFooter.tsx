"use client";
/**
 * The footer, drawn as the title block of a drawing: who runs the site, that it is not a city
 * service, and the rulebook's edition date (from /api/meta; shown only once the owner has set it, Q2).
 */
import Link from "next/link";
import { useMeta } from "./Providers";
import { formatDate } from "@/lib/format";

export function SiteFooter() {
  const { meta } = useMeta();
  const edition = meta?.rulebook.edition_date;
  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="page-grid py-8">
        <dl className="title-block col-span-full m-0 grid text-small text-ink-muted">
          <div>
            <dt className="font-semibold text-ink">Made by</dt>
            <dd>A prototype by the Seattle Permit Pre-Check team. Not a City of Seattle service.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Rulebook</dt>
            <dd>
              {edition ? <>Edition of <time dateTime={edition}>{formatDate(edition)}</time>. </> : null}
              {meta ? meta.rulebook.code_basis.split(";")[0] + "." : "Seattle building codes."}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Help</dt>
            <dd>
              <Link href="/help/">How the pre-check works</Link>
            </dd>
          </div>
        </dl>
      </div>
    </footer>
  );
}
