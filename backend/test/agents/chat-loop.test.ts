import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { runTurn, type TurnInput } from "../../src/agents/chat/loop";
import { getPool } from "../../src/db";
import { ACME_FE, ACME_ME, seedInbox, type SeededInbox } from "../chat-seed";
import { inRollback } from "../db";

/**
 * The loop with a scripted model. No test in this repository reaches the
 * proxy; the model's every step is a fixture here. The tools read through the
 * test's own transaction, so what a test seeds is what the agent can find.
 */

function step(value: unknown): string {
  return JSON.stringify(value);
}

function calls(...list: { tool: string; args?: Record<string, unknown>; thought?: string }[]): string {
  return step({ action: "tool", calls: list.map((call) => ({ args: {}, thought: "", ...call })) });
}

const sql = (text: string, purpose = "a query") => ({ tool: "run_sql", args: { sql: text, purpose } });
const final = (answer: string) => step({ action: "final", answer });

const BASE: Omit<TurnInput, "question"> = {
  history: [],
  scope: { runId: null, emailId: null },
  orientation: "(an orientation)",
  today: "2026-09-20",
  stickySkills: [],
  pickedSkills: [],
};

async function turn(
  replies: string[],
  options: { question?: string; input?: Partial<TurnInput>; seed?: boolean } = {},
) {
  return inRollback(async (tx: PoolClient) => {
    const seeded: SeededInbox | null = options.seed ? await seedInbox(tx) : null;
    const llm = new FakeLlmClient(replies);
    const result = await runTurn(
      { llm, pool: tx, tools: { pool: getPool(), roPool: tx, runId: options.input?.scope?.runId ?? null, emailId: null } },
      { ...BASE, question: options.question ?? "which client had the most mismatches?", ...options.input },
    );
    return { result, seeded, requests: llm.requests };
  });
}

