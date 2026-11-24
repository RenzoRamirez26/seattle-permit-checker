#!/usr/bin/env node
// The build guard (docs/website_plan.md section 5). Fails the build if web/ holds a building-code number,
// pass/fail logic, a model call, browser speech recognition, or a way to show model output as HTML; and, for the design
// rules (DESIGN.md, CONTENT.md), a banned word in copy, a fourth type size, or a text colour below 4.5 : 1.
//
//   node scripts/guard.mjs src [dir]   scan the source (default web/src)
//   node scripts/guard.mjs out [dir]   scan the built site (default web/out) for key-shaped strings
//
// Prints every allowed exception from guard-allow.json on every run, then each problem as file:line: reason.
// Exit code 1 if there is any problem. tests/test_web_guard.py runs this from python -m pytest.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(web, "..");
const mode = process.argv[2] ?? "src";
const target = process.argv[3] ?? join(web, mode === "out" ? "out" : "src");

// ---------------------------------------------------------------- allowed exceptions
const allow = JSON.parse(readFileSync(join(web, "scripts", "guard-allow.json"), "utf8"));
for (const a of allow) console.log(`guard: allowed ${a.rule} in ${a.file}: ${a.reason}`);
const allowed = (file, rule, line) =>
  allow.some((a) => a.rule === rule && file.endsWith(a.file) && (!a.contains || line.includes(a.contains)));

