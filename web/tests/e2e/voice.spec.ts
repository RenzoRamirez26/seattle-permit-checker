import { expect, test, type Page } from "@playwright/test";
import { API } from "../../playwright.config";
import { expectNoAxeViolations, fixture, shoot, WIDTHS } from "./helpers";

const CORS = { "access-control-allow-origin": "*" };
const panel = (page: Page) => page.getByRole("dialog", { name: "Ask about the pre-check" });

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

async function toResults(page: Page) {
  await page.goto("/plan/reading/?example=cafe_flawed");
  await expect(page).toHaveURL(/\/check\/$/);
  await page.getByRole("button", { name: "Run the check" }).click();
  await expect(page.getByTestId("counts")).toBeVisible();
}

test("on this server (no faster-whisper) the microphone is hidden and answers can still be read aloud", async ({ page }) => {
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByText("Speaking questions is not available on this server.")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Speak" })).toHaveCount(0);
});

test("keyboard only: Speak, Stop, correct the words heard, Send; the WAV goes to our API only", async ({ page }) => {
  const sent = await withSpeechToText(page);
  const hosts = new Set<string>();
  page.on("request", (r) => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host); });
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).focus();
  await page.keyboard.press("Enter");
  const speak = panel(page).getByRole("button", { name: "Speak" });
  await speak.focus();
  await page.keyboard.press("Enter");
  const stop = panel(page).getByRole("button", { name: "Stop" });
  await expect(stop).toBeFocused();                                    // the same button, so focus stays on it
  await expect(panel(page).getByRole("status").filter({ hasText: /^Recording \d+ s of 30/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");                                  // Stop, still focused

  const box = panel(page).getByRole("textbox", { name: "Your question" });
  await expect(box).toHaveValue("Why do I need a second exit for my cafe?");
  await expect(box).toBeFocused();
  await expect(panel(page).getByText("These are the words heard. Correct them if needed, then press Send.")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(`${API}/api/transcribe`);
  expect(sent[0].type).toMatch(/^multipart\/form-data; boundary=/);
  const body = sent[0].body;
  const at = body.indexOf("RIFF");
  expect(at).toBeGreaterThan(0);
  expect(body.subarray(at + 8, at + 12).toString()).toBe("WAVE");
  expect(body.readUInt32LE(at + 24)).toBe(16000);                      // 16 kHz
  expect(body.readUInt16LE(at + 22)).toBe(1);                          // mono
  expect(body.toString("latin1")).toContain('name="audio"; filename="question.wav"');
  expect([...hosts].every((h) => h.startsWith("127.0.0.1"))).toBe(true);
  expect(await panel(page).getByRole("log").locator("li").count()).toBe(0);    // nothing sent yet

  await page.keyboard.press("End");
  await page.keyboard.type(" Please explain.");
  await page.keyboard.press("Control+Enter");
  const log = panel(page).getByRole("log", { name: "Conversation" });
  await expect(log).toContainText("Why do I need a second exit for my cafe? Please explain.");
  await expect(log).toContainText("Written from your result");
  await expect(log.getByRole("button", { name: /Read aloud|Stop reading/ })).toBeVisible();
});

for (const width of WIDTHS) {
  test(`while recording at ${width} px: the Stop button, the seconds, and axe`, async ({ page }) => {
    await withSpeechToText(page);
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/business/");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await panel(page).getByRole("button", { name: "Speak" }).click();
    await expect(panel(page).getByRole("status").filter({ hasText: /^Recording \d+ s of 30/ })).toBeVisible();
    await page.waitForTimeout(1200);
    await expectNoAxeViolations(page, `panel while recording at ${width}`);
    if (process.env.SHOTS) await page.screenshot({ path: `../docs/screenshots/stage-6/recording-${width}.png` });
    await panel(page).getByRole("button", { name: "Stop" }).click();
    await expect(panel(page).getByRole("textbox", { name: "Your question" })).toHaveValue("Why do I need a second exit for my cafe?");
    await expectNoAxeViolations(page, `heard words at ${width}`);
    if (process.env.SHOTS) await page.screenshot({ path: `../docs/screenshots/stage-6/heard-words-${width}.png` });
    await panel(page).getByRole("button", { name: "Send" }).click();
    await expect(panel(page).getByRole("button", { name: /Read aloud|Stop reading/ })).toBeVisible();
    if (process.env.SHOTS) await page.screenshot({ path: `../docs/screenshots/stage-6/answer-read-aloud-${width}.png` });
  });
}

test("a half-typed question survives the panel changing to a sheet", async ({ page }) => {
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("textbox", { name: "Your question" }).fill("Do I need");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toHaveValue("Do I need");
});

test("the microphone shows on step 1 too, and Voice off hides it and is remembered", async ({ page }) => {
  await withSpeechToText(page);
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Speak" })).toBeVisible();
  await shoot(page, "stage-6", "panel-microphone", { fullPage: false });
  await panel(page).getByRole("checkbox", { name: /Voice/ }).uncheck();
  await expect(panel(page).getByRole("button", { name: "Speak" })).toHaveCount(0);
  await shoot(page, "stage-6", "voice-off", { fullPage: false });
  await page.reload();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByRole("checkbox", { name: /Voice/ })).not.toBeChecked();
  await expect(panel(page).getByRole("button", { name: "Speak" })).toHaveCount(0);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoAxeViolations(page, `voice off at ${width}`);
  }
});

test("a transcription error is said in words and the question can be typed", async ({ page }) => {
  const meta = fixture("meta");
  meta.features.speech_to_text = true;
  await page.route("**/api/meta", (route) => route.fulfill({ json: meta, headers: CORS }));
  await page.route("**/api/transcribe", (route) => route.fulfill({ status: 422, json: fixture("error_speech_not_understood").body, headers: CORS }));
  await page.goto("/business/");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await panel(page).getByRole("button", { name: "Speak" }).click();
  await page.waitForTimeout(800);
  await panel(page).getByRole("button", { name: "Stop" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("The recording could not be made out. Try again closer to the microphone, or type the question.");
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toBeEditable();
});

test("state: when this browser cannot record, the microphone shows as unavailable and typing still works", async ({ page }) => {
  await withSpeechToText(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    Object.defineProperty(window, "MediaRecorder", { value: undefined, configurable: true });
  });
  await toResults(page);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel(page).getByText("Voice isn’t available in this browser. Type your question instead.")).toBeVisible();
  const speak = panel(page).getByRole("button", { name: "Speak" });
  await expect(speak).toBeDisabled();
  await expect(speak).toHaveAttribute("aria-describedby", "mic-unavailable");
  await expect(panel(page).getByRole("textbox", { name: "Your question" })).toBeEditable();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await expectNoAxeViolations(page, `mic unavailable at ${width}`);
  }
  await shoot(page, "design-v3", "state-mic-unavailable", { fullPage: false });
});
