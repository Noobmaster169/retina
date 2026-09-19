import { Redis } from "ioredis";

import { config } from "../config";
import { childLogger } from "../lib/logger";

const log = childLogger({ module: "redis" });

let shared: Redis | undefined;

/**
 * The connection every queue shares. Lazy, so a process that never touches a
 * queue never dials Redis. `maxRetriesPerRequest: null` is a BullMQ
 * requirement: commands wait out a reconnect instead of failing.
 */
export function getRedis(): Redis {
  if (shared) return shared;
  shared = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  shared.on("error", (error) => log.warn({ err: error.message }, "redis connection error"));
  return shared;
}

/**
 * True while the shared connection is known to be down. A command issued then
 * would wait for the reconnect and still run long after its caller gave up.
 */
export function redisIsDown(): boolean {
  const { status } = getRedis();
  return status === "reconnecting" || status === "close" || status === "end";
}

export async function closeRedis(): Promise<void> {
  if (!shared) return;
  const closing = shared;
  shared = undefined;
  await closing.quit();
}

/** One short-lived connection that gives up at once, so /health cannot hang or leave a reconnect loop behind. */
export async function pingRedis(timeoutMs: number): Promise<void> {
  const probe = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  probe.on("error", () => undefined);
  try {
    await probe.connect();
    await probe.ping();
  } finally {
    probe.disconnect();
  }
}
