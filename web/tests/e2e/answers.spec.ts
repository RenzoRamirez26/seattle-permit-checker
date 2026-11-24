/**
 * The Answers page (step 3, design v3): "Check these first", "Also used in the check", "About your business",
 * the Yes / No / Not sure pills, the caption over the plan, and the status while the check runs.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";
import { seed } from "./seed";

const TINT = "rgb(232, 239, 248)";
const BLUE = "rgb(31, 78, 140)";
const WHITE = "rgb(255, 255, 255)";

/** The rows the café reading left empty: restroom rooms and the corridor (no area), restroom doors (swing unknown),
 *  the kitchen (grease interceptor), fire safety (emergency lighting) and the seats (accessible seats). */
const UNSURE = ["Restroom 1", "Restroom 2", "Corridor", "Restroom 1 door", "Restroom 2 door",
  "Kitchen and food preparation", "Fire safety on the plan", "Customer seating"];

const checkFirst = (page: Page) => page.getByRole("region", { name: "Check these first" });
const alsoUsed = (page: Page) => page.getByRole("region", { name: "Also used in the check" });
const rowsOf = (region: ReturnType<typeof checkFirst>) => region.locator("li[id]");

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

async function pillStyle(page: Page, group: string, option: string) {
  return page.getByRole("radiogroup", { name: group }).locator("label").filter({ hasText: new RegExp(`^${option}$`) })
    .evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, border: s.borderTopColor, weight: s.fontWeight, height: el.getBoundingClientRect().height }; });
}

test("Check these first lists the rows the reading left empty, first, each with the line and the ? mark", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  const first = checkFirst(page);
  await expect(first).toBeVisible();
  await expect(rowsOf(first).locator("h3")).toHaveText(UNSURE);
  for (const row of await rowsOf(first).all()) {
    await expect(row.getByText("We're not sure we read this right.")).toBeVisible();
    await expect(row.locator('svg[data-mark="city"]')).toHaveCount(1);
    await expect(row.getByText("Not sure").first()).toBeVisible();
  }
  await expect(first.getByText(fixture("reading_cafe_flawed").facts.uncertainties[0])).toBeVisible();
  // It comes before every other row: the first Change on the page is in it.
  await expect(page.getByRole("button", { name: /^Change / }).first()).toHaveAccessibleName("Change Restroom 1");
  const [a, b] = await Promise.all([first.boundingBox(), alsoUsed(page).boundingBox()]);
  expect(a!.y).toBeLessThan(b!.y);
});

test("a row in Check these first is changed in one step, and then says Changed by you", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await checkFirst(page).getByRole("button", { name: "Change Customer seating" }).click();
  await expect(page.getByRole("textbox", { name: "Seats", exact: true })).toBeFocused();   // the form opens, focus in its first field
  const field = page.getByRole("textbox", { name: /Seats at accessible tables/ });
  await field.fill("6");
  await page.keyboard.press("Enter");
  const row = checkFirst(page).getByRole("listitem", { name: "Customer seating" });
  await expect(row.getByText(/^Changed by you/)).toBeVisible();
  await expect(row.getByText("We're not sure we read this right.")).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Change Customer seating" })).toBeFocused();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("precheck.facts")!).accessible_seat_count)).toBe(6);
});

test("Also used in the check holds every other row, each with Change and no unsure line", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  const facts = fixture("reading_cafe_flawed").facts;
  const total = 4 + facts.spaces.length + facts.doors.length + facts.aisles.length + facts.restrooms.length;
  const also = alsoUsed(page);
  await expect(also.getByRole("button", { name: /^Change / })).toHaveCount(total - UNSURE.length);
  await expect(also.getByText("We're not sure we read this right.")).toHaveCount(0);
  await expect(also.getByRole("button", { name: "Change Door 1" })).toBeVisible();
  for (const name of ["Overall size", "Rooms", "Doors", "Aisles and routes", "Restrooms"]) {
    await expect(also.getByRole("heading", { name, level: 3 })).toBeVisible();
  }
  for (const add of ["Add a room", "Add a door", "Add an aisle or route", "Add a restroom"]) {
    await expect(also.getByRole("button", { name: add })).toBeVisible();
  }
});

test("About your business shows the step 1 answers and links back to step 1", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  const about = page.getByRole("region", { name: "About your business" });
  const answers = about.getByTestId("business-answers");
  await expect(answers.locator("div").first()).toHaveText(/Kind of business\s*Café or restaurant/);
  await expect(answers.locator("div").filter({ hasText: "Will there be cooking that makes grease or smoke?" }).locator("dd")).toHaveText("Yes");
  await expect(answers.locator("div").filter({ hasText: "Will you serve alcohol?" }).locator("dd")).toHaveText("No");
  await expect(answers.locator("div").last()).toHaveText(/Zone\s*NC2-55 \(M\)/);
  const change = about.getByRole("link", { name: "Change your answers about your business" });
  await expect(change).toHaveText("Change");
  await change.click();
  await expect(page).toHaveURL(/\/business\/$/);
});

test("About your business says so when step 1 was not answered", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed", business: null });
  await page.goto("/check/");
  const about = page.getByRole("region", { name: "About your business" });
  await expect(about.getByText("You haven't answered the questions about your business yet.")).toBeVisible();
  await expect(about.getByRole("link", { name: "Answer them" })).toHaveAttribute("href", /\/business\/?$/);
});

