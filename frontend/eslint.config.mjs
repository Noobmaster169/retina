import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // CLAUDE.md's 200-line rule, checked rather than audited. api-client.ts
      // reached 374 lines because nothing was watching it.
      "max-lines": ["error", { max: 200, skipBlankLines: false, skipComments: false }],
    },
  },
]);

export default eslintConfig;
