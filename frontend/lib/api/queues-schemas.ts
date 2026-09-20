import { z } from "zod";

/**
 * Mirrors backend/src/contracts.queues.ts by hand. A drift fails here, naming
 * the field, instead of reaching the run page as undefined.
 */

export const QueueName = z.enum(["classify", "compare"]);
export type QueueName = z.infer<typeof QueueName>;

export const QueueSlot = z.object({
  emailId: z.string(),
  /** What the model is doing, in plain English. Never a step name. */
  step: z.string(),
  startedAt: z.string().nullable(),
  elapsedMs: z.number().nullable(),
});
export type QueueSlot = z.infer<typeof QueueSlot>;

export const QueuedEmail = z.object({
  emailId: z.string(),
  /** "two files, txt and pdf". Empty before ingest has written the attachments. */
  files: z.string(),
  heldMs: z.number().nullable(),
});
export type QueuedEmail = z.infer<typeof QueuedEmail>;

export const QueueView = z.object({
  name: QueueName,
  /** How many slots there are. The panel's denominator. */
  concurrency: z.number(),
  waiting: z.number(),
  active: z.number(),
  failed: z.number(),
  /** When the queue takes work again. An instant, not a duration, so a stale poll cannot skew the countdown. */
  heldUntil: z.string().nullable(),
  slots: z.array(QueueSlot),
  next: z.array(QueuedEmail),
});
export type QueueView = z.infer<typeof QueueView>;

export const RunQueuesView = z.object({
  classify: QueueView,
  compare: QueueView,
  handoff: z.object({ needCheck: z.number(), notComparable: z.number() }),
  reachable: z.boolean(),
});
export type RunQueuesView = z.infer<typeof RunQueuesView>;

/** Mirrors HealthReport in backend/src/contracts.ts: what the rail's dependency row reads. */
export const CheckStatus = z.enum(["up", "down"]);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const HealthReport = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    postgres: CheckStatus,
    redis: CheckStatus,
    minio: CheckStatus,
    inbox: CheckStatus,
    docExtract: CheckStatus,
  }),
});
export type HealthReport = z.infer<typeof HealthReport>;

/** The rail draws these in the organisers' own order, with doc-extract last because it is the one that falls over. */
export const DEPENDENCIES = ["postgres", "redis", "minio", "inbox", "docExtract"] as const;

/** The label each check takes on screen: the service's own name, not a prettified one. */
export const DEPENDENCY_LABELS: Record<(typeof DEPENDENCIES)[number], string> = {
  postgres: "postgres",
  redis: "redis",
  minio: "minio",
  inbox: "inbox",
  docExtract: "doc-extract",
};
