/**
 * Words for how far each rule is checked against the code: unchecked, transcribed (checked against the code text by
 * our team) or reviewed (by an expert). The API decides each finding's level (Finding.check_level, the lowest level of
 * its rule and every rule it depends on) and counts the rules at each level (/api/meta rulebook); the browser only
 * shows the words. Unknown never claims more: a missing or unknown level, or a reviewed level without its reviewer and
 * date, gets the unchecked words, and counts not yet loaded say nothing about how many are checked.
 * The same words are in checker/rules_engine.py; tests/unit/verification.test.tsx keeps them equal.
 */
import type { Finding, Meta, Schemas } from "@/api/client";
import { formatNumber } from "@/lib/format";

type Counts = Pick<Meta["rulebook"], "rules" | "transcribed" | "reviewed">;
type Levelled = { check_level?: string | null; rule_reviewed_by?: string | null; rule_reviewed_on?: string | null };

/** The three levels, lowest first. Labels only: the API decides which level a rule is at. */
export const LEVELS = ["unchecked", "transcribed", "reviewed"] as const;

/** Under a finding, after its code section: one line for its level. */
export const UNVERIFIED_FINDING = "This rule's value is still being checked against the code.";
export const TRANSCRIBED_FINDING = "Checked against the code text by our team.";
export const reviewedFinding = (by: string, on: string) => `Reviewed by ${by}, ${on}.`;

/** The level line for a finding (or anything with a check_level). */
export function levelWords(f: Levelled | null | undefined): string {
  if (f?.check_level === "reviewed" && f.rule_reviewed_by && f.rule_reviewed_on) return reviewedFinding(f.rule_reviewed_by, f.rule_reviewed_on);
  if (f?.check_level === "transcribed" || f?.check_level === "reviewed") return TRANSCRIBED_FINDING;
  return UNVERIFIED_FINDING;
}
export const isUnchecked = (f: Levelled | null | undefined) => f?.check_level !== "transcribed" && f?.check_level !== "reviewed";

/** Under a permit the API listed because of an unchecked rule (Permit.check_level "unchecked"). */
export const UNVERIFIED_PERMIT = "Listed because of a value still being checked against the code.";
export const permitUnchecked = (p: Schemas["Permit"]) => typeof p.check_level === "string" && isUnchecked(p);
/** Under a permit whose own entry is still being checked (Permit.entry_verified false), e.g. the salon licence. */
export const UNVERIFIED_ENTRY = "This permit entry is still being checked against the agency's own rules.";

/** Said when no counts are known: it claims nothing either way. */
export const LEVELS_UNKNOWN = "How many of these rules are checked against the code text isn't known for this result.";

/** The counts sentence, e.g. "None of the 21 rules is checked against the code text yet; none reviewed by an expert." */
export function countsSentence(c: Counts | null | undefined): string {
  if (!c || !c.rules) return LEVELS_UNKNOWN;
  const n = c.rules, r = c.reviewed, k = c.transcribed + c.reviewed;
  const checked = !k ? `None of the ${formatNumber(n)} rules is checked against the code text yet`
    : k === n ? `All ${formatNumber(n)} rules are checked against the code text`
    : `${formatNumber(k)} of the ${formatNumber(n)} rules ${k === 1 ? "is" : "are"} checked against the code text`;
  const reviewed = !r ? "none" : r === n ? "all" : formatNumber(r);
  return `${checked}; ${reviewed} reviewed by an expert.`;
}

/** The last step of Start's one-line strip, and the title of its full "How it works" step. */
export const DECIDE = "Rules based on Seattle's code decide";
/** The strip's last step, with the counts in short (step 4 says them in full); before /api/meta loads, just the step. */
export function decideStrip(meta: Meta | null | undefined): string {
  if (!meta) return DECIDE;
  const { rules: n, transcribed, reviewed } = meta.rulebook;
  const k = transcribed + reviewed;
  if (!k) return `${DECIDE} (none of ${formatNumber(n)} checked or reviewed yet)`;
  const checked = k === n ? `all ${formatNumber(n)} checked` : `${formatNumber(k)} of ${formatNumber(n)} checked`;
  const rev = !reviewed ? "none reviewed" : reviewed === n ? "all reviewed" : `${formatNumber(reviewed)} reviewed`;
  return `${DECIDE} (${checked}, ${rev})`;
}

/** Start's step 4: who wrote the rules, then the counts from /api/meta. */
export const DECIDE_TEXT = "Our team coded these rules from Seattle's building and plumbing codes, the federal accessibility standards, and the King County and Washington State food codes. They list what to fix, what to check with the city and the permits to expect.";
export const rulesCheckedWords = (meta: Meta | null | undefined) => (meta ? countsSentence(meta.rulebook) : "");

/** The In short counts line: /api/meta's counts, else the result's own (rule_levels), else nothing claimed. */
export function inShortCounts(meta: Meta | null | undefined, result: { rule_levels?: Counts | null }): string {
  return countsSentence(meta?.rulebook ?? result.rule_levels ?? null);
}

/** Help's "How we check our rules": the three levels in words. The counts come from /api/meta. */
export const LEVELS_HELP = {
  id: "rule-levels",
  question: "How we check our rules",
  intro: "Every rule has one of three levels. The level never changes a result: a rule still being checked can still say Fix before you apply or Check with the city.",
  levels: [
    { level: "unchecked", name: "Still being checked", text: "Our team coded the rule from the code, but nobody has yet compared every number and condition with the code text." },
    { level: "transcribed", name: "Checked against the code text", text: "A person on our team read the section in the 2021 Seattle Building Code, compared every number and condition, and recorded who and when." },
    { level: "reviewed", name: "Reviewed by an expert", text: "An expert, such as a licensed architect or a plan reviewer, also reviewed the rule. We show their name, role and the date." },
  ],
  dependsOn: "A finding is only as checked as the rules it uses: a sprinkler finding uses the number of people, so it takes the lower of the two levels.",
} as const;

/** The rule id of the zoning screen, to find its finding for the Zoning tab. An id, not a rule: nothing is decided here. */
export const ZONING_RULE = "ZN-1";

export type { Finding };
