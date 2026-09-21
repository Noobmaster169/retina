import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { runTurn, type TurnInput } from "../../src/agents/chat/loop";
import type { ChatProgress } from "../../src/contracts";
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
  scope: { runId: null, emailId: null, context: [] },
  orientation: "(an orientation)",
  today: "2026-09-20",
  stickySkills: [],
  pickedSkills: [],
  memory: "",
};

async function turn(
  /** A step's answer, or one with the preview a streaming caller hears on the way to it. */
  replies: (string | { text: string; preview?: string[] })[],
  options: {
    question?: string;
    input?: Partial<TurnInput>;
    seed?: boolean;
    /** Called with each step's finished calls, as the route's writer is. */
    onStep?(calls: { tool: string; preview: string }[]): Promise<void>;
    /** Stops the turn after this many steps have finished, as the composer's button does. */
    stopAfter?: number;
  } = {},
) {
  return inRollback(async (tx: PoolClient) => {
    const seeded: SeededInbox | null = options.seed ? await seedInbox(tx) : null;
    const llm = new FakeLlmClient(replies);
    const steps: { tool: string; preview: string }[][] = [];
    const progress: ChatProgress[] = [];
    const result = await runTurn(
      {
        llm,
        pool: tx,
        tools: { pool: getPool(), roPool: tx, runId: options.input?.scope?.runId ?? null, emailId: null },
        onStep: async (finished) => {
          steps.push(finished.map((call) => ({ tool: call.tool, preview: call.preview })));
          await options.onStep?.(finished.map((call) => ({ tool: call.tool, preview: call.preview })));
        },
        stopped: () => options.stopAfter !== undefined && steps.length >= options.stopAfter,
        onProgress: (event) => progress.push(event),
      },
      { ...BASE, question: options.question ?? "which client had the most mismatches?", ...options.input },
    );
    return { result, seeded, requests: llm.requests, steps, progress };
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

  /**
   * `claude -p` writes its object, then writes it again in a second content
   * block, so the preview a caller is handed drops back to empty partway
   * through. Drawn as it arrives, the answer appears, vanishes and is retyped.
   */
  it("reports the answer forwards only, when the provider writes it twice", async () => {
    const whole = '{"action":"final","reading":"How I read it.","answer":"Twenty emails, all at review."}';
    const { result, progress } = await turn([
      {
        text: whole,
        preview: [
          '{"action":"final","reading":"How I read it.","answer":"Twenty emails, all at',
          whole,
          // The second block, from the beginning.
          '{"action":"final","reading":"How I',
          whole,
        ],
      },
    ]);

    expect(result.answer).toBe("Twenty emails, all at review.");

    const answers = progress.map((event) => event.answer);
    const started = answers.findIndex((answer) => answer !== "");
    expect(started).toBeGreaterThanOrEqual(0);
    // Once there are words, there are always words, and never fewer than before.
    expect(answers.slice(started).every((answer) => answer !== "")).toBe(true);
    for (let i = started + 1; i < answers.length; i++) {
      expect(answers[i].length).toBeGreaterThanOrEqual(answers[i - 1].length);
    }
    expect(answers.at(-1)).toBe("Twenty emails, all at review.");
    // The reading is held the same way; the second block restates it from nothing.
    expect(progress.at(-1)?.reading).toBe("How I read it.");
  });

  it("names the tools of a step before they run", async () => {
    const { progress } = await turn([calls(sql("select 1 as n"), { tool: "list_entities", args: { kind: "port" } }), final("Both.")]);

    const looking = progress.filter((event) => event.phase === "looking");
    expect(looking).toHaveLength(1);
    expect(looking[0].tools).toEqual(["run_sql", "list_entities"]);
    expect(looking[0].step).toBe(1);
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

  it("still refuses the guess after looking it up, because a tool's echo of what was asked is not data", async () => {
    const guess = "select id from core.entities where canonical = 'Acme Paper Trading'";
    const { result } = await turn(
      [
        calls({ tool: "find_entity", args: { text: "Acme Paper Trading" } }, { tool: "search_emails", args: { text: "Acme Paper Trading" } }),
        calls(sql(guess, "emails for Acme Paper Trading")),
        // Sending the refused query again does not ground it either: the refusal quotes the string.
        calls(sql(guess)),
        calls(sql("select id from core.entities where canonical like 'Acme Paper Trading'")),
        final("Nothing under that spelling."),
      ],
      { question: "what do we have on Acme Paper Trading?", seed: true },
    );
    expect(result.toolCalls.map((call) => call.ok)).toEqual([true, true, false, false, false]);
    expect(result.toolCalls[2].preview).toContain("'Acme Paper Trading'");
  });

  it("does not take the agent's earlier answer as data, since it repeats the person's spelling", async () => {
    const history: TurnInput["history"] = [
      { role: "user", content: "anything on Zephyrus Limited?" },
      { role: "assistant", content: "I found nothing for Zephyrus Limited." },
    ];
    const { result } = await turn([calls(sql("select 1 from core.entities where canonical = 'Zephyrus Limited'")), final("None.")], { input: { history } });
    expect(result.toolCalls[0].ok).toBe(false);
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
        { ...BASE, scope: { runId: seeded.runId, emailId: null, context: [] }, question: "which emails involve them?" },
      );

      const [call] = result.toolCalls;
      expect(call.ok).toBe(true);
      expect(call.recipe).toMatchObject({ name: "emails_for_entities", version: 1, skill: "ground-names", params: { run_id: seeded.runId } });
      expect(new Set(call.result?.rows.map((row) => row[0]))).toEqual(new Set(seeded.emailIds));
      expect(result.sqlUsed[0]).toContain("-- recipe emails_for_entities v1 with $1 =");
      expect(result.adhoc).toBe(false);
      // A conversation opened about a run is given the skill for runs.
      expect(result.skillsUsed).toContainEqual({ name: "pick-the-run", version: 1, how: "injected" });
    });
  });

  it("says what was near when a grounded query comes back empty", async () => {
    const { result, requests } = await turn(
      [calls(sql("select id from core.entities where canonical ilike 'ACME FAR WEST%'")), final("None.")],
      { seed: true },
    );
    expect(result.toolCalls[0].ok).toBe(true);
    expect(result.toolCalls[0].result?.rowCount).toBe(0);
    // The agent is told what it was one letter away from, with the id to use.
    expect(requests[1].user).toContain("Stored names near 'ACME FAR WEST%':");
    expect(requests[1].user).toContain(`${ACME_FE} (party)`);
    expect(result.skillsUsed.map((skill) => skill.name)).toContain("ground-names");
  });

  it("shows a loaded skill once, under the skills, and not again in the transcript", async () => {
    const { requests } = await turn([calls({ tool: "load_skill", args: { name: "time-questions" } }), final("There is no sent time.")]);
    expect(requests[1].user.split("## Skill: time-questions")).toHaveLength(2);
  });

  it("keeps a skill the agent loaded, and gives a sticky one to the next turn without a step", async () => {
    const loaded = await turn([calls({ tool: "load_skill", args: { name: "time-questions" } }), final("There is no sent time.")]);
    expect(loaded.result.skillsUsed).toContainEqual({ name: "time-questions", version: 2, how: "loaded" });
    expect(loaded.requests[1].user).toContain("## Skill: time-questions");

    const next = await turn([final("Still none.")], { input: { stickySkills: ["time-questions"] } });
    expect(next.requests[0].user).toContain("## Skill: time-questions");
  });

  it("lets a stored spelling through whoever typed it, and refuses one that is stored nowhere", async () => {
    const { result } = await turn(
      [
        calls(sql("select 1 from core.entities where canonical = 'ZEPHYR PAPER CO., LTD'"), sql("select 1 from core.entities where canonical = 'Zephyrus Limited'")),
        final("Done."),
      ],
      { seed: true },
    );
    expect(result.toolCalls[0].ok).toBe(true);
    expect(result.toolCalls[1].ok).toBe(false);
  });
});

