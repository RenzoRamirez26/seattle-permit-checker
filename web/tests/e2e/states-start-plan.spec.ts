import { expect, test, type FileChooser, type Page } from "@playwright/test";
import { join } from "node:path";
import { expectNoAxeViolations, expectNoSidewaysScroll, fixture, shoot, WIDTHS } from "./helpers";

const PLAN = join(__dirname, "..", "..", "..", "demo", "flawed_plan.png");
const CORS = { "access-control-allow-origin": "*" };

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

async function chooseFile(page: Page, files: Parameters<FileChooser["setFiles"]>[0]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Choose a (different )?file$/ }).click();
  await (await chooser).setFiles(files);
}

test("Checking: the real steps, Read the plan as the current step, and a bar with no value", async ({ page }) => {
  const reading = { ...fixture("reading_cafe_flawed"), source: "vision_model", source_label: "the vision model", case_id: null };
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  await page.route("**/api/plans/read", async (route) => {
    await Promise.all([new Promise((r) => setTimeout(r, 2000)), gate]);     // at least 2 s, and until the checks below are done
    await route.fulfill({ json: reading, headers: CORS });
  });
  await page.goto("/plan/");
  await chooseFile(page, PLAN);
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reading your plan");

  const steps = page.getByRole("list", { name: "Where the check is" });
  await expect(steps.getByRole("listitem")).toHaveText([/^Upload your plan/, /^Read the plan$/, /^Confirm the readings$/, /^Run Seattle's rules$/]);
  await expect(steps.getByRole("listitem").first()).toContainText("(done)");
  await expect(steps.locator('[aria-current="step"]')).toHaveCount(1);
  await expect(steps.locator('[aria-current="step"]')).toHaveText("Read the plan");

  const bar = page.getByRole("progressbar", { name: "Reading your plan" });
  await expect(bar).toBeVisible();
  await expect(bar).not.toHaveAttribute("aria-valuenow");
  await expect(page.getByRole("status").filter({ hasText: "Reading flawed_plan.png." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel" })).toBeVisible();

  // The bar slides; with reduced motion it stands still.
  const animation = () => bar.locator("span").evaluate((el) => getComputedStyle(el).animationName);
  expect(await animation()).not.toBe("none");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await axeBoth(page, "checking");
  await shoot(page, "design-v3", "checking", { fullPage: false });
  release();
  await expect(page).toHaveURL(/\/check\/$/, { timeout: 15_000 });
});

test("a plan the model couldn't read: two suggestions, Upload another plan, and Enter the readings by hand", async ({ page }) => {
  const body = fixture("error_plan_reading_failed").body;
  await page.route("**/api/plans/read", (route) => route.fulfill({ status: 422, json: body, headers: CORS }));
  await page.goto("/plan/");
  await chooseFile(page, PLAN);
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/\?problem=plan_reading_failed$/);
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "unreadable");

  const section = page.getByRole("region", { name: "We couldn't read this plan" });
  await expect(section.getByRole("heading", { level: 2 })).toHaveText("We couldn't read this plan");
  await expect(section.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(section.getByRole("listitem")).toHaveText([
    "Upload a clearer scan or photo, taken straight on.",
    "Check that room sizes and door widths are written on the plan.",
  ]);
  await expect(section.getByRole("button", { name: "Upload another plan" })).toBeVisible();
  await expect(section.getByRole("link", { name: "Enter the readings by hand" })).toHaveAttribute("href", "/check/?enter=yourself");
  await expect(page.getByRole("heading", { name: "Other ways to go on" })).toHaveCount(0);   // that is for the other problems

  await axeBoth(page, "plan unreadable");
  await expectNoSidewaysScroll(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "design-v3", "plan-unreadable");

  // Upload another plan forgets the old file and opens the file chooser straight away.
  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "Upload another plan" }).click();
  await (await chooser).setFiles(PLAN);
  await expect(page).toHaveURL(/\/plan\/$/);
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "chosen");
  await expect(page.getByText("Chosen: flawed_plan.png")).toBeVisible();
});

test("Enter the readings by hand opens step 3 empty", async ({ page }) => {
  await page.goto("/plan/?problem=plan_reading_failed");
  await page.getByRole("link", { name: "Enter the readings by hand" }).click();
  await expect(page).toHaveURL(/\/check\//);
  await expect(page.getByText(/^You are entering the measurements yourself\. Leave/)).toBeVisible();
});

test("header: the step nav marks the current step, links done steps, and shrinks on phones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/plan/");
  const nav = page.getByRole("navigation", { name: "Steps" });
  await expect(nav.locator('[aria-current="step"]')).toHaveText("2 Plan");
  await expect(nav.getByRole("link", { name: "1 Start" })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link")).toHaveCount(1);                      // Answers and Results are later steps
  await expect(page.getByRole("banner").getByRole("link", { name: "Help", exact: true })).toHaveAttribute("href", "/help/");
  await expect(page.getByText("Step 2 of 4", { exact: true })).toBeVisible();   // the step line above the h1

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(nav).toContainText("Step 2 of 4: Plan");
  await expectNoSidewaysScroll(page);
  await shoot(page, "design-v3", "header-plan", { fullPage: false });

  // The results step links only when this tab holds a check id; on help no step is current.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/help/");
  await expect(nav.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "4 Results" })).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem("precheck.check", JSON.stringify("abc123")));
  await page.goto("/help/");
  await expect(nav.getByRole("link", { name: "4 Results" })).toHaveAttribute("href", "/results/?check=abc123");
});
