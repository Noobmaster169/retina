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
  // A role is cluster-wide, so retina_ro is the same principal in retina_test
  // and in the development database, and migration 011 sets its password every
  // time it runs. Local development and the tests therefore have to agree on
  // one value: this is it, and .env.example uses it too. On the box there is
  // one database and PG_RO_PASSWORD is a real secret.
  PG_RO_PASSWORD: "localdev",
  DATABASE_RO_URL: "postgres://retina_ro:localdev@127.0.0.1:5433/retina_test",
  EMAIL_SERVER_URL: "http://127.0.0.1:8080",
  // Database 1 of the same Redis, so a test that drives real BullMQ workers
  // cannot hand its jobs to a development worker running on 0, or take one of
  // that worker's. Nothing else in the project uses a database other than 0.
  REDIS_URL: "redis://127.0.0.1:6379/1",
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
