/**
 * The shapes that cross the HTTP boundary. frontend/lib/api-client.ts mirrors
 * these by hand; change both or neither.
 */
import { z } from "zod";

import { DecidedBy, Stage } from "./contracts.enums";
import { Category } from "./contracts.scoring";

export const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const AttachmentRole = z.enum(["SI", "BL", "UNKNOWN"]);
export type AttachmentRole = z.infer<typeof AttachmentRole>;

/** Ours, not an organiser enum: the LLM steps whose prompt a run pins. */
export const PromptStep = z.enum(["classify", "classify-verify"]);
export type PromptStep = z.infer<typeof PromptStep>;

/** What one step of a run runs: a prompt file and a proxy alias. Fixed when the run is created. */
export const PinnedPrompt = z.object({ version: z.string(), model: z.string() });
export type PinnedPrompt = z.infer<typeof PinnedPrompt>;

/**
 * Empty for a run created before phase 4; the worker then uses the active
 * versions. An object, not a record, on purpose: it drops a step it does not
 * know instead of refusing it, so rolling back to this code after a later
 * phase added a step still reads that phase's runs.
 */
export const PromptSet = z.object({ classify: PinnedPrompt.optional(), "classify-verify": PinnedPrompt.optional() });
export type PromptSet = z.infer<typeof PromptSet>;

/**
 * Named id lists from `eval/`: `dev` is a small stratified train sample for
 * iterating, `holdout` the held-out ids that measure. Neither carries a label.
 */
export const RunSubset = z.enum(["dev", "holdout"]);
export type RunSubset = z.infer<typeof RunSubset>;

export const CreateRunBody = z
  .object({
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
    subset: RunSubset.optional(),
    /** A prompt version per step, for comparing two runs prompt against prompt. Else the active one. */
    promptSet: z.partialRecord(PromptStep, z.string().regex(/^v\d+$/)).optional(),
    /** A proxy alias per step, for the model comparison. Else the prompt file's, which is sonnet. */
    models: z.partialRecord(PromptStep, z.string().min(1).max(64)).optional(),
  })
  .refine((body) => !(body.subset && body.emailIds), { message: "name either emailIds or a subset, not both" });
export type CreateRunBody = z.infer<typeof CreateRunBody>;

export const QueueCounts = z.object({ waiting: z.number(), active: z.number(), failed: z.number() });
export type QueueCounts = z.infer<typeof QueueCounts>;

export const LlmUsage = z.object({
  calls: z.number(),
  failedCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  /** What the API would have charged. On the subscription rail nothing is billed. */
  costUsd: z.number(),
  /** Of the run's classified emails, the share the verifier settled. 0 before any is classified. */
  verifierShare: z.number(),
});
export type LlmUsage = z.infer<typeof LlmUsage>;

export const RunSummary = z.object({
  id: z.string(),
  /** `completed` means ingestion finished, not processing; `processingDone` says that. */
  status: RunStatus,
  ratePerSecond: z.number(),
  totalEmails: z.number().nullable(),
  /** Emails that will not move again: done or failed. */
  finishedEmails: z.number(),
  /** Nothing more will happen in this run: every email finished, or it was cancelled or failed. */
  processingDone: z.boolean(),
  /** From the start to the last email finishing, or to now while it runs. Null before it starts. */
  elapsedMs: z.number().nullable(),
  stageCounts: z.record(Stage, z.number()),
  /** Null when the queues cannot be reached. Everything else comes from Postgres and is still served. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  promptSet: PromptSet,
  llm: LlmUsage,
  /** The newest submission to the scorer, without its full scoreboard. */
  lastSubmission: z
    .object({
      id: z.string(),
      finalScore: z.number().nullable(),
      nEmails: z.number(),
      forced: z.boolean(),
      createdAt: z.string(),
      /** The headline numbers of its scoreboard. The full one is in GET /runs/:id/submissions. */
      scores: z
        .object({
          stage1MacroF1: z.number(),
          stage3DefectF1: z.number(),
          endToEndRate: z.number(),
          escalationRecall: z.number(),
          escalationPrecision: z.number(),
        })
        .nullable(),
    })
    .nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/**
 * How parallel a run is, from the env: emails classified at once, and model
 * calls in flight at once. The api reads the same env as the worker.
 */
export const Concurrency = z.object({ classify: z.number(), llm: z.number() });
export type Concurrency = z.infer<typeof Concurrency>;

export const RunList = z.object({ runs: z.array(RunSummary), concurrency: Concurrency });
export type RunList = z.infer<typeof RunList>;

export const EmailListItem = z.object({
  emailId: z.string(),
  from: z.string(),
  subject: z.string(),
  stage: Stage,
  attachmentCount: z.number(),
  outcome: z.string().nullable(),
  /** Null until the email is classified. */
  category: Category.nullable(),
  decidedBy: DecidedBy.nullable(),
  /** The generator's own stated confidence, which is what decides whether the verifier runs. */
  confidence: z.number().nullable(),
  /** The verifier's category, when it ran. Differs from the generator's when it overruled it. */
  verifierCategory: Category.nullable(),
  error: z.string().nullable(),
});
export type EmailListItem = z.infer<typeof EmailListItem>;

export const RunEmailsQuery = z.object({
  stage: Stage.optional(),
  category: Category.optional(),
  decidedBy: DecidedBy.optional(),
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

export * from "./contracts.enums";
export * from "./contracts.prompts";
export * from "./contracts.scoring";
export * from "./contracts.trace";
