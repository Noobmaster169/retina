import type { Pool } from "pg";

import { config } from "./config";
import { HealthChecks, type HealthReport, type QueueCounts } from "./contracts";
import { childLogger } from "./lib/logger";
import { withTimeout } from "./lib/time";
import { pingRedis } from "./queues/connection";
import { HEARTBEAT_TTL_S } from "./queues/heartbeat";
import type { ObjectStore } from "./storage";
import { httpProbes, type Probes } from "./health-probes";

const log = childLogger({ module: "health" });

const CHECK_TIMEOUT_MS = 2000;

/**
 * What the system says about itself, in one reading.
 *
 * Every check is bounded and none of them can fail this request: a dependency
 * that is down is the answer, not an error, and the report carries it. They
 * run together, so the slowest one sets how long the whole reading takes.
 *
 * What counts as `down` is deliberately narrow. Only postgres and redis make
 * this a 503, because a 503 is what auto-deploy rolls back on. A worker one
 * heartbeat late, a MinIO restarting, an OCR service still warming: all
 * `degraded`, all 200, all visible.
 */

type Detail = Record<string, unknown>;

/** Runs a probe, times it, and turns whatever it throws into a reading. */
async function check(name: string, probe: () => Promise<Detail | void>): Promise<{ status: string; latencyMs: number } & Detail> {
  const started = Date.now();
  try {
    const detail = (await withTimeout(probe(), CHECK_TIMEOUT_MS, name)) ?? {};
    return { status: "up", latencyMs: Date.now() - started, ...detail };
  } catch (error) {
    log.debug({ check: name, err: message(error) }, "health check down");
    return { status: "down", latencyMs: Date.now() - started };
  }
}

/** Reads Redis for something the report would rather have than not. Absent is a reading; silence is not. */
async function optional<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    log.warn({ check: name, err: message(error) }, "health could not read redis");
    return null;
  }
}

export interface HealthDeps {
  pool: Pool;
  /** Null when object storage is not configured, which reports as down. */
  store: ObjectStore | null;
  /** When the worker last said it was alive, and how much work is waiting. Both read Redis, so both may be absent. */
  worker: () => Promise<string | null>;
  queues: () => Promise<{ classify: QueueCounts; compare: QueueCounts }>;
  /** The three dependencies reached over HTTP. Injected so a test never dials the real proxy or the real inbox. */
  probes?: Probes;
}

/** A beat older than its own TTL cannot be standing, so anything we can read is fresh by construction. Belt and braces. */
function workerCheck(heartbeatAt: string | null): HealthChecks["worker"] {
  const at = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
  const fresh = Number.isFinite(at) && Date.now() - at < HEARTBEAT_TTL_S * 1000;
  return { status: fresh ? "up" : "down", heartbeatAt };
}

export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  const { store } = deps;
  const probes = deps.probes ?? httpProbes(config, CHECK_TIMEOUT_MS);
  const [postgres, redis, minio, inbox, docExtract, llmProxy, heartbeatAt, queues] = await Promise.all([
    check("postgres", async () => void (await deps.pool.query("select 1"))),
    check("redis", () => pingRedis(CHECK_TIMEOUT_MS)),
    check("minio", () => (store ? store.ping() : Promise.reject(new Error("not configured")))),
    // Called through a closure, never passed unbound: a Probes implemented as
    // a class loses `this` the moment its method travels on its own.
    check("inbox", () => probes.inbox()),
    check("docExtract", () => probes.docExtract()),
    check("llmProxy", () => probes.llmProxy()),
    optional("worker", () => deps.worker()),
    optional("queues", () => deps.queues()),
  ]);

  // Parsed, not asserted. A probe that answered `scoring_available` where the
  // contract says `scoringAvailable` would otherwise compile clean here and
  // reach the rail as undefined, which is the drift every other boundary in
  // this codebase is parsed to catch.
  const parsed = HealthChecks.safeParse({
    postgres,
    redis,
    minio,
    inbox,
    docExtract,
    llmProxy,
    worker: workerCheck(heartbeatAt),
  });
  if (!parsed.success) {
    // The report still has to answer. A check whose detail did not fit is
    // reported without it rather than not at all.
    log.warn({ issues: parsed.error.issues.map((issue) => issue.path.join(".")) }, "a health check answered outside its contract");
  }
  const checks = parsed.success ? parsed.data : bare(heartbeatAt);
  return { status: statusOf(checks), checks, version: config.GIT_SHA, queues };
}

/** Status only, for a report whose detail did not fit. Every check reads down, which is what "we cannot tell" means here. */
function bare(heartbeatAt: string | null): HealthChecks {
  const down = { status: "down" as const };
  return { postgres: down, redis: down, minio: down, inbox: down, docExtract: down, llmProxy: down, worker: workerCheck(heartbeatAt) };
}

/** Down is the api unable to serve at all. Everything else degrades, and a degraded api is still an api. */
function statusOf(checks: HealthChecks): HealthReport["status"] {
  if (checks.postgres.status === "down" || checks.redis.status === "down") return "down";
  return Object.values(checks).every((one) => one.status === "up") ? "ok" : "degraded";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
