// Copies the three invented demo plans from ../demo into public/demo/ (git-ignored), for "Try an example plan"
// and for the plan beside the facts on step 3. Also copies the PDF.js worker and MapLibre's production build into public/.
import { copyFileSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const demo = join(web, "..", "demo");
const out = join(web, "public", "demo");
mkdirSync(out, { recursive: true });
const cases = JSON.parse(readFileSync(join(demo, "cases.json"), "utf8"));
for (const c of cases) copyFileSync(join(demo, c.plan), join(out, c.plan));
// Which picture belongs to which example plan: ids, file names and pixel sizes only (no answers, no planted problems).
// The size lets step 3 give the <img> its width and height, so the page does not move when the picture arrives.
function pngSize(path) {
  const b = readFileSync(path);
  if (b.toString("latin1", 1, 4) !== "PNG") throw new Error(`${path} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
writeFileSync(join(out, "plans.json"), JSON.stringify(Object.fromEntries(cases.map((c) => [c.id, { file: c.plan, ...pngSize(join(demo, c.plan)) }]))) + "\n");
const worker = join(web, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
if (existsSync(worker)) copyFileSync(worker, join(web, "public", "pdf.worker.min.mjs"));
// MapLibre's production build, served from our own site: the library, and the web worker that draws GeoJSON (the zone
// outline). The library is loaded from here rather than bundled, because bundling it made the build copy MapLibre's
// development builds into out/ as well (F6).
for (const name of ["maplibre-gl.mjs", "maplibre-gl-worker.mjs"]) {
  const src = join(web, "node_modules", "maplibre-gl", "dist", name);
  if (existsSync(src)) copyFileSync(src, join(web, "public", name));
}
