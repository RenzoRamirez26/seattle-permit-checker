// Session 4 checks 3 and 6: walk every page at 375 and 1280 px, screenshot, axe, design measurements;
// the whole flow with the assistant closed for each demo plan; and once with the keyboard only.
// Run from the repository root with the API and the built site running:
//   node docs/verification/walk.mjs <web base> <api base> <screenshot dir> <out json>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const require = createRequire(join(ROOT, "web", "package.json"));
const { chromium } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const [WEB = "http://127.0.0.1:3000", API = "http://127.0.0.1:8000", SHOTS = "shots", OUT = "walk.json"] = process.argv.slice(2);
mkdirSync(SHOTS, { recursive: true });
const report = { pages: [], flows: [], keyboard: null, errors: [] };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console ${page.url()}: ${m.text().slice(0, 200)}`); });
  page.on("response", (r) => { if (r.status() >= 400) report.errors.push(`http ${r.status()} ${r.request().method()} ${r.url()}`); });
  return page;
}

async function axe(page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  const fmt = (v) => ({ id: v.id, impact: v.impact, tags: v.tags.filter((t) => t.startsWith("wcag") || t === "best-practice"), help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 6) });
  return { violations: r.violations.map(fmt), incomplete: r.incomplete.map(fmt) };
}

/** Measurements for the brief's section 12 and the Vercel guidelines, read from the live page. */
async function measure(page) {
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"; };
    const interactive = [...document.querySelectorAll("a, button, input, select, textarea, summary, [role=button], [role=radio], [tabindex='0']")].filter(vis);
    const small = interactive.flatMap((el) => {
      if (el.closest(".skip-link")) return [];
      if (el.type === "radio" || el.type === "file") return [];
      if (el.type === "checkbox") { const l = el.closest("label")?.getBoundingClientRect(); if (l && l.height >= 44 && l.width >= 44) return []; }
      const s = getComputedStyle(el);
      if (el.tagName === "A" && s.display === "inline" && el.closest("p, li, dd")) return [];
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44 ? [`${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
    });
    const inputsUnder16 = [...document.querySelectorAll("input:not([type=radio]):not([type=checkbox]):not([type=file]), textarea, select")].filter(vis)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.name || el.id);
    const transitionAll = [...document.querySelectorAll("*")].filter((el) => /(^|,\s*)all(\s|,|$)/.test(getComputedStyle(el).transitionProperty) && getComputedStyle(el).transitionDuration !== "0s")
      .map((el) => el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "")).slice(0, 5);
    const text = document.body.innerText;
    const banned = ["please", "sorry", "invalid", "oops"].filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
    const threeDots = (text.match(/\.\.\./g) || []).length;
    const genericButtons = [...document.querySelectorAll("button, a")].filter(vis).map((b) => b.textContent.trim()).filter((t) => /^(next|submit|click here)$/i.test(t));
    const h1 = [...document.querySelectorAll("h1")].map((h) => h.textContent.trim());
    const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => +h.tagName[1]);
    const skipped = levels.some((l, i) => i > 0 && l > levels[i - 1] + 1);
    const imgsNoSize = [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("width") && !i.getAttribute("height") && !i.style.aspectRatio).map((i) => i.src.slice(-40));
    const fixed = [...document.querySelectorAll("body *")].filter((el) => getComputedStyle(el).position === "fixed" && vis(el)).map((el) => el.tagName + ":" + (el.textContent || "").trim().slice(0, 20));
    const fontFamilies = [...new Set([...document.querySelectorAll("body *")].filter(vis).map((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "")))];
    const fontWeights = [...new Set([...document.querySelectorAll("body *")].filter((el) => vis(el) && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => getComputedStyle(el).fontWeight))];
    const placeholderOnly = [...document.querySelectorAll("input[placeholder], textarea[placeholder]")].filter((el) => !(el.labels && el.labels.length) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).map((el) => el.name);
    const numberInputs = [...document.querySelectorAll("input")].filter(vis).filter((el) => el.type === "text" && /ft|in|area|width|count|number/i.test(el.name || "")).map((el) => `${el.name}:${el.inputMode || "-"}`);
    const centered = [...document.querySelectorAll("p")].filter((p) => vis(p) && getComputedStyle(p).textAlign === "center").length;
    return {
      title: document.title, h1, headingSkip: skipped, lang: document.documentElement.lang,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      small, inputsUnder16, transitionAll, banned, threeDots, genericButtons, imgsNoSize, fixed, fontFamilies, fontWeights,
      placeholderOnly, numberInputs, centered,
      footer: (document.querySelector("footer")?.innerText || "").replace(/\s+/g, " ").slice(0, 200),
      backLink: !![...document.querySelectorAll("a")].find((a) => /^\s*Back\s*$/.test(a.textContent)),
      mainActions: [...document.querySelectorAll("[data-main-action]")].filter(vis).map((e) => e.textContent.trim()),
    };
  });
}

async function at320(page) {
  const old = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(150);
  const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.setViewportSize(old);
  return w;
}

