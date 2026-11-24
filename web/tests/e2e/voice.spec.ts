/**
 * Voice input end to end, with the browser's speech APIs replaced by init scripts so each path is certain:
 *   Path A: on-device SpeechRecognition (processLocally) puts the words in the box live; no audio leaves the page.
 *   Path B: MediaRecorder (Chromium's fake microphone) records WebM Opus, sent to our API only with its real type.
 *   Path C: neither: the words "Voice isn't available in this browser", and typing still works.
 * The test server has no faster-whisper (PERMIT_STT=off); where Path B needs it, /api/meta and /api/transcribe are
 * served from the fixtures.
 */
import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, fixture, shoot, WIDTHS } from "./helpers";

const CORS = { "access-control-allow-origin": "*" };
const HEARD = "Why do I need a second exit for my cafe?";
const panel = (page: Page) => page.getByRole("dialog", { name: "Ask about the pre-check" });
const START = "Start voice input";
const STOP = "Stop voice input";

/** A server with speech to text: /api/meta says so, and /api/transcribe answers from the fixture. */
async function withSpeechToText(page: Page) {
  const meta = fixture("meta");
  meta.features.speech_to_text = true;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: CORS }));
  const sent: { url: string; body: Buffer; type: string }[] = [];
  await page.route("**/api/transcribe", async (route) => {
    const r = route.request();
    sent.push({ url: r.url(), body: r.postDataBuffer() ?? Buffer.alloc(0), type: r.headers()["content-type"] ?? "" });
    await route.fulfill({ json: fixture("transcribe"), headers: CORS });
  });
  return sent;
}

/** No browser speech recognition at all (Path B or C). */
const noRecognition = (page: Page) => page.addInitScript(() => {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

/** An on-device recognizer: available() says how it is, install() records the call, and start() "hears" words. */
const onDeviceRecognition = (page: Page, availability: string) => page.addInitScript(([status, words]) => {
  const log = ((window as unknown as { __speech: unknown[] }).__speech = [] as unknown[]);
  class Rec {
    static async available(o: unknown) { log.push(["available", o]); return status; }
    static async install(o: unknown) { log.push(["install", o]); await new Promise((r) => setTimeout(r, 400)); return true; }
    local = false; lang = ""; interimResults = false; continuous = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
    start() {
      log.push(["start", this.local, this.interimResults, this.lang]);
      const res = (parts: [string, boolean][]) => ({ results: parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });
      setTimeout(() => this.onresult?.(res([["why do I need", false]])), 200);
      setTimeout(() => this.onresult?.(res([[words, true]])), 900);
    }
    stop() { setTimeout(() => this.onend?.(), 50); }
    abort() {}
  }
  Object.defineProperty(Rec.prototype, "processLocally", { get() { return this.local; }, set(v) { this.local = v; } });
  Object.defineProperty(window, "SpeechRecognition", { value: Rec, configurable: true });
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
}, [availability, HEARD] as const);

async function toResults(page: Page) {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
}

function watchHosts(page: Page) {
  const hosts = new Set<string>();
  page.on("request", (r) => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host); });
  return hosts;
}

// ---------------------------------------------------------------- the speech service is never touched on page load
test("no page asks the browser's speech service anything until Start voice input is pressed", async ({ page }) => {
  // Headless Chrome 159 (CI) crashes the tab on the real available(); a real browser should not be asked unprompted either.
  await onDeviceRecognition(page, "available");
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: START })).toBeVisible();
  for (const path of ["/", "/business/", "/plan/", "/help/"]) {
    await page.goto(path);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: START })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __speech: unknown[] }).__speech)).toEqual([]);
  }
  await panel(page).getByRole("button", { name: START }).click();
  await expect(panel(page).getByRole("button", { name: STOP })).toBeVisible();
  const log = await page.evaluate(() => (window as unknown as { __speech: unknown[] }).__speech);
  expect(log[0]).toEqual(["available", { langs: ["en-US"], processLocally: true }]);
});

