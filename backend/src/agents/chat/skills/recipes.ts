import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { TerminalError } from "../../../lib/errors";
import { guardSql } from "../sql-guard";

/**
 * The standard query for a standard question.
 *
 * A recipe is a `.sql` file beside the skill that uses it, with a header that
 * declares its name, what it answers, its parameters and its columns. The
 * agent calls it by name, so the same question is always the same query, its
 * values are bound parameters and never text a model spliced in, and the SQL
 * is still shown beside the answer like any other.
 *
 * Every file passes `guardSql` when it loads, so a recipe that could write
 * never registers, and it runs on `roPool` like model-written SQL does.
 */

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

export const PARAM_TYPES = ["uuid", "text", "pattern", "int", "bigint[]", "text[]"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export interface RecipeParam {
  name: string;
  type: ParamType;
}

export interface Recipe {
  name: string;
  skill: string;
  about: string;
  params: RecipeParam[];
  returns: string[];
  /** The body as it runs: comments stripped, one statement, a row cap at the end. */
  sql: string;
}

const NAME = /^[a-z][a-z0-9_]*$/;

const VALIDATORS: Record<ParamType, z.ZodType> = {
  uuid: z.uuid(),
  text: z.string().min(1).max(200),
  // A `pattern` is bound into a `like`, so it is a search and the literal guard lets it through.
  pattern: z.string().min(1).max(200),
  int: z.coerce.number().int().min(0).max(100_000),
  "bigint[]": z.array(z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])).min(1).max(200),
  "text[]": z.array(z.string().min(1).max(200)).min(1).max(50),
};

function header(lines: string[], key: string, path: string): string {
  const line = lines.find((candidate) => candidate.startsWith(`-- ${key}:`));
  if (!line) throw new TerminalError(`${path} has no "-- ${key}:" line`);
  return line.slice(`-- ${key}:`.length).trim();
}

function parseParams(spec: string, path: string): RecipeParam[] {
  if (spec === "none") return [];
  return spec.split(",").map((part) => {
    const [name, type, ...rest] = part.trim().split(/\s+/);
    if (!name || !NAME.test(name) || rest.length > 0 || !PARAM_TYPES.includes(type as ParamType)) {
      throw new TerminalError(`${path} declares a parameter "${part.trim()}" that is not "name type" with a type of ${PARAM_TYPES.join(", ")}`);
    }
    return { name, type: type as ParamType };
  });
}

export function parseRecipe(raw: string, skill: string, path: string): Recipe {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const name = header(lines, "name", path);
  if (!NAME.test(name)) throw new TerminalError(`${path} names itself "${name}", which is not a recipe name`);
  const params = parseParams(header(lines, "params", path), path);
  const returns = header(lines, "returns", path).split(",").map((column) => column.trim()).filter(Boolean);
  if (returns.length === 0) throw new TerminalError(`${path} declares no columns`);

  const verdict = guardSql(lines.filter((line) => !line.startsWith("--")).join("\n"));
  if (!verdict.ok) throw new TerminalError(`${path} is not a query the chat may run: ${verdict.reason}`);

  for (let index = 1; index <= params.length; index++) {
    if (!verdict.sql.includes(`$${index}`)) throw new TerminalError(`${path} declares ${params[index - 1].name} and never uses $${index}`);
  }
  if (verdict.sql.includes(`$${params.length + 1}`)) throw new TerminalError(`${path} uses $${params.length + 1}, which it does not declare`);

  return { name, skill, about: header(lines, "about", path), params, returns, sql: verdict.sql };
}

export function loadRecipes(dir = SKILLS_DIR): Map<string, Recipe> {
  const recipes = new Map<string, Recipe>();
  for (const skill of readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const folder = join(dir, skill.name, "recipes");
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).filter((name) => name.endsWith(".sql")).sort()) {
      const path = join(folder, file);
      const recipe = parseRecipe(readFileSync(path, "utf8"), skill.name, path);
      if (`${recipe.name}.sql` !== file) throw new TerminalError(`${path} names itself "${recipe.name}"`);
      if (recipes.has(recipe.name)) throw new TerminalError(`two recipes are named "${recipe.name}"`);
      recipes.set(recipe.name, recipe);
    }
  }
  return recipes;
}

let cached: Map<string, Recipe> | undefined;

export function recipes(): Map<string, Recipe> {
  cached ??= loadRecipes();
  return cached;
}

/** `name(param type, ...)`: what the prompt shows, and all the agent needs to call one. */
export function signature(recipe: Recipe): string {
  const params = recipe.params.map((param) => `${param.name} ${param.type}`).join(", ");
  return `${recipe.name}(${params}) -> ${recipe.returns.join(", ")}. ${recipe.about}`;
}

export type BoundRecipe =
  | { ok: true; values: unknown[]; textValues: string[] }
  | { ok: false; reason: string };

/**
 * Checks the arguments against the declared types and orders them for `$1..$n`.
 *
 * `textValues` are the ones a person could have misspelt, which the caller
 * puts through the same grounding check a literal in model-written SQL gets.
 */
export function bind(recipe: Recipe, args: Record<string, unknown>): BoundRecipe {
  const unknown = Object.keys(args).filter((key) => !recipe.params.some((param) => param.name === key));
  if (unknown.length > 0) return { ok: false, reason: `${recipe.name} takes no parameter named ${unknown.join(", ")}` };

  const values: unknown[] = [];
  const textValues: string[] = [];
  for (const param of recipe.params) {
    const parsed = VALIDATORS[param.type].safeParse(args[param.name]);
    if (!parsed.success) {
      return { ok: false, reason: `${recipe.name} needs ${param.name} as ${param.type}: ${parsed.error.issues[0].message}` };
    }
    values.push(param.type === "bigint[]" ? (parsed.data as (string | number)[]).map(String) : parsed.data);
    if (param.type === "text") textValues.push(parsed.data as string);
    if (param.type === "text[]") textValues.push(...(parsed.data as string[]));
  }
  return { ok: true, values, textValues };
}
