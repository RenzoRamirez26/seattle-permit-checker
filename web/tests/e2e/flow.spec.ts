import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { expectNoAxeViolations, expectNoSidewaysScroll, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";

const PLAN = join(__dirname, "..", "..", "..", "demo", "flawed_plan.png");

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

async function chooseFile(page: Page, files: Parameters<import("@playwright/test").FileChooser["setFiles"]>[0]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^Choose a (different )?file$/ }).click();
  await (await chooser).setFiles(files);
}

test("Start: text, the example plans from the API, and the Start button", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your floor plan before you apply");
  await expect(page.getByText(/not a City of Seattle service/).first()).toBeVisible();
  for (const c of fixture("meta").demo_cases) await expect(page.getByRole("link", { name: c.title })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(0);                     // text only until Q5
  await axeBoth(page, "start");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await shoot(page, "stage-2", "start");
  await page.getByRole("link", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/business\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();    // focus moves to the new page's question
});

test("an example plan goes from Start to step 3 and gives the same result as the command line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Café with planted problems" }).click();
  await expect(page).toHaveURL(/\/check\/$/);
  await expect(page.getByText("The saved reading for this example plan. No model was used.")).toBeVisible();
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toHaveText("11 things to fix before you apply, 2 to check with the city, 6 fine.");
});

test("step 1: errors next to the field and in the summary; Back and refresh keep the answers; Not sure is sent as null", async ({ page }) => {
  await page.goto("/business/");
  await expect(page.getByRole("radio")).toHaveCount(6);
  await axeBoth(page, "step 1 empty");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await shoot(page, "stage-2", "business-empty");

  await page.getByRole("button", { name: "Continue" }).click();
  const summary = page.getByRole("alert").filter({ hasText: "There is a problem" });
  await expect(summary).toContainText("Choose the kind of business.");
  await expect(page.getByRole("radio").first()).toBeFocused();
  await page.getByText("Café or restaurant").click();
  await page.getByLabel("Zone from the zoning map (optional)").fill("NC2-55 (M)");
  await page.route("**/api/zoning", (route) => route.fulfill({ json: fixture("zoning_address"), headers: { "access-control-allow-origin": "*" } }));
  await page.getByLabel("Street address in Seattle (optional)").fill("1420 5th Ave");
  await page.keyboard.press("Tab");                                            // leaving the address looks it up (stage 5)
  await expect(page.getByRole("region", { name: "Is this the right place?" })).toContainText("Found:");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(summary).toContainText("Answer whether there will be cooking that makes grease or smoke, or choose Not sure.");
  await expect(summary).toContainText("Answer whether you will serve alcohol, or choose Not sure.");
  await expect(summary).toContainText("Enter an address or a zone, not both.");
  await axeBoth(page, "step 1 errors");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "stage-2", "business-errors");

  await summary.getByRole("link", { name: /cooking/ }).click();
  await expect(page.getByRole("radiogroup", { name: /cooking/ }).getByRole("radio").first()).toBeFocused();
  await page.getByRole("radiogroup", { name: /cooking/ }).getByText("Yes", { exact: true }).click();
  await page.getByRole("radiogroup", { name: /alcohol/ }).getByText("Not sure", { exact: true }).click();
  await page.getByLabel("Street address in Seattle (optional)").fill("");
  await page.getByRole("button", { name: "A few more questions (optional)" }).click();
  await page.getByRole("radiogroup", { name: /tables or chairs outside/ }).getByText("No", { exact: true }).click();

  await page.reload();                                                          // refresh keeps what was entered
  await expect(page.getByRole("radio", { name: "Café or restaurant" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: /alcohol/ }).getByRole("radio", { name: "Not sure" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: /tables or chairs outside/ }).getByRole("radio", { name: "No", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/plan\/$/);
  await page.getByRole("link", { name: "Back" }).click();                      // Back keeps it
  await expect(page.getByRole("radiogroup", { name: /cooking/ }).getByRole("radio", { name: "Yes" })).toBeChecked();
  await expect(page.getByLabel("Zone from the zoning map (optional)")).toHaveValue("NC2-55 (M)");

  // The check request carries null for Not sure and for the unanswered optional questions, false for No.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/plan\/$/);
  const reading = fixture("reading_cafe_flawed");
  await page.evaluate((r) => { sessionStorage.setItem("precheck.reading", JSON.stringify(r)); sessionStorage.setItem("precheck.facts", JSON.stringify(r.facts)); }, reading);
  await page.goto("/check/");
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/checks") && r.method() === "POST");
  await page.getByRole("button", { name: "Run the check" }).click();
  const intake = (await sent).postDataJSON().intake;
  expect(intake).toEqual({ business_type: "cafe_restaurant", cooking_on_site: true, serves_alcohol: null, food_prep: false,
    outdoor_seating: false, upper_floor: null, historic_district: null, new_signage: null });
  await expect(page.getByTestId("counts")).toBeVisible();
});

test("step 2: empty, chosen, refused before sending, and read states", async ({ page }) => {
  await page.goto("/plan/");
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "empty");
  await expect(page.getByText(/This server cannot read uploaded plans yet/)).toBeVisible();
  await axeBoth(page, "step 2 empty");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await shoot(page, "stage-2", "plan-empty");

  let sentToApi = false;
  page.on("request", (r) => { if (r.url().includes("/api/plans/read")) sentToApi = true; });
  await chooseFile(page, { name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(12 * 1024 * 1024, 1) });
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toContainText("The file is 12 MB and the limit is 10 MB.");
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toContainText("Choose your floor plan file first.");
  expect(sentToApi).toBe(false);                                               // refused before upload
  await axeBoth(page, "step 2 refused");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "stage-2", "plan-refused");

  await chooseFile(page, PLAN);
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "chosen");
  await expect(page.getByText("Chosen: flawed_plan.png")).toBeVisible();
  await axeBoth(page, "step 2 chosen");
  await shoot(page, "stage-2", "plan-chosen");

  await page.goto("/plan/reading/?example=salon_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.goto("/plan/");
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "read");
  await expect(page.getByText("Already read: Hair salon with planted problems.")).toBeVisible();
  await axeBoth(page, "step 2 read");
  await shoot(page, "stage-2", "plan-read");
});

