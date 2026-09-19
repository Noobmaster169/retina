import { z } from "zod";

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
