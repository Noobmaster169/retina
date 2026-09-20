import type { Queryable } from "../../db";

export interface NewLlmCall {
  /**
   * Null for a call that belongs to no run, which is every chat turn. A run's
   * cost is what the pipeline spent on that run, so a conversation scoped to a
   * run still writes null here rather than adding its own tokens to the run's
   * bill. Every read of this table filters on `run_id` or joins `email_run_id`,
   * so a null-run row appears in none of them.
   */
  runId: string | null;
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

export { latestAccepted, listForEmail, listRecent } from "./llm-calls.trace";
