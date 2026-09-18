import { Pool } from "pg";

// Next.js reloads modules on every request in dev. Without stashing the pool on
// globalThis you leak a new connection pool per reload until Postgres refuses
// more connections.
const globalForDb = globalThis as unknown as { pool?: Pool };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Lazily opens the shared Postgres pool. Lazy on purpose: reading config at
 * module load would break `next build`, which imports route modules without
 * runtime env vars present.
 *
 * Discrete PG_* variables rather than a single DATABASE_URL, matching the
 * house convention — non-secret parts live in the ConfigMap, PG_PASSWORD alone
 * lives in the Secret.
 */
export function getPool(): Pool {
  if (globalForDb.pool) return globalForDb.pool;

  const pool = new Pool({
    host: required("PG_HOST"),
    port: Number(process.env.PG_PORT ?? "5432"),
    database: required("PG_DATABASE"),
    user: required("PG_USER"),
    password: required("PG_PASSWORD"),
    max: 10,
  });

  globalForDb.pool = pool;
  return pool;
}
