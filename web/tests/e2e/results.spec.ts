import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, expectNoSidewaysScroll, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

/** An example plan from Start to the results, through the real API with no key. */
async function runExample(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page).toHaveURL(/\/results\/\?check=/);
  await expect(page.getByTestId("counts")).toBeVisible();
  return new URL(page.url()).searchParams.get("check")!;
}

test("the flawed café: counts, the two tab rows, code reference, permits, and a PDF", async ({ page, request }) => {
  const id = await runExample(page, "Café with planted problems");
  await expect(page.getByTestId("counts")).toHaveText("11 things to fix before you apply, 2 to check with the city, 6 fine.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-align", "center");
  await expect(page.getByRole("tablist", { name: "Summary" }).getByRole("tab")).toHaveText(["In short", "Zoning", "Downloads"]);
  await expect(page.getByRole("tablist", { name: "What the check found" }).getByRole("tab")).toHaveText(["Fix before you apply (11)", "Check with the city (2)", "OK (6)"]);
  await expect(page.getByRole("tab", { name: "Fix before you apply (11)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(11);
  await expect(page.getByText("Seattle’s review records are not loaded on this server", { exact: false })).toBeVisible();
  await expect(page.getByText(/This check is kept until .*20\d\d/)).toBeVisible();
  await axeBoth(page, "results top");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await shoot(page, "stage-3", "cafe-flawed-top", { fullPage: false });
  await shoot(page, "stage-3", "cafe-flawed-full");

  const card = page.locator("#finding-0");
  await card.getByRole("button", { name: "Show the code reference" }).click();
  await expect(card.locator(".font-mono")).toBeVisible();
  await axeBoth(page, "results with code reference open");
  await card.scrollIntoViewIfNeeded();
  await shoot(page, "stage-3", "card-code-reference", { fullPage: false });
  await page.getByRole("tab", { name: "OK (6)" }).click();
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(6);
  await axeBoth(page, "results with OK selected");

  await page.getByRole("tab", { name: "Downloads" }).click();
  const download = page.getByRole("link", { name: "Download the fix list (PDF)" });
  await expect(download).toHaveAttribute("href", `${API}/api/checks/${id}/report.pdf`);
  const pdf = await request.get(`${API}/api/checks/${id}/report.pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const sheet = await request.get((await page.getByRole("link", { name: "Download the permit preparation sheet (PDF)" }).getAttribute("href"))!);
  expect(sheet.headers()["content-type"]).toBe("application/pdf");
});

test("the tabs work by keyboard, each panel is labelled by its tab, and the selection survives a refresh", async ({ page }) => {
  await runExample(page, "Café with planted problems");
  const inShort = page.getByRole("tab", { name: "In short" });
  await inShort.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Zoning" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Zoning" })).toContainText("Zone: NC2-55 (M)");
  const fixTab = page.getByRole("tab", { name: "Fix before you apply (11)" });
  await fixTab.focus();
  await page.keyboard.press("ArrowRight");
  const cityTab = page.getByRole("tab", { name: "Check with the city (2)" });
  await expect(cityTab).toBeFocused();
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Check with the city (2)" }).locator("article")).toHaveCount(2);
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "OK (6)" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  // the selected tab has the tint: the summary tab blue on the tab tint, the findings tab its status tint
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("color", "rgb(31, 78, 140)");
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("border-bottom-width", "3px");
  await expect(cityTab).toHaveCSS("background-color", "rgb(251, 241, 226)");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toHaveAttribute("aria-selected", "true");
  await axeBoth(page, "tabs after a refresh");
});

test("a link to a finding in another tab opens that tab first, then scrolls to the finding and focuses it", async ({ page }) => {
  const id = await runExample(page, "Café with planted problems");
  const check = await (await page.request.get(`${API}/api/checks/${id}`)).json();
  const okIndex = check.result.findings.findIndex((f: { status: string }) => f.status === "pass");
  const cityIndex = check.result.findings.findIndex((f: { status: string }) => f.status === "review");
  await page.goto("/help/");
  await page.goto(`/results/?check=${id}#finding-${okIndex}`);                    // a page load at the finding
  await expect(page.getByRole("tab", { name: "OK (6)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${okIndex}`)).toBeFocused();
  await expect(page.locator(`#finding-${okIndex}`)).toBeInViewport();
  await page.evaluate((i) => { window.location.hash = `finding-${i}`; }, cityIndex);   // the same page, a new finding
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${cityIndex}`)).toBeFocused();

  // The assistant's "From your result" link to the same OK finding, from the Fix tab.
  await page.getByRole("tab", { name: "Fix before you apply (11)" }).click();
  const rule = check.result.findings[okIndex].rule_id;
  await page.route("**/api/checks/*/ask", (route) => route.fulfill({
    json: { text: "Here is the finding you asked about.", cited_rules: [rule], generated_by: "template", problems: [] },
    headers: { "access-control-allow-origin": "*" },
  }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ask about the pre-check" });
  await dialog.getByRole("textbox", { name: "Your question" }).fill("Which items passed?");
  await dialog.getByRole("button", { name: "Send" }).click();
  await dialog.getByRole("link", { name: `${check.result.findings[okIndex].title} (OK)` }).click();
  await expect(page.getByRole("tab", { name: "OK (6)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${okIndex}`)).toBeFocused();
  await expect(page.locator(`#finding-${okIndex}`)).toBeInViewport();
});

test("the compliant café and the salon render", async ({ page }) => {
  await runExample(page, "Café that passes");
  await expect(page.getByTestId("counts")).toContainText("0 things to fix before you apply");
  await axeBoth(page, "compliant café");
  await shoot(page, "stage-3", "cafe-compliant");
  await runExample(page, "Hair salon with planted problems");
  await expect(page.getByRole("tab", { name: /^Fix before you apply \(\d+\)$/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Zoning" }).click();
  await expect(page.getByText("Zone: NR3")).toBeVisible();
  await axeBoth(page, "salon");
});

test("with Seattle's records (served from the fixture), every record line says how many permits it is based on", async ({ page }) => {
  const check = fixture("check_cafe_flawed_with_records");
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: { "access-control-allow-origin": "*" } }));
  await page.goto(`/results/?check=${check.id}`);
  const records = page.getByRole("region", { name: "What Seattle’s records show about businesses like yours" });
  await expect(records.locator("li").first()).toBeVisible();
  const lines = await records.locator("li").allTextContents();
  expect(lines.length).toBeGreaterThan(3);
  for (const l of lines) expect(l).toMatch(/^Of \d+ /);
  await expect(records).toContainText("Of 3 food and drink build-outs, 2 (67%) were sent back for corrections at least once.");
  await axeBoth(page, "with records");
  await records.scrollIntoViewIfNeeded();
  await shoot(page, "stage-3", "with-records", { fullPage: false });
  await page.locator("section[aria-labelledby=records]").scrollIntoViewIfNeeded();
});

test("Not sure answers show as Check with the city and May be needed permits", async ({ page }) => {
  const check = fixture("check_cafe_flawed_unsure");
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: { "access-control-allow-origin": "*" } }));
  await page.goto(`/results/?check=${check.id}`);
  await expect(page.getByText("May be needed", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("tab", { name: "Check with the city (3)" })).toBeVisible();
  await axeBoth(page, "not sure");
});

test("Delete this check now: confirm, then back to Start; the address no longer opens it", async ({ page }) => {
  const id = await runExample(page, "Hair salon with planted problems");
  await page.getByRole("button", { name: "Delete this check now…" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete this check?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await axeBoth(page, "delete dialog");
  await shoot(page, "stage-3", "delete-confirm", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete this check now…" })).toBeFocused();   // focus returns
  await page.getByRole("button", { name: "Delete this check now…" }).click();
  await page.getByRole("button", { name: "Delete the check" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(page.getByRole("status").filter({ hasText: "The check was deleted from the server." })).toBeVisible();
  await page.goto(`/results/?check=${id}`);
  await expect(page.getByText("This check is no longer kept. It was deleted or it expired. Start a new check.")).toBeVisible();
});

test("screenshots: PermitOS results tabs and palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "PermitOS" })).toBeVisible();
  await expect(page).toHaveTitle("Check your floor plan before you apply | PermitOS");
  await shoot(page, "permitos", "start", { fullPage: false });
  await runExample(page, "Café with planted problems");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "permitos", "results-top", { fullPage: false });
  await shoot(page, "permitos", "results-full");
  await page.getByRole("tab", { name: "Zoning" }).click();
  await page.getByRole("tab", { name: "Check with the city (2)" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "permitos", "results-zoning-city", { fullPage: false });
  await page.getByRole("tab", { name: "Downloads" }).click();
  await page.getByRole("tab", { name: "OK (6)" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "permitos", "results-downloads-ok", { fullPage: false });
  await page.goto("/check/");
  await shoot(page, "permitos", "check", { fullPage: false });
});
