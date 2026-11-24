/** Every remaining page of design v3 at 375 and 1280 px, with axe: step 1, step 2 (empty and with a file), help and 404. */
import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { expectNoAxeViolations, shoot, WIDTHS } from "./helpers";

const PLAN = join(__dirname, "..", "..", "..", "demo", "flawed_plan.png");

async function axeBoth(page: import("@playwright/test").Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

test("screenshots: step 1, step 2, help and the page that does not exist", async ({ page }) => {
  await page.goto("/business/");
  await expect(page.getByRole("radio")).toHaveCount(6);
  await axeBoth(page, "step 1");
  await shoot(page, "design-v3", "business", { fullPage: false });

  await page.goto("/plan/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upload your floor plan");
  await axeBoth(page, "step 2 empty");
  await shoot(page, "design-v3", "plan", { fullPage: false });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a file" }).click();
  await (await chooser).setFiles(PLAN);
  await expect(page.getByText("flawed_plan.png").first()).toBeVisible();
  await axeBoth(page, "step 2 with a file");
  await shoot(page, "design-v3", "plan-chosen", { fullPage: false });

  await page.goto("/help/");
  await axeBoth(page, "help");
  await shoot(page, "design-v3", "help", { fullPage: false });

  await page.goto("/no-such-page/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("There is no page at this address");
  await axeBoth(page, "not found");
  await shoot(page, "design-v3", "not-found", { fullPage: false });
});
