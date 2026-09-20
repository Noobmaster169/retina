import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { runTurn } from "../../src/agents/chat/loop";
import type { ToolContext } from "../../src/agents/chat/tools";
import { getPool } from "../../src/db";
import { inRollback } from "../db";

/**
 * The loop with a scripted model and a real read-only pool. No test in this
 * repository reaches the proxy; the model's every step is a fixture here.
 */

function step(value: unknown): string {
  return JSON.stringify(value);
}

/** The read-only pool the tools run on, from the same test database. */
function toolContext(pool: Pool, overrides: Partial<ToolContext> = {}): ToolContext {
  return { pool, roPool: pool, runId: null, emailId: null, ...overrides };
}

/**
 * Every turn runs inside a transaction that is rolled back, so the llm_calls
 * rows a loop writes never outlive the test that wrote them. The tools read
 * through the ordinary pool, which is correct: retina_ro is a different
 * connection and could not see this transaction's rows anyway.
 */
async function turn(replies: string[], question = "which client had the most mismatches?") {
  return inRollback(async (tx) => {
    const llm = new FakeLlmClient(replies);
    return runTurn(
      { llm, pool: tx, tools: toolContext(getPool()) },
      { question, history: [], scope: { runId: null, emailId: null } },
    );
  });
}

describe("runTurn", () => {
  it("calls a tool, then answers, and reports the SQL the tool actually ran", async () => {
    const result = await turn([
      step({
        action: "tool",
        tool: "run_sql",
        args: { sql: "select 1 as n", purpose: "a smoke test" },
        thought: "I need a number.",
      }),
      step({ action: "final", answer: "It is 1.", sql_used: ["something the model half remembered"] }),
    ]);

    expect(result.answer).toBe("It is 1.");
    expect(result.exhausted).toBe(false);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe("run_sql");
    expect(result.toolCalls[0].ok).toBe(true);
    expect(result.toolCalls[0].result?.rows).toEqual([["1"]]);
    // What ran beats what the model remembers running.
    expect(result.sqlUsed).toEqual(["select 1 as n limit 200"]);
  });

  it("feeds a guardrail refusal back so the next step can correct it", async () => {
    const result = await turn([
      step({
        action: "tool",
        tool: "run_sql",
        args: { sql: "delete from core.emails", purpose: "a write" },
        thought: "I will try to delete.",
      }),
      step({
        action: "tool",
        tool: "run_sql",
        args: { sql: "select 2 as n", purpose: "reading instead" },
        thought: "That was refused, so I will read.",
      }),
      step({ action: "final", answer: "It is 2.", sql_used: [] }),
    ]);

    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].preview).toContain("start with `select` or `with`");
    expect(result.toolCalls[1].ok).toBe(true);
    expect(result.answer).toBe("It is 2.");
    // Only the query that ran is reported as having run.
    expect(result.sqlUsed).toEqual(["select 2 as n limit 200"]);
  });

  it("feeds bad arguments back once rather than throwing", async () => {
    const result = await turn([
      step({ action: "tool", tool: "run_sql", args: { purpose: "no sql at all" }, thought: "Oops." }),
      step({ action: "final", answer: "I could not.", sql_used: [] }),
    ]);

    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].preview).toContain("bad arguments");
  });

  it("gives up after the step budget and says what it found", async () => {
    // One reply repeats forever in the fake, so the model never answers.
    const result = await turn([
      step({ action: "tool", tool: "run_sql", args: { sql: "select 3", purpose: "again" }, thought: "Once more." }),
    ]);

    expect(result.exhausted).toBe(true);
    expect(result.answer).toContain("could not finish");
    expect(result.toolCalls).toHaveLength(8);
  });

  it("draws the graph from what the tools reported, dead ends included", async () => {
    const result = await turn([
      step({
        action: "tool",
        tool: "run_sql",
        args: { sql: "select domain from analytics.dim_client where false", purpose: "an empty answer" },
        thought: "Looking for clients.",
      }),
      step({ action: "final", answer: "There were none.", sql_used: [] }),
    ]);

    const relation = result.graph.nodes.find((node) => node.kind === "relation");
    expect(relation?.label).toBe("analytics.dim_client");
    // A relation that returned nothing still appears, carrying its 0.
    expect(relation?.count).toBe(0);
    expect(relation?.empty).toBe(true);
    expect(result.graph.nodes.find((node) => node.kind === "question")?.id).toBe("ask");
    expect(result.graph.edges).toContainEqual({ from: "ask", to: "tool:0:run_sql" });
  });

  it("writes one llm_calls row per step, belonging to no run", async () => {
    await inRollback(async (tx) => {
      // Only the rows this transaction adds: the table is shared by the suite.
      const before = await tx.query<{ id: string | null }>("select max(id)::text as id from core.llm_calls");
      const from = before.rows[0].id ?? "0";

      const llm = new FakeLlmClient([
        step({ action: "tool", tool: "run_sql", args: { sql: "select 4", purpose: "one query" }, thought: "Reading." }),
        step({ action: "final", answer: "Nothing much.", sql_used: [] }),
      ]);
      await runTurn(
        { llm, pool: tx, tools: toolContext(getPool()) },
        { question: "hello", history: [], scope: { runId: null, emailId: null } },
      );

      const { rows } = await tx.query<{ n: string; runs: string }>(
        "select count(*)::text as n, count(run_id)::text as runs from core.llm_calls where id > $1::bigint and step = $2",
        [from, "chat"],
      );
      // One row per step of the loop, the answer included.
      expect(Number(rows[0].n)).toBe(2);
      // A conversation's tokens are not a run's cost, so run_id stays null.
      expect(Number(rows[0].runs)).toBe(0);
    });
  });
});
