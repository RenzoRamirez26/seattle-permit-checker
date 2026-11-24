/**
 * How far each rule is checked: the muted level line under every finding, the counts once in the In short band, the
 * last step of Start's strip, and Help's "How we check our rules", all from what the API says (Finding.check_level,
 * /api/meta rulebook counts).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, fixture, shoot, WIDTHS } from "./helpers";

const NOTE = "This rule's value is still being checked against the code.";
const TRANSCRIBED = "Checked against the code text by our team.";
const COUNTS = "None of the 21 rules is checked against the code text yet; none reviewed by an expert.";
const cors = { "access-control-allow-origin": "*" };

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

test("results: every finding gives its level after its code section, and In short gives the counts once", async ({ page, request }) => {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("check")!;
  const check = await (await request.get(`${API}/api/checks/${id}`)).json();
  const findings: { rule_id: string; check_level: string; citation: string; status: string }[] = check.result.findings;
  expect(new Set(findings.map((f) => f.check_level))).toEqual(new Set(["unchecked"]));   // no rule is transcribed yet

  await expect(page.getByText(COUNTS, { exact: true })).toHaveCount(1);                    // the In short band, once
  await expect(page.getByRole("tabpanel", { name: "In short" }).getByText(COUNTS)).toBeVisible();
  await expect(page.getByText(/Some rule values/)).toHaveCount(0);

  const rows = page.locator("article[id^=finding-]:visible");
  expect(await rows.count()).toBeGreaterThan(0);
  const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-ink-muted").trim());
  for (const row of await rows.all()) {
    const f = findings[Number((await row.getAttribute("id"))!.replace("finding-", ""))];
    const note = row.getByText(NOTE, { exact: true });
    await expect(note).toBeVisible();
    // right after the code section, muted, at the body size, with no icon of its own
    expect(await note.evaluate((el) => el.previousElementSibling?.querySelector(".font-mono")?.textContent)).toBe(f.citation);
    await expect(note).toHaveCSS("font-size", "17px");
    expect(await note.evaluate((el) => getComputedStyle(el).color)).toBe(
      await page.evaluate((c) => { const d = document.createElement("div"); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, muted));
    await expect(note.locator("svg")).toHaveCount(0);
  }
  // A permit listed because of the number of people says so, beside it.
  const permits = page.getByRole("region", { name: /^Permits and approvals/ });
  for (const p of check.result.permits_likely_required as { name: string; check_level?: string }[]) {
    const item = permits.getByRole("listitem").filter({ hasText: p.name });
    await expect(item.getByText("Listed because of a value still being checked against the code.")).toHaveCount(p.check_level === "unchecked" ? 1 : 0);
  }
  // Fix stays Fix: the statuses on the page are the API's
  await expect(page.getByRole("region", { name: `Fix before you apply (${findings.filter((f) => f.status === "fail").length})` })).toBeVisible();
  await axeBoth(page, "results with unchecked rules");
  await shoot(page, "rule-levels", "results-in-short", { fullPage: false });

  // The Zoning tab shows the zoning finding's code section and its level.
  const zoning = findings.find((f) => f.rule_id === "ZN-1")!;
  await page.getByRole("tab", { name: "Zoning" }).click();
  const panel = page.getByTestId("zoning");
  await expect(panel.getByText(zoning.citation, { exact: true })).toBeVisible();
  await expect(panel.getByText(NOTE, { exact: true })).toBeVisible();
});

test("results: transcribed and reviewed rules say so in their own words, and the statuses stay the API's", async ({ page }) => {
  const check = fixture("check_cafe_flawed");
  check.result.findings = check.result.findings.map((f: { rule_id: string }) => (f.rule_id.startsWith("EG")
    ? { ...f, check_level: "reviewed", rule_reviewed_by: "B. Expert, licensed architect", rule_reviewed_on: "2026-12-02" }
    : { ...f, check_level: "transcribed" }));
  const meta = fixture("meta");
  meta.rulebook = { ...meta.rulebook, unchecked: 0, transcribed: 17, reviewed: 4 };
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: cors }));
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: cors }));
  await page.goto(`/results/?check=${check.id}`);
  await expect(page.getByTestId("counts")).toBeVisible();
  await expect(page.getByText("All 21 rules are checked against the code text; 4 reviewed by an expert.")).toHaveCount(1);
  await expect(page.getByText(NOTE)).toHaveCount(0);
  await expect(page.getByText("Reviewed by B. Expert, licensed architect, 2026-12-02.").first()).toBeVisible();
  await expect(page.getByText(TRANSCRIBED).first()).toBeVisible();
  await page.getByText("Reviewed by B. Expert, licensed architect, 2026-12-02.").first().scrollIntoViewIfNeeded();
  await shoot(page, "rule-levels", "results-reviewed-example", { fullPage: false });
  const fails = check.result.findings.filter((f: { status: string }) => f.status === "fail").length;
  await expect(page.getByRole("region", { name: `Fix before you apply (${fails})` })).toBeVisible();
});

test("Start: the last step and step 4 give /api/meta's counts", async ({ page }) => {
  const meta = await (await page.request.get(`${API}/api/meta`)).json();
  expect([meta.rulebook.rules, meta.rulebook.transcribed, meta.rulebook.reviewed]).toEqual([21, 0, 0]);
  await page.goto("/");
  const strip = page.getByRole("list", { name: "How it works, in short" });
  await expect(strip.getByRole("listitem").last()).toHaveText(/Rules based on Seattle's code decide \(none of 21 checked or reviewed yet\)$/);
  const how = page.getByRole("region", { name: "How it works" });
  await expect(how).toContainText("Our team coded these rules from Seattle's building and plumbing codes, the federal accessibility standards, and the King County and Washington State food codes.");
  await expect(how).toContainText(COUNTS);
  await shoot(page, "rule-levels", "start", { fullPage: false });
  await expect(page.getByText(/some values still being checked/)).toHaveCount(0);
});

test("Start: with some rules checked the strip and step 4 say how many", async ({ page }) => {
  const meta = fixture("meta");
  meta.rulebook = { ...meta.rulebook, unchecked: 15, transcribed: 4, reviewed: 2 };
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: cors }));
  await page.goto("/");
  const strip = page.getByRole("list", { name: "How it works, in short" });
  await expect(strip.getByRole("listitem").last()).toHaveText(/Rules based on Seattle's code decide \(6 of 21 checked, 2 reviewed\)$/);
  await expect(page.getByRole("region", { name: "How it works" })).toContainText("6 of the 21 rules are checked against the code text; 2 reviewed by an expert.");
});

test("Help: How we check our rules explains the three levels with live counts", async ({ page }) => {
  await page.goto("/help/");
  const section = page.getByRole("region", { name: "How we check our rules" });
  await expect(section).toBeVisible();
  for (const name of ["Still being checked: 21 of 21 rules", "Checked against the code text: 0 of 21 rules", "Reviewed by an expert: 0 of 21 rules"]) {
    await expect(section.getByText(name)).toBeVisible();
  }
  await expect(section).toContainText(COUNTS);
  await axeBoth(page, "help with rule levels");
  await section.scrollIntoViewIfNeeded();
  await shoot(page, "rule-levels", "help", { fullPage: false });
});
