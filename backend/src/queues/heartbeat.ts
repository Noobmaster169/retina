import type { Redis } from "ioredis";

/**
 * The worker saying it is alive, where the api can see it.
 *
 * The api and the worker are separate containers with no channel between
 * them, so the only honest way for `/health` to speak about the worker is a
 * mark the worker itself leaves. The key carries its own expiry: a worker that
 * dies stops writing, the key expires, and the api reports a worker that is
 * not there without anyone having to notice it died.
 *
 * The expiry is six beats, not one. A worker that misses a cycle under load is
 * still working, and auto-deploy reads `/health`: a heartbeat that went stale
 * for a moment must never be the reason a good image is rolled back.
 */

export const HEARTBEAT_KEY = "worker:heartbeat";

/** Every ten seconds, from the scheduler. */
export const HEARTBEAT_EVERY_MS = 10_000;

/** How long a written beat stands. Six beats, so a missed cycle is invisible and a dead worker is not. */
export const HEARTBEAT_TTL_S = 60;

/** Marks the worker alive, now. */
export async function beat(redis: Redis, at = new Date()): Promise<void> {
  await redis.set(HEARTBEAT_KEY, at.toISOString(), "EX", HEARTBEAT_TTL_S);
}

/**
 * When the worker last said it was alive, or null when no beat stands.
 *
 * Null is the same answer for a worker that is down, one that has never run,
 * and a Redis the api cannot read. All three mean the api cannot see a worker,
 * which is exactly what it reports.
 */
export async function lastBeat(redis: Redis): Promise<string | null> {
  return redis.get(HEARTBEAT_KEY);
}
