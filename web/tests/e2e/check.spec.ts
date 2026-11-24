import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectNoAxeViolations, expectNoSidewaysScroll, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";
import { SALON_BUSINESS, seed } from "./seed";

const root = join(__dirname, "..", "..", "..");
const python = process.env.PYTHON ?? (existsSync(join(root, ".venv/bin/python")) ? join(root, ".venv/bin/python") : "python");

/** The same check from the command line: python -m checker.audit on the same input. */
function auditCli(): { fails: number; reviews: number; passes: number } {
  const out = join(mkdtempSync(join(tmpdir(), "audit-")), "r");
  execFileSync(python, ["-m", "checker.audit", "--extraction", "demo/flawed_extraction.json", "--business", "cafe_restaurant",
    "--cooking", "--zoning", "NC2-55 (M)", "--db", join(out, "none.sqlite"), "--out", out], { cwd: root, env: { ...process.env, PYTHON_DOTENV_DISABLED: "1" } });
  return JSON.parse(readFileSync(`${out}.json`, "utf8")).summary;
}

async function axeBoth(page: import("@playwright/test").Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

for (const caseId of ["cafe_flawed", "cafe_compliant", "salon_flawed"]) {
  test(`the ${caseId} reading renders with its plan`, async ({ page }) => {
    await seed(page, { caseId, business: caseId.startsWith("salon") ? SALON_BUSINESS : undefined });
    await page.goto("/check/");
    const facts = fixture(`reading_${caseId}`).facts;
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check what we read from your plan");
    await expect(page.getByText("The saved reading for this example plan. No model was used.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Change / })).toHaveCount(4 + facts.spaces.length + facts.doors.length + facts.aisles.length + facts.restrooms.length);
    const plan = page.getByRole("img", { name: /^Example floor plan:/ });
    await expect(plan).toBeVisible();
    expect(await plan.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(100);
    await axeBoth(page, caseId);
    await expectNoSidewaysScroll(page);
    await expectTouchTargets(page);
  });
}

test("the flawed café, unchanged, gives the same counts as python -m checker.audit", async ({ page }) => {
  const cli = auditCli();
  expect(cli).toMatchObject({ fails: 11, reviews: 2, passes: 6 });
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page).toHaveURL(/\/results\/\?check=/);
  await expect(page.getByTestId("counts")).toHaveText(`${cli.fails} things to fix before you apply, ${cli.reviews} to check with the city, ${cli.passes} fine.`);
});

test("adding a second exit changes the result, and a refresh keeps the edited facts", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await page.getByRole("button", { name: "Add a door" }).click();
  const form = page.getByRole("form", { name: "Change New door" });
  await form.getByRole("textbox", { name: "Name" }).fill("Back door");
  await form.getByRole("textbox", { name: /Clear width/ }).fill("36");
  await form.getByRole("radiogroup", { name: "Is it an exit to the outside?" }).getByText("Yes").click();
  await form.getByRole("radiogroup", { name: "Which way it opens" }).getByText("Outward, away from the room").click();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Back door" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Back door" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Back door" })).toContainText("Yes");

  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
  await expect(page.getByTestId("counts")).not.toHaveText(/^11 things to fix/);
});

test("keyboard only: from the first Change to Run the check", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  const firstChange = page.getByRole("button", { name: /^Change / }).first();
  await expect(firstChange).toBeVisible();
  for (let i = 0; i < 40 && !(await firstChange.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(firstChange).toBeFocused();
  await page.keyboard.press("Enter");
  const title = page.getByRole("textbox", { name: "Title on the plan" });
  await expect(title).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("textbox", { name: /Overall width/ })).toBeFocused();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("41");
  await page.keyboard.press("Enter");                          // Enter in a field saves the row
  await expect(firstChange).toBeFocused();                     // focus returns to Change
  await expect(page.getByText(/Changed by you/).first()).toBeVisible();
  const run = page.getByRole("button", { name: "Run the check" });
  for (let i = 0; i < 80 && !(await run.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(run).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/results\/\?check=/);
});

test("an error shows next to the field and in the summary, which links to it", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await page.getByRole("button", { name: "Change Door 1" }).click();
  await page.getByRole("textbox", { name: /Clear width/ }).fill("wide");
  await page.getByRole("button", { name: "Save changes" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary).toContainText("Door 1: Enter the clear width as a number, or leave it empty if you are not sure.");
  await expect(page.getByRole("textbox", { name: /Clear width/ })).toBeFocused();
  await axeBoth(page, "error summary");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "stage-1", "error-summary", { fullPage: false });
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(summary).toContainText("Save or cancel the change you are making first.");
  await summary.getByRole("link", { name: /Door 1: Enter the clear width/ }).click();
  await expect(page.getByRole("textbox", { name: /Clear width/ })).toBeFocused();
});

test("manual entry starts with every fact empty and can still run the check", async ({ page }) => {
  await page.addInitScript((b) => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); sessionStorage.setItem("precheck.business", JSON.stringify(b)); } }, SALON_BUSINESS);
  await page.goto("/check/?enter=yourself");
  await expect(page.getByText(/^You are entering the measurements yourself\. Leave/)).toBeVisible();
  await expect(page.getByText("None read from the plan.")).toHaveCount(4);
  await expect(page.getByText(/There is no plan here because you are entering the measurements yourself/)).toBeVisible();
  await axeBoth(page, "manual entry");
  await shoot(page, "stage-1", "manual-entry", { fullPage: false });
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
});

test("after a refresh an uploaded plan is gone but the facts stay, and the file can be chosen again", async ({ page }) => {
  const reading = { ...fixture("reading_cafe_flawed"), source: "vision_model", case_id: null, file_name: "my-plan.png" };
  await seed(page, { reading });
  await page.goto("/check/");
  await expect(page.getByText("The plan is not kept after a refresh. Choose the file again to see it here. It was my-plan.png.")).toBeVisible();
  await expect(page.getByText("Read by the vision model. Check every value against your plan.")).toBeVisible();
  await axeBoth(page, "refresh without plan");
  await shoot(page, "stage-1", "refresh-without-plan", { fullPage: false });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose the plan file" }).click();
  await (await chooser).setFiles(join(root, "demo", "flawed_plan.png"));
  await expect(page.getByRole("img", { name: "Your floor plan: flawed_plan.png" })).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("150%")).toBeVisible();
});

test("screenshots: stage 1", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await expect(page.getByRole("img", { name: /^Example floor plan:/ })).toBeVisible();
  await shoot(page, "stage-1", "cafe-reading", { fullPage: false });
  await shoot(page, "stage-1", "cafe-reading-full");
  await page.getByRole("button", { name: "Change Door 1" }).click();
  await page.getByRole("heading", { name: "Doors" }).evaluate((el) => el.scrollIntoView());
  await axeBoth(page, "row in Change state");
  await shoot(page, "stage-1", "row-change", { fullPage: false });
});
