/**
 * Rules whose values are not yet checked against the code (Finding.rule_verified, /api/meta rulebook.rules_unverified):
 * the muted line under such a finding, the one line in the In short band, and the careful default when unknown.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Check, Finding, Meta } from "@/api/client";
import { FindingCard } from "@/components/results/FindingCard";
import { PermitList } from "@/components/results/PermitList";
import { rulebookUnverified, SOME_UNVERIFIED, UNVERIFIED_FINDING, UNVERIFIED_PERMIT, usesUnverifiedRule } from "@/content/verification";
import { fixture } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const { Results } = await import("@/app/results/ResultsPage");

const flawed = () => fixture<Check>("check_cafe_flawed");
const findingWith = (verified: boolean | undefined): Finding => {
  const f = { ...flawed().result.findings.find((x) => x.status === "fail")! };
  if (verified === undefined) delete (f as Partial<Finding>).rule_verified;
  else f.rule_verified = verified;
  return f;
};

describe("a finding whose rule value is still being checked", () => {
  it("says so in one muted line after the code section, with no new icon", () => {
    const { container } = render(<FindingCard finding={findingWith(false)} index={0} />);
    const line = screen.getByText(UNVERIFIED_FINDING);
    expect(line.className).toMatch(/\btext-ink-muted\b/);
    expect(line.className).toMatch(/\btext-body\b/);
    const citation = screen.getByText(findingWith(false).citation).closest("p")!;
    expect(citation.nextElementSibling).toBe(line);                     // directly after the code section
    expect(container.querySelectorAll("svg")).toHaveLength(1);          // only the status icon
  });

  it("shows nothing extra for a checked rule", () => {
    render(<FindingCard finding={findingWith(true)} index={0} />);
    expect(screen.queryByText(UNVERIFIED_FINDING)).toBeNull();
  });

  it("treats a finding without the field as unverified (unknown never claims more)", () => {
    render(<FindingCard finding={findingWith(undefined)} index={0} />);
    expect(screen.getByText(UNVERIFIED_FINDING)).toBeTruthy();
  });

  it("never changes the status the API sent", () => {
    for (const v of [true, false]) {
      const f = findingWith(v);
      const { container, unmount } = render(<FindingCard finding={f} index={0} />);
      expect(container.querySelector("h3")!.textContent).toBe(`Fix before you apply: ${f.title}`);
      unmount();
    }
  });
});

describe("the In short band", () => {
  it("adds one line when any finding uses an unverified rule", () => {
    const check = flawed();
    expect(usesUnverifiedRule(check.result.findings)).toBe(true);
    render(<Results check={check} />);
    expect(screen.getAllByText(SOME_UNVERIFIED)).toHaveLength(1);
  });

  it("has no such line when every finding's rule is checked", () => {
    const check = flawed();
    check.result.findings = check.result.findings.map((f) => ({ ...f, rule_verified: true }));
    render(<Results check={check} />);
    expect(screen.queryByText(SOME_UNVERIFIED)).toBeNull();
    expect(screen.queryByText(UNVERIFIED_FINDING)).toBeNull();
  });
});

describe("the rulebook count from /api/meta", () => {
  it("says some values are being checked until the API counts none", () => {
    const meta = fixture<Meta>("meta");
    expect(meta.rulebook.rules_unverified).toBeGreaterThan(0);
    expect(rulebookUnverified(meta)).toBe(true);
    expect(rulebookUnverified(null)).toBe(true);                         // not loaded yet: the careful wording
    expect(rulebookUnverified({ ...meta, rulebook: { ...meta.rulebook, rules_unverified: 0 } })).toBe(false);
  });
});

describe("a permit listed because of a value still being checked", () => {
  it("says so under that permit only", () => {
    const permits = flawed().result.permits_likely_required;
    const marked = permits.filter((p) => p.rule_verified === false);
    expect(marked.length).toBeGreaterThan(0);
    render(<PermitList permits={permits} />);
    expect(screen.getAllByText(UNVERIFIED_PERMIT)).toHaveLength(marked.length);
    for (const p of marked) expect(screen.getByText(p.name).parentElement!.textContent).toContain(UNVERIFIED_PERMIT);
  });
});
