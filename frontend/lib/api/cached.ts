import { unstable_cache } from "next/cache";

/**
 * A read whose answer may be reused for a few seconds.
 *
 * Server-side only, like the rest of this folder. What it wraps is the same
 * function it returns; what it adds is that two people opening the same
 * company, or one person opening it twice, cost the backend one read instead
 * of two. The arguments are part of the key, so a cached read of one company
 * never answers for another.
 *
 * The line this draws is between what the mail resolved and what the pipeline
 * is doing. A resolved company, its counterparts, the lanes between ports: a
 * replay changes those, a click never does, and a minute of reuse is invisible.
 * A run's progress is the opposite, and the reads a live screen polls are
 * deliberately left out: the poll exists to show movement, and serving it from
 * a cache would make a running replay look stopped, which is worse than the
 * wait it would save.
 *
 * Reuse is only safe while a write invalidates it. Every write to a resolved
 * thing goes through one helper (`app/api/ontology/[type]/[id]/edit.ts`) and
 * that helper drops `BUSINESS`, so a person who corrects a name sees the
 * correction and not their own stale page.
 */

/** Everything the mail resolved. Dropped whole when a person edits, renames or merges a thing. */
export const BUSINESS = "business";

/** A minute. Long enough that clicking through a list is free, short enough that a replay's work appears. */
export const BUSINESS_SECONDS = 60;

/** A run's own shape. Dropped when a run is made, renamed, paused, resumed, cancelled or deleted. */
export const RUNS = "runs";

/** A run's own shape, not its progress. Short, because a run is a thing that is happening. */
export const RUN_SECONDS = 10;

export function cached<A extends unknown[], T>(
  /** Distinguishes this read from every other in the cache. The function's own name. */
  key: string,
  read: (...args: A) => Promise<T>,
  options: { seconds: number; tags: string[] },
): (...args: A) => Promise<T> {
  return unstable_cache(read, [key], { revalidate: options.seconds, tags: options.tags });
}
