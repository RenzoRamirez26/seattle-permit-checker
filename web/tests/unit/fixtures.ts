/** Reads a fixture written by scripts/make-fixtures.py (real API responses, no key). */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", `${name}.json`), "utf8")) as T;
}
export function fixtureNames(prefix: string): string[] {
  return require("node:fs").readdirSync(join(__dirname, "..", "fixtures"))
    .filter((f: string) => f.startsWith(prefix)).map((f: string) => f.replace(/\.json$/, ""));
}
