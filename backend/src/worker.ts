import { config } from "./config";
import { closePool, getPool } from "./db";
import { AverisSource } from "./ingest";
import { childLogger } from "./lib/logger";
import { closeRedis, getRedis } from "./queues/connection";
import { closeQueues, getQueues } from "./queues/queues";
import { startWorkers } from "./queues/workers";
import { createMinioStore } from "./storage";

const log = childLogger({ module: "worker" });

const store = createMinioStore();
await store.ensureBucket();

const queues = getQueues();
const workers = startWorkers(
  {
    pool: getPool(),
    source: new AverisSource(config.EMAIL_SERVER_URL),
    store,
    classify: queues.classify,
    compare: queues.compare,
  },
  getRedis(),
);
log.info({ classify: config.CLASSIFY_CONCURRENCY, compare: config.COMPARE_CONCURRENCY }, "worker started");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "worker stopping");
  await workers.stop();
  await closeQueues();
  await closeRedis();
  await closePool();
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
