/**
 * The shapes that cross the HTTP boundary. frontend/lib/api-client.ts mirrors
 * these by hand; change both or neither.
 */
import { z } from "zod";

export const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Stage = z.enum(["ingested", "classifying", "classified", "comparing", "review", "done", "failed"]);
export type Stage = z.infer<typeof Stage>;

export const AttachmentRole = z.enum(["SI", "BL", "UNKNOWN"]);
export type AttachmentRole = z.infer<typeof AttachmentRole>;

export const CreateRunBody = z.object({
  source: z.literal("averis").default("averis"),
  /** 0 is a burst: everything is enqueued at once. */
  ratePerSecond: z.number().min(0).max(50).default(2),
  limit: z.number().int().positive().optional(),
  /** Deduplicated: a repeated id would count twice in totalEmails and the run would never read as finished. */
  emailIds: z
    .array(z.string().regex(/^email_\d{1,6}$/))
    .min(1)
    .transform((ids) => [...new Set(ids)])
    .optional(),
});
export type CreateRunBody = z.infer<typeof CreateRunBody>;

export const QueueCounts = z.object({ waiting: z.number(), active: z.number(), failed: z.number() });
export type QueueCounts = z.infer<typeof QueueCounts>;

export const RunSummary = z.object({
  id: z.string(),
  /** `completed` means ingestion finished. Processing is finished when done + failed = totalEmails. */
  status: RunStatus,
  ratePerSecond: z.number(),
  totalEmails: z.number().nullable(),
  stageCounts: z.record(Stage, z.number()),
  /** Null when the queues cannot be reached. Everything else comes from Postgres and is still served. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const RunList = z.object({ runs: z.array(RunSummary) });
export type RunList = z.infer<typeof RunList>;

export const EmailListItem = z.object({
  emailId: z.string(),
  from: z.string(),
  subject: z.string(),
  stage: Stage,
  attachmentCount: z.number(),
  outcome: z.string().nullable(),
});
export type EmailListItem = z.infer<typeof EmailListItem>;

export const RunEmailsQuery = z.object({
  stage: Stage.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
export type RunEmailsQuery = z.infer<typeof RunEmailsQuery>;

export const RunEmailsPage = z.object({
  emails: z.array(EmailListItem),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type RunEmailsPage = z.infer<typeof RunEmailsPage>;

export const CheckStatus = z.enum(["up", "down"]);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const HealthReport = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({ postgres: CheckStatus, redis: CheckStatus, minio: CheckStatus, inbox: CheckStatus }),
});
export type HealthReport = z.infer<typeof HealthReport>;
