import { z } from "zod";

import { get, parseAs, refusalMessage, request } from "./transport";

/** Mirrors backend/src/contracts.ts; change both or neither. */

const RunStatus = z.enum(["created", "running", "paused", "completed", "cancelled", "failed"]);
export type RunStatus = z.infer<typeof RunStatus>;

const Stage = z.enum(["ingested", "classifying", "classified", "comparing", "review", "done", "failed"]);
export type Stage = z.infer<typeof Stage>;

export type RunAction = "pause" | "resume" | "cancel";

const QueueCounts = z.object({ waiting: z.number(), active: z.number(), failed: z.number() });
export type QueueCounts = z.infer<typeof QueueCounts>;

const LlmUsage = z.object({
  calls: z.number(),
  failedCalls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  /** What the API would have charged. On the subscription rail nothing is billed. */
  costUsd: z.number(),
});
export type LlmUsage = z.infer<typeof LlmUsage>;

const HeadlineScores = z.object({
  stage1MacroF1: z.number(),
  stage3DefectF1: z.number(),
  endToEndRate: z.number(),
  escalationRecall: z.number(),
  escalationPrecision: z.number(),
});
export type HeadlineScores = z.infer<typeof HeadlineScores>;

const LastSubmission = z.object({
  id: z.string(),
  finalScore: z.number().nullable(),
  nEmails: z.number(),
  forced: z.boolean(),
  createdAt: z.string(),
  scores: HeadlineScores.nullable(),
});
export type LastSubmission = z.infer<typeof LastSubmission>;

export const RunSummary = z.object({
  id: z.string(),
  /** `completed` means ingestion finished. Processing is finished when done + failed = totalEmails. */
  status: RunStatus,
  ratePerSecond: z.number(),
  totalEmails: z.number().nullable(),
  stageCounts: z.record(Stage, z.number()),
  /** Null when the backend cannot reach its queues. Everything else is still served. */
  queues: z.object({ classify: QueueCounts, compare: QueueCounts }).nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  llm: LlmUsage,
  /** The newest submission to the scorer. */
  lastSubmission: LastSubmission.nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

const RunList = z.object({ runs: z.array(RunSummary) });

/**
 * `source` is deliberately absent: the backend defaults it to the only source
 * there is, so sending it would be a second place to change when a second one
 * arrives.
 */
export interface CreateRunInput {
  /** 0 is a burst: everything is enqueued at once. */
  ratePerSecond?: number;
  limit?: number;
  emailIds?: string[];
}

/** A refusal (400, 404, 409, 503) comes back as a message, because the page shows it inline. */
export type RunOutcome = { ok: true; run: RunSummary } | { ok: false; status: number; message: string };

async function runOutcome(response: Response, what: string): Promise<RunOutcome> {
  if (!response.ok) return { ok: false, status: response.status, message: await refusalMessage(response) };
  return { ok: true, run: await parseAs(RunSummary, response, what) };
}

export async function listRuns(): Promise<RunSummary[]> {
  return (await get(RunList, "/runs")).runs;
}

export async function createRun(input: CreateRunInput): Promise<RunOutcome> {
  const response = await request("/runs", { method: "POST", body: JSON.stringify(input) });
  return runOutcome(response, "POST /runs");
}

async function controlRun(id: string, action: RunAction): Promise<RunOutcome> {
  const path = `/runs/${encodeURIComponent(id)}/${action}`;
  return runOutcome(await request(path, { method: "POST" }), `POST ${path}`);
}

export async function pauseRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "pause");
}

export async function resumeRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "resume");
}

export async function cancelRun(id: string): Promise<RunOutcome> {
  return controlRun(id, "cancel");
}