async function record(page, name, width) {
  await page.waitForTimeout(400);
  const file = `${name}-${width}.png`;
  await page.screenshot({ path: join(SHOTS, file), fullPage: true });
  const entry = { name, width, url: page.url().replace(WEB, ""), screenshot: file, ...(await measure(page)), at320: await at320(page), axe: await axe(page) };
  report.pages.push(entry);
  return entry;
}

async function toResults(page, caseId = "cafe_flawed") {
  await page.goto(`${WEB}/plan/reading/?example=${caseId}`);
  await page.waitForURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await page.getByTestId("counts").waitFor();
}

// ---------------------------------------------------------------- 1. every page, both widths
for (const width of process.env.SKIP_WALK ? [] : [375, 1280]) {
  const page = await newPage(width);
  await page.goto(`${WEB}/`); await page.getByRole("link", { name: "Café with planted problems" }).waitFor();
  await record(page, "start", width);
  await page.goto(`${WEB}/business/`); await page.getByRole("radio").first().waitFor();
  await record(page, "business", width);
  await page.getByRole("button", { name: "Continue" }).click();
  await record(page, "business-errors", width);
  await page.goto(`${WEB}/plan/`); await page.locator("[data-state]").waitFor();
  await record(page, "plan", width);
  await page.goto(`${WEB}/plan/reading/`);
  await record(page, "reading-no-file", width);
  await page.goto(`${WEB}/plan/reading/?example=cafe_flawed`); await page.waitForURL(/\/check\/$/);
  await record(page, "check", width);
  await page.goto(`${WEB}/check/?enter=yourself`); await page.waitForTimeout(300);
  await record(page, "check-enter-yourself", width);
  await toResults(page);
  await record(page, "results", width);
  const disclosure = page.getByRole("button", { name: /Show the code reference/ }).first();
  if (await disclosure.count()) { await disclosure.click(); await record(page, "results-code-reference", width); }
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("dialog", { name: "Ask about the pre-check" }).waitFor();
  await record(page, "results-assistant-open", width);
  await page.keyboard.press("Escape");
  await page.goto(`${WEB}/help/`);
  await record(page, "help", width);
  await page.goto(`${WEB}/business/`); await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByRole("dialog", { name: "Ask about the pre-check" }).waitFor();
  await record(page, "business-assistant-open", width);
  await page.goto(`${WEB}/no-such-page/`);
  await record(page, "not-found", width);
  await page.context().close();
}

// ---------------------------------------------------------------- 2. the whole flow, assistant closed, each demo plan
const meta = await (await fetch(`${API}/api/meta`)).json();
const cases = meta.demo_cases;
for (const width of process.env.SKIP_FLOWS ? [] : [375, 1280]) {
  for (const c of cases) {
    const page = await newPage(width);
    let opened = false;
    page.on("request", (r) => { if (r.url().includes("/ask")) opened = true; });
    const steps = [];
    await page.goto(`${WEB}/`);
    await page.getByRole("link", { name: "Start", exact: true }).click();
    await page.waitForURL(/\/business\/$/); steps.push("business");
    const bt = meta.business_types.find((b) => b.key === c.business_type);
    await page.getByText(bt.label, { exact: true }).click();
    if (bt.serves_food) await page.getByRole("radiogroup", { name: /cooking/ }).getByText(c.cooking_on_site ? "Yes" : "No", { exact: true }).click();
    if (bt.serves_food || bt.serves_alcohol) {
      const g = page.getByRole("radiogroup", { name: /alcohol/ });
      if (await g.count()) await g.getByText("No", { exact: true }).click();
    }
    if (c.zone) await page.getByLabel("Zone from the zoning map (optional)").fill(c.zone);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/\/plan\/$/); steps.push("plan");
    // No key on this server: upload the plan for real, get the no_model_key answer, then take the example from "Other ways to go on".
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose a file" }).click();
    await (await chooser).setFiles(`${ROOT}demo/${c.id === "cafe_flawed" ? "flawed_plan.png" : c.id === "cafe_compliant" ? "compliant_plan.png" : "salon_flawed_plan.png"}`);
    await page.getByRole("button", { name: "Read my plan", exact: true }).click();
    await page.getByRole("link", { name: `Try the example plan: ${c.title}` }).waitFor({ timeout: 20000 });
    steps.push(`upload refused: ${(await page.getByRole("alert").first().innerText()).replace(/\s+/g, " ").slice(0, 160)}`);
    await page.getByRole("link", { name: `Try the example plan: ${c.title}` }).click();
    await page.waitForURL(/\/check\/$/); steps.push("check");
    await page.getByRole("button", { name: "Run the check" }).click();
    await page.getByTestId("counts").waitFor(); steps.push("results");
    const counts = await page.getByTestId("counts").innerText();
    const id = new URL(page.url()).searchParams.get("check");
    const stored = await (await fetch(`${API}/api/checks/${id}`)).json();
    const shown = await page.locator("[id^=finding-]").evaluateAll((els) => els.filter((e) => /^finding-\d+$/.test(e.id)).map((e) => e.innerText.split("\n").slice(0, 2).join(" | ")));
    const dl = await page.getByRole("link", { name: "Download the fix list (PDF)" }).getAttribute("href");
    const pdf = dl ? await fetch(new URL(dl, WEB).href) : null;
    const assistantVisible = await page.getByRole("dialog", { name: "Ask about the pre-check" }).isVisible();
    report.flows.push({ width, case: c.id, steps, counts, check_id: id, summary: stored.result.summary,
      intake_sent: stored.result.intake, findings_shown: shown.length, findings_api: stored.result.findings.length,
      pdf: pdf ? `${pdf.status} ${pdf.headers.get("content-type")}` : "no link", assistant_opened: opened || assistantVisible });
    await page.context().close();
  }
}