describe("runTurn", () => {
  it("calls a tool, then answers, and reports the SQL the tool actually ran", async () => {
    const { result } = await turn([
      step({ action: "tool", reading: "A smoke test.", calls: [{ ...sql("select 1 as n"), thought: "I need a number." }] }),
      step({ action: "final", answer: "It is 1.", sql_used: ["something the model half remembered"] }),
    ]);

    expect(result.answer).toBe("It is 1.");
    expect(result.reading).toBe("A smoke test.");
    expect(result.exhausted).toBe(false);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ tool: "run_sql", ok: true, recipe: null });
    expect(result.toolCalls[0].result?.rows).toEqual([["1"]]);
    // What ran beats what the model remembers running.
    expect(result.sqlUsed).toEqual(["select 1 as n limit 200"]);
    // SQL the agent wrote itself marks a question no recipe covers yet.
    expect(result.adhoc).toBe(true);
  });

  it("runs the calls of one step together and hands every result back", async () => {
    const { result, requests } = await turn([
      calls(sql("select 1 as n"), sql("select 2 as n"), { tool: "list_entities", args: { kind: "port" } }),
      final("Both."),
    ]);

    expect(result.toolCalls.map((call) => call.tool)).toEqual(["run_sql", "run_sql", "list_entities"]);
    // Two model calls for three tool calls: the point of a step carrying several.
    expect(requests).toHaveLength(2);
    expect(requests[1].user).toContain("### you called list_entities");
  });

  it("feeds a guardrail refusal back so the next step can correct it", async () => {
    const { result } = await turn([calls(sql("delete from core.emails")), calls(sql("select 2 as n")), final("It is 2.")]);

    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].preview).toContain("start with `select` or `with`");
    expect(result.toolCalls[1].ok).toBe(true);
    // Only the query that ran is reported as having run.
    expect(result.sqlUsed).toEqual(["select 2 as n limit 200"]);
  });

  it("feeds bad arguments back once rather than throwing", async () => {
    const { result } = await turn([calls({ tool: "run_sql", args: { purpose: "no sql at all" } }), final("I could not.")]);
    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].preview).toContain("bad arguments");
  });

  it("hands back a tool step that carries no call, without showing it as a call", async () => {
    const { result, requests } = await turn([step({ action: "tool", calls: [] }), final("Nothing to do.")]);
    expect(result.toolCalls).toEqual([]);
    expect(requests[1].user).toContain("gave no calls");
  });

  it("hands back a final step that says nothing", async () => {
    const { result, requests } = await turn([step({ action: "final", answer: "  " }), final("There are three.")]);
    expect(result.answer).toBe("There are three.");
    expect(requests[1].user).toContain("a final step with no answer");
  });

  it("gives up after the step budget and says what it found", async () => {
    // One reply repeats forever in the fake, so the model never answers.
    const { result } = await turn([calls(sql("select 3"))]);
    expect(result.exhausted).toBe(true);
    expect(result.answer).toContain("could not finish");
    expect(result.toolCalls).toHaveLength(8);
  });

  it("draws the graph from what the tools reported, dead ends included", async () => {
    const { result } = await turn([calls(sql("select domain from analytics.dim_client where false")), final("There were none.")]);
    const relation = result.graph.nodes.find((node) => node.kind === "relation");
    expect(relation?.label).toBe("analytics.dim_client");
    // A relation that returned nothing still appears, carrying its 0.
    expect(relation?.count).toBe(0);
    expect(relation?.empty).toBe(true);
    expect(result.graph.edges).toContainEqual({ from: "ask", to: "tool:0:run_sql" });
  });

  it("writes one llm_calls row per step, belonging to no run", async () => {
    await inRollback(async (tx) => {
      // Only the rows this transaction adds: the table is shared by the suite.
      const before = await tx.query<{ id: string | null }>("select max(id)::text as id from core.llm_calls");
      const from = before.rows[0].id ?? "0";
      const llm = new FakeLlmClient([calls(sql("select 4")), final("Nothing much.")]);
      await runTurn({ llm, pool: tx, tools: { pool: getPool(), roPool: tx, runId: null, emailId: null } }, { ...BASE, question: "hello" });

      const { rows } = await tx.query<{ n: string; runs: string }>(
        "select count(*)::text as n, count(run_id)::text as runs from core.llm_calls where id > $1::bigint and step = $2",
        [from, "chat"],
      );
      expect(Number(rows[0].n)).toBe(2);
      // A conversation's tokens are not a run's cost, so run_id stays null.
      expect(Number(rows[0].runs)).toBe(0);
    });
  });
});

