import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The guard's import rules, repeated so the editor shows them while typing (docs/website_plan.md section 5).
const restricted = {
  patterns: [
    { group: ["**/checker/**", "**/seattle.json"], message: "The rulebook and checker/ stay on the server. Display what the API returns." },
    { group: ["anthropic", "@anthropic-ai/*", "openai", "@ai-sdk/*", "ai", "ai/*"], message: "Model calls go through the backend only." },
  ],
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", restricted],
      "react/no-danger": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "test-results/**", "playwright-report/**", "src/api/schema.d.ts"]),
]);