// ---------------------------------------------------------------- Path A
test("Path A: on this device, keyboard only: words appear live, no audio is sent, Send asks the API", async ({ page }) => {
  await onDeviceRecognition(page, "available");
  const transcribe: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/transcribe")) transcribe.push(r.url()); });
  const hosts = watchHosts(page);
  await toResults(page);                                   // a server with no speech to text: Path A needs none
  await page.getByRole("button", { name: "Ask", exact: true }).focus();
  await page.keyboard.press("Enter");
  const start = panel(page).getByRole("button", { name: START });
  await expect(start).toHaveAttribute("aria-pressed", "false");
  await start.focus();
  await page.keyboard.press("Enter");
  const stop = panel(page).getByRole("button", { name: STOP });
  await expect(stop).toBeFocused();
  await expect(stop).toHaveAttribute("aria-pressed", "true");
  await expect(panel(page).getByRole("status").filter({ hasText: /^Listening…/ })).toBeVisible();
  const box = panel(page).getByRole("textbox", { name: "Your question" });
  await expect(box).toHaveValue("why do I need");          // interim words, live
  await expect(box).toHaveValue(HEARD);                    // final words replace them
  await page.keyboard.press("Enter");                      // Stop, still focused
  await expect(panel(page).getByTestId("heard")).toHaveText(`We heard: “${HEARD}”. Correct it if needed, then press Send.`);
  await expect(panel(page).getByTestId("heard")).toHaveAttribute("aria-live", "polite");
  if (process.env.SHOTS) await page.screenshot({ path: "../docs/screenshots/voice-hybrid/path-a-heard-1280.png" });   // before a resize remounts it
  const log = await page.evaluate(() => (window as unknown as { __speech: unknown[] }).__speech);
  expect(log).toContainEqual(["available", { langs: ["en-US"], processLocally: true }]);
  expect(log).toContainEqual(["start", true, true, "en-US"]);
  expect(transcribe).toEqual([]);
  expect([...hosts].every((h) => h.startsWith("127.0.0.1"))).toBe(true);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await expectNoAxeViolations(page, `heard on device at ${width}`);
  }
  await box.press("Control+Enter");
  await expect(panel(page).getByRole("log", { name: "Conversation" })).toContainText("Written from your result");
});

test("Path A: downloadable: the mic press installs the language pack once, then listens", async ({ page }) => {
  await onDeviceRecognition(page, "downloadable");
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("button", { name: START }).click();
  await expect(panel(page).getByText("Getting voice ready on this device. This happens once.")).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: "../docs/screenshots/voice-hybrid/path-a-getting-ready-1280.png" });   // a resize would remount the panel
  await expect(panel(page).getByRole("button", { name: STOP })).toBeVisible();
  const log = await page.evaluate(() => (window as unknown as { __speech: unknown[] }).__speech);
  expect(log.filter((e) => (e as string[])[0] === "install")).toEqual([["install", { langs: ["en-US"], processLocally: true }]]);
});

