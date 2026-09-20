import { z } from "zod";

import type { TurnResult } from "../agents/chat/loop";
import { Behaviour, type ChatQuestion } from "./chat-questions";

export { Behaviour, ChatQuestion, ChatQuestionSet } from "./chat-questions";

/**
 * Whether one chat turn did what its question expected of it.
 *
 * Pure: the question and the turn in, the checks out. It measures behaviour a
 * person could verify from the page (did it look before it filtered, did it
 * use the standard query, does the answer name what it should), never the
 * model's prose against a reference sentence.
 */

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
  exhausted: boolean;
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
  // A recipe's parameters may sit inside `params` or beside `name`; the tool takes both, so this reads both.
  const nested = z.record(z.string(), z.unknown()).safeParse(call.args.params);
  const { name: _name, params: _params, ...flat } = call.args;
  return Object.entries({ ...flat, ...(nested.success ? nested.data : {}) }).some(([name, value]) => name !== "run_id" && (Array.isArray(value) || typeof value === "string"));
}

function groundsFirst(calls: TurnResult["toolCalls"]): Check {
  const firstFilter = calls.findIndex(filters);
  if (firstFilter === -1) return { name: "grounds_first", ok: true, detail: "nothing was filtered on" };
  const looked = calls.slice(0, firstFilter).some((call) => LOOKUPS.has(call.tool) && call.ok);
  return { name: "grounds_first", ok: looked, detail: looked ? "a lookup came first" : `${calls[firstFilter].tool} filtered before any lookup` };
}

export interface TurnContext {
  steps: number;
  runId: string | null;
  /** Alternatives the loop removed because their thing or number was not in a result. Zero on a turn that invented none. */
  removedMoves: number;
}

export function scoreTurn(question: ChatQuestion, turn: TurnResult, context: TurnContext): Scored {
  const answer = turn.answer.toLowerCase();
  const has = (text: string) => answer.includes(text.toLowerCase());
  const { expect } = question;
  const refusals = turn.toolCalls.filter(isGuardRefusal).length;
  const recipes = [...new Set(turn.toolCalls.flatMap((call) => (call.recipe && call.ok ? [call.recipe.name] : [])))];

  const things = turn.next.flatMap((move) => (move.thing === null ? [] : [move.thing.toLowerCase()]));
  const names = (thing: string) => things.some((offered) => offered.includes(thing.toLowerCase()));

  const checks: Check[] = [
    ...expect.mentions.map((text) => ({ name: `mentions "${text}"`, ok: has(text), detail: "" })),
    ...expect.mentionsAnyOf.map((group) => ({ name: `mentions one of ${group.map((text) => `"${text}"`).join(", ")}`, ok: group.some(has), detail: "" })),
    ...expect.absent.map((text) => ({ name: `does not say "${text}"`, ok: !has(text), detail: "" })),
    ...expect.alternatives.map((thing) => ({ name: `offers "${thing}"`, ok: names(thing), detail: things.join(", ") })),
    ...expect.alternativesAbsent.map((thing) => ({ name: `does not offer "${thing}"`, ok: !names(thing), detail: things.join(", ") })),
    { name: "finished within the step budget", ok: !turn.exhausted, detail: "" },
  ];

  if (expect.outcome !== undefined) {
    checks.push({ name: `outcome is ${expect.outcome}`, ok: turn.outcome === expect.outcome, detail: turn.outcome });
  }

  for (const behaviour of expect.behaviours) {
    if (behaviour === "grounds_first") checks.push(groundsFirst(turn.toolCalls));
    if (behaviour === "uses_recipe") checks.push({ name: behaviour, ok: recipes.length > 0, detail: recipes.join(", ") });
    if (behaviour === "no_own_sql") checks.push({ name: behaviour, ok: !turn.adhoc, detail: "" });
    if (behaviour === "no_guard_refusal") checks.push({ name: behaviour, ok: refusals === 0, detail: `${refusals} refused` });
    if (behaviour === "names_the_run") {
      const short = context.runId?.slice(0, 8) ?? "";
      checks.push({ name: behaviour, ok: short !== "" && has(short), detail: short });
    }
    // Every alternative on the turn was already checked against what the tools
    // returned, so this asks the opposite question: did the agent propose any
    // that had to be removed. `removedMoves` is what the loop dropped.
    if (behaviour === "every_alternative_real") {
      checks.push({ name: behaviour, ok: context.removedMoves === 0, detail: `${context.removedMoves} removed` });
    }
    if (behaviour === "asked") checks.push({ name: behaviour, ok: turn.clarify !== null, detail: turn.clarify?.question ?? "asked nothing" });
    if (behaviour === "did_not_ask") checks.push({ name: behaviour, ok: turn.clarify === null, detail: turn.clarify?.question ?? "" });
    if (behaviour === "offers_a_next_move") checks.push({ name: behaviour, ok: turn.next.length > 0, detail: `${turn.next.length} offered` });
    if (behaviour === "marks_its_inference") {
      const marked = turn.next.some((move) => move.basis === "general_knowledge");
      checks.push({ name: behaviour, ok: marked, detail: marked ? "marked" : "nothing marked as its own knowledge" });
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
    exhausted: turn.exhausted,
    guardRefusals: refusals,
  };
}

export interface Summary {
  questions: number;
  passed: number;
  /** Turns that ran at least one recipe, none of their own SQL, and finished, as a share of the turns that queried at all. */
  recipeOnlyShare: number;
  /** Turns answered with no query, from the orientation. Not counted for or against the recipes. */
  noQuery: number;
  medianSteps: number;
  guardRefusals: number;
  adhoc: string[];
}

export function summarise(scored: Scored[]): Summary {
  const steps = scored.map((item) => item.steps).sort((a, b) => a - b);
  const middle = Math.floor(steps.length / 2);
  // A turn that ran nothing says nothing about whether a recipe covered the question.
  const queried = scored.filter((item) => item.recipes.length > 0 || item.adhoc || item.exhausted);
  return {
    questions: scored.length,
    passed: scored.filter((item) => item.passed).length,
    recipeOnlyShare: queried.length === 0 ? 0 : queried.filter((item) => item.recipes.length > 0 && !item.adhoc && !item.exhausted).length / queried.length,
    noQuery: scored.length - queried.length,
    medianSteps: steps.length === 0 ? 0 : steps.length % 2 === 1 ? steps[middle] : (steps[middle - 1] + steps[middle]) / 2,
    guardRefusals: scored.reduce((sum, item) => sum + item.guardRefusals, 0),
    adhoc: scored.filter((item) => item.adhoc).map((item) => item.id),
  };
}
