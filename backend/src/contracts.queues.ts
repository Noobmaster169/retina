import { z } from "zod";

/**
 * The two queues as the run page draws them. `RunSummary.queues` carries the
 * counts; this carries who holds each slot and what they are doing, which is
 * the most visible thing on that page and the only way the drawing is of the
 * code rather than of an idea of it.
 *
 * Re-exported from contracts.ts; mirrored in frontend/lib/api/queues-schemas.ts.
 */

/** How much work a queue holds. On the run summary, on the health report, and on nothing else. */
export const QueueCounts = z.object({ waiting: z.number(), active: z.number(), failed: z.number() });
export type QueueCounts = z.infer<typeof QueueCounts>;

/** Which queue. The names are BullMQ's, from queues/names.ts. */
export const QueueName = z.enum(["classify", "compare"]);
export type QueueName = z.infer<typeof QueueName>;

/** One email holding a slot: which email, what it is doing, and how long it has held it. */
export const QueueSlot = z.object({
  emailId: z.string(),
  /**
   * In plain English, from the model call in flight. A job between calls says
   * what its queue does, because the slot is held either way.
   */
  step: z.string(),
  /** When the worker took the job. Null when BullMQ did not record it. */
  startedAt: z.string().nullable(),
  elapsedMs: z.number().nullable(),
});
export type QueueSlot = z.infer<typeof QueueSlot>;

/** An email waiting for a slot. */
export const QueuedEmail = z.object({
  emailId: z.string(),
  /** "two files, txt and pdf". Empty string before ingest has written its attachments. */
  files: z.string(),
  /**
   * When the job joined the queue. An instant and not a duration, for the same
   * reason as `heldUntil`: the page counts up from it on its own clock, and a
   * duration would be two seconds stale before it was ever drawn.
   */
  queuedAt: z.string(),
});
export type QueuedEmail = z.infer<typeof QueuedEmail>;

export const QueueView = z.object({
  name: QueueName,
  /** How many slots there are, from the worker's env. The panel's denominator. */
  concurrency: z.number(),
  waiting: z.number(),
  active: z.number(),
  failed: z.number(),
  /**
   * When the queue takes work again. Set when failure-policy.ts rate limited
   * it after a dependency refused; null while it is running. A held queue is
   * not a failed one, and the page must not draw it as one.
   *
   * An instant and not a duration: a poll is two seconds old by the time it is
   * drawn, and a countdown from a stale duration is wrong by exactly that.
   */
  heldUntil: z.string().nullable(),
  slots: z.array(QueueSlot),
  next: z.array(QueuedEmail),
});
export type QueueView = z.infer<typeof QueueView>;

/**
 * Both queues and the one crossing between them, aggregated here because
 * CLAUDE.md puts no business logic in the frontend.
 */
export const RunQueuesView = z.object({
  classify: QueueView,
  compare: QueueView,
  /** Of the emails sorted so far, how many cross into the second queue and how many stop at the first. */
  handoff: z.object({ needCheck: z.number(), notComparable: z.number() }),
  /** Null when the queues cannot be reached. The page then says so rather than drawing zeroes. */
  reachable: z.boolean(),
});
export type RunQueuesView = z.infer<typeof RunQueuesView>;