// ---------------------------------------------------------------- Path B
test("Path B: recorded with the real type and sent to our API only; shows the wait; keyboard only", async ({ page }) => {
  await noRecognition(page);
  const sent = await withSpeechToText(page);
  const hosts = watchHosts(page);
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const start = panel(page).getByRole("button", { name: START });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(panel(page).getByRole("button", { name: STOP })).toBeFocused();
  await expect(panel(page).getByRole("status").filter({ hasText: /^Listening… \d+ s of 30/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  const box = panel(page).getByRole("textbox", { name: "Your question" });
  await expect(box).toHaveValue(HEARD);
  await expect(box).toBeFocused();
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(`${API}/api/transcribe`);
  expect(sent[0].type).toMatch(/^multipart\/form-data; boundary=/);
  const body = sent[0].body.toString("latin1");
  expect(body).toContain('name="audio"; filename="question.webm"');
  expect(body).toMatch(/Content-Type: audio\/webm;codecs=opus/i);
  expect(sent[0].body.indexOf(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBeGreaterThan(0);    // a real WebM file
  expect([...hosts].every((h) => h.startsWith("127.0.0.1"))).toBe(true);
  expect(await panel(page).getByRole("log").locator("li").count()).toBe(0);                  // nothing sent yet
  await page.keyboard.type(" Please explain.");
  await page.keyboard.press("Control+Enter");
  const log = panel(page).getByRole("log", { name: "Conversation" });
  await expect(log).toContainText(`${HEARD} Please explain.`);
  await expect(log.getByRole("button", { name: /Read aloud|Stop reading/ })).toBeVisible();
});

test("Path B: Turning your speech into text… while the API works", async ({ page }) => {
  await noRecognition(page);
  const meta = fixture("meta");
  meta.features.speech_to_text = true;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: CORS }));
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  await page.route("**/api/transcribe", async (route) => { await held; await route.fulfill({ json: fixture("transcribe"), headers: CORS }); });
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("button", { name: START }).click();
  await page.waitForTimeout(800);
  await panel(page).getByRole("button", { name: STOP }).click();
  await expect(panel(page).getByRole("status").filter({ hasText: "Turning your speech into text…" })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: "../docs/screenshots/voice-hybrid/path-b-turning-into-text-1280.png" });   // a resize would remount the panel
  release();
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toHaveValue(HEARD);
});

for (const width of WIDTHS) {
  test(`Path B while listening at ${width} px: the Stop button, the seconds, and axe`, async ({ page }) => {
    await noRecognition(page);
    await withSpeechToText(page);
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/business/");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await panel(page).getByRole("button", { name: START }).click();
    await expect(panel(page).getByRole("status").filter({ hasText: /^Listening… \d+ s of 30/ })).toBeVisible();
    await page.waitForTimeout(1200);
    await expectNoAxeViolations(page, `panel while listening at ${width}`);
    if (process.env.SHOTS) await page.screenshot({ path: `../docs/screenshots/voice-hybrid/listening-${width}.png` });
    await panel(page).getByRole("button", { name: STOP }).click();
    await expect(panel(page).getByRole("textbox", { name: "Your question" })).toHaveValue(HEARD);
    await expectNoAxeViolations(page, `heard words at ${width}`);
  });
}

test("a transcription error is said in words and the question can be typed", async ({ page }) => {
  await noRecognition(page);
  const meta = fixture("meta");
  meta.features.speech_to_text = true;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: CORS }));
  await page.route("**/api/transcribe", (route) => route.fulfill({ status: 422, json: fixture("error_speech_not_understood").body, headers: CORS }));
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("button", { name: START }).click();
  await page.waitForTimeout(800);
  await panel(page).getByRole("button", { name: STOP }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("The recording could not be made out. Try again closer to the microphone, or type the question.");
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toBeEditable();
});

test("the microphone blocked: the words say how to allow it, or to type", async ({ page }) => {
  await noRecognition(page);
  await withSpeechToText(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("button", { name: START }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("The microphone is blocked. Allow it in your browser settings, or type your question.");
  await shoot(page, "voice-hybrid", "mic-blocked", { fullPage: false });
});

// ---------------------------------------------------------------- Path C
test("Path C: no on-device recognition and no recorder: voice isn't available, typing still works", async ({ page }) => {
  await noRecognition(page);
  await withSpeechToText(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true });
  });
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByText("Voice isn’t available in this browser. Type your question instead.")).toBeVisible();
  const start = panel(page).getByRole("button", { name: START });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute("aria-describedby", "mic-unavailable");
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toBeEditable();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await expectNoAxeViolations(page, `mic unavailable at ${width}`);
  }
  await shoot(page, "voice-hybrid", "path-c-unavailable", { fullPage: false });
});

test("no on-device recognition and a server without speech to text: no microphone; answers can still be read aloud", async ({ page }) => {
  await noRecognition(page);
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByText("Speaking questions is not available on this server.")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: START })).toHaveCount(0);
});

test("a half-typed question survives the panel changing to a sheet", async ({ page }) => {
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("textbox", { name: "Your question" }).fill("Do I need");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toHaveValue("Do I need");
});

test("the microphone shows on step 1 too, and Voice off hides it and is remembered", async ({ page }) => {
  await noRecognition(page);
  await withSpeechToText(page);
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: START })).toBeVisible();
  await panel(page).getByRole("checkbox", { name: /Voice/ }).uncheck();
  await expect(panel(page).getByRole("button", { name: START })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByRole("checkbox", { name: /Voice/ })).not.toBeChecked();
  await expect(panel(page).getByRole("button", { name: START })).toHaveCount(0);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `voice off at ${width}`);
  }
});