describe("a turn while it is running", () => {
  it("reports each step's calls as they finish, in order, one call at a time", async () => {
    const { steps } = await turn([
      calls(sql("select 1 as n", "the first"), sql("select 2 as n", "the second")),
      calls(sql("select 3 as n", "the third")),
      final("Done."),
    ]);

    // Two steps, not three calls: a step's calls run together, so they finish together.
    expect(steps.map((step) => step.length)).toEqual([2, 1]);
    expect(steps[0].map((call) => call.tool)).toEqual(["run_sql", "run_sql"]);
  });

  it("reports a failed call too, because a step that went wrong is still a step", async () => {
    const { steps } = await turn([calls(sql("drop table core.emails")), final("I could not.")]);
    expect(steps[0]).toHaveLength(1);
    expect(steps[0][0].preview).toMatch(/must start with .select./i);
  });

  it("does not report the final step, which is the answer and not a call", async () => {
    const { steps, result } = await turn([calls(sql("select 1 as n")), final("One.")]);
    expect(steps).toHaveLength(1);
    expect(result.answer).toBe("One.");
  });

  it("stops between steps, keeps what it found, and never asks the model again", async () => {
    const { result, requests } = await turn(
      [calls(sql("select 1 as n", "the only one that runs")), calls(sql("select 2 as n")), final("Never reached.")],
      { stopAfter: 1 },
    );

    expect(result.answer).toMatch(/^Stopped after 1 step/);
    expect(result.outcome).toBe("partial");
    // What it had is still on the turn: half an answer with its working is evidence.
    expect(result.toolCalls).toHaveLength(1);
    expect(result.answer).toContain("run_sql");
    // One model call, not three: the budget is not spent on a turn nobody is waiting for.
    expect(requests).toHaveLength(1);
  });

  it("lets a step's writes land before the step after it asks the model", async () => {
    const order: string[] = [];
    await turn([calls(sql("select 1 as n")), calls(sql("select 2 as n")), final("Done.")], {
      onStep: async () => {
        order.push("wrote a step");
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push("finished writing");
      },
    });
    // Never "wrote, wrote, finished, finished": the page would show them out of order.
    expect(order).toEqual(["wrote a step", "finished writing", "wrote a step", "finished writing"]);
  });
});

