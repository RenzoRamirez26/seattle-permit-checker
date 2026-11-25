#!/usr/bin/env node
// Writes a Content-Security-Policy into every page of the static export (out/**/*.html), as the first thing in <head>.
// The policy lets a page load only what the site loads: its own files (scripts, fonts, the PDF.js and MapLibre workers,
// the map tiles in /tiles), the API at NEXT_PUBLIC_API_BASE, and, only when switched on at build time, Plausible and
// Cloudflare Turnstile. Next.js puts its page data in inline <script> tags, so each one is allowed by its SHA-256 hash,
// never by 'unsafe-inline'. frame-ancestors, HSTS and the other headers cannot be set from a page: the host sets them
// (vercel.json, netlify.toml; scripts/serve-out.mjs sends the same ones in the end-to-end tests).
//   node scripts/csp.mjs [out-dir]        (runs after `next build`, before the guard)
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2] ?? join(web, "out");
const origin = (url) => (url ? new URL(url).origin : null);

const api = origin(process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000");
const plausible = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  ? origin(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.manual.js") : null;
const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "https://challenges.cloudflare.com" : null;
const list = (...xs) => xs.filter(Boolean).join(" ");

export function policy(hashes) {
  return [
    "default-src 'self'",
    `script-src ${list("'self'", "'wasm-unsafe-eval'", ...hashes, plausible, turnstile)}`,   // wasm: PDF.js image decoders
    "style-src 'self' 'unsafe-inline'",                         // React and MapLibre set style attributes
    "img-src 'self' data: blob:",                               // the chosen plan's preview is a blob: URL
    "font-src 'self' data:",
    `connect-src ${list("'self'", api, plausible)}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    `frame-src ${turnstile ?? "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(api?.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? pages(p) : p.endsWith(".html") ? [p] : [];
  });
}

const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let n = 0;
for (const file of pages(out)) {
  let html = readFileSync(file, "utf8").replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  const hashes = [...new Set([...html.matchAll(INLINE)].map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`))];
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy(hashes)}">`;
  if (!/<head[^>]*>/.test(html)) throw new Error(`csp: no <head> in ${file}`);
  html = html.replace(/<head[^>]*>/, (h) => h + meta);
  writeFileSync(file, html);
  n += 1;
}
console.log(`csp: wrote the policy into ${n} pages (API ${api}${plausible ? `, analytics ${plausible}` : ""}${turnstile ? ", Turnstile" : ""})`);