test("with no key, the upload path shows the no_model_key message and offers the examples and manual entry", async ({ page }) => {
  await page.goto("/plan/");
  await chooseFile(page, PLAN);
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/\?problem=no_model_key$/);           // the real API answered 503
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "failed");
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toContainText("This server cannot read uploaded plans yet. Try an example plan, or enter the measurements yourself.");
  await expect(page.getByRole("link", { name: "Enter the measurements yourself" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the example plan: Café with planted problems" })).toBeVisible();
  await axeBoth(page, "step 2 failed");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "stage-2", "plan-failed");
  await page.getByRole("link", { name: "Enter the measurements yourself" }).first().click();
  await expect(page.getByText(/^You are entering the measurements yourself\. Leave/)).toBeVisible();
});

test("an uploaded plan read by the model (intercepted 200) opens step 3 with the plan beside the facts", async ({ page }) => {
  const reading = { ...fixture("reading_cafe_flawed"), source: "vision_model", source_label: "the vision model", case_id: null };
  let form = "";
  await page.route("**/api/plans/read", async (route) => {
    form = route.request().postData() ?? "";
    await new Promise((r) => setTimeout(r, 2000));
    await route.fulfill({ json: reading, headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/business/");
  await page.getByText("Café or restaurant").click();
  await page.getByRole("radiogroup", { name: /cooking/ }).getByText("Yes", { exact: true }).click();
  await page.getByRole("radiogroup", { name: /alcohol/ }).getByText("No", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await chooseFile(page, PLAN);
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reading your plan");
  await expect(page.getByRole("status")).toContainText("Reading flawed_plan.png.");
  await axeBoth(page, "reading");
  await shoot(page, "stage-2", "reading", { fullPage: false });
  await expect(page).toHaveURL(/\/check\/$/, { timeout: 15_000 });
  expect(form).toContain('name="file"; filename="flawed_plan.png"');
  expect(form).toContain('name="business_type"');
  await expect(page.getByText("Read by the vision model. Check every value against your plan.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Your floor plan: flawed_plan.png" })).toBeVisible();
});

test("Cancel on the Reading page stops the request and returns to step 2", async ({ page }) => {
  await page.route("**/api/plans/read", () => { /* never answers */ });
  await page.goto("/plan/");
  await chooseFile(page, PLAN);
  await page.getByRole("button", { name: "Read my plan", exact: true }).click();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/plan\/$/);
  await expect(page.getByText("Chosen: flawed_plan.png")).toBeVisible();      // the file is still chosen
});

test("refresh on the Reading page says the file is gone and links back", async ({ page }) => {
  await page.goto("/plan/reading/");
  await expect(page.getByText("There is no plan to read. The plan file is not kept after a refresh.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Choose your floor plan" })).toBeVisible();
});

test("Start again clears the answers", async ({ page }) => {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.goto("/");
  await page.getByRole("button", { name: "Start again (clears your answers)" }).click();
  await expect(page.getByRole("button", { name: /Start again/ })).toHaveCount(0);
  await page.goto("/check/");
  await expect(page.getByText("No plan has been read in this browser tab yet.")).toBeVisible();
});
