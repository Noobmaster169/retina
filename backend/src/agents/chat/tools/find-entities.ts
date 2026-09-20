import { z } from "zod";

import { EntityKind } from "../../../contracts";
import { type ConceptAnswer, resolveConcept } from "../../../ontology/concept-search";
import { refusalFor } from "../grounding";
import { guardSql } from "../sql-guard";
import { guesses } from "./grounded";
import { firstColumn, toResult } from "./sql-result";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * Every thing of one kind that a description fits, where the description is
 * written nowhere in the database.
 *
 * "Ports in Asia", "customers that are distributors", "food grade board": none
 * of those words is a column value. This gives the term a meaning, judges the
 * things against it, keeps every verdict, and hands back a subquery the next
 * `run_sql` can join on, so the final answer is one indexed join however many
 * matched.
 *
 * Where a standard attribute already answers the term, the agent should filter
 * on it in SQL instead and not call this at all: that is complete and free.
 */

const Input = z.object({
  kind: EntityKind,
  /** The term as the person wrote it, not a guess at what it should be called. */
  description: z.string().min(2).max(200),
  /**
   * A query returning one column of entity ids, to narrow before any profile is
   * read. This is how "shipped in the last three months" cuts 200,000 parties
   * down before the first model call, and why ids never pass through the
   * model's own context.
   */
  candidateSql: z.string().max(4000).optional(),
  /** The reader wants the whole set, so anything over budget is finished in the background. */
  needComplete: z.boolean().optional(),
});
type Input = z.infer<typeof Input>;

/** The same cap `run_sql` uses on a result, but on ids, which are small and never reach the model. */
const ID_ROWS = 5000;

function lines(answer: ConceptAnswer, narrowed: number | null): string[] {
  const { reading } = answer;
  const out = [
    `"${reading.phrase}" among ${reading.entityKind} things.`,
    `It was read as: ${reading.definition}`,
    "",
    `${reading.matched} matched. Judged now: ${reading.judged}; already known: ${reading.reused}; no basis either way: ${reading.unknown}.`,
  ];
  if (narrowed !== null) out.push(`Narrowed by your query to ${narrowed} of them before any was judged.`);
  out.push(
    reading.complete
      ? "Every candidate was judged, so this set is complete."
      : `${reading.deferred} were not judged. Any total over this set is a lower bound, and must be worded as one.`,
    "",
  );

  if (answer.matches.length === 0) out.push("Nothing matched.");
  else {
    out.push("id\tname\tconfidence\twhy");
    for (const match of answer.matches) out.push([match.id, match.name, match.confidence.toFixed(2), match.rationale].join("\t"));
  }
  out.push("", "Join on this rather than listing the ids:", answer.joinSql);
  return out;
}

export const findEntities: ChatTool<Input> = {
  name: "find_entities",
  description:
    "Finds every port, party, carrier, person, commodity or vessel that a description fits, when the " +
    "description is not a value in any column: `in Asia`, `a distributor`, `food grade board`. Returns the " +
    "definition it used, the matches, how many were judged, and a subquery to join on. Narrow first with " +
    "candidateSql where the question also has a column part. Where a stored attribute already answers the " +
    "term, filter on it in SQL instead: that is complete and costs nothing.",
  schema: Input,
  shape: Input.shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so nothing can be looked up");
    // Over MCP a person is the agent, and this tool would spend tokens on their
    // behalf without being asked. It says so rather than failing.
    const llm = ctx.llm;
    if (!llm) return refused("this tool makes model calls of its own and no model client is configured here; use find_entity and run_sql instead");

    let ids: number[] | null = null;
    let sql: string | undefined;
    if (input.candidateSql) {
      const verdict = guardSql(input.candidateSql);
      if (!verdict.ok) return refused(`candidateSql is not a query this may run: ${verdict.reason}`);
      // The same literal guard model-written SQL gets. A narrowing query that
      // filters on a guessed name narrows to the wrong set silently.
      const guessed = await guesses(ctx, { sql: verdict.sql });
      if (guessed.length > 0) return { ...refused(refusalFor(guessed)), sql: verdict.sql, ungrounded: guessed };

      sql = verdict.sql;
      const answer = await ctx.roPool.query(verdict.sql);
      if (answer.fields.length !== 1) {
        return { ...refused(`candidateSql must select exactly one column of entity ids; this one selects ${answer.fields.length}`), sql };
      }
      const column = answer.fields[0].name;
      ids = answer.rows
        .slice(0, ID_ROWS)
        .map((row) => Number((row as Record<string, unknown>)[column]))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) return { ...refused("candidateSql returned no entity ids, so there is nothing to judge"), sql };
    }

    const answer = await resolveConcept(
      { pool: ctx.pool, llm },
      { kind: input.kind, description: input.description, ids, needComplete: input.needComplete ?? false },
    );

    const result = toResult(
      answer.matches.map((match) => ({ id: match.id, name: match.name, confidence: match.confidence })),
      [{ name: "id" }, { name: "name" }, { name: "confidence" }],
      0,
    );

    return {
      ok: true,
      text: lines(answer, ids?.length ?? null).join("\n"),
      preview: `${answer.reading.matched} of ${answer.reading.judged + answer.reading.reused} judged match "${answer.reading.phrase}"${answer.reading.complete ? "" : `, ${answer.reading.deferred} not yet judged`}`,
      sql,
      result,
      touched: [
        { relation: "core.concept_verdicts", count: answer.reading.judged + answer.reading.reused },
        { relation: "core.entities", count: answer.reading.matched },
      ],
      entities: firstColumn({ ...result, rows: result.rows.map((row) => [row[1]]) }),
      // The names, the ids and the subquery. The definition and the counts are
      // this tool's own words about what it did, not data it returned, so they
      // are deliberately not here.
      grounds: [...answer.matches.map((match) => [match.id, match.name, match.confidence].join("\t")), answer.joinSql].join("\n"),
      empty: answer.matches.length === 0,
      semantic: [answer.reading],
    };
  },
};
