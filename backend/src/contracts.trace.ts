import { z } from "zod";

import { DecidedBy, Stage } from "./contracts.enums";
import { ComparisonView, ExtractionView } from "./contracts.extraction";
import { DocumentView, ReviewCaseView } from "./contracts.review";
import { Category } from "./contracts.scoring";

/**
 * What a run's model calls look like from outside: the live feed's summaries
 * and one email's full trace. Mirrored in frontend/lib/api/trace-schemas.ts.
 */

/** One attempt at one model call, without its text: what the live feed shows. */
export const LlmCallSummary = z.object({
  id: z.string(),
  emailId: z.string().nullable(),
  step: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  attempt: z.number(),
  ok: z.boolean(),
  error: z.string().nullable(),
  /** What the schema accepted, when it did. */
  parsed: z.unknown(),
  latencyMs: z.number(),
  createdAt: z.string(),
});
export type LlmCallSummary = z.infer<typeof LlmCallSummary>;

/**
 * One attempt at one model call, exactly as it went out and came back. The
 * ledger is append-only, so a retry is a second entry, not an edit.
 */
export const LlmCall = LlmCallSummary.extend({
  /** The system prompt as sent, schema included. */
  system: z.string(),
  /** The email as the model saw it. */
  user: z.string(),
  /** The model's text, before any parsing. Null when the call itself failed. */
  responseText: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
});
export type LlmCall = z.infer<typeof LlmCall>;

export const LlmCallList = z.object({ calls: z.array(LlmCall) });
export type LlmCallList = z.infer<typeof LlmCallList>;

export const LlmCallSummaryList = z.object({ calls: z.array(LlmCallSummary) });
export type LlmCallSummaryList = z.infer<typeof LlmCallSummaryList>;

/** `after` is the id of the newest call the caller already has, so a live view fetches only what is new. */
export const RunCallsQuery = z.object({
  after: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type RunCallsQuery = z.infer<typeof RunCallsQuery>;

/** A model call still running: what it has written so far. With a schema, the JSON being written. */
export const LiveCallView = z.object({
  emailId: z.string(),
  step: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  attempt: z.number(),
  text: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
});
export type LiveCallView = z.infer<typeof LiveCallView>;

export const RunLive = z.object({ calls: z.array(LiveCallView) });
export type RunLive = z.infer<typeof RunLive>;

const Opinion = z.object({ category: Category, confidence: z.number(), rationale: z.string() });

/** How an email's category was settled: each reader's answer, and the one that stood. */
export const ClassificationView = z.object({
  finalCategory: Category,
  /**
   * A person's category, where one was recorded. It stands beside the model's
   * rather than over it: the model's answer is what the eval measures, and the
   * submission reads `humanCategory ?? finalCategory`. So does every screen.
   */
  humanCategory: Category.nullable(),
  decidedBy: DecidedBy,
  generator: Opinion,
  /** Null when the generator was sure enough that the verifier did not run. */
  verifier: Opinion.extend({ counterCases: z.string().nullable() }).nullable(),
  /** Set when the verifier ran and failed for good, so the generator's category stood. */
  verifierError: z.string().nullable(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
});
export type ClassificationView = z.infer<typeof ClassificationView>;

/** Everything about one email of a run: where it is, what was decided, and every call made for it. */
export const EmailTrace = z.object({
  emailId: z.string(),
  stage: Stage,
  error: z.string().nullable(),
  classification: ClassificationView.nullable(),
  /** The email's attachments as the parser and the model saw them. Empty before compare reads them. */
  documents: z.array(DocumentView),
  /** Why the email is waiting for a person, when it is. */
  review: ReviewCaseView.nullable(),
  /** What the extractor read from the SI and the BL. Empty until the pair is extracted. */
  extractions: z.array(ExtractionView),
  /** How the pair was judged. Null until it was, and for an email that never reached a comparison. */
  comparison: ComparisonView.nullable(),
  /** The call running right now, if one is. */
  live: LiveCallView.nullable(),
  calls: z.array(LlmCall),
});
export type EmailTrace = z.infer<typeof EmailTrace>;
