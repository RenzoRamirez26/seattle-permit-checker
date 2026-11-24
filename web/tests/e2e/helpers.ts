import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(__dirname, "..", "fixtures");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are API responses read as loose JSON in tests
export const fixture = <T = any>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8"));

/** axe with the WCAG 2.2 AA tags. Zero violations to pass; incomplete results are printed for a manual look. */
export async function expectNoAxeViolations(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  for (const i of r.incomplete) console.log(`axe incomplete [${label}]: ${i.id} (${i.nodes.length} nodes): ${i.help}: ${i.nodes.slice(0, 4).map((n) => `${n.target.join(" ")} (${n.any.map((a) => a.message).join("; ").slice(0, 120)})`).join(" | ")}`);
  expect(r.violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), label).toEqual([]);
}

/** Brief section 12: the page works at 320 px with no sideways scrolling. */
export async function expectNoSidewaysScroll(page: Page) {
  const old = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 800 });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "sideways scroll at 320 px").toBeLessThanOrEqual(0);
  if (old) await page.setViewportSize(old);
}

/** Brief section 12: every visible interactive element is at least 44 px tall and wide on a phone (inline text links excepted). */
export async function expectTouchTargets(page: Page) {
  const old = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 800 });
  const small = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary, [role=button], [role=radio], [tabindex='0']"));
    return els.flatMap((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!r.width || !r.height || style.visibility === "hidden") return [];
      if (el.closest(".skip-link")) return [];
      if (r.width <= 1 && r.height <= 1) return []; // visually hidden, for screen readers only (React Aria's "Dismiss")
      if ((el as HTMLInputElement).type === "radio" || (el as HTMLInputElement).type === "file") return []; // the whole card or label is the target
      const inline = el.tagName === "A" && style.display === "inline" && el.closest("p, li, dd");
      if (inline) return []; // a link inside a sentence (WCAG 2.5.8 inline exception)
      return r.height < 44 || r.width < 44 ? [`${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
    });
  });
  expect(small, "touch targets under 44 px at 375 px").toEqual([]);
  if (old) await page.setViewportSize(old);
}

/** Screenshots at 375 and 1280 px wide, 2x, under docs/screenshots/<stage>/. Only when SHOTS=1 (npm run screenshots). */
export async function shoot(page: Page, stage: string, name: string, opts: { fullPage?: boolean } = {}) {
  if (!process.env.SHOTS) return;
  const dir = join(__dirname, "..", "..", "..", "docs", "screenshots", stage);
  mkdirSync(dir, { recursive: true });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(dir, `${name}-${width}.png`), fullPage: opts.fullPage ?? true });
  }
}

export const WIDTHS = [375, 1280] as const;
