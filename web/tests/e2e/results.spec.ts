import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, expectNoSidewaysScroll, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

const EXAMPLES: Record<string, string> = {
  "Café with planted problems": "cafe_flawed", "Café with no issues found": "cafe_compliant", "Hair salon with planted problems": "salon_flawed",
};

/** An example plan to the results, through the real API with no key. */
async function runExample(page: Page, title: string) {
  await page.goto(`/plan/reading/?example=${EXAMPLES[title]}`);
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page).toHaveURL(/\/results\/\?check=/);
  await expect(page.getByTestId("counts")).toBeVisible();
  return new URL(page.url()).searchParams.get("check")!;
}

test("the flawed café: counts, Fix always shown, the two tab rows, code reference, permits, and a PDF", async ({ page, request }) => {
  const id = await runExample(page, "Café with planted problems");
  await expect(page.getByTestId("counts")).toHaveText("You have 11 things to fix before you apply and 2 to check with the city.");
  await expect(page.getByTestId("others")).toHaveText("We found no issues in the other 6 checks.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-align", "center");
  await expect(page.getByText("A pre-check from the checks we ran, not a city approval.")).toBeVisible();
  await expect(page.getByTestId("facts-line")).toContainText("Café or restaurant · 2,400 sq ft · Zone NC2-55 (M)");
  const tiles = page.getByRole("list", { name: "Counts" }).getByRole("listitem");
  await expect(tiles).toHaveText(["11to fix before you apply", "2to check with the city", "6checks with no issues found"]);
  await expect(page.getByRole("tablist", { name: "Summary" }).getByRole("tab")).toHaveText(["In short", "Zoning", "Downloads"]);
  const fix = page.getByRole("region", { name: "Fix before you apply (11)" });
  await expect(fix.getByRole("heading", { level: 2 })).toHaveText("Fix before you apply (11)");
  await expect(fix.getByText("These are likely to stop a permit review.")).toBeVisible();
  await expect(fix.locator("article")).toHaveCount(5);                          // many findings: the first five, then Show all
  await expect(page.getByRole("tablist", { name: "Check with the city / No issues found" }).getByRole("tab")).toHaveText(["Check with the city (2)", "No issues found (6)"]);
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(5 + 2);
  await expect(page.getByText("Seattle’s review records aren’t loaded on this server", { exact: false })).toBeVisible();
  await expect(page.getByText(/This check is kept until .*20\d\d/)).toBeVisible();
  await axeBoth(page, "results top");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await shoot(page, "stage-3", "cafe-flawed-top", { fullPage: false });
  await shoot(page, "stage-3", "cafe-flawed-full");

  const card = page.locator("#finding-0");
  await expect(card.locator("[data-mark=fix]")).toBeVisible();                  // the row: icon, title, observation, code section
  await expect(card.locator(".font-mono")).toBeVisible();
  await expect(card.getByRole("button", { name: /^Ask about this: / })).toHaveText("Ask about this →");
  await page.getByRole("tab", { name: "No issues found (6)" }).click();
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(5 + 5);
  await axeBoth(page, "results with No issues found selected");

  await page.getByRole("tab", { name: "Downloads" }).click();
  const download = page.getByRole("tabpanel", { name: "Downloads" }).getByRole("link", { name: "Download the fix list (PDF)" });
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
  const cityTab = page.getByRole("tab", { name: "Check with the city (2)" });
  const okTab = page.getByRole("tab", { name: "No issues found (6)" });
  await cityTab.focus();
  await expect(page.getByRole("tabpanel", { name: "Check with the city (2)" }).locator("article")).toHaveCount(2);
  await page.keyboard.press("ArrowRight");
  await expect(okTab).toBeFocused();
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "No issues found (6)" }).locator("article")).toHaveCount(5);
  await page.keyboard.press("Home");
  await expect(cityTab).toBeFocused();
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  // the selected tab: the hero's pill blue on the tint; the underline tab the tint and a 3 px blue underline
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("color", "rgb(31, 78, 140)");
  expect(parseFloat(await page.getByRole("tab", { name: "Zoning" }).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(20);
  await expect(cityTab).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(cityTab).toHaveCSS("border-bottom-width", "3px");
  await expect(cityTab).toHaveCSS("border-bottom-color", "rgb(31, 78, 140)");
  await expect(cityTab.locator("[data-mark=city]")).toHaveCount(1);
  await expect(okTab.locator("[data-mark=none]")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");                                       // OK, then a refresh keeps it
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "No issues found (6)" })).toHaveAttribute("aria-selected", "true");
  await axeBoth(page, "tabs after a refresh");
});