test("Not sure as a chosen pill: tint, blue text, blue edge; arrow keys move the choice", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await page.getByRole("button", { name: "Change Fire safety on the plan" }).click();
  const group = "Emergency lighting noted";
  const notSure = page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: "Not sure" });
  await expect(notSure).toBeChecked();                                     // the reading left it empty
  const chosen = await pillStyle(page, group, "Not sure");
  expect(chosen).toMatchObject({ bg: TINT, color: BLUE, border: BLUE, weight: "500" });
  expect(chosen.height).toBeGreaterThanOrEqual(48);
  const yes = await pillStyle(page, group, "Yes");
  expect(yes).toMatchObject({ bg: WHITE, border: "rgb(138, 143, 150)", weight: "400" });

  await notSure.focus();
  await page.keyboard.press("ArrowLeft");
  const no = page.getByRole("radiogroup", { name: group }).getByRole("radio", { name: "No", exact: true });
  await expect(no).toBeChecked();
  await expect(no).toBeFocused();
  expect(await pillStyle(page, group, "No")).toMatchObject({ bg: TINT, color: BLUE });
  expect((await pillStyle(page, group, "Not sure")).bg).toBe(WHITE);
  // The chosen pill keeps its size: the 2 px edge is a border plus an inset ring.
  expect((await pillStyle(page, group, "No")).height).toBe(chosen.height);
  await page.keyboard.press("ArrowRight");
  await expect(notSure).toBeChecked();
  expect((await pillStyle(page, group, "Not sure")).bg).toBe(TINT);
  await page.getByRole("heading", { name: "Check these first" }).scrollIntoViewIfNeeded();
  await shoot(page, "design-v3", "answers-not-sure-pill", { fullPage: false });
});

test("Not sure on step 1 has the same chosen style", async ({ page }) => {
  await page.goto("/business/");
  await page.getByRole("radiogroup", { name: "Kind of business" }).getByText("Café or restaurant", { exact: true }).click();
  const card = await page.getByRole("radiogroup", { name: "Kind of business" }).locator("label").filter({ hasText: /^Café or restaurant$/ })
    .evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius }; });
  expect(card).toMatchObject({ bg: TINT, color: BLUE });
  expect(parseFloat(card.radius)).toBeGreaterThan(100);                    // a pill
  await page.getByRole("radiogroup", { name: /alcohol/ }).getByText("Not sure", { exact: true }).click();
  expect(await pillStyle(page, "Will you serve alcohol?", "Not sure")).toMatchObject({ bg: TINT, color: BLUE, border: BLUE });
  await shoot(page, "design-v3", "business-pills", { fullPage: false });
});

test("the caption over the plan names the reading being changed and where it is, in words", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  const caption = page.getByTestId("plan-caption");
  await expect(caption).toHaveAttribute("aria-live", "polite");
  await expect(caption).toBeEmpty();
  await page.getByRole("button", { name: "Change Restroom 1 door" }).click();
  await expect(caption).toHaveText("Selected: Restroom 1 door. Where: off corridor.");
  // The caption sits above the picture.
  const [c, img] = await Promise.all([caption.boundingBox(), page.getByRole("img", { name: /^Example floor plan:/ }).boundingBox()]);
  expect(c!.y + c!.height).toBeLessThanOrEqual(img!.y);
  await shoot(page, "design-v3", "answers-caption", { fullPage: false });
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Change Kitchen and food preparation" }).focus();
  await expect(caption).toHaveText("Selected: Kitchen and food preparation. Where: not marked on the plan.");
});

test("while the check runs, a status says Seattle's rules are running", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.route("**/api/checks", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/check/");
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Running Seattle's rules on your readings…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Running the check…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/results\/\?check=/);
});

test("axe, touch targets and screenshots: the Answers page at 375 and 1280 px", async ({ page }) => {
  await seed(page, { caseId: "cafe_flawed" });
  await page.goto("/check/");
  await expect(page.getByRole("img", { name: /^Example floor plan:/ })).toBeVisible();
  await axeBoth(page, "answers");
  await expectTouchTargets(page);
  await shoot(page, "design-v3", "answers", { fullPage: false });
  await shoot(page, "design-v3", "answers-full");
  await checkFirst(page).getByRole("button", { name: "Change Restroom 1 door" }).click();
  await axeBoth(page, "answers, a row open");
  await shoot(page, "design-v3", "answers-change", { fullPage: false });
});

test("a reading with nothing left empty and no notes has no Check these first group", async ({ page }) => {
  const reading = structuredClone(fixture("reading_salon_flawed"));
  const f = reading.facts;
  f.uncertainties = [];
  f.accessible_seat_count = 0;
  f.seat_count = 6;
  f.fire_safety = { ...f.fire_safety, class_k_extinguisher_shown: false, emergency_lighting_noted: false };
  f.kitchen = { ...f.kitchen, grease_interceptor_shown: false, hand_sinks: 1, mop_or_service_sink: true, three_compartment_sink: false, type1_hood_shown: false };
  f.doors = f.doors.map((d: object) => ({ ...d, swing: "outward" }));
  f.spaces = f.spaces.map((s: object) => ({ ...s, area_sqft: 50, width_ft: 5, length_ft: 10 }));
  await seed(page, { reading });
  await page.goto("/check/");
  await expect(page.getByRole("button", { name: "Run the check" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check these first" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Used in the check", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Change / }).first()).toHaveAccessibleName("Change The whole space");
});
