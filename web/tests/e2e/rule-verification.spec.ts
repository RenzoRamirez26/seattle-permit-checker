/**
 * Rules whose values are not yet checked against the code: the muted line under each such finding, one line in the
 * In short band, and the last step of Start's strip, all from what the API says (rule_verified, rules_unverified).
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, fixture, WIDTHS } from "./helpers";

const NOTE = "This rule's value is still being checked against the code.";
const SOME = "Some rule values are still being checked against the code.";
const cors = { "access-control-allow-origin": "*" };

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

test("results: each finding on an unverified rule says so after its code section, and In short says it once", async ({ page, request }) => {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("check")!;
  const findings: { rule_id: string; rule_verified: boolean; citation: string; status: string }[] =
    (await (await request.get(`${API}/api/checks/${id}`)).json()).result.findings;
  expect(findings.some((f) => !f.rule_verified)).toBe(true);       // today no rule counts as checked (EG-3's ADA section)

  await expect(page.getByText(SOME, { exact: true })).toHaveCount(1);              // the In short band, once
  await expect(page.getByRole("tabpanel", { name: "In short" }).getByText(SOME)).toBeVisible();

  const rows = page.locator("article[id^=finding-]:visible");
  expect(await rows.count()).toBeGreaterThan(0);
  const muted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-ink-muted").trim());
  for (const row of await rows.all()) {
    const f = findings[Number((await row.getAttribute("id"))!.replace("finding-", ""))];
    const note = row.getByText(NOTE, { exact: true });
    if (f.rule_verified) {
      await expect(note).toHaveCount(0);
      continue;
    }
    await expect(note).toBeVisible();
    // right after the code section, muted, at the body size, with no icon of its own
    expect(await note.evaluate((el) => el.previousElementSibling?.querySelector(".font-mono")?.textContent)).toBe(f.citation);
    await expect(note).toHaveCSS("font-size", "17px");
    expect(await note.evaluate((el) => getComputedStyle(el).color)).toBe(
      await page.evaluate((c) => { const d = document.createElement("div"); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, muted));
    await expect(note.locator("svg")).toHaveCount(0);
  }
  // A permit listed because of the number of people says so, beside it.
  const check = await (await request.get(`${API}/api/checks/${id}`)).json();
  const permits = page.getByRole("region", { name: /^Permits and approvals/ });
  for (const p of check.result.permits_likely_required as { name: string; rule_verified: boolean }[]) {
    const item = permits.getByRole("listitem").filter({ hasText: p.name });
    await expect(item.getByText("Listed because of a value still being checked against the code.")).toHaveCount(p.rule_verified ? 0 : 1);
  }
  // Fix stays Fix: the statuses on the page are the API's
  await expect(page.getByRole("region", { name: `Fix before you apply (${findings.filter((f) => f.status === "fail").length})` })).toBeVisible();
  await axeBoth(page, "results with unverified rules");

  // The Zoning tab shows the zoning finding's code section and, its rule being unverified, the same line.
  const zoning = findings.find((f) => f.rule_id === "ZN-1")!;
  expect(zoning.rule_verified).toBe(false);
  await page.getByRole("tab", { name: "Zoning" }).click();
  const panel = page.getByTestId("zoning");
  await expect(panel.getByText(zoning.citation, { exact: true })).toBeVisible();
  await expect(panel.getByText(NOTE, { exact: true })).toBeVisible();
});

test("results: with every rule checked, neither line appears", async ({ page }) => {
  const check = fixture("check_cafe_flawed");
  check.result.findings = check.result.findings.map((f: object) => ({ ...f, rule_verified: true }));
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: cors }));
  await page.goto(`/results/?check=${check.id}`);
  await expect(page.getByTestId("counts")).toBeVisible();
  await expect(page.getByText(SOME)).toHaveCount(0);
  await expect(page.getByText(NOTE)).toHaveCount(0);
  await page.getByRole("tab", { name: "Zoning" }).click();
  await expect(page.getByTestId("zoning")).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("Start: the last step says some values are still being checked while the API counts unverified rules", async ({ page }) => {
  const meta = await (await page.request.get(`${API}/api/meta`)).json();
  expect(meta.rulebook.rules_unverified).toBeGreaterThan(0);
  await page.goto("/");
  const strip = page.getByRole("list", { name: "How it works, in short" });
  await expect(strip.getByRole("listitem").last()).toHaveText(/Rules based on Seattle's code decide \(some values still being checked\)$/);
  await expect(page.getByRole("region", { name: "How it works" })).toContainText("Some of their values are still being checked against the code.");
});

test("Start: with no unverified rules the last step is just Rules based on Seattle's code decide", async ({ page }) => {
  const meta = fixture("meta");
  meta.rulebook.rules_unverified = 0;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: cors }));
  await page.goto("/");
  const strip = page.getByRole("list", { name: "How it works, in short" });
  await expect(strip.getByRole("listitem").last()).toHaveText(/Rules based on Seattle's code decide$/);
  await expect(page.getByRole("region", { name: "How it works" })).not.toContainText("still being checked");
});
