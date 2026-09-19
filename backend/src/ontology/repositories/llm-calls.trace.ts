import { z } from "zod";

import type { LlmCall, LlmCallSummary } from "../../contracts";
import type { Queryable } from "../../db";

/** Reading the ledger back: one email's trace, a run's live feed, an answer already paid for. */

/** The slices of the stored request and response the trace shows. Written by structured.ts, read back here. */
const StoredRequest = z.object({ system: z.string().default(""), user: z.string().default("") });
const StoredResponse = z.object({ text: z.string() }).nullable();

interface SummaryRow {
  id: string;
  email_id: string | null;
  step: string;
  model: string;
  prompt_version: string;
  attempt: number;
  ok: boolean;
  error: string | null;
  parsed: unknown;
  latency_ms: number;
  created_at: Date;
}

interface CallRow extends SummaryRow {
  request: unknown;
  response: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
}

function toSummary(row: SummaryRow): LlmCallSummary {
  return {
    id: row.id,
    emailId: row.email_id,
    step: row.step,
    model: row.model,
    promptVersion: row.prompt_version,
    attempt: row.attempt,
    ok: row.ok,
    error: row.error,
    parsed: row.parsed,
    latencyMs: row.latency_ms,
    createdAt: row.created_at.toISOString(),
  };
}

function toCall(row: CallRow): LlmCall {
  const request = StoredRequest.parse(row.request);
  return {
    ...toSummary(row),
    system: request.system,
    user: request.user,
    responseText: StoredResponse.parse(row.response)?.text ?? null,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
  };
}

const SUMMARY_COLUMNS = `l.id, er.email_id, l.step, l.model, l.prompt_version, l.attempt, l.ok, l.error, l.parsed,
  l.latency_ms, l.created_at`;

/** Every call made for one email of a run, oldest first: the email's whole trace. */
export async function listForEmail(db: Queryable, runId: string, emailId: string): Promise<LlmCall[]> {
  const { rows } = await db.query<CallRow>(
    `select ${SUMMARY_COLUMNS}, l.request, l.response, l.input_tokens, l.output_tokens, l.cost_usd
       from core.llm_calls l join core.email_runs er on er.id = l.email_run_id
      where er.run_id = $1 and er.email_id = $2
      order by l.id`,
    [runId, emailId],
  );
  return rows.map(toCall);
}

/**
 * A run's newest calls, newest first, without their text: a live view polls
 * this, and a prompt is kilobytes. With `after`, only calls newer than that id.
 */
export async function listRecent(
  db: Queryable,
  runId: string,
  page: { after?: number; limit: number },
): Promise<LlmCallSummary[]> {
  const { rows } = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from core.llm_calls l left join core.email_runs er on er.id = l.email_run_id
      where l.run_id = $1 and ($2::bigint is null or l.id > $2)
      order by l.id desc
      limit $3`,
    [runId, page.after ?? null, page.limit],
  );
  return rows.map(toSummary);
}

/**
 * The answer the schema accepted on this email's newest successful call of
 * `step` under `promptVersion`, or null. Lets a job that failed after that
 * call reuse it instead of paying for it again.
 */
export async function latestAccepted(
  db: Queryable,
  emailRunId: string,
  step: string,
  promptVersion: string,
): Promise<unknown> {
  const { rows } = await db.query<{ parsed: unknown }>(
    `select parsed from core.llm_calls
      where email_run_id = $1 and step = $2 and prompt_version = $3 and ok and parsed is not null
      order by id desc limit 1`,
    [emailRunId, step, promptVersion],
  );
  return rows[0]?.parsed ?? null;
}
