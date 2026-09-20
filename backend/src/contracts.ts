/**
 * The shapes that cross the HTTP boundary. frontend/lib/api-client.ts mirrors
 * these by hand; change both or neither.
 */
import { z } from "zod";

import { Stage } from "./contracts.enums";
import { RunOutcomes } from "./contracts.extraction";
import { RunReview } from "./contracts.review";

export const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const AttachmentRole = z.enum(["SI", "BL", "UNKNOWN"]);
export type AttachmentRole = z.infer<typeof AttachmentRole>;

/** Ours, not an organiser enum: the LLM steps whose prompt a run pins. */
export const PromptStep = z.enum(["classify", "classify-verify", "triage", "doc-type", "extract", "extract-verify", "field-judge"]);
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
export const PromptSet = z.object({
  classify: PinnedPrompt.optional(),
  "classify-verify": PinnedPrompt.optional(),
  triage: PinnedPrompt.optional(),
  "doc-type": PinnedPrompt.optional(),
  extract: PinnedPrompt.optional(),
  "extract-verify": PinnedPrompt.optional(),
  "field-judge": PinnedPrompt.optional(),
});
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
  /** Emails that will not move again on their own: done, failed, or waiting for a person. */
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
  /** The emails waiting for a person, and why. */
  review: RunReview,
  /** How the compared pairs came out, and which fields differed. */
  outcomes: RunOutcomes,
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
          /** The scorer's own weights, so the page shows what each component is worth rather than assuming. */
          weights: z.object({ stage1: z.number(), stage3: z.number(), endToEnd: z.number() }),
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

export const CheckStatus = z.enum(["up", "down"]);
export type CheckStatus = z.infer<typeof CheckStatus>;

/**
 * One dependency, and whatever it says about itself beyond being up.
 *
 * The detail is not decoration: `tesseract` names the OCR build a scan was
 * read with, `emails` catches a bind mount that came up empty, and `models`
 * catches a proxy serving an empty alias table. Each of those has looked
 * exactly like a working system from the outside at least once.
 */
const check = <T extends z.ZodRawShape>(detail: T) =>
  z.object({ status: CheckStatus, latencyMs: z.number().optional(), ...detail });

export const HealthChecks = z.object({
  postgres: check({}),
  redis: check({}),
  minio: check({}),
  /** The Averis server in emails/. Named for what it is to us, which is where email comes from. */
  inbox: check({ emails: z.number().optional(), scoringAvailable: z.boolean().optional() }),
  docExtract: check({ tesseract: z.string().nullable().optional() }),
  llmProxy: check({ models: z.number().optional() }),
  /**
   * Not a probe: the worker is another container with no route into it. This
   * is the mark it leaves in Redis every ten seconds, read back. Null when no
   * beat stands, which covers a worker that is down, one that never ran, and a
   * Redis the api cannot read.
   */
  worker: check({ heartbeatAt: z.string().nullable() }),
});
export type HealthChecks = z.infer<typeof HealthChecks>;

export const HealthReport = z.object({
  /**
   * `down` only when the api cannot do its job at all: postgres or redis.
   * Everything else, a stale heartbeat included, is `degraded` and still a
   * 200, because auto-deploy rolls back on a 503 and a worker one cycle late
   * must never be the reason a good image goes away.
   */
  status: z.enum(["ok", "degraded", "down"]),
  checks: HealthChecks,
  /** The commit this image was built from, or "dev" outside one. */
  version: z.string(),
  /** How much work is waiting, so the state of the queues is in the same reading as the state of the services. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
});
export type HealthReport = z.infer<typeof HealthReport>;

export * from "./contracts.actions";
export * from "./contracts.clients";
export * from "./contracts.emails";
export * from "./contracts.enums";
export * from "./contracts.extraction";
export * from "./contracts.prompts";
export * from "./contracts.queues";
export * from "./contracts.review";
export * from "./contracts.scoring";
export * from "./contracts.trace";
