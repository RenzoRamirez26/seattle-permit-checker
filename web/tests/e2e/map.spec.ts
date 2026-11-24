import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectTouchTargets, fixture, shoot, WIDTHS } from "./helpers";

const CORS = { "access-control-allow-origin": "*" };

async function axeBoth(page: Page, label: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `${label} at ${width}`);
  }
}

/** Every request the page makes must go to the site or the API (no tile server, no geocoder from the browser). */
function hostsSeen(page: Page): Set<string> {
  const hosts = new Set<string>();
  page.on("request", (r) => { if (!r.url().startsWith("data:") && !r.url().startsWith("blob:")) hosts.add(new URL(r.url()).host); });
  return hosts;
}

async function serveZoning(page: Page, body: object) {
  const calls: object[] = [];
  await page.route("**/api/zoning", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...CORS, "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } });
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: body, headers: CORS });
  });
  return calls;
}

test("step 1: an address shows the pin and asks whether it is the right place, with no request to another host", async ({ page }) => {
  const hosts = hostsSeen(page);
  const calls = await serveZoning(page, fixture("zoning_address"));
  await page.goto("/business/");
  await page.getByText("Café or restaurant").click();
  await page.getByLabel("Street address in Seattle (optional)").fill("123 Example St, Seattle, WA");
  await page.getByLabel("Zone from the zoning map (optional)").focus();          // leaving the field looks it up
  const place = page.getByRole("region", { name: "Is this the right place?" });
  await expect(place).toContainText("Found: 123 Example St, Seattle, WA. Zone NC2-55 (M).");
  const map = page.getByRole("img", { name: "Map with a pin at 123 Example St, Seattle, WA" });
  await expect(map).toHaveAttribute("data-map-state", "drawn", { timeout: 15_000 });
  await expect(map.locator(".map-pin")).toHaveCount(1);
  expect((await map.locator("canvas").boundingBox())!.width).toBeGreaterThan(200);
  expect(calls).toEqual([{ address: "123 Example St, Seattle, WA", business_type: "cafe_restaurant" }]);
  expect([...hosts].every((h) => h.startsWith("127.0.0.1"))).toBe(true);
  await axeBoth(page, "step 1 with map");
  await expectTouchTargets(page);
  await place.scrollIntoViewIfNeeded();
  await shoot(page, "stage-5", "step-1-pin", { fullPage: false });
  await page.reload();                                                          // a refresh looks it up again
  await expect(page.getByRole("region", { name: "Is this the right place?" })).toContainText("Zone NC2-55 (M)");
});

test("step 1: an address that is not found says so and suggests the zone instead; no map", async ({ page }) => {
  await serveZoning(page, { zoning: { district: null, status: "unknown", detail: "Address not found." }, point: null, outline: null });
  await page.goto("/business/");
  await page.getByText("Retail shop").click();
  await page.getByLabel("Street address in Seattle (optional)").fill("1 Nowhere Rd");
  await page.getByLabel("Zone from the zoning map (optional)").focus();
  await expect(page.getByText("This address was not found on Seattle’s map.", { exact: false })).toBeVisible();
  await expect(page.locator(".place-map")).toHaveCount(0);
});

function checkWithAddress() {
  const check = fixture("check_cafe_flawed");
  const z = fixture("zoning_address");
  check.id = "fixture-with-address";
  check.result.zoning = z.zoning;
  return { check, z };
}

test("results: the zoning card shows the pin, the outline and the zone's name as text, and the same in words", async ({ page }) => {
  const hosts = hostsSeen(page);
  const { check, z } = checkWithAddress();
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: CORS }));
  await serveZoning(page, z);
  await page.goto(`/results/?check=${check.id}`);
  const card = page.locator("section[aria-labelledby=zoning]");
  await expect(card).toContainText("Zone: NC2-55 (M)");
  await expect(card).toContainText("Address: 123 Example St, Seattle, WA");
  const map = card.getByRole("img", { name: "Map of 123 Example St, Seattle, WA with the outline of zone NC2-55 (M)" });
  await expect(map).toHaveAttribute("data-map-state", "drawn", { timeout: 15_000 });
  await expect(map).toHaveAttribute("data-outline", "yes");
  await expect(map.locator(".map-zone-label")).toHaveText("NC2-55 (M)");         // the name is text, not only a colour
  expect(await map.locator("a, button, [tabindex]:not([tabindex='-1'])").count()).toBe(0);   // keyboard users pass straight by
  expect((await map.locator("canvas").boundingBox())!.width).toBeGreaterThan(200);        // drawn at its full width
  expect([...hosts].every((h) => h.startsWith("127.0.0.1"))).toBe(true);
  await axeBoth(page, "zoning card with map");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await map.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(300);
    if (process.env.SHOTS) await page.screenshot({ path: `../docs/screenshots/stage-5/zoning-card-${width}.png` });
  }
});

test("results: with no outline the map has the pin only, and with no point there is no map; the words stay", async ({ page }) => {
  const { check, z } = checkWithAddress();
  await page.route(`**/api/checks/${check.id}`, (route) => route.fulfill({ json: check, headers: CORS }));
  await serveZoning(page, { ...z, outline: null });
  await page.goto(`/results/?check=${check.id}`);
  const card = page.locator("section[aria-labelledby=zoning]");
  await expect(card.getByRole("img")).toHaveAttribute("data-outline", "no");
  await expect(card.locator(".map-zone-label")).toHaveCount(0);
  await expect(card).toContainText("Zone: NC2-55 (M)");

  await page.unroute("**/api/zoning");
  await serveZoning(page, { ...z, point: null, outline: null });
  await page.reload();
  await expect(card).toContainText("Zone: NC2-55 (M)");
  await page.waitForTimeout(500);
  await expect(card.locator(".place-map")).toHaveCount(0);
});

test("a zone entered by hand gives no map and no zoning request", async ({ page }) => {
  let asked = false;
  page.on("request", (r) => { if (r.url().includes("/api/zoning")) asked = true; });
  await page.goto("/plan/reading/?example=cafe_flawed");
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.locator("section[aria-labelledby=zoning]")).toContainText("Zone: NC2-55 (M)");
  await expect(page.locator(".place-map")).toHaveCount(0);
  expect(asked).toBe(false);
});
