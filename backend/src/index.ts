import net from "node:net";

import { createApp } from "./app";
import { config } from "./config";
import { closePool, getPool } from "./db";
import { checkHealth } from "./health";
import { childLogger } from "./lib/logger";
import { closeRedis } from "./queues/connection";
import { closeQueues } from "./queues/queues";
import { bullRunQueues } from "./queues/run-queues";
import { inboxScorer } from "./scorer/scorer";
import { createMinioStore, type ObjectStore } from "./storage";

const log = childLogger({ module: "api" });

// Happy Eyeballs gives each candidate address 250ms to connect, which cold
// connections from some networks blow through and fail as ETIMEDOUT.
// This is a connect-attempt budget, not a request timeout.
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

/** Null where object storage is not configured yet. /health says so; nothing else in the api needs it. */
function storeOrNull(): ObjectStore | null {
  try {
    return createMinioStore();
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : String(error) }, "object storage unavailable");
    return null;
  }
}

const pool = getPool();
const store = storeOrNull();
const app = createApp({
  pool,
  runQueues: bullRunQueues(),
  store,
  scorer: inboxScorer(config.EMAIL_SERVER_URL),
  health: () => checkHealth({ pool, store }),
});

const server = app.listen(config.PORT, () => log.info({ port: config.PORT }, "api listening"));
// A cold model plus a long generation can outlast the default 5-minute
// request timeout; the llm client has its own 600s ceiling, the binding one.
server.requestTimeout = 660_000;
server.headersTimeout = 665_000;

/** Never rejects: a signal handler cannot await it, so a failure is logged here or nowhere. */
async function shutdown(): Promise<void> {
  try {
    await closeQueues();
    await closeRedis();
    await closePool();
  } catch (error) {
    log.error({ err: error instanceof Error ? error.message : String(error) }, "shutdown failed");
    process.exit(1);
  }
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void shutdown());
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
