/**
 * End-to-end tests: the real FastAPI backend with no key and no Seattle database, and the static export.
 * Two cases that would need the network or a key are served from tests/fixtures by request interception.
 */
import { defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_PORT = 8765;
const WEB_PORT = 3765;
export const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const root = join(__dirname, "..");
const python = process.env.PYTHON ?? (existsSync(join(root, ".venv/bin/python")) ? join(root, ".venv/bin/python") : "python");
const data = process.env.PERMIT_E2E_DIR ?? (process.env.PERMIT_E2E_DIR = mkdtempSync(join(tmpdir(), "permit-e2e-")));
// The cloud sessions have a Chromium at this path; the project pins its own Playwright, so point at it.
const chromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: WEB,
    trace: "off",
    // A fake microphone fed with tests/fixtures/question.wav (an invented question in a machine voice), allowed without a prompt.
    launchOptions: {
      ...(existsSync(chromium) ? { executablePath: chromium } : {}),
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${join(root, "tests", "fixtures", "question.wav")}`],
    },
  },
  webServer: [
    {
      command: `${python} -m uvicorn api.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: root,
      url: `${API}/api/meta`,
      reuseExistingServer: false,
      env: {
        PYTHON_DOTENV_DISABLED: "1",
        ANTHROPIC_API_KEY: "",
        PERMIT_STT: "off",
        PERMIT_CHECKS_DB: join(data, "checks.sqlite"),
        PERMIT_SEATTLE_DB: join(data, "no-permits.sqlite"),
        PERMIT_CORS_ORIGIN: WEB,
      },
    },
    {
      command: `npm run build && node scripts/serve-out.mjs ${WEB_PORT}`,
      url: WEB,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_BASE: API },
    },
  ],
});