// ---------------------------------------------------------------- 3. keyboard only, Start to the downloaded fix list
{
  const page = await newPage(1280);
  const log = [];
  const noFocusRing = [];
  async function focused() {
    return page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { text: "", ring: true };
      const s = getComputedStyle(el);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      const parentRing = (() => { const p = el.closest("label, [data-focus-visible], [data-focus-ring]"); if (!p) return false; const ps = getComputedStyle(p); return (ps.outlineStyle !== "none" && parseFloat(ps.outlineWidth) > 0) || (ps.boxShadow && ps.boxShadow !== "none"); })();
      const lab = el.labels && el.labels.length ? el.labels[0].innerText : "";
      return { text: (el.getAttribute("aria-label") || lab || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 60), tag: el.tagName, role: el.getAttribute("role"), type: el.type, ring: ring || parentRing };
    });
  }
  async function tabTo(re, max = 80) {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press("Tab");
      const f = await focused();
      if (!f.ring && f.text) noFocusRing.push(`${page.url().replace(WEB, "")} ${f.tag} "${f.text}"`);
      if (re.test(f.text)) { log.push(`Tab x${i + 1} -> ${f.tag} "${f.text}"`); return f; }
    }
    throw new Error(`keyboard: could not reach ${re} on ${page.url()}`);
  }
  try {
    await page.goto(`${WEB}/`);
    await page.getByRole("link", { name: "Café with planted problems" }).waitFor();
    await tabTo(/^Start$/); await page.keyboard.press("Enter");
    await page.waitForURL(/\/business\/$/);
    await tabTo(/^Café or restaurant/); await page.keyboard.press("Space");
    await tabTo(/^Yes$/); await page.keyboard.press("Space");                 // cooking: the first radio in the group
    await tabTo(/^(Yes|No|Not sure)$/); await page.keyboard.press("ArrowRight"); // alcohol: Yes -> No
    await tabTo(/Zone from the zoning map/);
    await page.keyboard.type("NC2-55 (M)");
    await tabTo(/^Continue$/); await page.keyboard.press("Enter");
    await page.waitForURL(/\/plan\/$/);
    const t0 = Date.now();
    await page.getByRole("heading", { level: 1, name: "Upload your floor plan" }).waitFor({ timeout: 15000 });
    log.push(`/plan heading after ${Date.now() - t0} ms`);
    await tabTo(/^try an example plan$/); await page.keyboard.press("Enter");
    await page.waitForURL(/\/$/); await page.getByRole("link", { name: "Café with planted problems" }).waitFor();
    await tabTo(/^Café with planted problems$/); await page.keyboard.press("Enter");
    await page.waitForURL(/\/check\/$/);
    await tabTo(/^Run the check$/, 200); await page.keyboard.press("Enter");
    await page.getByTestId("counts").waitFor();
    const counts = await page.getByTestId("counts").innerText();
    await tabTo(/Show the code reference/, 120); await page.keyboard.press("Enter");
    const dlPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
    await page.goto(page.url()); // no-op guard against stale focus
    await page.getByTestId("counts").waitFor();
    await tabTo(/Download the fix list \(PDF\)/, 200);
    const popupOrDl = await Promise.race([dlPromise, page.keyboard.press("Enter").then(() => page.waitForTimeout(3000)).then(() => "pressed")]);
    log.push(`Enter on Download -> ${popupOrDl && popupOrDl.suggestedFilename ? "download " + popupOrDl.suggestedFilename() : String(popupOrDl)}`);
    // the assistant from the keyboard: open, ask a suggested question, close
    await tabTo(/^Ask$/, 200); await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Ask about the pre-check" }).waitFor();
    const inPanel = await page.evaluate(() => !!document.activeElement.closest("[role=dialog]"));
    await page.keyboard.press("Escape");
    const backOnAsk = await page.evaluate(() => document.activeElement.textContent.trim() === "Ask");
    report.keyboard = { ok: true, counts, log, noFocusRing: [...new Set(noFocusRing)], focusIntoPanel: inPanel, focusBackToAsk: backOnAsk };
  } catch (e) {
    report.keyboard = { ok: false, error: String(e), log, noFocusRing: [...new Set(noFocusRing)], url: page.url() };
    await page.screenshot({ path: join(SHOTS, "keyboard-failure.png"), fullPage: true });
  }
  await page.context().close();
}

await browser.close();
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`pages ${report.pages.length}, flows ${report.flows.length}, keyboard ${report.keyboard?.ok}, errors ${report.errors.length}`);
