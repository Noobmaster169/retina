import { proxyLlmClient } from "./agents";
import { config } from "./config";
import { closePool, getPool } from "./db";
import { httpDocExtractClient } from "./doc-extract";
import { AverisSource } from "./ingest";
import { childLogger } from "./lib/logger";
import { redisLiveCalls } from "./live";
import { closeRedis, getRedis } from "./queues/connection";
import { closeQueues, getQueues } from "./queues/queues";
import { startWorkers } from "./queues/workers";
import { createMinioStore } from "./storage";

const log = childLogger({ module: "worker" });

const store = createMinioStore();
await store.ensureBucket();

const queues = getQueues();
const live = redisLiveCalls();
const workers = startWorkers(
  {
    pool: getPool(),
    source: new AverisSource(config.EMAIL_SERVER_URL),
    store,
    llm: proxyLlmClient({ maxConcurrency: config.LLM_MAX_CONCURRENCY }),
    docExtract: httpDocExtractClient(config.DOC_EXTRACT_URL),
    live,
    classify: queues.classify,
    compare: queues.compare,
  },
  getRedis(),
);
log.info(
  { classify: config.CLASSIFY_CONCURRENCY, compare: config.COMPARE_CONCURRENCY, llm: config.LLM_MAX_CONCURRENCY },
  "worker started",
);

let shuttingDown = false;
/** Never rejects: a signal handler cannot await it, so a failure is logged here or nowhere. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "worker stopping");
  try {
    await workers.stop();
    await live.close();
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
  process.on(signal, () => void shutdown(signal));
}
