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

test("Start: the headline, the example drawing, the step 1 form on the blue band, and How it works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check your space before you sign the lease.");
  await expect(page.getByText(/A pre-check, not a city approval\./)).toBeVisible();
  const img = page.getByRole("img", { name: "An example floor plan of a café, invented for this demo" });
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("width", /^\d+$/);
  await expect(img).toHaveAttribute("height", /^\d+$/);
  const form = page.getByRole("region", { name: "What kind of business is it?" });
  await expect(form.getByRole("radio")).toHaveCount(6);
  await expect(form.getByRole("button", { name: "Continue" })).toBeVisible();
  const how = page.getByRole("region", { name: "How it works" });
  await expect(how.getByRole("heading", { level: 3 })).toHaveText([
    "Step 1: You upload your plan", "Step 2: The model reads it", "Step 3: You confirm", "Step 4: Seattle's rules decide",
  ]);
  for (const c of fixture("meta").demo_cases) await expect(page.getByRole("link", { name: c.title })).toHaveCount(0);   // examples live on step 2
  await expect(page.getByRole("heading", { name: "What you need" })).toHaveCount(0);
  await axeBoth(page, "start");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);
  await shoot(page, "design-v3", "start");
  await form.getByText("Retail shop").click();
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/plan\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();    // focus moves to the new page's question
});

test("an example plan goes from step 2's example rows to step 3 and gives the same result as the command line", async ({ page }) => {
  await page.goto("/plan/");
  await page.getByRole("region", { name: "Try an example plan" }).getByRole("link", { name: "Café with planted problems", exact: true }).click();
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
  await expect(page.getByText(/This server can't read uploaded plans yet/)).toBeVisible();
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
  const preview = page.getByRole("region", { name: "Chosen: flawed_plan.png" });
  await expect(preview.getByRole("img", { name: "Preview of flawed_plan.png" })).toHaveAttribute("width", /^\d+$/);
  await expect(preview.getByRole("status")).toHaveText("Ready to read. It is sent only when you press Read my plan.");
  await expect(preview.getByText(/%/)).toHaveCount(0);                        // no made-up upload progress
  expect(sentToApi).toBe(false);
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
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toContainText("This server can't read uploaded plans yet. Try an example plan, or enter the measurements yourself.");
  await expect(page.getByRole("link", { name: "Enter the measurements yourself" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the example plan: Café with planted problems" })).toBeVisible();
  await axeBoth(page, "step 2 failed");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "stage-2", "plan-failed");
  await page.getByRole("link", { name: "Enter the measurements yourself" }).first().click();
  await expect(page.getByText(/^You are entering the measurements yourself\. Leave/)).toBeVisible();
});

test("with no key, step 2 lists the example plans itself instead of sending the owner back to Start", async ({ page }) => {
  const meta = fixture("meta");
  expect(meta.features.model_api_key).toBe(false);                     // the e2e API runs with no key
  await page.goto("/plan/");
  const notice = page.getByRole("region", { name: /^This server can't read uploaded plans yet\./ });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link")).toHaveText([
    "Enter the measurements yourself",
    ...meta.demo_cases.map((c: { title: string }) => `Try the example plan: ${c.title}`),
  ]);
  for (const c of meta.demo_cases as { id: string; title: string }[]) {
    await expect(notice.getByRole("link", { name: `Try the example plan: ${c.title}` })).toHaveAttribute("href", `/plan/reading/?example=${c.id}`);
  }
  await expect(page.locator('main a[href="/"]').filter({ hasNotText: "Back" })).toHaveCount(0);   // no link back to Start for the examples (Back goes to step 1)
  await axeBoth(page, "step 2 no key");
  await expectNoSidewaysScroll(page);
  await expectTouchTargets(page);

  await notice.getByRole("link", { name: "Try the example plan: Café with planted problems" }).click();
  await expect(page).toHaveURL(/\/check\/$/);
  await expect(page.getByText("The saved reading for this example plan. No model was used.")).toBeVisible();
});

test("with a key, step 2 shows no no-key notice", async ({ page }) => {
  const meta = fixture("meta");
  meta.features.model_api_key = true;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/plan/");
  await expect(page.locator("[data-state]")).toHaveAttribute("data-state", "empty");
  await expect(page.getByText(/This server can't read uploaded plans yet/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Try the example plan:/ })).toHaveCount(0);
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

test("Start over in the header clears the answers and empties Start's form", async ({ page }) => {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Café or restaurant" })).toBeChecked();   // the example's answers
  await page.getByRole("banner").getByRole("link", { name: "Start over", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Café or restaurant" })).not.toBeChecked();
  await page.goto("/check/");
  await expect(page.getByText("No plan has been read in this browser tab yet.")).toBeVisible();
});

test("F2: an example plan that replaces the owner's step 1 answers says so, and Keep my answers puts them back", async ({ page }) => {
  await page.goto("/business/");
  await page.getByText("Retail shop").click();
  await page.getByLabel("Zone from the zoning map (optional)").fill("NC3-75");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/plan\/$/);
  await page.goto("/plan/reading/?example=cafe_flawed");             // the same link as "Try the example plan" on step 2
  await expect(page).toHaveURL(/\/check\/$/);

  const notice = page.getByRole("region", { name: "The example plan uses its own answers" });
  await expect(notice).toContainText("They replaced your answers from step 1: Café or restaurant; cooking that makes grease or smoke: Yes; alcohol: No; zone NC2-55 (M).");
  await axeBoth(page, "example answers notice");
  await expectNoSidewaysScroll(page);
  await shoot(page, "verify", "check-example-answers-notice", { fullPage: false });

  await notice.getByRole("button", { name: "Keep my answers" }).click();
  const kept = page.getByRole("status").filter({ hasText: "Your answers from step 1 are kept." });
  await expect(kept).toBeFocused();
  await expect(notice).toHaveCount(0);

  const sent = page.waitForRequest((r) => r.url().endsWith("/api/checks") && r.method() === "POST");
  await page.getByRole("button", { name: "Run the check" }).click();
  const body = (await sent).postDataJSON();
  expect(body.intake.business_type).toBe("retail");
  expect(body.zoning).toEqual({ address: null, zone: "NC3-75" });
  await expect(page.getByTestId("counts")).toBeVisible();
});

test("F2: an example chosen with no step 1 answers shows no notice", async ({ page }) => {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await expect(page.getByRole("button", { name: "Run the check" })).toBeVisible();
  await expect(page.getByRole("region", { name: "The example plan uses its own answers" })).toHaveCount(0);
});

test("F7: step 1's missing business type is said once for the group, and the cards keep their usual border", async ({ page }) => {
  await page.goto("/business/");
  await expect(page.getByRole("radio")).toHaveCount(6);
  const border = () => page.locator("label:has(input[type=radio])").evaluateAll((cards) => cards.map((c) => getComputedStyle(c).borderTopColor));
  const before = await border();
  expect(before).toHaveLength(6);
  await page.getByRole("button", { name: "Continue" }).click();
  const group = page.getByRole("radiogroup", { name: "Kind of business" });
  await expect(group.getByText("Choose the kind of business.")).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "There is a problem" })).toContainText("Choose the kind of business.");
  expect(await border()).toEqual(before);
  expect(before.every((c) => c !== "rgb(179, 38, 30)")).toBe(true);          // never the Fix red
  await axeBoth(page, "step 1 error, one message");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "verify", "business-errors-fixed", { fullPage: false });
});
