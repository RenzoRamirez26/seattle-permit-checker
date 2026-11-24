import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoSidewaysScroll, expectTouchTargets, shoot, WIDTHS } from "./helpers";

const ROUTES: [string, string][] = [
  ["/", "Check your space before you sign the lease."],
  ["/business/", "What kind of business is it?"],
  ["/plan/", "Upload your floor plan"],
  ["/plan/reading/", "Reading your plan"],
  ["/check/", "Check what we read from your plan"],
  ["/results/", "Your pre-check results"],
  ["/help/", "How the pre-check works"],
];

for (const [path, heading] of ROUTES) {
  test(`${path} has its h1, title, footer, and passes axe`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page).toHaveTitle(new RegExp(heading.replace(/\.$/, "").replace(/[?]/g, "\\?")));
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("PermitOS · Not a City of Seattle service");
    await expect(page.getByRole("banner").getByRole("link", { name: "PermitOS", exact: true })).toHaveAttribute("href", "/");
    await expect(footer).not.toContainText("TODO");
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoAxeViolations(page, `${path} at ${width}`);
    }
    await expectNoSidewaysScroll(page);
    await expectTouchTargets(page);
  });
}

test("the footer shows the code edition and the date it took effect, both from /api/meta (#29)", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Rules based on the 2021 Seattle Building Code, effective November 15, 2024.");
  await expect(footer.locator("time")).toHaveAttribute("datetime", "2024-11-15");
});

test("the footer shows no date while the rulebook holds the placeholder", async ({ page }) => {
  await page.route("**/api/meta", async (route) => {
    const meta = await (await route.fetch()).json();
    await route.fulfill({ json: { ...meta, rulebook: { ...meta.rulebook, edition_date: null } } });
  });
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("Rules based on the 2021 Seattle Building Code.");
  await expect(footer.locator("time")).toHaveCount(0);
});

test("the skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/business/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("screenshots: stage 0", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("contentinfo")).toContainText("2021 Seattle");
  await shoot(page, "stage-0", "start-empty");
});

test("F3: the site has a favicon, so a first page load asks for nothing that is not there", async ({ page, request }) => {
  const missing: string[] = [];
  page.on("response", (r) => { if (r.status() === 404) missing.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const icon = page.locator('head link[rel="icon"][type="image/svg+xml"]');
  await expect(icon).toHaveCount(1);
  const svg = await request.get(new URL((await icon.getAttribute("href"))!, page.url()).href);
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"]).toBe("image/x-icon");
  await page.waitForLoadState("networkidle");
  expect(missing).toEqual([]);
});

test("F4: an address with no page gets its own title, its h1 and a 404", async ({ page }) => {
  const res = await page.goto("/no-such-page/");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("There is no page at this address");
  await expect(page).toHaveTitle("There is no page at this address | PermitOS");
  await expect(page.getByRole("link", { name: "Go to the start of the pre-check" })).toBeVisible();
});
