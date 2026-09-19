import { z } from "zod";

/**
 * Mirrors backend/src/contracts.ts; change both or neither. No transport here,
 * so a client component may import these to parse what it polls.
 */

const Stage = z.enum(["ingested", "classifying", "classified", "comparing", "review", "done", "failed"]);

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
  stage?: string;
  category?: Category;
  decidedBy?: DecidedBy;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** One attempt at one model call, exactly as it went out and came back. */
export const LlmCall = z.object({
  id: z.string(),
  emailId: z.string().nullable(),
  step: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  attempt: z.number(),
  ok: z.boolean(),
  error: z.string().nullable(),
  system: z.string(),
  user: z.string(),
  responseText: z.string().nullable(),
  parsed: z.unknown(),
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  latencyMs: z.number(),
  createdAt: z.string(),
});
export type LlmCall = z.infer<typeof LlmCall>;

export const LlmCallList = z.object({ calls: z.array(LlmCall) });

