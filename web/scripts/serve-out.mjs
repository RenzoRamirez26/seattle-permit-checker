// Serves the static export in out/ on one port, the way any static host would (gzip, cache headers, the security
// headers from vercel.json, the custom 404). No dependencies.
//   node scripts/serve-out.mjs [port]
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
// The same security headers the static host sends (vercel.json), so the end-to-end tests run under them.
const headers = Object.fromEntries(JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"))
  .headers[0].headers.map((h) => [h.key.toLowerCase(), h.value]));
const port = Number(process.argv[2] ?? 3765);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".pmtiles": "application/octet-stream", ".wav": "audio/wav" };

async function file(path) {
  try {
    const s = await stat(path);
    return s.isDirectory() ? file(join(path, "index.html")) : path;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const found = (await file(join(out, safe))) ?? (await file(join(out, safe + ".html")));
  const path = found ?? join(out, "404.html");
  // Compressed and cached the way the static host does it, so Lighthouse measures what visitors will get.
  let body = await readFile(path);
  const extra = {};
  if (/\.(html|js|mjs|css|svg|json|txt|xml|webmanifest)$/.test(path) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    body = gzipSync(body);
    extra["content-encoding"] = "gzip";
    extra["vary"] = "Accept-Encoding";
  }
  extra["cache-control"] = url.pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";
  res.writeHead(found ? 200 : 404, { ...headers, ...extra, "content-type": types[extname(path)] ?? "application/octet-stream" });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`serving out/ on http://127.0.0.1:${port}`));