describe("what an answer may claim", () => {
  const finalWith = (extra: Record<string, unknown>) => step({ action: "final", answer: "An answer.", ...extra });

  it("keeps an alternative whose thing and count came back from a tool", async () => {
    const { result } = await turn([
      calls(sql("select 'PORT ALPHA, ATLANTIS (ATALP)' as port, 7 as emails", "the ports")),
      finalWith({
        next: [
          { kind: "alternative", label: "Port Alpha", prompt: "What goes through Port Alpha?", thing: "PORT ALPHA, ATLANTIS (ATALP)", count: 7, basis: "general_knowledge" },
        ],
      }),
    ]);
    expect(result.next.map((move) => move.label)).toEqual(["Port Alpha"]);
    expect(result.removedMoves).toBe(0);
  });

  it("removes one the agent reasoned its way to, and the answer still stands", async () => {
    const { result } = await turn([
      calls(sql("select 'PORT ALPHA, ATLANTIS (ATALP)' as port, 7 as emails", "the ports")),
      finalWith({
        next: [
          { kind: "alternative", label: "Port Alpha", prompt: "What goes through Port Alpha?", thing: "PORT ALPHA, ATLANTIS (ATALP)", count: 7, basis: "data" },
          { kind: "alternative", label: "Port Omega", prompt: "What goes through Port Omega?", thing: "PORT OMEGA, LEMURIA", count: 3, basis: "general_knowledge" },
        ],
      }),
    ]);
    expect(result.next.map((move) => move.label)).toEqual(["Port Alpha"]);
    expect(result.removedMoves).toBe(1);
    expect(result.answer).toBe("An answer.");
  });

  it("hands back a none_found that does not say where it looked, once", async () => {
    const { result, requests } = await turn([
      finalWith({ outcome: "none_found", checked: [] }),
      finalWith({ outcome: "none_found", checked: ["resolved ports", "subject lines"] }),
    ]);
    expect(requests).toHaveLength(2);
    expect(result.outcome).toBe("none_found");
    expect(result.checked).toEqual(["resolved ports", "subject lines"]);
  });

  it("settles a claim the agent would not fix, and keeps the prose", async () => {
    const { result, requests } = await turn([
      finalWith({ outcome: "needs_input", clarify: null }),
      finalWith({ outcome: "needs_input", clarify: null }),
    ]);
    // Asked once, not argued with twice.
    expect(requests).toHaveLength(2);
    expect(result.outcome).toBe("answered");
    expect(result.clarify).toBeNull();
    expect(result.answer).toBe("An answer.");
  });

  it("carries a clarifying question that came with its options", async () => {
    const clarify = { question: "Which one do you mean?", options: ["the port", "the company"] };
    const { result } = await turn([finalWith({ outcome: "needs_input", clarify })]);
    expect(result.outcome).toBe("needs_input");
    expect(result.clarify).toEqual(clarify);
  });

  it("remembers by name what a lookup grounded, and never by id", async () => {
    const { result, seeded } = await turn(
      [calls({ tool: "find_entity", args: { text: ACME_ME } }), final("Found it.")],
      { seed: true, question: `What do we have on ${ACME_ME}?` },
    );
    expect(seeded).not.toBeNull();
    expect(result.grounded.map((thing) => thing.canonical)).toContain(ACME_ME);
    expect(result.grounded.every((thing) => thing.kind === "party")).toBe(true);
  });
});
