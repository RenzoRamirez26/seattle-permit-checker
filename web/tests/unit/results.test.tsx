import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Check, Finding } from "@/api/client";
import { groups, look, STATUS_ORDER } from "@/components/results/status";
import { recordLines } from "@/components/results/RecordLines";
import { countsSentence } from "@/components/results/CountsSentence";
import { revealFinding } from "@/state/resultsTabs";
import { fixture } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const { Results } = await import("@/app/results/ResultsPage");

const flawed = () => fixture<Check>("check_cafe_flawed");
/** Shown means not inside a collapsed panel (React Aria keeps collapsed content in the page with hidden="until-found"). */
const shown = (el: Element | null) => !!el && !el.closest("[hidden]");
const shownCards = () => Array.from(document.querySelectorAll("article[id^=finding-]")).filter(shown);

describe("status words", () => {
  it("shows each status as its word with an icon, and never shows review as OK", () => {
    expect(look("fail").word).toBe("Fix");
    expect(look("review").word).toBe("Check with the city");
    expect(look("pass").word).toBe("OK");
    for (const s of STATUS_ORDER) expect(look(s).Icon).toBeTruthy();
    expect(look("something-new").word).toBe("Check with the city");   // an unknown status is never OK
  });

  it("orders the groups Fix, Check with the city, OK and keeps each finding's position", () => {
    const f = flawed().result.findings;
    const shuffled = [f.find((x) => x.status === "pass")!, f.find((x) => x.status === "review")!, f.find((x) => x.status === "fail")!] as Finding[];
    const g = groups(shuffled);
    expect(g.map((x) => look(x.status).word)).toEqual(["Fix", "Check with the city", "OK"]);
    expect(g.map((x) => x.items.map((i) => i.index))).toEqual([[2], [1], [0]]);
  });

  it("words the counts the way the brief does", () => {
    expect(countsSentence(flawed().result.summary)).toBe("11 things to fix before you apply, 2 to check with the city, 6 fine");
    expect(countsSentence({ fails: 1, reviews: 0, passes: 3 })).toBe("1 thing to fix before you apply, 0 to check with the city, 3 fine");
  });
});

