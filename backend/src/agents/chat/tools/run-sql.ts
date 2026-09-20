import { z } from "zod";

import type { SqlResult } from "../../../contracts";
import { guardSql, MAX_RESULT_BYTES, MAX_ROWS } from "../sql-guard";
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

/** Postgres hands back dates, numerics and arrays as their own types; the page and the model both want text. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Tab separated, because a model reads a table better than it reads JSON and it costs a third of the tokens. */
function asText(result: SqlResult, purpose: string): string {
  const header = result.columns.join("\t");
  const body = result.rows.map((row) => row.map((cell) => cell ?? "").join("\t")).join("\n");
  const note = result.truncated ? `\n(cut at ${result.rows.length} rows; say so in the answer)` : "";
  return `${purpose}\n${result.rowCount} rows in ${result.durationMs} ms\n\n${header}\n${body}${note}`;
}

/** Drops rows from the end until the rendered result fits. A model given 200 kB of JSON answers worse, not better. */
function fit(result: SqlResult): SqlResult {
  let rows = result.rows;
  let truncated = result.truncated;
  while (rows.length > 0 && JSON.stringify(rows).length > MAX_RESULT_BYTES) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)));
    truncated = true;
  }
  return { ...result, rows, truncated };
}

export const runSql: ChatTool<Input> = {
  name: "run_sql",
  description:
    "Runs one read-only SQL query and returns its rows. Prefer the analytics views over core tables. " +
    "Only select and with are allowed; a limit is added when you do not give one. Always use this rather " +
    "than stating a number from memory.",
  schema: Input,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) {
      return refused("the read-only database connection is not configured (DATABASE_RO_URL is unset), so no SQL can be run");
    }

    const verdict = guardSql(input.sql);
    if (!verdict.ok) return refused(verdict.reason);

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

    const columns = fields.map((field) => field.name);
    const capped = rows.slice(0, MAX_ROWS);
    const result = fit({
      columns,
      rows: capped.map((row) => columns.map((column) => render(row[column]))),
      rowCount: rows.length,
      truncated: rows.length > capped.length,
      durationMs,
    });

    const relations = relationsIn(verdict.sql);
    const firstColumn = result.rows.map((row) => row[0]).filter((cell): cell is string => cell !== null);

    return {
      ok: true,
      text: asText(result, input.purpose),
      preview: `${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"} in ${durationMs} ms`,
      sql: verdict.sql,
      result,
      // A relation that returned nothing is still reported, with its 0.
      touched: relations.length > 0
        ? relations.map((relation) => ({ relation, count: result.rowCount }))
        : [{ relation: "the query named no table", count: result.rowCount }],
      entities: [...new Set(firstColumn)].slice(0, 6),
    };
  },
};
