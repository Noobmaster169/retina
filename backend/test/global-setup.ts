import { Client } from "pg";

import { migrate } from "../db/migrate.mjs";
import { TEST_ENV } from "../vitest.config";

/** Creates the test database once if it is missing, then brings it up to date. */
export default async function setup(): Promise<void> {
  const admin = new Client({
    host: TEST_ENV.PG_HOST,
    port: Number(TEST_ENV.PG_PORT),
    database: "postgres",
    user: TEST_ENV.PG_USER,
    password: TEST_ENV.PG_PASSWORD,
  });
  await admin.connect();
  try {
    const found = await admin.query("select 1 from pg_database where datname = $1", [TEST_ENV.PG_DATABASE]);
    if (found.rowCount === 0) await admin.query(`create database ${TEST_ENV.PG_DATABASE}`);
  } finally {
    await admin.end();
  }

  // migrate.mjs reads the connection from the environment, and global setup
  // runs outside the workers that vitest applies `test.env` to.
  Object.assign(process.env, TEST_ENV);
  await migrate({ log: () => undefined });
}