describe("the results page", () => {
  const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

  it("always shows Fix before you apply in full, then one tab row: Check with the city and OK, with their counts", () => {
    render(<Results check={flawed()} />);
    const fix = screen.getByRole("region", { name: "Fix before you apply (11)" });
    expect(within(fix).getAllByRole("article")).toHaveLength(11);
    const lists = screen.getAllByRole("tablist");
    expect(lists.map((l) => l.getAttribute("aria-label"))).toEqual(["Summary", "Check with the city / OK"]);
    expect(within(lists[0]).getAllByRole("tab").map((t) => t.textContent)).toEqual(["In short", "Zoning", "Downloads"]);
    expect(within(lists[1]).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Check with the city (2)", "OK (6)"]);
    expect(tab("In short").getAttribute("aria-selected")).toBe("true");
    expect(tab("Check with the city (2)").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Check with the city (2)" })).toBeTruthy();
    expect(shownCards()).toHaveLength(13);
    fireEvent.click(tab("OK (6)"));
    expect(tab("OK (6)").getAttribute("aria-selected")).toBe("true");
    expect(shownCards()).toHaveLength(11 + 6);                          // Fix stays in full
    expect(screen.queryByTestId("counts")).toBeTruthy();
    fireEvent.click(tab("Downloads"));
    expect(screen.queryByTestId("counts")).toBeNull();              // only the selected panel is shown
  });

  it("says when there is nothing to fix, and selects OK when there is nothing to check with the city", () => {
    render(<Results check={fixture<Check>("check_cafe_compliant")} />);
    const fix = screen.getByRole("region", { name: "Fix before you apply (0)" });
    expect(within(fix).getByText("Nothing to fix before you apply.")).toBeTruthy();
    expect(tab("Check with the city (0)").getAttribute("aria-selected")).toBe("false");
    expect(tab(/^OK \(/).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tab("Check with the city (0)"));
    expect(screen.getByText("Nothing to check with the city.")).toBeTruthy();
  });

  it("lists the five sections in order in the On this page landmark", () => {
    render(<Results check={flawed()} />);
    const navs = screen.getAllByRole("navigation", { name: "On this page" });
    expect(navs).toHaveLength(2);                                     // the compact bar (phones) and the rail (wide)
    const rail = navs.find((n) => within(n).queryAllByRole("link").length)!;
    const items = within(rail).getAllByRole("link").map((a) => a.textContent);
    expect(items).toEqual(["Your pre-check results", "Fix before you apply (11)", "Check with the city / OK",
      "Permits and approvals to expect", "What Seattle’s records show about businesses like yours"]);
    expect(within(rail).getAllByRole("link")[0].getAttribute("aria-current")).toBe("location");
    expect(within(rail).getByText("0 of 5 sections seen")).toBeTruthy();
  });

  it("keeps the selected tabs for this check across a refresh", () => {
    const check = flawed();
    const first = render(<Results check={check} />);
    fireEvent.click(tab("Zoning"));
    fireEvent.click(tab("OK (6)"));
    first.unmount();
    render(<Results check={check} />);
    expect(tab("Zoning").getAttribute("aria-selected")).toBe("true");
    expect(tab("OK (6)").getAttribute("aria-selected")).toBe("true");
  });

  it("opens a finding's tab before scrolling to it when a link asks for it", async () => {
    const check = flawed();
    const okIndex = check.result.findings.findIndex((f) => f.status === "pass");
    render(<Results check={check} />);
    expect(document.getElementById(`finding-${okIndex}`)).toBeNull();
    await act(async () => revealFinding(okIndex));
    expect(tab("OK (6)").getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(document.activeElement?.id).toBe(`finding-${okIndex}`));   // after the old panel has gone
  });

  it("gives two findings with the same rule id different anchors", () => {
    const check = flawed();
    const eg3 = check.result.findings.map((f, i) => [f.rule_id, i] as const).filter(([r]) => r === "EG-3").map(([, i]) => i);
    expect(eg3.length).toBeGreaterThanOrEqual(2);
    render(<Results check={check} />);
    const ids = eg3.map((i) => document.getElementById(`finding-${i}`));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids.map((e) => e!.id)).size).toBe(eg3.length);
  });

  it("shows the code reference only when asked, in the citation the API sent", () => {
    const check = flawed();
    render(<Results check={check} />);
    const first = document.getElementById("finding-0")!;
    expect(shown(within(first).getByText(check.result.findings[0].citation))).toBe(false);
    fireEvent.click(within(first).getByRole("button", { name: "Show the code reference" }));
    expect(shown(within(first).getByText(check.result.findings[0].citation))).toBe(true);
    expect(within(first).getByRole("button", { name: "Hide the code reference" })).toBeTruthy();
  });

  it("links the two PDFs to their API routes", () => {
    render(<Results check={flawed()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Downloads" }));
    expect(screen.getByRole("link", { name: "Download the fix list (PDF)" }).getAttribute("href")).toBe("http://api.test/api/checks/fixture-cafe_flawed/report.pdf");
    expect(screen.getByRole("link", { name: "Download the permit preparation sheet (PDF)" }).getAttribute("href")).toBe("http://api.test/api/checks/fixture-cafe_flawed/preparation-sheet.pdf");
  });

  it("says the city's records are not loaded when there are none", () => {
    render(<Results check={flawed()} />);
    expect(screen.getByText(/Seattle’s review records are not loaded on this server/)).toBeTruthy();
  });

  it("marks a permit that depends on a Not sure answer as May be needed", () => {
    render(<Results check={fixture<Check>("check_cafe_flawed_unsure")} />);
    expect(screen.getAllByText("May be needed")).toHaveLength(3);
    expect(screen.getByText(/whether alcohol will be served, which was answered Not sure/)).toBeTruthy();
  });

  it("renders the salon and the compliant café", () => {
    for (const name of ["check_salon_flawed", "check_cafe_compliant"]) {
      const { unmount } = render(<Results check={fixture<Check>(name)} />);
      expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
      unmount();
    }
  });
});

describe("Seattle's records", () => {
  it("says on every line how many permits it is based on", () => {
    const data = fixture<Check>("check_cafe_flawed_with_records").result.local_review_data;
    const lines = recordLines(data as never);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(l).toMatch(/^Of \d+ /);
    expect(lines[0]).toBe("Of 3 food and drink build-outs, 2 (67%) were sent back for corrections at least once.");
    expect(recordLines(null)).toEqual([]);
  });
});
