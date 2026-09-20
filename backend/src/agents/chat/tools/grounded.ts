import { entitySearch } from "../../../ontology/repositories";
import { literalsIn, shown, ungrounded } from "../grounding";
import type { ToolContext } from "./types";

/**
 * The literal guard as the tools apply it: the pure check, then the one
 * question only the database can answer.
 *
 * A string the agent was never shown is a guess, unless it happens to be,
 * character for character, a stored spelling or identifier. Then it is right
 * whoever typed it, and refusing it would cost a step for nothing.
 */

/** The values of a query, or of a recipe's text arguments, that are still guesses. Empty over MCP, where nothing is shown. */
export async function guesses(ctx: ToolContext, from: { sql: string } | { values: string[] }): Promise<string[]> {
  if (ctx.shown === undefined || !ctx.roPool) return [];
  const text = ctx.shown;
  const missing = "sql" in from ? ungrounded(from.sql, text) : from.values.filter((value) => !shown(text, value));
  if (missing.length === 0) return [];
  const known = new Set(await entitySearch.knownValues(ctx.roPool, missing));
  return missing.filter((value) => !known.has(value));
}

/**
 * What to say beside an empty result: the nearest stored names to each thing
 * the query filtered on. Empty when there is nothing near, which is itself
 * worth knowing and is said by the caller.
 */
export async function nearestTo(ctx: ToolContext, sql: string): Promise<string> {
  if (!ctx.roPool) return "";
  const values = [...new Set(literalsIn(sql).map((literal) => literal.value))].filter((value) => /\p{L}{3}/u.test(value)).slice(0, 3);
  const lines: string[] = [];
  for (const value of values) {
    const near = (await entitySearch.findCandidates(ctx.roPool, value, null, 4)).filter((candidate) => candidate.how !== "exact");
    if (near.length > 0) {
      lines.push(`Stored names near '${value}': ${near.map((candidate) => `[${candidate.id}] ${candidate.canonical} (${candidate.kind})`).join("; ")}`);
    }
  }
  return lines.join("\n");
}
