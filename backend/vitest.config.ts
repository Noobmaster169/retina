import { defineConfig } from "vitest/config";

// The integration tests talk to the Postgres from compose.local.yaml, in its
// own database so they never see or touch development rows.
export const TEST_ENV = {
  NODE_ENV: "test",
  PG_HOST: "127.0.0.1",
  PG_PORT: "5433",
  PG_DATABASE: "retina_test",
  PG_USER: "postgres",
  PG_PASSWORD: "localdev",
  EMAIL_SERVER_URL: "http://127.0.0.1:8080",
  API_SHARED_SECRET: "test-frontend-key",
  TEAM_API_KEY: "test-team-key",
  LOG_LEVEL: "silent",
};

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    env: TEST_ENV,
    // One database, shared by every file.
    fileParallelism: false,
  },
});
