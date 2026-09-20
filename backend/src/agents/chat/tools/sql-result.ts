import type { SqlResult } from "../../../contracts";
import { MAX_RESULT_BYTES, MAX_ROWS } from "../sql-guard";

/**
 * Rows as the model and the page both read them.
 *
 * Shared by `run_sql` and `run_recipe`, so a recipe's result is capped, cut and
 * rendered exactly as a model-written query's is.
 */

/** Postgres hands back dates, numerics and arrays as their own types; the page and the model both want text. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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

export function toResult(rows: Record<string, unknown>[], fields: { name: string }[], durationMs: number): SqlResult {
  const columns = fields.map((field) => field.name);
  const capped = rows.slice(0, MAX_ROWS);
  return fit({
    columns,
    rows: capped.map((row) => columns.map((column) => render(row[column]))),
    rowCount: rows.length,
    truncated: rows.length > capped.length,
    durationMs,
  });
}

/** Tab separated, because a model reads a table better than it reads JSON and it costs a third of the tokens. */
export function asText(result: SqlResult, purpose: string): string {
  const header = result.columns.join("\t");
  const body = result.rows.map((row) => row.map((cell) => cell ?? "").join("\t")).join("\n");
  const note = result.truncated ? `\n(cut at ${result.rows.length} rows; say so in the answer)` : "";
  return `${purpose}\n${result.rowCount} rows in ${result.durationMs} ms\n\n${header}\n${body}${note}`;
}

/** The distinct values of the first column, which is what the result graph draws as the things an answer is about. */
export function firstColumn(result: SqlResult, limit = 6): string[] {
  const cells = result.rows.map((row) => row[0]).filter((cell): cell is string => cell !== null);
  return [...new Set(cells)].slice(0, limit);
}
