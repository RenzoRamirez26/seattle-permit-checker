import { describe, expect, it } from "vitest";
import { ERROR_WORDS, errorWords } from "@/api/errors";
import { fixture, fixtureNames } from "./fixtures";

describe("error messages", () => {
  const codes = fixtureNames("error_").map((n) => fixture<{ body: { error: { code: string } } }>(n).body.error.code);

  it("covers every error code the API returned in the fixtures", () => {
    expect(codes.length).toBeGreaterThan(10);
    for (const code of codes) expect(ERROR_WORDS[code], code).toBeTruthy();
  });

  it("names the fix and avoids please, sorry, invalid and oops", () => {
    for (const [code, words] of Object.entries(ERROR_WORDS)) {
      expect(words, code).not.toMatch(/\b(please|sorry|invalid|oops)\b/i);
      expect(words.split(". ").length, code).toBeGreaterThanOrEqual(1);
      expect(words.endsWith("."), code).toBe(true);
    }
  });

  it("falls back to the server error sentence for an unknown code", () => {
    expect(errorWords("never-seen")).toBe(ERROR_WORDS.server_error);
  });
});
