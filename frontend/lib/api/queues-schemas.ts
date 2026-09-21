import { z } from "zod";

import { QueueCounts } from "./runs-schemas";

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
  /** When the job joined the queue. The page counts up from it on its own clock. */
  queuedAt: z.string(),
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

/**
 * A check carries its own detail, and the rail shows it on hover: how many
 * emails the inbox is serving, how many aliases the proxy has. Both have looked
 * like a healthy system from the outside at least once. doc-extract carries
 * none: it answers that it is up and there is nothing else it can say.
 */
const check = z.object({ status: CheckStatus, latencyMs: z.number().optional() });

export const HealthReport = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  checks: z.object({
    postgres: check,
    redis: check,
    minio: check,
    inbox: check.extend({ emails: z.number().optional(), scoringAvailable: z.boolean().optional() }),
    docExtract: check,
    llmProxy: check.extend({ models: z.number().optional() }),
    /** Not a probe: the mark the worker leaves in Redis every ten seconds. Null when none stands. */
    worker: check.extend({ heartbeatAt: z.string().nullable() }),
  }),
  version: z.string(),
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
});
export type HealthReport = z.infer<typeof HealthReport>;

/**
 * The rail draws these in the order the pipeline needs them, with the two that
 * fall over last: doc-extract because it is the one that does, and the worker
 * because it restarts on every deploy and is legitimately absent for a moment.
 */
export const DEPENDENCIES = ["postgres", "redis", "minio", "inbox", "llmProxy", "docExtract", "worker"] as const;

/** The label each check takes on screen: the service's own name, not a prettified one. */
export const DEPENDENCY_LABELS: Record<(typeof DEPENDENCIES)[number], string> = {
  postgres: "postgres",
  redis: "redis",
  minio: "minio",
  inbox: "inbox",
  llmProxy: "llm-proxy",
  docExtract: "doc-extract",
  worker: "worker",
};

/** What a check says about itself beyond being up, for the chip's title. Empty when it says nothing. */
export function checkDetail(health: HealthReport, key: (typeof DEPENDENCIES)[number]): string {
  const one = health.checks[key];
  if (key === "inbox" && "emails" in one && one.emails !== undefined) return `${one.emails} emails`;
  if (key === "llmProxy" && "models" in one && one.models !== undefined) return `${one.models} models`;
  if (key === "worker" && "heartbeatAt" in one && one.heartbeatAt) return `last beat ${one.heartbeatAt}`;
  return "";
}
