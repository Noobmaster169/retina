import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { config } from "./config";

/** What a repository needs: satisfied by the pool and by a transaction client. */
export interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

let pool: Pool | undefined;

/** Lazy, so importing a module that can query never opens a connection by itself. */
export function getPool(): Pool {
  pool ??= new Pool({
    host: config.PG_HOST,
    port: config.PG_PORT,
    database: config.PG_DATABASE,
    user: config.PG_USER,
    password: config.PG_PASSWORD,
    max: 10,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

/** Runs `fn` in one transaction: committed if it returns, rolled back if it throws. */
export async function withTx<T>(db: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
