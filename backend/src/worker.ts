import { proxyLlmClient } from "./agents";
import { config } from "./config";
import { closePool, getPool } from "./db";
import { httpDocExtractClient } from "./doc-extract";
import { AverisSource } from "./ingest";
import { inboxUrl } from "./inboxes";
import { TerminalError } from "./lib/errors";
import { childLogger } from "./lib/logger";
import { redisGateMeter } from "./ingest";
import { redisLiveCalls } from "./live";
import { closeRedis, getRedis } from "./queues/connection";
import { redisPriorityCache } from "./queues/priority-cache";
import { closeQueues, getQueues } from "./queues/queues";
import { startSchedulers } from "./queues/schedulers";
import { startWorkers } from "./queues/workers";
import { createMinioStore } from "./storage";

const log = childLogger({ module: "worker" });

const store = createMinioStore();
await store.ensureBucket();

const queues = getQueues();
const live = redisLiveCalls();
const redis = getRedis();
const pool = getPool();
const priority = redisPriorityCache(redis);
const llm = proxyLlmClient({ maxConcurrency: config.LLM_MAX_CONCURRENCY });
// A lane of its own, as wide as the queue it serves: see WorkerDeps.ontologyLlm.
const ontologyLlm = proxyLlmClient({ maxConcurrency: config.ONTOLOGY_CONCURRENCY });
const workers = startWorkers(
  {
    pool,
    source: new AverisSource(config.EMAIL_SERVER_URL),
    // A run that names an inbox this deployment was not given fails its ingest
    // loudly rather than quietly reading the organisers' one: the api refuses
    // to create such a run, so this is only ever a misconfiguration.
    sourceFor: (source) => {
      const url = inboxUrl(source);
      if (!url) throw new TerminalError(`this deployment serves no ${source} inbox; set EMAIL_SERVER_5K_URL`);
      return new AverisSource(url);
    },
    store,
    llm,
    ontologyLlm,
    docExtract: httpDocExtractClient(config.DOC_EXTRACT_URL),
    live,
    classify: queues.classify,
    compare: queues.compare,
    ontology: queues.ontology,
    priority,
    // The gate. Its mode comes from GATE_MODE and its default is `observe`,
    // so a worker that has just been deployed records every verdict and holds
    // nothing an automatic rule decided.
    gate: { redis, meter: redisGateMeter(redis) },
  },
  redis,
);
// The worker owns the clock, not the api: the api runs behind a load balancer
// in principle and one of two replicas writing the heartbeat would say the
// worker is alive when it is not.
const schedulers = await startSchedulers({ pool, redis, priority, aging: [queues.classify, queues.compare] });
log.info(
  {
    classify: config.CLASSIFY_CONCURRENCY,
    compare: config.COMPARE_CONCURRENCY,
    ontology: config.ONTOLOGY_CONCURRENCY,
    llm: config.LLM_MAX_CONCURRENCY,
    ontologyLlm: config.ONTOLOGY_CONCURRENCY,
  },
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
    await schedulers.stop();
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
