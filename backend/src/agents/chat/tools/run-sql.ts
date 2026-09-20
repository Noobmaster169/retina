import { z } from "zod";

import { refusalFor } from "../grounding";
import { guardSql } from "../sql-guard";
import { guesses, nearestTo } from "./grounded";
import { asText, cellsOf, firstColumn, toResult } from "./sql-result";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * One read-only query, and the rows it returned.
 *
 * The tool that makes the chat worth building: an answer that carries the
 * query that produced it is an answer a reader can check, and every screen
 * that shows one refuses to collapse it.
 */

const Input = z.object({
  sql: z.string().min(1).max(8000),
  /** Why this query. Shown to the reader beside the SQL, and it makes the model state its intent before it runs. */
  purpose: z.string().min(1).max(300),
});
type Input = z.infer<typeof Input>;

/**
 * The relations a query read, taken from the query itself.
 *
 * A display label, not a security decision, which is why a regex is honest
 * here and is not in the guardrail. It is still fact: this is the text that
 * ran. A query that names no schema-qualified relation reports none rather
 * than guessing one.
 */
export function relationsIn(sql: string): string[] {
  const found = [...sql.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/gi)].map((match) => match[1].toLowerCase());
  return [...new Set(found)];
}

export const runSql: ChatTool<Input> = {
  name: "run_sql",
  description:
    "Runs one read-only SQL query you wrote and returns its rows. Use it only when no recipe fits. " +
    "Only select and with are allowed; a limit is added when you do not give one. A filter on a string " +
    "you have not been shown is refused: ground it first, or search with like.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) {
      return refused("the read-only database connection is not configured (DATABASE_RO_URL is unset), so no SQL can be run");
    }

    const verdict = guardSql(input.sql);
    if (!verdict.ok) return refused(verdict.reason);

    // A filter on a string nothing has shown the agent is a filter on a guess,
    // and its empty result would read as a finding. Refused before it runs.
    const guessed = await guesses(ctx, { sql: verdict.sql });
    if (guessed.length > 0) return { ...refused(refusalFor(guessed)), sql: verdict.sql, ungrounded: guessed };

    const started = Date.now();
    let rows: Record<string, unknown>[];
    let fields: { name: string }[];
    try {
      const answer = await ctx.roPool.query(verdict.sql);
      rows = answer.rows;
      fields = answer.fields;
    } catch (error) {
      // A malformed query is the model's to fix, not the caller's to retry:
      // handing the message back is what lets the next step correct it.
      const reason = error instanceof Error ? error.message : String(error);
      return { ...refused(`Postgres rejected it: ${reason}`), sql: verdict.sql };
    }
    const durationMs = Date.now() - started;

    const result = toResult(rows, fields, durationMs);
    const relations = relationsIn(verdict.sql);
    // An empty result from a grounded query is an answer; the nearest names say
    // whether a better-spelt question was one step away.
    const near = result.rowCount === 0 ? await nearestTo(ctx, verdict.sql) : "";

    return {
      ok: true,
      text: near ? `${asText(result, input.purpose)}

${near}` : asText(result, input.purpose),
      preview: `${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"} in ${durationMs} ms`,
      sql: verdict.sql,
      result,
      // A relation that returned nothing is still reported, with its 0.
      touched: relations.length > 0
        ? relations.map((relation) => ({ relation, count: result.rowCount }))
        : [{ relation: "the query named no table", count: result.rowCount }],
      entities: firstColumn(result),
      grounds: cellsOf(result),
      empty: result.rowCount === 0,
    };
  },
};
