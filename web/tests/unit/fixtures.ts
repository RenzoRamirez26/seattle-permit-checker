/** Reads a fixture written by scripts/make-fixtures.py (real API responses, no key). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname, "..", "fixtures");

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as T;
}
export function fixtureNames(prefix: string): string[] {
  return readdirSync(DIR).filter((f) => f.startsWith(prefix)).map((f) => f.replace(/\.json$/, ""));
}
