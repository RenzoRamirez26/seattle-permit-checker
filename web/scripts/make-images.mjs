#!/usr/bin/env node
// Draws the site's social preview and app icons with the site's own fonts and colours (DESIGN.md), in Chromium:
//   public/og.png             1200 x 630, the Open Graph and Twitter card image (PermitOS, Start's headline, no data)
//   src/app/apple-icon.png    180 x 180, the apple-touch-icon (Next.js adds the <link> for it)
//   public/icon-192.png, public/icon-512.png   for the web app manifest
// The icons are app/icon.svg on a square. Run again after changing the headline, a colour or the icon:
//   node scripts/make-images.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = (pkg, file) => `data:font/woff2;base64,${readFileSync(join(web, "node_modules", "@fontsource", pkg, "files", file)).toString("base64")}`;
const icon = readFileSync(join(web, "src", "app", "icon.svg"), "utf8");

const og = `<!doctype html><html><head><style>
@font-face { font-family: Plex Sans; font-weight: 300; src: url(${font("ibm-plex-sans", "ibm-plex-sans-latin-300-normal.woff2")}); }
@font-face { font-family: Plex Sans; font-weight: 500; src: url(${font("ibm-plex-sans", "ibm-plex-sans-latin-500-normal.woff2")}); }
@font-face { font-family: Plex Serif; font-weight: 400; src: url(${font("ibm-plex-serif", "ibm-plex-serif-latin-400-normal.woff2")}); }
html, body { margin: 0; width: 1200px; height: 630px; }
body { background: #faf7f2; color: #1d2430; font-family: Plex Sans; display: flex; flex-direction: column; }
.top { flex: 1; padding: 72px 80px 0; display: flex; flex-direction: column; gap: 40px; }
.mark { font-weight: 500; font-size: 40px; } .mark b { font-weight: 500; color: #1f4e8c; }
h1 { margin: 0; font-family: Plex Serif; font-weight: 400; font-size: 76px; line-height: 1.12; max-width: 980px; }
.band { background: #1f4e8c; color: #ffffff; padding: 40px 80px; font-size: 28px; font-weight: 300; display: flex; justify-content: space-between; gap: 32px; white-space: nowrap; }
.band span { color: #c9d8ee; }
</style></head><body>
<div class="top"><div class="mark">Permit<b>OS</b></div><h1>Check your space before you sign the lease.</h1></div>
<div class="band"><div>A floor plan pre-check for Seattle small businesses</div><span>Not a City of Seattle service</span></div>
</body></html>`;

const square = (size) => `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;background:#1f4e8c}
svg{display:block;width:${size}px;height:${size}px}</style></head><body>${icon.replace(/rx="2"/, 'rx="0"')}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function shot(html, width, height, out) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(web, out), clip: { x: 0, y: 0, width, height } });
  console.log(`wrote ${out}`);
}
await shot(og, 1200, 630, "public/og.png");
await shot(square(180), 180, 180, "src/app/apple-icon.png");
await shot(square(192), 192, 192, "public/icon-192.png");
await shot(square(512), 512, 512, "public/icon-512.png");
await browser.close();