describe("the harness around the loop", () => {
  it("puts the standing instructions, the orientation, the skill cards and every recipe in front of the first step", async () => {
    const { requests } = await turn([final("Hello.")], { input: { orientation: "Ports: all 3.\n  [7] SOMEWHERE" } });
    const first = requests[0].user;
    expect(first).toContain("How to start a turn");
    expect(first).toContain("[7] SOMEWHERE");
    expect(first).toContain("- ground-names:");
    expect(first).toContain("emails_for_entities(entity_ids bigint[], run_id uuid)");
    expect(first).toContain("Today is 2026-09-20.");
  });

  it("refuses a filter on a name only the question held, and lets the grounded one through", async () => {
    const { result, seeded } = await turn(
      [
        calls(sql("select id from core.entities where canonical = 'Acme Paper Trading'")),
        calls({ tool: "find_entity", args: { text: "Acme Paper Trading" } }),
        calls(sql(`select id from core.entities where canonical = '${ACME_ME}'`)),
        final("One party."),
      ],
      { question: "what do we have on Acme Paper Trading?", seed: true },
    );

    const [refusedCall, found, grounded] = result.toolCalls;
    expect(refusedCall.ok).toBe(false);
    expect(refusedCall.preview).toContain("'Acme Paper Trading'");
    expect(refusedCall.preview).toContain("find_entity");
    expect(found.ok).toBe(true);
    expect(grounded.ok).toBe(true);
    expect(grounded.result?.rows).toEqual([[seeded?.idOf(ACME_ME)]]);
    // The refusal put the skill for it in front of the agent without being asked.
    expect(result.skillsUsed).toContainEqual({ name: "ground-names", version: 1, how: "injected" });
  });

  it("grounds two names in one step and answers from a recipe, which is not adhoc", async () => {
    const { result, seeded, requests } = await turn(
      [
        calls({ tool: "find_entity", args: { text: "Acme" } }, { tool: "find_entity", args: { text: "Northwind" } }),
        final("placeholder"),
      ],
      { seed: true },
    );
    expect(requests).toHaveLength(2);
    const candidates = requests[1].user;
    expect(candidates).toContain(ACME_ME);
    expect(candidates).toContain(ACME_FE);
    expect(result.adhoc).toBe(false);
    expect(seeded?.idOf(ACME_ME)).toBeDefined();
  });

  it("runs a recipe on the conversation's run and carries its name, its SQL and its arguments to the turn", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const ids = [seeded.idOf(ACME_ME), seeded.idOf(ACME_FE)];
      const llm = new FakeLlmClient([calls({ tool: "run_recipe", args: { name: "emails_for_entities", params: { entity_ids: ids } } }), final("Three emails.")]);
      const result = await runTurn(
        { llm, pool: tx, tools: { pool: getPool(), roPool: tx, runId: seeded.runId, emailId: null } },
        { ...BASE, scope: { runId: seeded.runId, emailId: null }, question: "which emails involve them?" },
      );

      const [call] = result.toolCalls;
      expect(call.ok).toBe(true);
      expect(call.recipe).toMatchObject({ name: "emails_for_entities", skill: "ground-names", params: { run_id: seeded.runId } });
      expect(new Set(call.result?.rows.map((row) => row[0]))).toEqual(new Set(seeded.emailIds));
      expect(result.sqlUsed[0]).toContain("-- recipe emails_for_entities with $1 =");
      expect(result.adhoc).toBe(false);
      // A conversation opened about a run is given the skill for runs.
      expect(result.skillsUsed).toContainEqual({ name: "pick-the-run", version: 1, how: "injected" });
    });
  });

  it("says what was near when a grounded query comes back empty", async () => {
    const { result } = await turn(
      [calls(sql("select id from core.entities where canonical ilike 'ACME FAR WEST%'")), final("None.")],
      { seed: true },
    );
    expect(result.toolCalls[0].ok).toBe(true);
    expect(result.toolCalls[0].result?.rowCount).toBe(0);
    expect(result.skillsUsed.map((skill) => skill.name)).toContain("ground-names");
  });

  it("keeps a skill the agent loaded, and gives a sticky one to the next turn without a step", async () => {
    const loaded = await turn([calls({ tool: "load_skill", args: { name: "time-questions" } }), final("There is no sent time.")]);
    expect(loaded.result.skillsUsed).toContainEqual({ name: "time-questions", version: 1, how: "loaded" });
    expect(loaded.requests[1].user).toContain("## Skill: time-questions");

    const next = await turn([final("Still none.")], { input: { stickySkills: ["time-questions"] } });
    expect(next.requests[0].user).toContain("## Skill: time-questions");
  });

  it("treats what the agent said earlier as shown, and what the person said as not", async () => {
    const history: TurnInput["history"] = [
      { role: "user", content: "anything on Zephyrus Limited?" },
      { role: "assistant", content: "The party is ZEPHYR PAPER CO., LTD, in one email." },
    ];
    const { result } = await turn(
      [
        calls(sql("select 1 from core.entities where canonical = 'ZEPHYR PAPER CO., LTD'"), sql("select 1 from core.entities where canonical = 'Zephyrus Limited'")),
        final("Done."),
      ],
      { input: { history } },
    );
    expect(result.toolCalls[0].ok).toBe(true);
    expect(result.toolCalls[1].ok).toBe(false);
  });
});