// ---------------------------------------------------------------- the rulebook's numbers
function rulebookNumbers() {
  const rules = JSON.parse(readFileSync(join(root, "checker", "rules", "seattle.json"), "utf8"));
  const found = new Set();
  const walk = (v, key = "") => {
    if (typeof v === "number") {
      found.add(String(v));
      if (v > 0 && v < 1) found.add(String(Math.round(v * 1000) / 10)); // a share such as 0.05 is shown as 5 %
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "_meta") walk(x, k);
  };
  walk(rules);
  return [...found].sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------- the facts' field names, from the generated types
function factFields() {
  const text = readFileSync(join(web, "src", "api", "schema.d.ts"), "utf8");
  const fields = new Set();
  for (const model of ["Facts", "Space", "Door", "Aisle", "Restroom", "Kitchen", "FireSafety"]) {
    const start = text.indexOf(`\n        ${model}: {`);
    if (start < 0) throw new Error(`guard: ${model} is missing from src/api/schema.d.ts`);
    const end = text.indexOf("\n        };", start);
    for (const m of text.slice(start, end).matchAll(/^ {12}(\w+)\??:/gm)) fields.add(m[1]);
  }
  for (const s of ["name", "label", "use", "location", "serves", "designation", "swing"]) fields.delete(s); // words, not measurements
  return [...fields];
}

const UNIT = String.raw`\s*(?:-\s*)?(?:in\b|in\.|inch|inches|"|”|ft\b|ft\.|feet|foot|sq\.?\s?ft|square\s+feet|occupants?|persons?|people|%|percent)`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function srcRules() {
  const numbers = rulebookNumbers().filter((n) => n !== "0");
  const fields = factFields().join("|");
  return [
    { rule: "code-number", why: "a rulebook number next to a unit: code values come from the API only",
      re: new RegExp(String.raw`(?<![\w.\-\[/#])(?:${numbers.map(esc).join("|")})${UNIT}`, "i"),
      skip: (f) => f.endsWith(".css") }, // stylesheets hold sizes, not sentences
    { rule: "code-section", why: "a building-code section: citations come from the API only",
      re: /\b(?:SBC|IBC|IFC|UPC|SMC|ADA)\b|\bTable\s+\d{3,4}|\bSection\s+\d{3,4}|§/ },
    { rule: "decision", why: "a comparison on a measured fact: decisions are made by rules_engine.py",
      re: new RegExp(String.raw`\b(?:${fields})\b\s*(?:<|>)=?(?!>)|(?<![=\-<])(?:<|>)=?\s*[\w.?!\[\]"']*\b(?:${fields})\b`) },
    { rule: "status-literal", why: 'the literals "pass", "fail", "review" belong in components/results/status.ts only',
      re: /["'`](?:pass|fail|review)["'`]/, skip: (f) => f.endsWith(join("components", "results", "status.ts")) },
    { rule: "rulebook-import", why: "the rulebook and checker/ are never imported into web/",
      re: /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*(?:seattle\.json|checker\/)/ },
    { rule: "model-call", why: "model calls happen on the server only",
      re: /anthropic|@ai-sdk\/|\bopenai\b|ANTHROPIC_API_KEY|x-api-key|\bclaude-[a-z0-9]|from\s+["']ai(?:\/[^"']*)?["']/i },
    { rule: "other-host", why: "the browser talks to the API base only",
      re: /\bfetch\s*\(\s*["'`]https?:|new\s+(?:WebSocket|EventSource|XMLHttpRequest)\b|sendBeacon/ },
    { rule: "speech-recognition", why: "browser speech recognition can send audio to the browser maker; only src/voice/ondevice.ts may use it, with processLocally = true",
      re: /SpeechRecognition/, skip: (f) => f.endsWith(join("src", "voice", "ondevice.ts")) },
    { rule: "speech-not-local", why: "on-device speech recognition must set processLocally = true and never false",
      re: /processLocally\s*=(?!=)(?!\s*true\b)|processLocally\s*:\s*false/ },
    { rule: "raw-html", why: "model output is never shown as HTML",
      re: /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/ },
  ];
}

const OUT_RULES = [
  { rule: "key-in-build", why: "a key-shaped string in the built site", re: /sk-ant|ANTHROPIC|api\.anthropic\.com/ },
];

// ---------------------------------------------------------------- scan
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const checks = mode === "out" ? OUT_RULES : srcRules();
const wanted = mode === "out" ? /\.(html|js|mjs|css|json|txt)$/ : /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md)$/;
const problems = [];
for (const file of files(target).filter((f) => wanted.test(f))) {
  const rel = relative(web, file).split(sep).join("/");
  if (mode === "src" && rel.endsWith("api/schema.d.ts")) continue; // generated from the API's own contract
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const c of checks) {
      if (c.skip?.(file)) continue;
      const m = line.match(c.re);
      if (m && !allowed(rel, c.rule, line)) problems.push(`${rel}:${i + 1}: ${c.rule}: ${c.why} (found "${m[0].trim()}")`);
    }
  });
}

// The one file allowed to use the browser's recognition must ask for on-device processing.
if (mode === "src") {
  const od = join(target, "voice", "ondevice.ts");
  if (existsSync(od)) {
    const code = readFileSync(od, "utf8");
    if (!/\.processLocally\s*=\s*true\b/.test(code) || !/processLocally:\s*true\b/.test(code))
      problems.push("src/voice/ondevice.ts: speech-not-local: it must set recognition.processLocally = true and ask available()/install() with processLocally: true");
  }
}

// ---------------------------------------------------------------- design rules (src only; DESIGN.md, CONTENT.md)
if (mode === "src") {
  // 1. Banned words in copy: string literals and JSX text in .ts/.tsx, comments removed. CONTENT.md rules 3 and 11.
  const BANNED = /\b(?:approved|compliant|invalid|illegal|please|sorry|oops)\b/i;
  const STATUS_WORD = /\b(?:OK|Pass|Passed|PASS)\b/;      // as a status label; the API's lower-case "pass" is data
  const copyOf = (code) => {
    const noComments = code.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    return noComments.split("\n").map((line) => {
      const bits = [];
      for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) bits.push(m[2]);
      for (const m of line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) bits.push(m[1]);
      return bits.join(" | ");
    });
  };
  for (const file of files(target).filter((f) => /\.(ts|tsx)$/.test(f))) {
    const rel = relative(web, file).split(sep).join("/");
    if (rel.endsWith("api/schema.d.ts")) continue;
    copyOf(readFileSync(file, "utf8")).forEach((copy, i) => {
      const m = copy.match(BANNED) ?? copy.match(STATUS_WORD);
      if (m && !allowed(rel, "banned-word", copy)) problems.push(`${rel}:${i + 1}: banned-word: CONTENT.md bans this word in copy (found "${m[0]}")`);
    });
  }

  // 2. Three type sizes: the size tokens in tokens.css, and no other size anywhere in src.
  const tokens = readFileSync(join(web, "src", "styles", "tokens.css"), "utf8");
  const sizes = [...tokens.matchAll(/--text-([a-z0-9-]+?)\s*:/g)].map((m) => m[1]).filter((n) => !n.includes("--"));
  if (sizes.length > 3) problems.push(`src/styles/tokens.css: type-scale: ${sizes.length} type sizes (${sizes.join(", ")}); DESIGN.md allows 3`);
  for (const file of files(target).filter((f) => /\.(ts|tsx|css)$/.test(f))) {
    const rel = relative(web, file).split(sep).join("/");
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const m = line.match(/\btext-(?:xs|sm|base|lg|[2-9]?xl)\b|\btext-\[\d|font-size:\s*(?!var\(|100%|inherit)[\d.]+|\bfont:[^;]*?\b\d+(?:\.\d+)?(?:px|rem|em)\b/);
      if (m) problems.push(`${rel}:${i + 1}: type-scale: a type size outside the three tokens (found "${m[0]}")`);
    });
  }

  // 3. Contrast: every text/background token pair in contrast-pairs.json reaches the minimum (WCAG 2 ratio).
  const colour = Object.fromEntries([...tokens.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const pairs = JSON.parse(readFileSync(join(web, "src", "styles", "contrast-pairs.json"), "utf8"));
  for (const [fg, bg] of pairs.pairs) {
    if (!colour[fg] || !colour[bg]) { problems.push(`src/styles/contrast-pairs.json: contrast: no colour token "${!colour[fg] ? fg : bg}"`); continue; }
    const [a, b] = [lum(colour[fg]), lum(colour[bg])];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < pairs.minimum) problems.push(`src/styles/contrast-pairs.json: contrast: ${fg} on ${bg} is ${ratio.toFixed(2)} : 1, below ${pairs.minimum}`);
  }
}

if (problems.length) {
  console.error(`guard: ${problems.length} problem(s) in ${mode}:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`guard: ${mode} is clean (${relative(web, target) || "."})`);
