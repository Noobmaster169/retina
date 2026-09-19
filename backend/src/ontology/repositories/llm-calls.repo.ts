import { z } from "zod";

import type { LlmCall } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewLlmCall {
  runId: string;
  emailRunId: string | null;
  step: string;
  model: string;
  promptVersion: string;
  request: unknown;
  response?: unknown;
  parsed?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
  latencyMs: number;
  ok: boolean;
  error?: string | null;
  attempt: number;
}

export interface LlmUsage {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** The ledger is append-only: a retry is a new row, never an update. */
export async function insert(db: Queryable, call: NewLlmCall): Promise<void> {
  await db.query(
    `insert into core.llm_calls
       (run_id, email_run_id, step, model, prompt_version, request, response, parsed,
        input_tokens, output_tokens, cost_usd, latency_ms, ok, error, attempt)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      call.runId,
      call.emailRunId,
      call.step,
      call.model,
      call.promptVersion,
      JSON.stringify(call.request),
      call.response === undefined ? null : JSON.stringify(call.response),
      call.parsed === undefined || call.parsed === null ? null : JSON.stringify(call.parsed),
      call.inputTokens ?? null,
      call.outputTokens ?? null,
      call.costUsd ?? null,
      call.latencyMs,
      call.ok,
      call.error ?? null,
      call.attempt,
    ],
  );
}

const NO_USAGE: LlmUsage = { calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

/**
 * Usage per run, as a total lookup: a run that made no calls reads as zero
 * rather than as absent, so a caller has no missing case to handle.
 */
export async function usageForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => LlmUsage> {
  const usage = new Map(runIds.map((id) => [id, { ...NO_USAGE }]));
  if (runIds.length === 0) return () => ({ ...NO_USAGE });
  const { rows } = await db.query<{ run_id: string; calls: string; failed: string; input: string; output: string; cost: string }>(
    `select run_id,
            count(*) as calls,
            count(*) filter (where not ok) as failed,
            coalesce(sum(input_tokens), 0) as input,
            coalesce(sum(output_tokens), 0) as output,
            coalesce(sum(cost_usd), 0) as cost
       from core.llm_calls where run_id = any($1::uuid[]) group by run_id`,
    [runIds],
  );
  for (const row of rows) {
    usage.set(row.run_id, {
      calls: Number(row.calls),
      failedCalls: Number(row.failed),
      inputTokens: Number(row.input),
      outputTokens: Number(row.output),
      costUsd: Number(row.cost),
    });
  }
  return (runId) => usage.get(runId) ?? { ...NO_USAGE };
}

export async function usageForRun(db: Queryable, runId: string): Promise<LlmUsage> {
  return (await usageForRuns(db, [runId]))(runId);
}

/** The slices of the stored request and response the trace shows. Written by structured.ts, read back here. */
const StoredRequest = z.object({ system: z.string().default(""), user: z.string().default("") });
const StoredResponse = z.object({ text: z.string() }).nullable();

interface CallRow {
  id: string;
  email_id: string | null;
  step: string;
  model: string;
  prompt_version: string;
  attempt: number;
  ok: boolean;
  error: string | null;
  request: unknown;
  response: unknown;
  parsed: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  latency_ms: number;
  created_at: Date;
}

function toCall(row: CallRow): LlmCall {
  const request = StoredRequest.parse(row.request);
  return {
    id: row.id,
    emailId: row.email_id,
    step: row.step,
    model: row.model,
    promptVersion: row.prompt_version,
    attempt: row.attempt,
    ok: row.ok,
    error: row.error,
    system: request.system,
    user: request.user,
    responseText: StoredResponse.parse(row.response)?.text ?? null,
    parsed: row.parsed,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    latencyMs: row.latency_ms,
    createdAt: row.created_at.toISOString(),
  };
}

const CALL_COLUMNS = `l.id, er.email_id, l.step, l.model, l.prompt_version, l.attempt, l.ok, l.error, l.request,
  l.response, l.parsed, l.input_tokens, l.output_tokens, l.cost_usd, l.latency_ms, l.created_at`;

/** Every call made for one email of a run, oldest first: the email's whole trace. */
export async function listForEmail(db: Queryable, runId: string, emailId: string): Promise<LlmCall[]> {
  const { rows } = await db.query<CallRow>(
    `select ${CALL_COLUMNS}
       from core.llm_calls l join core.email_runs er on er.id = l.email_run_id
      where er.run_id = $1 and er.email_id = $2
      order by l.id`,
    [runId, emailId],
  );
  return rows.map(toCall);
}

/** A run's newest calls, newest first. With `after`, only calls newer than that id, for a live view. */
export async function listRecent(db: Queryable, runId: string, page: { after?: number; limit: number }): Promise<LlmCall[]> {
  const { rows } = await db.query<CallRow>(
    `select ${CALL_COLUMNS}
       from core.llm_calls l left join core.email_runs er on er.id = l.email_run_id
      where l.run_id = $1 and ($2::bigint is null or l.id > $2)
      order by l.id desc
      limit $3`,
    [runId, page.after ?? null, page.limit],
  );
  return rows.map(toCall);
}
