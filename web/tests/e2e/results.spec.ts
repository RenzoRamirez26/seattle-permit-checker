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
  await expect(page.getByRole("heading", { name: /^Fix before you apply|^OK/ }).first()).toBeVisible();
  return new URL(page.url()).searchParams.get("check")!;
}

test("the flawed café: counts, Fix then Check with the city then OK, code reference, permits, and a PDF", async ({ page, request }) => {
  const id = await runExample(page, "Café with planted problems");
  await expect(page.getByTestId("counts")).toHaveText("11 things to fix before you apply, 2 to check with the city, 6 fine.");
  const h2 = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(h2.indexOf("Fix before you apply (11)")).toBeLessThan(h2.indexOf("Check with the city (2)"));
  await expect(page.getByRole("button", { name: "OK (6)" })).toHaveAttribute("aria-expanded", "false");
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
  await page.getByRole("button", { name: "OK (6)" }).click();
  await expect(page.locator("article[id^=finding-]:visible")).toHaveCount(19);
  await axeBoth(page, "results with code reference and OK open");
  await card.scrollIntoViewIfNeeded();
  await shoot(page, "stage-3", "card-code-reference", { fullPage: false });

  const download = page.getByRole("link", { name: "Download the fix list (PDF)" });
  await expect(download).toHaveAttribute("href", `${API}/api/checks/${id}/report.pdf`);
  const pdf = await request.get(`${API}/api/checks/${id}/report.pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const sheet = await request.get((await page.getByRole("link", { name: "Download the permit preparation sheet (PDF)" }).getAttribute("href"))!);
  expect(sheet.headers()["content-type"]).toBe("application/pdf");
});

test("the summary stays in view on a wide screen while the findings scroll", async ({ page }) => {
  await runExample(page, "Café with planted problems");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(200);
  const box = await page.getByRole("heading", { name: "In short" }).boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeLessThan(200);
  await shoot(page, "stage-3", "summary-sticky", { fullPage: false });
});

test("the compliant café and the salon render", async ({ page }) => {
  await runExample(page, "Café that passes");
  await expect(page.getByTestId("counts")).toContainText("0 things to fix before you apply");
  await axeBoth(page, "compliant café");
  await shoot(page, "stage-3", "cafe-compliant");
  await runExample(page, "Hair salon with planted problems");
  await expect(page.getByRole("heading", { name: /^Fix before you apply/ })).toBeVisible();
  await expect(page.getByText("Zone: NR3")).toBeVisible();
  await axeBoth(page, "salon");
});

test("with Seattle's records (served from the fixture), every record line says how many permits it is based on", async ({ page }) => {
  const check = fixture("check_cafe_flawed_with_records");
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: { "access-control-allow-origin": "*" } }));
  await page.goto(`/results/?check=${check.id}`);
  const records = page.getByRole("region", { name: "What Seattle’s records show" }).or(page.locator("section[aria-labelledby=records]"));
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
  await expect(page.getByRole("heading", { name: "Check with the city (3)" })).toBeVisible();
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
