import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { config } from "./config";
import { childLogger } from "./lib/logger";

const log = childLogger({ module: "db" });

/** What a repository needs: satisfied by the pool and by a transaction client. */
export interface Queryable {
  query<R extends QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}

let pool: Pool | undefined;

/** Lazy, so importing a module that can query never opens a connection by itself. */
export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    host: config.PG_HOST,
    port: config.PG_PORT,
    database: config.PG_DATABASE,
    user: config.PG_USER,
    password: config.PG_PASSWORD,
    max: 10,
  });
  // Postgres restarting drops every idle connection, and pg reports that on
  // the pool. Without a listener here Node treats an emitter's 'error' as
  // unhandled and takes the process down: the api died instead of answering
  // /health with postgres down, which is the one reading a deploy rolls back
  // on and the one a person looks at first. The pool discards the client and
  // opens a new one on the next query, so this is a line in the log and not
  // an outage of anything.
  pool.on("error", (error) => log.warn({ err: error.message }, "an idle database connection was dropped"));
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}

/**
 * Runs work in one transaction. A seam rather than a call, so a test can hand
 * in one that is already inside the transaction it rolls back, and the code
 * under test does not have to know which it got.
 */
export type Transactor = <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;

export function transactor(db: Pool): Transactor {
  return (fn) => withTx(db, fn);
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
