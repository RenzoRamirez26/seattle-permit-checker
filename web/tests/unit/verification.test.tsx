/**
 * How far each rule is checked (Finding.check_level, /api/meta rulebook counts): the muted level line under every
 * finding, the counts line in the In short band, the Help section, and the careful default when anything is unknown.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, Finding, Meta } from "@/api/client";
import { FindingCard } from "@/components/results/FindingCard";
import { PermitList } from "@/components/results/PermitList";
import {
  countsSentence, decideStrip, inShortCounts, LEVELS_UNKNOWN, levelWords, TRANSCRIBED_FINDING, UNVERIFIED_ENTRY,
  UNVERIFIED_FINDING, UNVERIFIED_PERMIT,
} from "@/content/verification";
import { fixture } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const { Results } = await import("@/app/results/ResultsPage");

const flawed = () => fixture<Check>("check_cafe_flawed");
const meta = () => fixture<Meta>("meta");
const failing = (extra: Partial<Finding> = {}): Finding => ({ ...flawed().result.findings.find((x) => x.status === "fail")!, ...extra });
const REVIEWED = { check_level: "reviewed" as const, rule_reviewed_by: "B. Expert, licensed architect", rule_reviewed_on: "2026-12-02" };

describe("the level line under a finding", () => {
  it("says still being checked, in one muted 17 px line after the code section, with no new icon", () => {
    const f = failing();
    expect(f.check_level).toBe("unchecked");
    const { container } = render(<FindingCard finding={f} index={0} />);
    const line = screen.getByText(UNVERIFIED_FINDING);
    expect(line.className).toMatch(/\btext-ink-muted\b/);
    expect(line.className).toMatch(/\btext-body\b/);
    expect(screen.getByText(f.citation).closest("p")!.nextElementSibling).toBe(line);   // directly after the code section
    expect(container.querySelectorAll("svg")).toHaveLength(1);                            // only the status icon
  });

  it("says checked against the code text for a transcribed rule", () => {
    render(<FindingCard finding={failing({ check_level: "transcribed" })} index={0} />);
    expect(screen.getByText(TRANSCRIBED_FINDING).className).toMatch(/\btext-ink-muted\b/);
    expect(screen.queryByText(UNVERIFIED_FINDING)).toBeNull();
  });

  it("names the reviewer and the date for a reviewed rule", () => {
    render(<FindingCard finding={failing(REVIEWED)} index={0} />);
    expect(screen.getByText("Reviewed by B. Expert, licensed architect, 2026-12-02.")).toBeTruthy();
  });

  it("never claims more than the API sent: no level, an unknown level, or a review without its record is unchecked", () => {
    const none = failing(); delete (none as Partial<Finding>).check_level;
    expect(levelWords(none)).toBe(UNVERIFIED_FINDING);
    expect(levelWords({ check_level: "verified" })).toBe(UNVERIFIED_FINDING);
    expect(levelWords(null)).toBe(UNVERIFIED_FINDING);
    expect(levelWords({ check_level: "reviewed" })).toBe(TRANSCRIBED_FINDING);     // reviewed, but no name or date shown
  });

  it("never changes the status the API sent", () => {
    for (const extra of [{ check_level: "unchecked" as const }, { check_level: "transcribed" as const }, REVIEWED]) {
      const f = failing(extra);
      const { container, unmount } = render(<FindingCard finding={f} index={0} />);
      expect(container.querySelector("h3")!.textContent).toBe(`Fix before you apply: ${f.title}`);
      unmount();
    }
  });
});

describe("the counts from /api/meta", () => {
  it("are in the fixture: 21 rules, none checked, none reviewed", () => {
    const r = meta().rulebook;
    expect([r.rules, r.unchecked, r.transcribed, r.reviewed]).toEqual([21, 21, 0, 0]);
  });

  it("read as one sentence, the same words the backend uses", () => {
    expect(countsSentence(meta().rulebook)).toBe("None of the 21 rules is checked against the code text yet; none reviewed by an expert.");
    expect(countsSentence({ rules: 21, transcribed: 1, reviewed: 0 })).toBe("1 of the 21 rules is checked against the code text; none reviewed by an expert.");
    expect(countsSentence({ rules: 21, transcribed: 7, reviewed: 3 })).toBe("10 of the 21 rules are checked against the code text; 3 reviewed by an expert.");
    expect(countsSentence({ rules: 21, transcribed: 0, reviewed: 21 })).toBe("All 21 rules are checked against the code text; all reviewed by an expert.");
    expect(countsSentence(null)).toBe(LEVELS_UNKNOWN);
    const engine = readFileSync(join(__dirname, "..", "..", "..", "checker", "rules_engine.py"), "utf8");
    for (const words of [UNVERIFIED_FINDING, TRANSCRIBED_FINDING, "Reviewed by {reviewed_by}, {reviewed_on}.", LEVELS_UNKNOWN, UNVERIFIED_PERMIT, UNVERIFIED_ENTRY,
      "None of the {n} rules is checked against the code text yet", "All {n} rules are checked against the code text", "reviewed by an expert."]) {
      expect(engine).toContain(words);
    }
  });

  it("give Start's strip the same counts in short, and no 'some values' wording", () => {
    expect(decideStrip(meta())).toBe("Rules based on Seattle's code decide (none of 21 checked or reviewed yet)");
    expect(decideStrip(null)).toBe("Rules based on Seattle's code decide");
    expect(decideStrip(null)).not.toMatch(/some values/);
  });
});

describe("the In short band", () => {
  it("gives the counts once, from the result when /api/meta is not loaded", () => {
    const check = flawed();
    render(<Results check={check} />);
    expect(screen.getAllByText(countsSentence(check.result.rule_levels!))).toHaveLength(1);
    expect(screen.queryByText(/Some rule values/)).toBeNull();
  });

  it("prefers /api/meta's counts", () => {
    const check = flawed();
    const m = meta();
    expect(inShortCounts({ ...m, rulebook: { ...m.rulebook, unchecked: 18, transcribed: 3 } }, check.result))
      .toBe("3 of the 21 rules are checked against the code text; none reviewed by an expert.");
    expect(inShortCounts(null, { rule_levels: null })).toBe(LEVELS_UNKNOWN);
  });
});

describe("a permit listed because of a value still being checked", () => {
  it("says so under that permit only", () => {
    const permits = flawed().result.permits_likely_required;
    const marked = permits.filter((p) => p.check_level === "unchecked");
    expect(marked.length).toBeGreaterThan(0);
    render(<PermitList permits={permits} />);
    expect(screen.getAllByText(UNVERIFIED_PERMIT)).toHaveLength(marked.length);
    for (const p of marked) expect(screen.getByText(p.name).parentElement!.textContent).toContain(UNVERIFIED_PERMIT);
  });

  it("says nothing once that rule is transcribed", () => {
    const permits = flawed().result.permits_likely_required.map((p) => (p.check_level ? { ...p, check_level: "transcribed" as const } : p));
    render(<PermitList permits={permits} />);
    expect(screen.queryByText(UNVERIFIED_PERMIT)).toBeNull();
  });
});
