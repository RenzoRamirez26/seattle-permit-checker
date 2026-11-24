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

/** The records in two groups (how reviews went; what reviewers asked about) and the review-time figure, or null. */
export function recordGroups(d: ReviewData | null | undefined): {
  reviewTime: { days: number; words: string } | null;
  groups: { title: string; lines: string[] }[];
} | null {
  const s = d?.summary;
  if (!s || !s.permits) return null;
  const label = d?.category_label ? `${d.category_label} build-outs` : "similar build-outs";
  const of = `Of ${formatNumber(s.permits)} ${label}`;
  const went: string[] = [];
  if (s.share_two_or_more_rounds != null) {
    went.push(`${of}, ${formatNumber(Math.round(s.share_two_or_more_rounds * s.permits))} (${pct(s.share_two_or_more_rounds)}) were sent back for corrections at least once.`);
  }
  if (s.median_days_with_applicant != null) went.push(`${of}, half spent ${formatNumber(s.median_days_with_applicant)} days or more waiting on the applicant's corrections.`);
  for (const r of d?.corrections_by_review_type ?? []) {
    went.push(`Of ${projects(r.permits)} reviewed by ${r.review_type}, ${formatNumber(Math.round(r.share_corrections * r.permits))} (${pct(r.share_corrections)}) were sent back in the first round.`);
  }
  const asked = (d?.top_comment_subjects ?? []).map((t) =>
    `Of ${formatNumber(s.permits)} ${label}, ${formatNumber(t.permits)} had reviewer comments about ${t.subject} (${formatNumber(t.comments)} ${t.comments === 1 ? "comment" : "comments"}).`);
  return {
    reviewTime: s.median_days_in_review != null
      ? { days: s.median_days_in_review, words: `Half of ${formatNumber(s.permits)} ${label} spent this long or more in plan review.` }
      : null,
    groups: [{ title: "How reviews went", lines: went }, { title: "What reviewers asked about", lines: asked }].filter((g) => g.lines.length),
  };
}
