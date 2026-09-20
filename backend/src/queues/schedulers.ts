import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Pool } from "pg";

import type { LlmClient } from "../agents";
import { childLogger } from "../lib/logger";
import { refreshIfStale } from "../ontology/derived";
import { clients } from "../ontology/repositories";
import { ageWaitingJobs } from "./aging";
import { beat, HEARTBEAT_EVERY_MS } from "./heartbeat";
import { QUEUES } from "./names";
import type { PriorityCache } from "./priority-cache";
import { getQueues } from "./queues";
import { refreshProfiles } from "./refresh-profiles";

const log = childLogger({ module: "schedulers" });

/**
 * The work that runs on a clock rather than on an email: refreshing the tier
 * cache, promoting jobs that have waited, saying the worker is alive, and
 * bringing everything derived level with core.
 *
 * BullMQ's own schedulers, not cron on the box, for two reasons. The box runs
 * one crontab that nobody reviews and a scheduled job there would be invisible
 * to anyone reading this repository. And a repeatable job is keyed, so a
 * worker restart every three minutes under auto-deploy re-registers the same
 * tasks rather than accumulating a new copy of each one.
 */

/** The names the repeatable jobs are registered under. A restart upserts these, never a fifth copy. */
export const SCHEDULED = {
  refreshPriorityCache: "refresh-priority-cache",
  ageWaitingJobs: "age-waiting-jobs",
  heartbeat: "heartbeat",
  refreshAnalytics: "refresh-analytics",
  refreshProfiles: "refresh-profiles",
} as const;

const EVERY_HOUR_MS = 60 * 60 * 1000;
const EVERY_MINUTE_MS = 60 * 1000;
const EVERY_FIVE_MINUTES_MS = 5 * EVERY_MINUTE_MS;
const EVERY_TEN_MINUTES_MS = 10 * EVERY_MINUTE_MS;

const EVERY: Record<string, number> = {
  [SCHEDULED.refreshPriorityCache]: EVERY_HOUR_MS,
  [SCHEDULED.ageWaitingJobs]: EVERY_MINUTE_MS,
  [SCHEDULED.heartbeat]: HEARTBEAT_EVERY_MS,
  [SCHEDULED.refreshAnalytics]: EVERY_FIVE_MINUTES_MS,
  // The profile job does model work, so it runs less often than the derived
  // refresh and takes at most PROFILE_BATCH things per tick.
  [SCHEDULED.refreshProfiles]: EVERY_TEN_MINUTES_MS,
};

export interface SchedulerDeps {
  pool: Pool;
  redis: Redis;
  priority: PriorityCache;
  /**
   * Which queue to register on. Only a test passes it, and only so that
   * clearing its own queue cannot wipe the registrations of a worker running
   * against the same Redis, which is exactly what a dev box has.
   */
  queueName?: string;
  /**
   * The model client the profile job calls. Absent, that job does nothing and
   * says so: the api registers schedulers in tests and has no worker's client.
   */
  llm?: LlmClient;
  /**
   * The queues the aging pass walks. Passed for the same reason as
   * `queueName`: without it a test's own scheduler ages the real `classify`
   * and `compare` of a worker sharing this Redis, and the isolation the name
   * buys is only half of what it looks like.
   */
  aging?: Queue[];
}

/** Postgres is the truth; the hash is a copy the enqueue path can afford to read. */
async function refreshPriorityCache(deps: SchedulerDeps): Promise<void> {
  await deps.priority.replaceAll(await clients.tiers(deps.pool));
}

async function ageEmailQueues(deps: SchedulerDeps): Promise<void> {
  const queues = deps.aging ?? Object.values(pick(getQueues()));
  const results = await Promise.all(queues.map((queue) => ageWaitingJobs(queue)));
  const promoted = results.reduce((sum, result) => sum + result.promoted, 0);
  if (promoted > 0) log.info({ promoted }, "aged waiting jobs");
}

/** The two queues emails wait in. Ingest holds one job per run and has nothing to order. */
function pick({ classify, compare }: ReturnType<typeof getQueues>) {
  return { classify, compare };
}

/**
 * The analytics views and the resolved ontology, both only when core has
 * moved. That check is what makes a five minute clock cheap enough to leave
 * on, and keeping them in one task is what stops one of them being forgotten.
 */
async function refreshDerived(deps: SchedulerDeps): Promise<void> {
  const result = await refreshIfStale(deps.pool);
  if (result.views) log.info({ things: result.entities }, "the derived data caught up with core");
}

async function runTask(deps: SchedulerDeps, name: string): Promise<void> {
  if (name === SCHEDULED.refreshPriorityCache) return refreshPriorityCache(deps);
  if (name === SCHEDULED.ageWaitingJobs) return ageEmailQueues(deps);
  if (name === SCHEDULED.heartbeat) return beat(deps.redis);
  if (name === SCHEDULED.refreshAnalytics) return refreshDerived(deps);
  if (name === SCHEDULED.refreshProfiles) {
    if (!deps.llm) return void log.warn({ task: name }, "no model client, so no profile was written");
    await refreshProfiles({ pool: deps.pool, llm: deps.llm });
    return;
  }
  // A name from an older image whose scheduler this worker inherited. Logged
  // and dropped: failing it would retry a job no code here can ever do.
  log.warn({ task: name }, "no such scheduled task");
}

export interface RunningSchedulers {
  stop(): Promise<void>;
}

/**
 * Registers the repeatable jobs and consumes them.
 *
 * Concurrency 1: these tasks are short, and two aging passes at once would
 * read the same waiting job twice and promote it twice in one minute.
 *
 * The first heartbeat is written before anything is registered, so a worker
 * that has just booted is visible to `/health` immediately rather than ten
 * seconds later, which is long enough for a deploy's health gate to see a
 * worker that is running as one that is not.
 */
export async function startSchedulers(deps: SchedulerDeps): Promise<RunningSchedulers> {
  const queue = new Queue(deps.queueName ?? QUEUES.scheduler, { connection: deps.redis });

  // Neither is worth failing a boot over. The worker already has its queue
  // consumers running and its shutdown handlers are not installed yet, so a
  // throw here would end the process with jobs holding locks and no clean
  // close. Both are repeatable jobs: the next cycle does them properly.
  await beat(deps.redis).catch((error) => log.warn({ err: message(error) }, "could not write the first heartbeat"));
  await refreshPriorityCache(deps).catch((error) => log.warn({ err: message(error) }, "could not fill the priority cache at boot"));

  for (const name of Object.values(SCHEDULED)) {
    await queue.upsertJobScheduler(name, { every: EVERY[name] }, { name });
  }

  const worker = new Worker(queue.name, (job: Job) => runTask(deps, job.name), {
    connection: deps.redis,
    concurrency: 1,
  });
  worker.on("failed", (job, error) => log.warn({ task: job?.name, err: error.message }, "a scheduled task failed"));
  worker.on("error", (error) => log.warn({ err: error.message }, "scheduler worker error"));

  log.info({ tasks: Object.values(SCHEDULED) }, "schedulers registered");

  return {
    async stop() {
      await worker.close();
      await queue.close();
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
