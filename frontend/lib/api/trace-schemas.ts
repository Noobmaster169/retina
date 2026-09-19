import { z } from "zod";

import { Stage } from "./runs-schemas";

/**
 * Mirrors backend/src/contracts.ts; change both or neither. No transport here,
 * so a client component may import these to parse what it polls.
 */

/** The organisers' categories, value for value. */
export const Category = z.enum(["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]);
export type Category = z.infer<typeof Category>;

/** Ours, not an organiser enum: which layer settled the category. */
export const DecidedBy = z.enum(["llm", "verifier", "human"]);
export type DecidedBy = z.infer<typeof DecidedBy>;

export const RunEmailItem = z.object({
  emailId: z.string(),
  from: z.string(),
  subject: z.string(),
  stage: Stage,
  attachmentCount: z.number(),
  outcome: z.string().nullable(),
  category: Category.nullable(),
  decidedBy: DecidedBy.nullable(),
  /** The generator's own stated confidence, which decides whether the verifier runs. */
  confidence: z.number().nullable(),
  verifierCategory: Category.nullable(),
  error: z.string().nullable(),
});
export type RunEmailItem = z.infer<typeof RunEmailItem>;

export const RunEmailsPage = z.object({
  emails: z.array(RunEmailItem),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type RunEmailsPage = z.infer<typeof RunEmailsPage>;

export interface RunEmailsQuery {
  stage?: Stage;
  category?: Category;
  decidedBy?: DecidedBy;
  q?: string;
  page?: number;
  pageSize?: number;
}

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
  parsed: z.unknown(),
  latencyMs: z.number(),
  createdAt: z.string(),
});
export type LlmCallSummary = z.infer<typeof LlmCallSummary>;

export const LlmCallSummaryList = z.object({ calls: z.array(LlmCallSummary) });

/** One attempt at one model call, exactly as it went out and came back. */
export const LlmCall = LlmCallSummary.extend({
  system: z.string(),
  user: z.string(),
  responseText: z.string().nullable(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
});
export type LlmCall = z.infer<typeof LlmCall>;

export const LlmCallList = z.object({ calls: z.array(LlmCall) });


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
  decidedBy: DecidedBy,
  generator: Opinion,
  verifier: Opinion.extend({ counterCases: z.string().nullable() }).nullable(),
  verifierError: z.string().nullable(),
  model: z.string().nullable(),
  promptVersion: z.string().nullable(),
});
export type ClassificationView = z.infer<typeof ClassificationView>;

/** Everything about one email of a run. Mirrors EmailTrace in backend/src/contracts.trace.ts. */
export const EmailTrace = z.object({
  emailId: z.string(),
  stage: Stage,
  error: z.string().nullable(),
  classification: ClassificationView.nullable(),
  live: LiveCallView.nullable(),
  calls: z.array(LlmCall),
});
export type EmailTrace = z.infer<typeof EmailTrace>;
