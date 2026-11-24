// Copies the three invented demo plans from ../demo into public/demo/ (git-ignored), for "Try an example plan"
// and for the plan beside the facts on step 3. Also copies the PDF.js worker into public/.
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = join(web, "..", "demo");
const out = join(web, "public", "demo");
mkdirSync(out, { recursive: true });
for (const c of JSON.parse(readFileSync(join(demo, "cases.json"), "utf8"))) {
  copyFileSync(join(demo, c.plan), join(out, c.plan));
}
const worker = join(web, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
if (existsSync(worker)) copyFileSync(worker, join(web, "public", "pdf.worker.min.mjs"));
