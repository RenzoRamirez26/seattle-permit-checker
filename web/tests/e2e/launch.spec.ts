/**
 * Launch readiness in the built site (served by scripts/serve-out.mjs with vercel.json's headers): the security
 * headers and the Content-Security-Policy hold while the whole flow runs, the legal pages are linked, every page has
 * its title, description and canonical URL, robots.txt and sitemap.xml exist, images have alt text, and the 404 page.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shoot } from "./helpers";

const PAGES = ["/", "/business/", "/plan/", "/plan/reading/", "/check/", "/results/", "/help/", "/privacy/", "/terms/"];
const NOINDEX = new Set(["/plan/reading/", "/check/", "/results/"]);
const vercel = JSON.parse(readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"));

/** Fails the test on any Content-Security-Policy violation the page reports. */
function watchCsp(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|frame|create)/i.test(m.text())) seen.push(m.text());
  });
  page.on("pageerror", (e) => seen.push(`page error: ${e.message}`));
  return seen;
}

test("the static site sends the security headers and a per-page CSP with no unsafe-inline scripts", async ({ page, request }) => {
  const r = await request.get("/");
  for (const h of vercel.headers[0].headers) expect(r.headers()[h.key.toLowerCase()], h.key).toBe(h.value);
  expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(r.headers()["permissions-policy"]).toContain("microphone=(self)");
  expect(r.headers()["permissions-policy"]).toContain("camera=()");
  await page.goto("/");
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval' 'sha256-/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:8765/);
  expect(csp).toContain("object-src 'none'");
});

test("the whole flow runs under the CSP with no violation: example plan, check, results, assistant", async ({ page }) => {
  const violations = watchCsp(page);
  await page.goto("/plan/");
  await page.getByRole("region", { name: "Try an example plan", exact: true })
    .getByRole("link", { name: "Café with planted problems", exact: true }).click();
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
  await page.getByRole("button", { name: "Ask about this: Add a second exit" }).click();
  const panel = page.getByRole("dialog", { name: "Ask about the pre-check" });
  await page.keyboard.press("Control+Enter");
  await expect(panel.getByRole("log")).toContainText("Written from your result");     // the API answered under the CSP
  for (const path of ["/", "/help/", "/privacy/", "/terms/"]) await page.goto(path);
  expect(violations).toEqual([]);
});

test("every page has a title, a description and a canonical URL; flow pages are noindex", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page, path).toHaveTitle(/PermitOS/);
    expect((await page.locator('meta[name="description"]').getAttribute("content"))?.length, path).toBeGreaterThan(40);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute("href", new RegExp(`${path.replace(/\//g, "\\/")}$`));
    await expect(page.locator('meta[property="og:image"]'), path).toHaveAttribute("content", /\/og\.png$/);
    await expect(page.locator('meta[name="twitter:card"]'), path).toHaveAttribute("content", "summary_large_image");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots, path).toBe(NOINDEX.has(path) ? "noindex, follow" : "index, follow");
    for (const img of await page.locator("img").all()) expect(await img.getAttribute("alt"), path).not.toBeNull();
  }
});

test("robots.txt, the sitemap, the icons and the social image are there", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /api/");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/", "/help/", "/privacy/", "/terms/"]) expect(sitemap).toContain(`${path}</loc>`);
  for (const path of ["/results/", "/check/"]) expect(sitemap).not.toContain(`${path}</loc>`);
  for (const [path, type] of [["/og.png", "image/png"], ["/favicon.ico", "image/x-icon"], ["/apple-icon.png", "image/png"],
    ["/icon-192.png", "image/png"], ["/icon-512.png", "image/png"], ["/icon.svg", "image/svg+xml"]]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()["content-type"], path).toBe(type);
  }
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512", "any"]);
});

test("the footer links to Privacy and Terms, and they say what the brief asks", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy");
  const main = page.getByRole("main");
  for (const words of ["Claude API, run by Anthropic", "deleted as soon as the reading ends", "kept for 30 days",
    "never leaves your device", "our server only", "We set no cookies", "Counting visits"]) await expect(main).toContainText(words);
  await expect(main.getByRole("link", { name: /@|\[contact email\]/ })).toHaveAttribute("href", /^mailto:/);
  await shoot(page, "launch", "privacy", { fullPage: true });
  await page.goto("/");
  await footer.getByRole("link", { name: "Terms" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms");
  for (const words of ["not a city approval", "Not a City of Seattle service", "Not legal or professional advice",
    "You stay responsible for your application", "No warranty"]) await expect(page.getByRole("main")).toContainText(words, { ignoreCase: true });
  await shoot(page, "launch", "terms", { fullPage: true });
});

test("the custom 404 page is served with a 404 status", async ({ page }) => {
  const r = await page.goto("/no-such-page/");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("There is no page at this address");
  await expect(page.getByRole("link", { name: "Go to the start of the pre-check" })).toHaveAttribute("href", "/");
});

test("Start has one call to action: Start the pre-check", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Start the pre-check" })).toHaveCount(1);
  await expect(main.getByRole("button", { name: "Continue" })).toHaveCount(0);
});

test("an address without a street number is caught before anything is sent", async ({ page }) => {
  await page.goto("/business/");
  await page.getByText("Retail shop").click();
  await page.getByLabel("Street address in Seattle (optional)").fill("Pike Place Market");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter the street number and the street, for example 1420 5th Ave.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/business\/$/);
});
