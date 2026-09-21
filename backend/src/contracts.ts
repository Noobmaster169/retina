/**
 * The shapes that cross the HTTP boundary. frontend/lib/api-client.ts mirrors
 * these by hand; change both or neither.
 */
import { z } from "zod";

import { QueueCounts } from "./contracts.queues";

import { Stage } from "./contracts.enums";
import { RunOutcomes } from "./contracts.extraction";
import { RunReview } from "./contracts.review";

export const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const AttachmentRole = z.enum(["SI", "BL", "UNKNOWN"]);
export type AttachmentRole = z.infer<typeof AttachmentRole>;

/** Ours, not an organiser enum: the LLM steps whose prompt a run pins. */
export const PromptStep = z.enum(["classify", "classify-verify", "triage", "doc-type", "extract", "extract-verify", "field-judge", "vision-read"]);
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
  "vision-read": PinnedPrompt.optional(),
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

/** What a person renamed a run to. Empty takes the name back and the run is named by its clock again. */
export const RenameRunBody = z.object({ name: z.string().trim().max(80) });
export type RenameRunBody = z.infer<typeof RenameRunBody>;

export const RunSummary = z.object({
  id: z.string(),
  /** What a person called this run. Null when nobody has, and the client names it by when it started. */
  name: z.string().nullable(),
  /** `completed` means ingestion finished, not processing; `processingDone` says that. */
  status: RunStatus,
  ratePerSecond: z.number(),
  totalEmails: z.number().nullable(),
  /** Emails that will not move again on their own: done, failed, or waiting for a person. */
  finishedEmails: z.number(),
  /**
   * Emails the ingest gate held, which have no email_runs row and so appear in
   * no stage count. Without it `finishedEmails` could never reach
   * `totalEmails` on a run that held anything and the page would spin forever.
   */
  heldByGate: z.number(),
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

export * from "./contracts.actions";
export * from "./contracts.chat-agent";
export * from "./contracts.chat";
export * from "./contracts.database";
export * from "./contracts.health";
export * from "./contracts.insight";
export * from "./contracts.clients";
export * from "./contracts.emails";
export * from "./contracts.enums";
export * from "./contracts.extraction";
export * from "./contracts.gate";
export * from "./contracts.ontology";
export * from "./contracts.semantic";
export * from "./contracts.shipments";
export * from "./contracts.prompts";
export * from "./contracts.queues";
export * from "./contracts.review";
export * from "./contracts.scoring";
export * from "./contracts.shipment";
export * from "./contracts.trace";
