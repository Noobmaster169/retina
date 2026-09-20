import { z } from "zod";

import type { TurnResult } from "../agents/chat/loop";

/**
 * Whether one chat turn did what its question expected of it.
 *
 * Pure: the question and the turn in, the checks out. It measures behaviour a
 * person could verify from the page (did it look before it filtered, did it
 * use the standard query, does the answer name what it should), never the
 * model's prose against a reference sentence.
 */

export const Behaviour = z.enum([
  /** A lookup came before the first call that filters on a thing or a text value. */
  "grounds_first",
  /** At least one recipe ran. */
  "uses_recipe",
  /** The turn needed no SQL the agent wrote itself. */
  "no_own_sql",
  /** The literal guard never had to refuse a call. */
  "no_guard_refusal",
  /** The answer names the run it counted in, by the first eight characters of its id. */
  "names_the_run",
]);
export type Behaviour = z.infer<typeof Behaviour>;

export const ChatQuestion = z.object({
  id: z.string().min(1),
  tags: z.array(z.string()).default([]),
  question: z.string().min(1),
  /** Ask it in a conversation opened about the latest run, as the run page's chat is. */
  scoped: z.boolean().default(true),
  expect: z
    .object({
      /** Each must appear in the answer. Case does not matter. */
      mentions: z.array(z.string()).default([]),
      /** At least one of each inner list must appear: for a fact that can be worded several ways. */
      mentionsAnyOf: z.array(z.array(z.string()).min(1)).default([]),
      /** None may appear. */
      absent: z.array(z.string()).default([]),
      behaviours: z.array(Behaviour).default([]),
      /** Model calls, the answer included. */
      maxSteps: z.number().int().positive().optional(),
    })
    .default({ mentions: [], mentionsAnyOf: [], absent: [], behaviours: [] }),
});
export type ChatQuestion = z.infer<typeof ChatQuestion>;

export const ChatQuestionSet = z.array(ChatQuestion).min(1);

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Scored {
  id: string;
  passed: boolean;
  checks: Check[];
  steps: number;
  recipes: string[];
  adhoc: boolean;
  guardRefusals: number;
}

const LOOKUPS = new Set(["find_entity", "list_entities", "get_entity", "search_emails", "profile_column"]);

function isGuardRefusal(call: TurnResult["toolCalls"][number]): boolean {
  return !call.ok && /not appeared in anything you have been shown/.test(call.preview);
}

/** A call that filters on something a person could have misspelt: its own SQL with a literal, or a recipe given ids or text. */
function filters(call: TurnResult["toolCalls"][number]): boolean {
  if (call.tool === "run_sql") return /'[^']*\p{L}[^']*'/u.test(String(call.args.sql ?? ""));
  if (call.tool !== "run_recipe") return false;
  const params = z.record(z.string(), z.unknown()).safeParse(call.args.params);
  if (!params.success) return false;
  return Object.entries(params.data).some(([name, value]) => name !== "run_id" && (Array.isArray(value) || typeof value === "string"));
}

function groundsFirst(calls: TurnResult["toolCalls"]): Check {
  const firstFilter = calls.findIndex(filters);
  if (firstFilter === -1) return { name: "grounds_first", ok: true, detail: "nothing was filtered on" };
  const looked = calls.slice(0, firstFilter).some((call) => LOOKUPS.has(call.tool) && call.ok);
  return { name: "grounds_first", ok: looked, detail: looked ? "a lookup came first" : `${calls[firstFilter].tool} filtered before any lookup` };
}

export function scoreTurn(question: ChatQuestion, turn: TurnResult, context: { steps: number; runId: string | null }): Scored {
  const answer = turn.answer.toLowerCase();
  const has = (text: string) => answer.includes(text.toLowerCase());
  const { expect } = question;
  const refusals = turn.toolCalls.filter(isGuardRefusal).length;
  const recipes = [...new Set(turn.toolCalls.flatMap((call) => (call.recipe && call.ok ? [call.recipe.name] : [])))];

  const checks: Check[] = [
    ...expect.mentions.map((text) => ({ name: `mentions "${text}"`, ok: has(text), detail: "" })),
    ...expect.mentionsAnyOf.map((group) => ({ name: `mentions one of ${group.map((text) => `"${text}"`).join(", ")}`, ok: group.some(has), detail: "" })),
    ...expect.absent.map((text) => ({ name: `does not say "${text}"`, ok: !has(text), detail: "" })),
    { name: "finished within the step budget", ok: !turn.exhausted, detail: "" },
  ];

  for (const behaviour of expect.behaviours) {
    if (behaviour === "grounds_first") checks.push(groundsFirst(turn.toolCalls));
    if (behaviour === "uses_recipe") checks.push({ name: behaviour, ok: recipes.length > 0, detail: recipes.join(", ") });
    if (behaviour === "no_own_sql") checks.push({ name: behaviour, ok: !turn.adhoc, detail: "" });
    if (behaviour === "no_guard_refusal") checks.push({ name: behaviour, ok: refusals === 0, detail: `${refusals} refused` });
    if (behaviour === "names_the_run") {
      const short = context.runId?.slice(0, 8) ?? "";
      checks.push({ name: behaviour, ok: short !== "" && has(short), detail: short });
    }
  }
  if (expect.maxSteps !== undefined) {
    checks.push({ name: `at most ${expect.maxSteps} steps`, ok: context.steps <= expect.maxSteps, detail: `${context.steps} taken` });
  }

  return {
    id: question.id,
    passed: checks.every((check) => check.ok),
    checks,
    steps: context.steps,
    recipes,
    adhoc: turn.adhoc,
    guardRefusals: refusals,
  };
}

export interface Summary {
  questions: number;
  passed: number;
  /** Turns that answered from recipes alone, as a share of all turns. */
  recipeOnlyShare: number;
  medianSteps: number;
  guardRefusals: number;
  adhoc: string[];
}

export function summarise(scored: Scored[]): Summary {
  const steps = scored.map((item) => item.steps).sort((a, b) => a - b);
  const middle = Math.floor(steps.length / 2);
  return {
    questions: scored.length,
    passed: scored.filter((item) => item.passed).length,
    recipeOnlyShare: scored.length === 0 ? 0 : scored.filter((item) => !item.adhoc).length / scored.length,
    medianSteps: steps.length === 0 ? 0 : steps.length % 2 === 1 ? steps[middle] : (steps[middle - 1] + steps[middle]) / 2,
    guardRefusals: scored.reduce((sum, item) => sum + item.guardRefusals, 0),
    adhoc: scored.filter((item) => item.adhoc).map((item) => item.id),
  };
}
