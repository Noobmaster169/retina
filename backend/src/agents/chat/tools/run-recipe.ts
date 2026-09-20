import { z } from "zod";

import { orientation } from "../../../ontology/repositories";
import { refusalFor } from "../grounding";
import { bind, recipes } from "../skills/recipes";
import { guesses } from "./grounded";
import { relationsIn } from "./run-sql";
import { asText, cellsOf, firstColumn, toResult } from "./sql-result";
import { type ChatTool, refused, type ToolContext, type ToolOutcome } from "./types";

/**
 * A standard query, called by name.
 *
 * The same question gets the same SQL every time, its values are bound
 * parameters rather than text spliced in, and the SQL is still shown beside the
 * answer. It runs on the read-only pool under the same row cap as `run_sql`.
 */

const Input = z
  .looseObject({
    name: z.string().min(1).max(80),
    /** The recipe's parameters by name, as its signature lists them. */
    params: z.record(z.string(), z.unknown()).default({}),
  })
  // A model often writes the parameters beside `name` rather than inside `params`. The meaning is
  // plain, so they are taken as given; refusing would cost a step to teach a bracket.
  .transform(({ name, params, ...flat }) => ({ name, params: { ...flat, ...params } }));
type Input = z.infer<typeof Input>;

const Shape = { name: z.string().min(1).max(80), params: z.record(z.string(), z.unknown()).default({}) };

/** How the page and the turn's `sql_used` show it: the text that ran, then what each placeholder held. */
function shownSql(sql: string, name: string, values: unknown[]): string {
  const bound = values.map((value, index) => `$${index + 1} = ${JSON.stringify(value)}`).join(", ");
  return `${sql}\n-- recipe ${name}${bound ? ` with ${bound}` : ""}`;
}

export const runRecipe: ChatTool<Input> = {
  name: "run_recipe",
  description:
    "Runs a named, tested query and returns its rows. Prefer this over run_sql: the recipes are listed with " +
    "their parameters under the skills. Leave run_id out to get this conversation's run, or else the latest.",
  schema: Input,
  shape: Shape,

  async run(input, ctx: ToolContext): Promise<ToolOutcome> {
    if (!ctx.roPool) return refused("the read-only database connection is not configured, so no recipe can be run");

    const recipe = recipes().get(input.name);
    if (!recipe) {
      return refused(`there is no recipe named "${input.name}". The recipes are: ${[...recipes().keys()].join(", ")}`);
    }

    const params = { ...input.params };
    let runNote = "";
    if (recipe.params.some((param) => param.name === "run_id") && params.run_id == null) {
      const runId = ctx.runId ?? (await orientation.latestRunId(ctx.roPool));
      if (!runId) return refused("there are no runs yet, so there is nothing for this recipe to read", "core.runs");
      params.run_id = runId;
      runNote = `run: ${runId} (${ctx.runId ? "this conversation's run" : "the latest run"})\n`;
    }

    const bound = bind(recipe, params);
    if (!bound.ok) return refused(bound.reason);

    const guessed = await guesses(ctx, { values: bound.textValues });
    if (guessed.length > 0) return { ...refused(refusalFor(guessed)), ungrounded: guessed };

    const started = Date.now();
    let answer: { rows: Record<string, unknown>[]; fields: { name: string }[] };
    try {
      answer = await ctx.roPool.query(recipe.sql, bound.values);
    } catch (error) {
      // A tested recipe fails on its arguments or on the five second limit, and
      // either is the agent's to act on rather than the caller's to retry.
      const reason = error instanceof Error ? error.message : String(error);
      return { ...refused(`Postgres rejected ${recipe.name}: ${reason}`), sql: shownSql(recipe.sql, recipe.name, bound.values) };
    }
    const result = toResult(answer.rows, answer.fields, Date.now() - started);
    const relations = relationsIn(recipe.sql);

    return {
      ok: true,
      text: `${runNote}${asText(result, `${recipe.name}: ${recipe.about}`)}`,
      preview: `${recipe.name}: ${result.rowCount} ${result.rowCount === 1 ? "row" : "rows"} in ${result.durationMs} ms`,
      sql: shownSql(recipe.sql, recipe.name, bound.values),
      result,
      touched: relations.map((relation) => ({ relation, count: result.rowCount })),
      entities: firstColumn(result),
      grounds: cellsOf(result),
      empty: result.rowCount === 0,
      recipe: { name: recipe.name, skill: recipe.skill, params },
    };
  },
};