test("a link to a finding in another tab opens that tab first, then scrolls to the finding and focuses it", async ({ page }) => {
  const id = await runExample(page, "Café with planted problems");
  const check = await (await page.request.get(`${API}/api/checks/${id}`)).json();
  const okIndex = check.result.findings.findIndex((f: { status: string }) => f.status === "pass");
  const cityIndex = check.result.findings.findIndex((f: { status: string }) => f.status === "review");
  await page.goto("/help/");
  await page.goto(`/results/?check=${id}#finding-${okIndex}`);                    // a page load at the finding
  await expect(page.getByRole("tab", { name: "No issues found (6)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${okIndex}`)).toBeFocused();
  await expect(page.locator(`#finding-${okIndex}`)).toBeInViewport();
  await page.evaluate((i) => { window.location.hash = `finding-${i}`; }, cityIndex);   // the same page, a new finding
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${cityIndex}`)).toBeFocused();

  // The assistant's "From your result" link to the same OK finding, with Check with the city selected.
  await page.getByRole("tab", { name: "Check with the city (2)" }).click();
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
  await dialog.getByRole("link", { name: `${check.result.findings[okIndex].title} (No issues found)` }).click();
  await expect(page.getByRole("tab", { name: "No issues found (6)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`#finding-${okIndex}`)).toBeFocused();
  await expect(page.locator(`#finding-${okIndex}`)).toBeInViewport();
});

test("the compliant café and the salon render", async ({ page }) => {
  await runExample(page, "Café with no issues found");
  await expect(page.getByTestId("counts")).toHaveText("Nothing to fix before you apply, and nothing to check with the city.");
  await axeBoth(page, "compliant café");
  await shoot(page, "stage-3", "cafe-compliant");
  await runExample(page, "Hair salon with planted problems");
  await expect(page.getByRole("region", { name: /^Fix before you apply \(\d+\)$/ }).locator("article").first()).toBeVisible();
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
  // the count is the API's: a finding with the same status either way is not turned into Check with the city (#22)
  await expect(page.getByRole("tab", { name: `Check with the city (${check.result.summary.reviews})` })).toBeVisible();
  // "May be needed" is said once per permit: the tag, then only the reason (#26)
  await expect(page.getByText(/May be needed:/)).toHaveCount(0);
  await expect(page.getByText(/^Check with the city\. It depends on whether alcohol will be served/)).toBeVisible();
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

test("screenshots: design v3 results", async ({ page }) => {
  await runExample(page, "Café with planted problems");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "design-v3", "results-top", { fullPage: false });
  await shoot(page, "design-v3", "results-full");
  await page.getByRole("tab", { name: "Zoning" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "design-v3", "results-zoning", { fullPage: false });
  await page.getByRole("tab", { name: "No issues found (6)" }).click();
  await page.getByRole("region", { name: "Check with the city / No issues found" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shoot(page, "design-v3", "results-tabs-no-issues", { fullPage: false });
  await page.getByRole("region", { name: "Permits and approvals to expect" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  await shoot(page, "design-v3", "results-permits-rail", { fullPage: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /^On this page:/ }).click();
  await page.waitForTimeout(150);
  if (process.env.SHOTS) await page.screenshot({ path: "../docs/screenshots/design-v3/results-popover-375.png" });
  await page.keyboard.press("Escape");
});

test("state: nothing to fix shows one line with the No issues found mark", async ({ page }) => {
  await runExample(page, "Café with no issues found");
  const fix = page.getByRole("region", { name: "Fix before you apply (0)" });
  await expect(fix.getByText("Nothing to fix before you apply.")).toBeVisible();
  // no red when there is nothing to fix (#25): no "!" mark, and the "(0)" and the 0 tile in ink
  await expect(fix.locator("[data-mark=fix]")).toHaveCount(0);
  await expect(fix.locator("[data-mark=none]").first()).toBeVisible();
  const ink = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(await fix.locator("h2 .nums").evaluate((el) => getComputedStyle(el).color)).toBe(ink);
  const tile = page.getByRole("list", { name: "Counts" }).getByRole("listitem").first();
  await expect(tile.locator("[data-mark=fix]")).toHaveCount(0);
  expect(await tile.locator(".nums").evaluate((el) => getComputedStyle(el).color)).toBe(ink);
  await expect(fix.locator("article")).toHaveCount(0);
  await expect(fix.getByText("These are likely to stop a permit review.")).toHaveCount(0);
  await axeBoth(page, "nothing to fix");
  await fix.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shoot(page, "design-v3", "state-nothing-to-fix", { fullPage: false });
});

test("state: many findings show five, then Show all N, which moves focus to the sixth", async ({ page }) => {
  await runExample(page, "Café with planted problems");
  const fix = page.getByRole("region", { name: "Fix before you apply (11)" });
  await expect(fix.locator("article")).toHaveCount(5);
  const more = fix.getByRole("button", { name: "Show all 11" });
  await more.scrollIntoViewIfNeeded();
  await shoot(page, "design-v3", "state-many-findings", { fullPage: false });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(fix.locator("article")).toHaveCount(11);
  await expect(fix.locator("article").nth(5)).toBeFocused();
  await expect(fix.getByRole("button", { name: "Show all 11" })).toHaveCount(0);
  await axeBoth(page, "many findings, all shown");
});

test("state: no zoning result offers the address, Try again and the city's map", async ({ page }) => {
  const check = fixture("check_cafe_flawed");
  check.id = "fixture-no-zoning";
  check.result.zoning = { ...check.result.zoning, address: "1 Nowhere St, Seattle, WA", district: null, zone: null, status: "unknown", detail: "Address not found.", source: "address" };
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: { "access-control-allow-origin": "*" } }));
  const zoning = fixture("zoning_address");
  await page.route("**/api/zoning", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    return route.fulfill({ json: zoning, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto(`/results/?check=${check.id}`);
  await page.getByRole("tab", { name: "Zoning" }).click();
  const panel = page.getByRole("tabpanel", { name: "Zoning" });
  await expect(panel.getByText("We couldn’t find zoning for this address")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Street address in Seattle" })).toHaveValue("1 Nowhere St, Seattle, WA");
  await expect(panel.getByRole("link", { name: "Find the zone on Seattle’s property map" })).toHaveAttribute("href", /seattlecitygis\.maps\.arcgis\.com/);
  await axeBoth(page, "no zoning");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "design-v3", "state-no-zoning", { fullPage: false });
  await panel.getByRole("textbox", { name: "Street address in Seattle" }).fill("123 Example St, Seattle, WA");
  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel).toContainText(`Zone: ${zoning.zoning.district}`);
  await expect(panel).toContainText("This is not in your result yet. Run the check again to include it.");
  // a zoning found again still shows its code section, and says its rule is still being checked (no finding yet)
  expect(typeof zoning.zoning.cite).toBe("string");
  await expect(panel.getByText(zoning.zoning.cite, { exact: true })).toBeVisible();
  await expect(panel.getByText("This rule's value is still being checked against the code.")).toBeVisible();
});

/** The rail's items, with their state: current, seen or next. */
async function railStates(page: Page) {
  return page.getByRole("navigation", { name: "On this page" }).locator("a:visible").evaluateAll((as) => as.map((a) => [
    a.textContent?.replace(" (seen)", ""), a.getAttribute("data-state"), a.getAttribute("aria-current"),
    !!a.querySelector("svg"), (a.textContent ?? "").includes("(seen)"),
  ]));
}

test("On this page at 1280 px: marks the current section and the ones seen, jumps, and moves focus to the heading", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await runExample(page, "Café with planted problems");
  const rail = page.getByRole("navigation", { name: "On this page" });
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())!.width).toBe(220);
  for (const width of [1024, 1280, 1600]) {
    // The rail sits right of the results column, and the heading is centred over that column.
    await page.setViewportSize({ width, height: 900 });
    const column = (await page.locator("#section-results .results-column").boundingBox())!;
    const railBox = (await rail.boundingBox())!;
    const heading = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(railBox.x, `rail right of the column at ${width}`).toBeGreaterThanOrEqual(column.x + column.width + 47);
    expect(Math.abs(heading.x + heading.width / 2 - (column.x + column.width / 2)), `heading centred on the column at ${width}`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("button", { name: /^On this page:/ })).toBeHidden();        // the compact bar is for phones
  await expect(rail.getByTestId("sections-seen")).toHaveText("0 of 5 sections seen");
  expect((await railStates(page))[0]).toEqual(["Your pre-check results", "current", "location", false, false]);

  await rail.getByRole("link", { name: "Permits and approvals to expect" }).click();
  await expect(page.getByRole("heading", { name: "Permits and approvals to expect" })).toBeFocused();
  await expect(rail.getByTestId("sections-seen")).toHaveText("3 of 5 sections seen");
  expect(await railStates(page)).toEqual([
    ["Your pre-check results", "seen", null, true, true],
    ["Fix before you apply (11)", "seen", null, true, true],
    ["Check with the city / No issues found", "seen", null, true, true],
    ["Permits and approvals to expect", "current", "location", false, false],
    ["What Seattle’s records show about businesses like yours", "next", null, false, false],
  ]);
  const current = rail.locator('a[aria-current="location"]');
  await expect(current).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(current).toHaveCSS("color", "rgb(31, 78, 140)");
  await expect(current).toHaveCSS("border-left-width", "0px");                  // no side bar
  await expect(current).toHaveCSS("font-weight", "500");
  await expect(rail.locator('a[data-state="next"] span[aria-hidden].rounded-full')).toHaveCount(1);   // a hollow dot
  const sticky = rail.locator("div").first();                                             // the sticky box inside the rail
  expect((await sticky.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect(sticky).toBeInViewport();

  await rail.getByRole("link", { name: "Fix before you apply (11)" }).click();
  await expect(page.getByRole("heading", { name: "Fix before you apply (11)" })).toBeFocused();
  await expect(rail.locator('a[aria-current="location"]')).toHaveText("Fix before you apply (11)");
  await expect(rail.getByTestId("sections-seen")).toHaveText("1 of 5 sections seen");

  await rail.getByRole("link", { name: "Check with the city / No issues found" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Check with the city / No issues found" })).toBeFocused();
  await rail.getByRole("link", { name: "Your pre-check results" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(rail.getByTestId("sections-seen")).toHaveText("0 of 5 sections seen");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));   // the end of the page
  await expect(rail.locator('a[aria-current="location"]')).toHaveText("What Seattle’s records show about businesses like yours");
  await expect(rail.getByTestId("sections-seen")).toHaveText("4 of 5 sections seen");
  await expectNoAxeViolations(page, "rail at 1280");
});

test("On this page at 375 px: a compact bar clear of the Ask button that opens the list in a popover", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await runExample(page, "Café with planted problems");
  await expect(page.getByRole("navigation", { name: "On this page" }).locator("ol:visible")).toHaveCount(0);   // no rail
  const bar = page.getByRole("button", { name: /^On this page:/ });
  await expect(bar).toHaveText("Section 1 of 5 · Next: Fix before you apply");
  expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(812 - 96);            // inside the 96 px scroll padding
  const barBox = (await bar.boundingBox())!;
  const ask = (await page.getByRole("button", { name: "Ask", exact: true }).boundingBox())!;
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(ask.x - 8);                        // clear of the Ask button
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(812);

  await bar.click();
  const popover = page.getByRole("dialog", { name: "On this page" });
  await expect(popover).toBeVisible();
  await expect(popover.getByTestId("sections-seen")).toHaveText("0 of 5 sections seen");
  await expectNoAxeViolations(page, "popover at 375");
  await popover.getByRole("link", { name: "Permits and approvals to expect" }).click();
  await expect(popover).toBeHidden();
  await expect(page.getByRole("heading", { name: "Permits and approvals to expect" })).toBeFocused();
  await expect(bar).toHaveText("Section 4 of 5 · Next: Seattle’s records");
  await bar.click();
  await expect(popover.locator('a[aria-current="location"]')).toHaveText("Permits and approvals to expect");
  await expect(popover.locator('a[data-state="seen"]')).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(bar).toBeFocused();
  await expectNoAxeViolations(page, "bar at 375");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
});

test("the On this page bar never covers the control that has keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await runExample(page, "Café with planted problems");
  const bar = page.getByRole("button", { name: /^On this page:/ });
  const covered: string[] = [];
  await page.locator("body").press("Tab");
  for (let i = 0; i < 80; i++) {
    const hit = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const barEl = Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => b.getAttribute("aria-label")?.startsWith("On this page:"));
      if (!el || !barEl || el === barEl || el === document.body) return null;
      const a = el.getBoundingClientRect(), b = barEl.getBoundingClientRect();
      const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return overlap ? `${el.tagName} ${(el.textContent ?? "").trim().slice(0, 40)}` : null;
    });
    if (hit) covered.push(hit);
    await page.keyboard.press("Tab");
  }
  expect(covered).toEqual([]);
  await expect(bar).toBeVisible();
});
