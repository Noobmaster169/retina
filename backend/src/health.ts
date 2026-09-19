import type { Pool } from "pg";

import { config } from "./config";
import type { CheckStatus, HealthReport } from "./contracts";
import { pingDocExtract } from "./doc-extract";
import { childLogger } from "./lib/logger";
import { withTimeout } from "./lib/time";
import { pingRedis } from "./queues/connection";
import type { ObjectStore } from "./storage";

const log = childLogger({ module: "health" });

const CHECK_TIMEOUT_MS = 2000;

async function check(name: string, probe: () => Promise<unknown>): Promise<CheckStatus> {
  try {
    await withTimeout(probe(), CHECK_TIMEOUT_MS, name);
    return "up";
  } catch (error) {
    // Down is the answer, not a failure of this request: the report carries it.
    log.debug({ check: name, err: error instanceof Error ? error.message : String(error) }, "health check down");
    return "down";
  }
}

async function pingInbox(): Promise<void> {
  const response = await fetch(`${config.EMAIL_SERVER_URL.replace(/\/+$/, "")}/health`, {
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`inbox /health returned ${response.status}`);
}

export interface HealthDeps {
  pool: Pool;
  /** Null when object storage is not configured, which reports as down. */
  store: ObjectStore | null;
}

/** Deliberately leaves the llm-proxy out: a probe would report the api down every time a model was cold. */
export async function checkHealth(deps: HealthDeps): Promise<HealthReport> {
  const { store } = deps;
  const [postgres, redis, minio, inbox, docExtract] = await Promise.all([
    check("postgres", () => deps.pool.query("select 1")),
    check("redis", () => pingRedis(CHECK_TIMEOUT_MS)),
    check("minio", () => (store ? store.ping() : Promise.reject(new Error("not configured")))),
    check("inbox", pingInbox),
    check("docExtract", () => pingDocExtract(config.DOC_EXTRACT_URL, CHECK_TIMEOUT_MS)),
  ]);
  const checks = { postgres, redis, minio, inbox, docExtract };
  return { status: Object.values(checks).every((status) => status === "up") ? "ok" : "degraded", checks };
}
