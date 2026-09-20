import { z } from "zod";

import { databaseProfile } from "../../../ontology/repositories";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/** What a column holds, so a filter is built on a value that exists and not on a guess at one. */

const Input = z.object({
  /** Schema-qualified, such as `core.emails`. */
  relation: z.string().min(3).max(120),
  column: z.string().min(1).max(80),
  /** Rank the values by how close they are to this text instead of by how often they occur. */
  near: z.string().min(1).max(200).nullable().default(null),
});
type Input = z.infer<typeof Input>;

export const profileColumn: ChatTool<Input> = {
  name: "profile_column",
  description:
    "Shows what one column holds: row, distinct and null counts, its thirty most frequent values with counts, " +
    "and min and max for numbers and dates. Call it before filtering on any text column that is not an enum. " +
    "Give near to rank the values by closeness to a text instead, which is how you find a value that was mistyped " +
    "or half-remembered: the one meant is rarely among the thirty most frequent.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so no column can be profiled");

    let outcome: Awaited<ReturnType<typeof databaseProfile.profileColumn>>;
    try {
      outcome = await databaseProfile.profileColumn(ctx.roPool, input.relation, input.column, input.near);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return refused(`${input.relation}.${input.column} could not be profiled: ${reason}`, input.relation);
    }
    if (!outcome.ok) return refused(outcome.reason, input.relation);

    const { profile } = outcome;
    const lines = [
      `${profile.relation}.${profile.column} (${profile.dataType})`,
      `rows: ${profile.rows}, distinct: ${profile.distinct}, null: ${profile.nulls}`,
      profile.min !== null ? `min: ${profile.min}, max: ${profile.max}` : null,
      "",
      profile.near !== null
        ? `the ${profile.top.length} values closest to "${profile.near}", closest first:`
        : profile.distinct > profile.top.length
          ? `the ${profile.top.length} most frequent of ${profile.distinct} values:`
          : "every value:",
      profile.top.some((row) => (row.value?.length ?? 0) >= databaseProfile.VALUE_WIDTH)
        ? `values are cut at ${databaseProfile.VALUE_WIDTH} characters: filter on a cut one with like and a %, not with =`
        : null,
      profile.near !== null ? "value\tcount\tcloseness" : "value\tcount",
      ...profile.top.map((row) =>
        row.score === null
          ? `${row.value ?? "(null)"}\t${row.count}`
          : `${row.value ?? "(null)"}\t${row.count}\t${row.score.toFixed(2)}`,
      ),
    ].filter((line): line is string => line !== null);

    return {
      ok: true,
      text: lines.join("\n"),
      preview:
        profile.near !== null
          ? `${profile.relation}.${profile.column}: ${profile.top.length} values near "${profile.near}"`
          : `${profile.relation}.${profile.column}: ${profile.distinct} distinct in ${profile.rows} rows`,
      touched: [{ relation: profile.relation, count: profile.rows }],
      entities: profile.top.slice(0, 6).map((row) => row.value ?? "(null)"),
      // The count stays beside its value: an alternative is kept only where one row carried both.
      grounds: profile.top.map((row) => `${row.value ?? ""}\t${row.count}`).join("\n"),
      /** A search for values near a text that found none is the event the near-misses skill exists for. */
      empty: profile.top.length === 0,
    };
  },
};
