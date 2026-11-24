import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectTouchTargets, shoot, WIDTHS } from "./helpers";
import { seed } from "./seed";

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

const panel = (page: Page) => page.getByRole("dialog", { name: "Ask about the pre-check" });
const askButton = (page: Page) => page.getByRole("button", { name: "Ask", exact: true });

async function toResults(page: Page) {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
}

test("it never opens by itself, on any page", async ({ page }) => {
  for (const path of ["/", "/business/", "/plan/", "/check/", "/help/"]) {
    await page.goto(path);
    await page.waitForTimeout(300);
    await expect(askButton(page)).toBeVisible();
    await expect(panel(page)).toBeHidden();
  }
  await toResults(page);
  await expect(panel(page)).toBeHidden();
});

test("keyboard: focus moves in on open, Escape closes and returns focus to Ask (panel and sheet)", async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/business/");
    await askButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ask about the pre-check" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(askButton(page)).toBeFocused();
  }
});

test("closed, the Ask button never covers the main button, from 320 to 1280 px wide, at any scroll position", async ({ page }) => {
  const pages: [string, (p: Page) => Promise<void>][] = [
    ["/", async () => {}],
    ["/business/", async () => {}],
    ["/plan/", async () => {}],
    ["/check/", async (p) => { await seed(p, { caseId: "cafe_flawed" }); }],
  ];
  for (const [path, before] of pages) {
    await before(page);
    for (const width of [320, 375, 640, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 640 });
      await page.goto(path);
      await expect(page.locator("[data-main-action]").first()).toBeVisible();
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += 120) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(40);
        const overlap = await page.evaluate(() => {
          const ask = document.querySelector<HTMLElement>(".ask-button")!.getBoundingClientRect();
          return Array.from(document.querySelectorAll<HTMLElement>("[data-main-action]")).some((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.left < ask.right && r.right > ask.left && r.top < ask.bottom && r.bottom > ask.top;
          });
        });
        expect(overlap, `${path} at ${width} px, scrolled to ${y}`).toBe(false);
      }
    }
  }
});

test("closed, the Ask button never covers the control that has keyboard focus (Vercel: nothing fixed covers focus)", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  for (const [width, height] of [[375, 812], [1280, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/check/");
    await expect(page.getByRole("button", { name: "Run the check" })).toBeVisible();
    const covered = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const hit = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const ask = document.querySelector<HTMLElement>(".ask-button");
        if (!el || !ask || el === document.body || ask.contains(el)) return null;
        const a = ask.getBoundingClientRect(), r = el.getBoundingClientRect();
        const overlaps = r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
        return overlaps ? (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) : null;
      });
      if (hit) covered.add(hit);
    }
    expect([...covered], `focused controls under the Ask button at ${width} px`).toEqual([]);
  }
});

test("open on a wide screen, the panel sits in columns 9 to 12 and the page makes room: nothing is covered", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/check/");
  await askButton(page).click();
  await expect(panel(page)).toBeVisible();
  const p = (await panel(page).boundingBox())!;
  expect(p.x).toBeGreaterThan(1280 * 0.6);
  const run = page.getByRole("button", { name: "Run the check" });
  await run.scrollIntoViewIfNeeded();
  const r = (await run.boundingBox())!;
  expect(r.x + r.width).toBeLessThanOrEqual(p.x);
  const field = (await page.getByRole("button", { name: "Change Door 1" }).boundingBox())!;
  expect(field.x + field.width).toBeLessThanOrEqual(p.x);
  await run.click();                                         // the flow goes on with the panel open
  await expect(page.getByTestId("counts")).toBeVisible();
});

test("step 1: ready-made questions answered from the help text, with no request", async ({ page }) => {
  let asked = false;
  page.on("request", (r) => { if (r.url().includes("/ask")) asked = true; });
  await page.goto("/business/");
  await askButton(page).click();
  await expect(panel(page).getByText("I explain this pre-check and your result. I do not approve permits")).toBeVisible();
  for (const q of ["Why does it ask about cooking?", "What if I am not sure of an answer?", "Where do I find the zone?"]) {
    await expect(panel(page).getByRole("button", { name: q })).toBeVisible();
  }
  await axeBoth(page, "panel on step 1");
  await expectTouchTargets(page);
  await shoot(page, "stage-4", "panel-step-1", { fullPage: false });
  await panel(page).getByRole("button", { name: "What if I am not sure of an answer?" }).click();
  await expect(panel(page).getByText(/Choose Not sure\. Anything left as Not sure is never treated as fine/)).toBeVisible();
  expect(asked).toBe(false);
});

test("results: an answer from the API links to its findings and scrolls the page there", async ({ page }) => {
  await toResults(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await askButton(page).click();
  await panel(page).getByRole("button", { name: "What should I fix first?" }).click();
  const log = panel(page).getByRole("log", { name: "Conversation" });
  await expect(log).toContainText("I found 11 problems and 2 items to confirm.");
  await expect(log).toContainText("Written from your result by a template.");
  const link = log.getByRole("link", { name: "No Type I hood over cooking equipment (Fix before you apply)" });
  await expect(link).toBeVisible();
  await axeBoth(page, "panel on results");
  await page.setViewportSize({ width: 1280, height: 900 });
  await shoot(page, "stage-4", "panel-results", { fullPage: false });
  await link.click();
  const target = page.locator(`#${(await link.getAttribute("href"))!.split("#")[1]}`);
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();

  // On a phone the sheet closes so the finding can be seen.
  await page.setViewportSize({ width: 375, height: 812 });
  if (await panel(page).isHidden()) await askButton(page).click();          // still open from above, now as a sheet
  await panel(page).getByRole("log").getByRole("link").first().click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("article:focus")).toBeInViewport();
});

test("Ask about this opens the panel with the question in the box, not sent", async ({ page }) => {
  await toResults(page);
  await page.getByRole("button", { name: "Ask about this: Not enough exits" }).click();
  const box = panel(page).getByRole("textbox", { name: "Your question" });
  await expect(box).toHaveValue("Tell me more about “Not enough exits”.");
  await expect(box).toBeFocused();
  await expect(panel(page).getByRole("log")).not.toContainText("Not enough exits");
  await page.keyboard.press("Control+Enter");
  await expect(panel(page).getByRole("log")).toContainText("Written from your result");
  await panel(page).getByRole("button", { name: "Clear the conversation" }).click();
  await expect(panel(page).getByRole("log").locator("li")).toHaveCount(0);
});

test("the whole flow finishes with the assistant closed", async ({ page }) => {
  await toResults(page);
  await expect(panel(page)).toBeHidden();
  await page.getByRole("tab", { name: "Downloads" }).click();
  await expect(page.getByRole("tabpanel", { name: "Downloads" }).getByRole("link", { name: "Download the fix list (PDF)" })).toBeVisible();
});

test("screenshots: stage 4 panel at both widths, and the sheet", async ({ page }) => {
  await toResults(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await askButton(page).click();
  await expect(panel(page)).toBeVisible();
  await shoot(page, "stage-4", "sheet-results", { fullPage: false });
});
