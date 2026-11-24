// Copies the three invented demo plans from ../demo into public/demo/ (git-ignored), for "Try an example plan"
// and for the plan beside the facts on step 3. Also copies the PDF.js and MapLibre workers into public/.
import { copyFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = join(web, "..", "demo");
const out = join(web, "public", "demo");
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(join(demo, "cases.json"), "utf8"));
for (const c of cases) copyFileSync(join(demo, c.plan), join(out, c.plan));
// Which picture belongs to which example plan: ids and file names only (no answers, no planted problems).
writeFileSync(join(out, "plans.json"), JSON.stringify(Object.fromEntries(cases.map((c) => [c.id, c.plan]))) + "\n");
const worker = join(web, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
if (existsSync(worker)) copyFileSync(worker, join(web, "public", "pdf.worker.min.mjs"));
// MapLibre draws GeoJSON (the zone outline) in a web worker, served from our own site.
const mapWorker = join(web, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
if (existsSync(mapWorker)) copyFileSync(mapWorker, join(web, "public", "maplibre-gl-worker.mjs"));
