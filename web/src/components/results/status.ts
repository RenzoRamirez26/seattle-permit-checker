/**
 * The one place the status literals appear (the guard allows them nowhere else). It maps a status the API sent
 * to its word, icon and colours, and orders the groups Fix, Check with the city, OK. It decides nothing:
 * `status` is always the API's. A status this file does not know is shown as "Check with the city", never OK.
 */
import { CircleCheck, CircleHelp, CircleX, type LucideIcon } from "lucide-react";
import type { Finding, Schemas } from "@/api/client";

export type Status = Finding["status"];
type Look = { word: string; group: string; Icon: LucideIcon; text: string; tint: string; border: string };

const LOOKS: Record<Status, Look> = {
  fail: { word: "Fix", group: "Fix before you apply", Icon: CircleX, text: "text-fix", tint: "bg-fix-tint", border: "border-fix" },
  review: { word: "Check with the city", group: "Check with the city", Icon: CircleHelp, text: "text-city", tint: "bg-city-tint", border: "border-city" },
  pass: { word: "OK", group: "OK", Icon: CircleCheck, text: "text-ok", tint: "bg-ok-tint", border: "border-ok" },
};

/** Fix first, then Check with the city, then OK. */
export const STATUS_ORDER: Status[] = ["fail", "review", "pass"];

export function look(status: string): Look {
  return LOOKS[status as Status] ?? LOOKS.review;
}

export const isOk = (status: string) => status === "pass";

export type Numbered = { finding: Finding; index: number };

/** The findings in the three groups, each keeping its position in the result (its anchor is finding-<index>). */
export function groups(findings: Finding[]): { status: Status; items: Numbered[] }[] {
  const known = (s: string): Status => (s in LOOKS ? (s as Status) : "review");
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
