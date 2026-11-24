/**
 * Words for rules whose values are not yet checked against the code text. The API says which rules those are
 * (Finding.rule_verified, /api/meta rulebook.rules_unverified); the browser only shows the words. Unknown never
 * claims more: a finding without rule_verified true, or a meta not yet loaded, gets the careful wording.
 */
import type { Finding, Meta } from "@/api/client";

/** Under a finding whose rule value is still being checked, after its code section. */
export const UNVERIFIED_FINDING = "This rule's value is still being checked against the code.";
/** One line in the In short band when any finding uses such a rule. */
export const SOME_UNVERIFIED = "Some rule values are still being checked against the code.";
/** The last step of Start's one-line strip, and the sentence that ends its full "How it works" step. */
export const DECIDE = "Rules based on Seattle's code decide";
export const DECIDE_UNVERIFIED = "Rules based on Seattle's code decide (some values still being checked)";
export const DECIDE_TEXT_UNVERIFIED = "Some of their values are still being checked against the code.";

export const ruleUnverified = (f: Pick<Finding, "rule_verified">) => f.rule_verified !== true;
export const usesUnverifiedRule = (findings: Pick<Finding, "rule_verified">[]) => findings.some(ruleUnverified);
/** True until the API says every rule is checked: before meta loads, and if it never does. */
export const rulebookUnverified = (meta: Meta | null | undefined) => !meta || meta.rulebook.rules_unverified > 0;

/** The rule id of the zoning screen, to find its finding for the Zoning tab. An id, not a rule: nothing is decided here. */
export const ZONING_RULE = "ZN-1";
