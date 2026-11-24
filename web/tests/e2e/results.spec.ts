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

test("the flawed café: counts, Fix always shown, the two tab rows, code reference, permits, and a PDF", async ({ page, request }) => {
  const id = await runExample(page, "Café with planted problems");
  await expect(page.getByTestId("counts")).toHaveText("11 things to fix before you apply, 2 to check with the city, 6 fine.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("text-align", "center");
  await expect(page.getByRole("tablist", { name: "Summary" }).getByRole("tab")).toHaveText(["In short", "Zoning", "Downloads"]);
  const fix = page.getByRole("region", { name: "Fix before you apply (11)" });
  await expect(fix.getByRole("heading", { level: 2 })).toHaveText("Fix before you apply (11)");
  await expect(fix.locator("article")).toHaveCount(11);
  await expect(page.getByRole("tablist", { name: "Check with the city / OK" }).getByRole("tab")).toHaveText(["Check with the city (2)", "OK (6)"]);
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(13);
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
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(11 + 6);
  await expect(fix.locator("article")).toHaveCount(11);                         // the Fix section never hides
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
  const cityTab = page.getByRole("tab", { name: "Check with the city (2)" });
  const okTab = page.getByRole("tab", { name: "OK (6)" });
  await cityTab.focus();
  await expect(page.getByRole("tabpanel", { name: "Check with the city (2)" }).locator("article")).toHaveCount(2);
  await page.keyboard.press("ArrowRight");
  await expect(okTab).toBeFocused();
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "OK (6)" }).locator("article")).toHaveCount(6);
  await page.keyboard.press("Home");
  await expect(cityTab).toBeFocused();
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(cityTab).toHaveAttribute("aria-selected", "true");
  // the selected tab has the tint: the summary tab blue on the tab tint, the findings tab its status tint
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("color", "rgb(31, 78, 140)");
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveCSS("border-bottom-width", "3px");
  await expect(cityTab).toHaveCSS("background-color", "rgb(251, 241, 226)");
  await page.keyboard.press("ArrowRight");                                       // OK, then a refresh keeps it
  await expect(okTab).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Zoning" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "OK (6)" })).toHaveAttribute("aria-selected", "true");
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "permitos", "results-zoning", { fullPage: false });
  await page.getByRole("tab", { name: "Downloads" }).click();
  await page.getByRole("tab", { name: "OK (6)" }).click();
  await page.getByRole("region", { name: "Check with the city / OK" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shoot(page, "permitos", "results-tabs-ok", { fullPage: false });
  await page.getByRole("region", { name: "Permits and approvals to expect" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  await shoot(page, "permitos", "results-rail-permits", { fullPage: false });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: /^On this page:/ }).click();
  await page.waitForTimeout(150);
  if (process.env.SHOTS) await page.screenshot({ path: "../docs/screenshots/permitos/results-popover-375.png" });
  await page.keyboard.press("Escape");
  await page.goto("/check/");
  await shoot(page, "permitos", "check", { fullPage: false });
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
  await expect(page.getByRole("button", { name: /^On this page:/ })).toBeHidden();        // the compact bar is for phones
  await expect(rail.getByTestId("sections-seen")).toHaveText("0 of 5 sections seen");
  expect((await railStates(page))[0]).toEqual(["Your pre-check results", "current", "location", false, false]);

  await rail.getByRole("link", { name: "Permits and approvals to expect" }).click();
  await expect(page.getByRole("heading", { name: "Permits and approvals to expect" })).toBeFocused();
  await expect(rail.getByTestId("sections-seen")).toHaveText("3 of 5 sections seen");
  expect(await railStates(page)).toEqual([
    ["Your pre-check results", "seen", null, true, true],
    ["Fix before you apply (11)", "seen", null, true, true],
    ["Check with the city / OK", "seen", null, true, true],
    ["Permits and approvals to expect", "current", "location", false, false],
    ["What Seattle’s records show about businesses like yours", "next", null, false, false],
  ]);
  const current = rail.locator('a[aria-current="location"]');
  await expect(current).toHaveCSS("background-color", "rgb(232, 239, 248)");
  await expect(current).toHaveCSS("color", "rgb(31, 78, 140)");
  await expect(current).toHaveCSS("border-left-width", "3px");
  const sticky = rail.locator("div").first();                                             // the sticky box inside the rail
  expect((await sticky.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect(sticky).toBeInViewport();

  await rail.getByRole("link", { name: "Fix before you apply (11)" }).click();
  await expect(page.getByRole("heading", { name: "Fix before you apply (11)" })).toBeFocused();
  await expect(rail.locator('a[aria-current="location"]')).toHaveText("Fix before you apply (11)");
  await expect(rail.getByTestId("sections-seen")).toHaveText("1 of 5 sections seen");

  await rail.getByRole("link", { name: "Check with the city / OK" }).click();
  await expect(page.getByRole("tab", { name: "Check with the city (2)" })).toBeFocused();
  await rail.getByRole("link", { name: "Your pre-check results" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(rail.getByTestId("sections-seen")).toHaveText("0 of 5 sections seen");

  await page.mouse.wheel(0, 100000);                                                      // the end of the page
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
