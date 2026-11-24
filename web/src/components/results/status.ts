/**
 * The one place the status literals appear (the guard allows them nowhere else). It maps a status the API sent
 * to its word, icon and colours, and orders the groups Fix, Check with the city, OK. It decides nothing:
 * `status` is always the API's. A status this file does not know is shown as "Check with the city", never OK.
 */
import type { Finding, Schemas } from "@/api/client";
import type { Mark } from "./StatusIcon";

export type Status = Finding["status"];
/** word: the status name (CONTENT.md rule 11); mark: its shape-coded icon; text: the colour of its count. */
type Look = { word: string; group: string; empty: string; mark: Mark; text: string };

const LOOKS: Record<Status, Look> = {
  fail: { word: "Fix before you apply", group: "Fix before you apply", empty: "Nothing to fix before you apply.", mark: "fix", text: "text-fix" },
  review: { word: "Check with the city", group: "Check with the city", empty: "Nothing to check with the city.", mark: "city", text: "text-blue" },
  pass: { word: "No issues found", group: "No issues found", empty: "No checks came back without an issue.", mark: "none", text: "text-ink-muted" },
};

/** Fix first, then Check with the city, then OK. */
export const STATUS_ORDER: Status[] = ["fail", "review", "pass"];

export function look(status: string): Look {
  return LOOKS[status as Status] ?? LOOKS.review;
}

export const isOk = (status: string) => status === "pass";

export type Numbered = { finding: Finding; index: number };

/** The group a finding's status belongs to: an unknown status goes with Check with the city. */
export const groupOf = (s: string): Status => (s in LOOKS ? (s as Status) : "review");

/** Fix before you apply is its own section, always shown; the other two groups are tabs. */
export const FIX: Status = "fail";
export const TAB_GROUPS: Status[] = ["review", "pass"];

/** The tab selected first: Check with the city, unless it has none, then OK. */
export function defaultTab(counts: Record<Status, number>): Status {
  return counts.review || !counts.pass ? "review" : "pass";
}

/** The findings in the three groups, each keeping its position in the result (its anchor is finding-<index>). */
export function groups(findings: Finding[]): { status: Status; items: Numbered[] }[] {
  const known = groupOf;
  return STATUS_ORDER.map((status) => ({
    status,
    items: findings.map((finding, index) => ({ finding, index })).filter(({ finding }) => known(finding.status) === status),
  }));
}

/** The zoning screen's status (checker/zoning.py) in words. */
export const ZONING_WORDS: Record<Schemas["ZoningScreen"]["status"], { word: string; status: Status }> = {
  likely_permitted: { word: "Likely allowed here", status: "pass" },
  needs_review: { word: "Check with the city", status: "review" },
  not_permitted: { word: "Not allowed here", status: "fail" },
  unknown: { word: "Could not tell", status: "review" },
};

/** The status a "May be needed" permit is shown with: the city decides. */
export const CHECK_WITH_CITY: Status = "review";
