/**
 * What Seattle's own review records show for similar tenant build-outs (local_review_data from the API).
 * Every line says how many permits it is based on ("Of N ..."). Reviewer names are never in this data.
 */
import { formatNumber } from "@/lib/format";

type Summary = { permits: number; share_two_or_more_rounds?: number | null; median_days_in_review?: number | null; median_days_with_applicant?: number | null };
type Row = { review_type: string; permits: number; share_corrections: number };
type Subject = { subject: string; comments: number; permits: number };
export type ReviewData = { category_label?: string; source?: string; summary?: Summary; corrections_by_review_type?: Row[]; top_comment_subjects?: Subject[] };

const pct = (share: number) => new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 }).format(share);
const projects = (n: number) => `${formatNumber(n)} similar ${n === 1 ? "project" : "projects"}`;

export function recordLines(d: ReviewData | null | undefined): string[] {
  const s = d?.summary;
  if (!s || !s.permits) return [];
  const label = d?.category_label ? `${d.category_label} build-outs` : "similar build-outs";
  const of = `Of ${formatNumber(s.permits)} ${label}`;
  const lines: string[] = [];
  if (s.share_two_or_more_rounds != null) {
    lines.push(`${of}, ${formatNumber(Math.round(s.share_two_or_more_rounds * s.permits))} (${pct(s.share_two_or_more_rounds)}) were sent back for corrections at least once.`);
  }
  if (s.median_days_in_review != null) lines.push(`${of}, half spent ${formatNumber(s.median_days_in_review)} days or more in plan review.`);
  if (s.median_days_with_applicant != null) lines.push(`${of}, half spent ${formatNumber(s.median_days_with_applicant)} days or more waiting on the applicant's corrections.`);
  for (const r of d?.corrections_by_review_type ?? []) {
    lines.push(`Of ${projects(r.permits)} reviewed by ${r.review_type}, ${formatNumber(Math.round(r.share_corrections * r.permits))} (${pct(r.share_corrections)}) were sent back in the first round.`);
  }
  for (const t of d?.top_comment_subjects ?? []) {
    lines.push(`Of ${formatNumber(s.permits)} ${label}, ${formatNumber(t.permits)} had reviewer comments about ${t.subject} (${formatNumber(t.comments)} ${t.comments === 1 ? "comment" : "comments"}).`);
  }
  return lines;
}

export function RecordLines({ data }: { data: ReviewData | null | undefined }) {
  const lines = recordLines(data);
  if (!lines.length) {
    return <p className="m-0 measure">Seattle&rsquo;s review records are not loaded on this server, so there are no figures here on how similar projects went through review.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-disc flex-col gap-2 pl-6 nums">
        {lines.map((l) => <li key={l} className="measure">{l}</li>)}
      </ul>
      <p className="m-0 text-small text-ink-muted">Tenant build-outs (additions and alterations) only. Source: {data?.source ?? "City of Seattle open data"}.</p>
    </div>
  );
}
