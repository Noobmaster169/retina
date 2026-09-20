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
    // A table driven test is a table: the 200 line rule would split the table
    // from the thing it drives, which is the one place length is not a smell.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "max-lines": "off" },
  },
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
