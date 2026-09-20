import { type Job, Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Pool } from "pg";

import { childLogger } from "../lib/logger";
import { clients } from "../ontology/repositories";
import { ageWaitingJobs } from "./aging";
import { beat, HEARTBEAT_EVERY_MS } from "./heartbeat";
import { QUEUES } from "./names";
import type { PriorityCache } from "./priority-cache";
import { getQueues } from "./queues";

const log = childLogger({ module: "schedulers" });

/**
 * The work that runs on a clock rather than on an email: refreshing the tier
 * cache, promoting jobs that have waited, and saying the worker is alive.
 *
 * BullMQ's own schedulers, not cron on the box, for two reasons. The box runs
 * one crontab that nobody reviews and a scheduled job there would be invisible
 * to anyone reading this repository. And a repeatable job is keyed, so a
 * worker restart every three minutes under auto-deploy re-registers the same
 * three tasks rather than accumulating a new copy each time.
 *
 * Phase 10 adds `refresh-analytics` here. Add it to TASKS, not to the box.
 */

/** The names the repeatable jobs are registered under. A restart upserts these, never a fourth copy. */
export const SCHEDULED = {
  refreshPriorityCache: "refresh-priority-cache",
  ageWaitingJobs: "age-waiting-jobs",
  heartbeat: "heartbeat",
} as const;

const EVERY_HOUR_MS = 60 * 60 * 1000;
const EVERY_MINUTE_MS = 60 * 1000;

const EVERY: Record<string, number> = {
  [SCHEDULED.refreshPriorityCache]: EVERY_HOUR_MS,
  [SCHEDULED.ageWaitingJobs]: EVERY_MINUTE_MS,
  [SCHEDULED.heartbeat]: HEARTBEAT_EVERY_MS,
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

async function runTask(deps: SchedulerDeps, name: string): Promise<void> {
  if (name === SCHEDULED.refreshPriorityCache) return refreshPriorityCache(deps);
  if (name === SCHEDULED.ageWaitingJobs) return ageEmailQueues(deps);
  if (name === SCHEDULED.heartbeat) return beat(deps.redis);
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
