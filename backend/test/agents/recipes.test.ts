import { describe, expect, it } from "vitest";

import { bind, loadRecipes, parseRecipe, recipes, signature, type ParamType } from "../../src/agents/chat/skills/recipes";
import { getRoPool } from "../../src/db";

const RUN = "00000000-0000-4000-8000-000000000000";

/** A value of each type that binds and matches nothing, so every recipe runs and its columns can be read. */
const SAMPLE: Record<ParamType, unknown> = {
  uuid: RUN,
  text: "party",
  pattern: "%nothing-matches-this%",
  int: 5,
  "bigint[]": ["1", 2],
  "text[]": ["a"],
};

const GOOD = [
  "-- name: things",
  "-- about: Counts things.",
  "-- params: run_id uuid, ids bigint[]",
  "-- returns: n",
  "select count(*) as n from core.email_runs where run_id = $1::uuid and id = any($2::bigint[])",
].join("\n");

describe("parseRecipe", () => {
  it("reads the header, strips it, and caps the rows", () => {
    const recipe = parseRecipe(GOOD, "a-skill", "things.sql");
    expect(recipe).toMatchObject({ name: "things", skill: "a-skill", about: "Counts things.", returns: ["n"] });
    expect(recipe.params).toEqual([{ name: "run_id", type: "uuid" }, { name: "ids", type: "bigint[]" }]);
    expect(recipe.sql).not.toContain("--");
    expect(recipe.sql.endsWith("limit 200")).toBe(true);
  });

  const bad: { name: string; text: string; error: RegExp }[] = [
    { name: "no name", text: GOOD.replace("-- name: things\n", ""), error: /no "-- name:" line/ },
    { name: "a name that is not one", text: GOOD.replace("name: things", "name: Things!"), error: /not a recipe name/ },
    { name: "an unknown type", text: GOOD.replace("run_id uuid", "run_id guid"), error: /is not "name type"/ },
    { name: "no columns", text: GOOD.replace("returns: n", "returns:"), error: /declares no columns/ },
    { name: "a write", text: GOOD.replace("select count(*) as n from", "delete from"), error: /may run/ },
    { name: "two statements", text: `${GOOD}; select 1`, error: /may run/ },
    { name: "a declared parameter it never uses", text: GOOD.replace(" and id = any($2::bigint[])", ""), error: /never uses \$2/ },
    { name: "a placeholder it does not declare", text: GOOD.replace("ids bigint[]", "").replace("uuid,", "uuid"), error: /uses \$2/ },
  ];
  it.each(bad)("refuses $name", ({ text, error }) => {
    expect(() => parseRecipe(text, "a-skill", "things.sql")).toThrow(error);
  });
});

describe("bind", () => {
  const recipe = parseRecipe(GOOD, "a-skill", "things.sql");

  it("orders the arguments for the placeholders and renders ids as text", () => {
    const bound = bind(recipe, { ids: [7, "8"], run_id: RUN });
    expect(bound).toEqual({ ok: true, values: [RUN, ["7", "8"]], textValues: [] });
  });

  it.each([
    { name: "a missing argument", args: { run_id: RUN }, reason: /needs ids as bigint\[\]/ },
    { name: "a run id that is not a uuid", args: { run_id: "latest", ids: [1] }, reason: /needs run_id as uuid/ },
    { name: "an argument it does not take", args: { run_id: RUN, ids: [1], extra: 1 }, reason: /no parameter named extra/ },
  ])("refuses $name", ({ args, reason }) => {
    const bound = bind(recipe, args);
    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.reason).toMatch(reason);
  });

  it("hands back the text a person could have misspelt, and not a pattern", () => {
    const named = recipes().get("entities_named_like");
    expect(named).toBeDefined();
    const bound = bind(named!, { kind: "port", pattern: "%x%" });
    expect(bound).toMatchObject({ ok: true, textValues: ["port"] });
  });
});

describe("the shipped recipes", () => {
  const all = [...loadRecipes().values()];

  it("are about twenty, each under a skill, each with a signature the prompt can show", () => {
    expect(all.length).toBeGreaterThanOrEqual(18);
    for (const recipe of all) expect(signature(recipe)).toContain(`${recipe.name}(`);
  });

  it.each(all.map((recipe) => [recipe.name, recipe] as const))("%s runs and returns the columns it declares", async (_name, recipe) => {
    const bound = bind(recipe, Object.fromEntries(recipe.params.map((param) => [param.name, SAMPLE[param.type]])));
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    // As retina_ro, the role the chat reads as: a recipe over a table it was never granted fails here.
    const result = await getRoPool()!.query(recipe.sql, bound.values);
    expect(result.fields.map((field) => field.name)).toEqual(recipe.returns);
  });
});
