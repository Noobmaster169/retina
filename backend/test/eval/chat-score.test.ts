import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { TurnResult } from "../../src/agents/chat/loop";
import { ChatQuestion, ChatQuestionSet, scoreTurn, summarise } from "../../src/eval/chat-score";

type Call = TurnResult["toolCalls"][number];

function call(tool: Call["tool"], args: Record<string, unknown> = {}, extra: Partial<Call> = {}): Call {
  return { tool, args, thought: "", ok: true, preview: "", sql: null, result: null, durationMs: 1, recipe: null, ...extra };
}

function turn(answer: string, toolCalls: Call[], extra: Partial<TurnResult> = {}): TurnResult {
  return {
    answer, reading: "", sqlUsed: [], toolCalls, graph: { nodes: [], edges: [] }, skillsUsed: [],
    adhoc: toolCalls.some((item) => item.tool === "run_sql" && item.ok), exhausted: false,
    outcome: "answered", checked: [], next: [], clarify: null, grounded: [], semantic: [], removedMoves: 0, ...extra,
  };
}

const RUN = "0011eb39-2767-415a-bc2d-75617c4a0212";
const question = (expectations: Record<string, unknown>) => ChatQuestion.parse({ id: "q", question: "?", expect: expectations });
const recipeCall = (name: string, params: Record<string, unknown>) =>
  call("run_recipe", { name, params }, { recipe: { name, version: 1, skill: "a-skill", params } });

describe("scoreTurn", () => {
  const cases: { name: string; expect: Record<string, unknown>; turn: TurnResult; passed: boolean }[] = [
    {
      name: "a lookup before a recipe given ids is grounded",
      expect: { behaviours: ["grounds_first", "uses_recipe", "no_own_sql"] },
      turn: turn("Two parties.", [call("find_entity", { text: "Acme" }), recipeCall("emails_for_entities", { entity_ids: [1, 2] })]),
      passed: true,
    },
    {
      name: "a recipe given ids with no lookup before it is not",
      expect: { behaviours: ["grounds_first"] },
      turn: turn("Two.", [recipeCall("emails_for_entities", { entity_ids: [1] })]),
      passed: false,
    },
    {
      name: "a recipe whose parameters sit beside its name is seen as filtering too",
      expect: { behaviours: ["grounds_first"] },
      turn: turn("Two.", [call("run_recipe", { name: "emails_for_entities", entity_ids: [12] })]),
      passed: false,
    },
    {
      name: "own SQL with a name literal and no lookup is not grounded",
      expect: { behaviours: ["grounds_first"] },
      turn: turn("None.", [call("run_sql", { sql: "select 1 from core.entities where canonical = 'Acme'" })]),
      passed: false,
    },
    {
      name: "a recipe that takes only a run filters on nothing a person could misspell",
      expect: { behaviours: ["grounds_first", "uses_recipe"] },
      turn: turn("Consignee.", [recipeCall("mismatches_by_field", { run_id: RUN })]),
      passed: true,
    },
    {
      name: "a failed lookup does not count as looking",
      expect: { behaviours: ["grounds_first"] },
      turn: turn("x", [call("find_entity", {}, { ok: false }), recipeCall("entity_roles", { entity_ids: [1] })]),
      passed: false,
    },
    {
      name: "own SQL fails no_own_sql",
      expect: { behaviours: ["no_own_sql"] },
      turn: turn("1", [call("run_sql", { sql: "select 1" })]),
      passed: false,
    },
    {
      name: "a guard refusal is counted from what the page shows",
      expect: { behaviours: ["no_guard_refusal"] },
      turn: turn("x", [call("run_sql", { sql: "select 1" }, { ok: false, preview: "'Acme' has not appeared in anything you have been shown on this turn" })]),
      passed: false,
    },
    { name: "the answer names the run", expect: { behaviours: ["names_the_run"] }, turn: turn("In run 0011eb39 there were 8.", []), passed: true },
    { name: "the answer does not name the run", expect: { behaviours: ["names_the_run"] }, turn: turn("There were 8.", []), passed: false },
    { name: "mentions ignore case", expect: { mentions: ["acme fine paper"] }, turn: turn("ACME FINE PAPER TRADING is the shipper.", []), passed: true },
    { name: "one of several wordings is enough", expect: { mentionsAnyOf: [["no sent", "not when it was sent", "ingest"]] }, turn: turn("That is the ingest time.", []), passed: true },
    { name: "something it must not say", expect: { absent: ["tonnage"] }, turn: turn("By tonnage, 138.", []), passed: false },
    { name: "running out of steps fails whatever else held", expect: {}, turn: turn("I could not finish", [], { exhausted: true }), passed: false },
  ];
  it.each(cases)("$name", ({ expect: expectations, turn: result, passed }) => {
    expect(scoreTurn(question(expectations), result, { steps: 2, runId: RUN, removedMoves: 0 }).passed).toBe(passed);
  });

  it("holds a turn to its step limit", () => {
    const limited = question({ maxSteps: 2 });
    expect(scoreTurn(limited, turn("x", []), { steps: 2, runId: RUN, removedMoves: 0 }).passed).toBe(true);
    expect(scoreTurn(limited, turn("x", []), { steps: 3, runId: RUN, removedMoves: 0 }).passed).toBe(false);
  });
});

describe("summarise", () => {
  it("reports the share answered from recipes alone, the median steps, and which turns were adhoc", () => {
    const scored = [
      scoreTurn(ChatQuestion.parse({ id: "a", question: "?" }), turn("x", [recipeCall("lanes", {})]), { steps: 2, runId: RUN, removedMoves: 0 }),
      scoreTurn(ChatQuestion.parse({ id: "b", question: "?" }), turn("x", [call("run_sql", { sql: "select 1" })]), { steps: 4, runId: RUN, removedMoves: 0 }),
      scoreTurn(ChatQuestion.parse({ id: "c", question: "?" }), turn("x", []), { steps: 1, runId: RUN, removedMoves: 0 }),
    ];
    expect(summarise(scored)).toMatchObject({ questions: 3, passed: 3, medianSteps: 2, adhoc: ["b"], noQuery: 1 });
    // One of the two turns that queried used recipes alone; the turn that ran nothing is left out of the share.
    expect(summarise(scored).recipeOnlyShare).toBeCloseTo(1 / 2);
  });
});

describe("the question set that ships", () => {
  const set = ChatQuestionSet.parse(JSON.parse(readFileSync(join(__dirname, "../../eval/chat-questions.json"), "utf8")));

  it("has forty-five questions with distinct ids, five plain and fifteen interactive", () => {
    expect(set).toHaveLength(45);
    expect(new Set(set.map((item) => item.id)).size).toBe(45);
    expect(set.filter((item) => item.tags.includes("plain"))).toHaveLength(5);
    expect(set.filter((item) => item.tags.includes("interactive"))).toHaveLength(15);
  });

  it("keeps the interactive questions off specific email ids, so a fresh seed asks the same thing", () => {
    const interactive = set.filter((item) => item.tags.includes("interactive"));
    for (const item of interactive) expect(item.question).not.toMatch(/email_\d+/);
  });
});
