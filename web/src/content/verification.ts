/**
 * Words for rules whose values are not yet checked against the code text. The API says which rules those are
 * (Finding.rule_verified, /api/meta rulebook.rules_unverified); the browser only shows the words. Unknown never
 * claims more: a finding without rule_verified true, or a meta not yet loaded, gets the careful wording.
 */
import type { Finding, Meta } from "@/api/client";
import { formatNumber } from "@/lib/format";

/** Under a finding whose rule value is still being checked, after its code section. */
export const UNVERIFIED_FINDING = "This rule's value is still being checked against the code.";
/** Under a permit the API listed because of a value still being checked (Permit.rule_verified false). */
export const UNVERIFIED_PERMIT = "Listed because of a value still being checked against the code.";
/** Under a permit whose own entry is still being checked (Permit.entry_verified false), e.g. the salon licence. */
export const UNVERIFIED_ENTRY = "This permit entry is still being checked against the agency's own rules.";
/** One line in the In short band when any finding uses such a rule. */
export const SOME_UNVERIFIED = "Some rule values are still being checked against the code.";
/** The last step of Start's one-line strip, and the sentence that ends its full "How it works" step. */
export const DECIDE = "Rules based on Seattle's code decide";
export const DECIDE_UNVERIFIED = "Rules based on Seattle's code decide (some values still being checked)";
export const DECIDE_TEXT_UNVERIFIED = "Some of their values are still being checked against the code.";
/** Start's step 4: who wrote the rules, and how many are checked against the code text, from /api/meta's counts. */
export const DECIDE_TEXT = "Our team coded these rules from Seattle's building and plumbing codes, the federal accessibility standards, and the King County and Washington State food codes. They list what to fix, what to check with the city and the permits to expect.";
export function rulesCheckedWords(meta: Meta | null | undefined): string {
  if (!meta) return DECIDE_TEXT_UNVERIFIED;
  const { rules: n, rules_unverified: u } = meta.rulebook;
  if (u === n) return `None of the ${formatNumber(n)} rules is checked against the code text yet.`;
  if (u) return `${formatNumber(u)} of the ${formatNumber(n)} rules aren't checked against the code text yet.`;
  return `All ${formatNumber(n)} rules are checked against the code text.`;
}

/** The strip's last step, saying the same as step 4: none checked, some still being checked, or plain. */
export function decideStrip(meta: Meta | null | undefined): string {
  if (!meta) return DECIDE_UNVERIFIED;
  const { rules: n, rules_unverified: u } = meta.rulebook;
  if (u === n) return `${DECIDE} (none checked against the code text yet)`;
  return u ? DECIDE_UNVERIFIED : DECIDE;
}

export const ruleUnverified = (f: Pick<Finding, "rule_verified">) => f.rule_verified !== true;
export const usesUnverifiedRule = (findings: Pick<Finding, "rule_verified">[]) => findings.some(ruleUnverified);
/** True until the API says every rule is checked: before meta loads, and if it never does. */
export const rulebookUnverified = (meta: Meta | null | undefined) => !meta || meta.rulebook.rules_unverified > 0;

/** The rule id of the zoning screen, to find its finding for the Zoning tab. An id, not a rule: nothing is decided here. */
export const ZONING_RULE = "ZN-1";
