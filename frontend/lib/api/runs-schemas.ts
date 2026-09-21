import { z } from "zod";

/**
 * Mirrors backend/src/contracts.ts; change both or neither. No transport here,
 * so a client component may import these to parse what it polls.
 */

export const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const Stage = z.enum(["ingested", "classifying", "classified", "comparing", "review", "done", "failed"]);
export type Stage = z.infer<typeof Stage>;

/** The organisers' review reasons, value for value. */
export const ReviewReason = z.enum(["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]);
export type ReviewReason = z.infer<typeof ReviewReason>;

/** How an email ended: never sent to compare, compared clean or with a defect, or parked with one of the reasons. */
export const Outcome = z.enum(["not_comparable", "OK", "MISMATCH", ...ReviewReason.options]);

/** The seven fields an SI and a BL are compared on, value for value the organisers'. */
export const ComparisonField = z.enum([
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
]);
export type ComparisonField = z.infer<typeof ComparisonField>;

/** A run's compared pairs: how many came out clean or with a defect, and which fields differed how often. */
export const RunOutcomes = z.object({ ok: z.number(), mismatch: z.number(), byField: z.record(ComparisonField, z.number()) });
export type RunOutcomes = z.infer<typeof RunOutcomes>;
export type Outcome = z.infer<typeof Outcome>;

export type RunAction = "pause" | "resume" | "cancel";

export const QueueCounts = z.object({ waiting: z.number(), active: z.number(), failed: z.number() });
export type QueueCounts = z.infer<typeof QueueCounts>;

export const LlmUsage = z.object({
  calls: z.number(),
  failedCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  /** What the API would have charged. On the subscription rail nothing is billed. */
  costUsd: z.number(),
  /** Of the run's classified emails, the share the verifier settled. */
  verifierShare: z.number(),
});
export type LlmUsage = z.infer<typeof LlmUsage>;

/** The run's emails waiting for a person, in total and per reason. */
export const RunReview = z.object({ open: z.number(), byReason: z.record(ReviewReason, z.number()) });
export type RunReview = z.infer<typeof RunReview>;

export const HeadlineScores = z.object({
  stage1MacroF1: z.number(),
  stage3DefectF1: z.number(),
  endToEndRate: z.number(),
  escalationRecall: z.number(),
  escalationPrecision: z.number(),
  /** The scorer's own weights, so the score panel says what each component is worth rather than assuming. */
  weights: z.object({ stage1: z.number(), stage3: z.number(), endToEnd: z.number() }),
});
export type HeadlineScores = z.infer<typeof HeadlineScores>;

export const LastSubmission = z.object({
  id: z.string(),
  finalScore: z.number().nullable(),
  nEmails: z.number(),
  forced: z.boolean(),
  createdAt: z.string(),
  scores: HeadlineScores.nullable(),
});
export type LastSubmission = z.infer<typeof LastSubmission>;

export const PromptStep = z.enum(["classify", "classify-verify", "triage", "doc-type", "extract", "extract-verify", "field-judge"]);
export type PromptStep = z.infer<typeof PromptStep>;

/** What each LLM step of a run runs, fixed when the run was created. Empty for a run from before phase 4. */
const PinnedPrompt = z.object({ version: z.string(), model: z.string() });
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

export const RunSummary = z.object({
  id: z.string(),
  /** What a person called this run. Null when nobody has, and `runName` names it by when it started. */
  name: z.string().nullable(),
  /** `completed` means ingestion finished. Processing is finished when done + failed + review = totalEmails. */
  status: RunStatus,
  ratePerSecond: z.number(),
  totalEmails: z.number().nullable(),
  /** Emails that will not move again on their own: done, failed, or waiting for a person. */
  finishedEmails: z.number(),
  /** Nothing more will happen in this run, so a page watching it can stop polling. */
  processingDone: z.boolean(),
  /** From the start to the last email finishing, or to now while it runs. Null before it starts. */
  elapsedMs: z.number().nullable(),
  stageCounts: z.record(Stage, z.number()),
  /** Null when the backend cannot reach its queues. Everything else is still served. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  promptSet: PromptSet,
  llm: LlmUsage,
  review: RunReview,
  /** How the compared pairs came out, and which fields differed. */
  outcomes: RunOutcomes,
  /** The newest submission to the scorer. */
  lastSubmission: LastSubmission.nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/** How parallel a run is, from the backend's env: emails classified at once, model calls in flight at once. */
export const Concurrency = z.object({ classify: z.number(), llm: z.number() });
export type Concurrency = z.infer<typeof Concurrency>;

export const RunList = z.object({ runs: z.array(RunSummary), concurrency: Concurrency });
export type RunList = z.infer<typeof RunList>;

/** Named id lists: `dev` is 30 train emails to iterate on, `holdout` the 104 that measure. */
export type RunSubset = "dev" | "holdout";


/** Each step's prompt versions on disk, for the new-run form. Mirrors backend/src/contracts.prompts.ts. */
export const PromptCatalog = z.object({
  steps: z.array(
    z.object({
      step: z.string(),
      versions: z.array(z.object({ version: z.string(), model: z.string(), active: z.boolean(), notes: z.string().nullable() })),
    }),
  ),
});
export type PromptCatalog = z.infer<typeof PromptCatalog>;
