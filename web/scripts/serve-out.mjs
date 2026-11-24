// Serves the static export in out/ on one port, the way any static host would. No dependencies.
//   node scripts/serve-out.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../out", import.meta.url));
const port = Number(process.argv[2] ?? 3765);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
  ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".pmtiles": "application/octet-stream", ".wav": "audio/wav" };

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
  res.writeHead(found ? 200 : 404, { "content-type": types[extname(path)] ?? "application/octet-stream" });
  res.end(await readFile(path));
}).listen(port, "127.0.0.1", () => console.log(`serving out/ on http://127.0.0.1:${port}`));
