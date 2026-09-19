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

export async function usageForRun(db: Queryable, runId: string): Promise<LlmUsage> {
  const { rows } = await db.query<{ calls: string; failed: string; input: string; output: string; cost: string }>(
    `select count(*) as calls,
            count(*) filter (where not ok) as failed,
            coalesce(sum(input_tokens), 0) as input,
            coalesce(sum(output_tokens), 0) as output,
            coalesce(sum(cost_usd), 0) as cost
       from core.llm_calls where run_id = $1`,
    [runId],
  );
  const row = rows[0];
  return {
    calls: Number(row.calls),
    failedCalls: Number(row.failed),
    inputTokens: Number(row.input),
    outputTokens: Number(row.output),
    costUsd: Number(row.cost),
  };
}
