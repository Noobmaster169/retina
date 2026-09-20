import { defineConfig } from "vitest/config";

/**
 * Pure helpers only. Rendering is checked by looking at the page, which is
 * what a design this specific asks for; what a test can hold is the wording
 * and the arithmetic underneath it.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ["{app,components,lib}/**/*.test.ts"], environment: "node" },
});
