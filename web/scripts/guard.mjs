#!/usr/bin/env node
// The build guard (docs/website_plan.md section 5). Fails the build if web/ holds a building-code number,
// pass/fail logic, a model call, browser speech recognition, or a way to show model output as HTML.
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
    { rule: "speech-recognition", why: "browser speech recognition can send audio to the browser maker; audio goes to our API only",
      re: /SpeechRecognition/ },
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

if (problems.length) {
  console.error(`guard: ${problems.length} problem(s) in ${mode}:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`guard: ${mode} is clean (${relative(web, target) || "."})`);
