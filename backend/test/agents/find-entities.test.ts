import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmRequest } from "../../src/agents/llm-client";
import { TOOLS } from "../../src/agents/chat/tools";
import { concepts } from "../../src/ontology/repositories";
import { ALPHA, BETA, GAMMA, seedInbox } from "../chat-seed";
import { inRollback } from "../db";

/**
 * The tool that answers a term written nowhere in the database. What is on
 * trial is the cost model: a term asked twice makes no call, a rewritten
 * profile re-judges exactly what it describes, and over the budget the answer
 * says partial rather than looking complete.
 */

const DEFINITION = "A seaport on the coast of Asia by the UN geoscheme, including Western Asia.";

/** `concept-define` answers with a new meaning; `concept-judge` answers yes for whichever names are listed. */
function scripted(yes: string[]): (request: LlmRequest) => string {
  return (request) => {
    if (request.system.includes("You give a meaning")) {
      // A meaning already written for this phrase is reused, which is what
      // makes the same question cost nothing the second time.
      const known = /^-?\s*\[(\d+)\]/m.exec(request.user)?.[1] ?? null;
      return JSON.stringify({ sameAs: known, definition: DEFINITION, searchTerms: ["Asia", "seaport"] });
    }
    // Sections are rendered as "- <item>", and a subject's first line is "[id] name".
    const ids = [...request.user.matchAll(/^-?\s*\[(\d+)\] (.+)$/gm)].map((match) => [match[1], match[2]] as const);
    return JSON.stringify(
      Object.fromEntries(
        ids.map(([id, name]) => [
          id,
          yes.some((wanted) => name.includes(wanted))
            ? { rationale: "its country is in Asia", verdict: "yes", confidence: 0.9 }
            : { rationale: "nothing in the profile says where it is", verdict: "unknown", confidence: 0.5 },
        ]),
      ),
    );
  };
}

async function call(tx: PoolClient, llm: FakeLlmClient, args: Record<string, unknown>) {
  return TOOLS.find_entities.run(args, { pool: tx as never, roPool: tx, llm, runId: null, emailId: null, shown: "" });
}

describe("find_entities", () => {
  it("defines the term, judges every candidate, and says the set is complete", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const llm = new FakeLlmClient(scripted([ALPHA]));

      const outcome = await call(tx, llm, { kind: "port", description: "in Asia" });

      expect(outcome.ok).toBe(true);
      expect(outcome.text).toContain(DEFINITION);
      expect(outcome.text).toContain("Every candidate was judged, so this set is complete.");
      expect(outcome.text).toContain(ALPHA);
      expect(outcome.semantic?.[0]).toMatchObject({ complete: true, matched: 1, reused: 0 });
      // The subquery carries no string literal, so the chat's own guard passes it.
      expect(outcome.grounds).toContain("and matched");
      expect(outcome.grounds).not.toContain("'yes'");
    });
  });

  it("makes no judge call the second time the same term is asked", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const first = new FakeLlmClient(scripted([ALPHA]));
      await call(tx, first, { kind: "port", description: "in Asia" });
      const judged = first.requests.filter((request) => request.system.includes("You apply one definition")).length;
      expect(judged).toBeGreaterThan(0);

      // The second asking reuses the meaning, so only the define call is made.
      const again = new FakeLlmClient((request: LlmRequest) => {
        if (request.system.includes("You give a meaning")) {
          const id = /^-?\s*\[(\d+)\]/m.exec(request.user)?.[1] ?? null;
          return JSON.stringify({ sameAs: id, definition: DEFINITION, searchTerms: ["Asia"] });
        }
        throw new Error("nothing should have been judged again");
      });
      const outcome = await call(tx, again, { kind: "port", description: "in Asia" });

      expect(outcome.semantic?.[0]).toMatchObject({ judged: 0, reused: 3, matched: 1 });
    });
  });

  it("re-judges exactly the thing whose profile was rewritten", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      await call(tx, new FakeLlmClient(scripted([ALPHA])), { kind: "port", description: "in Asia" });

      await tx.query("update core.entities set profile_version = profile_version + 1 where id = $1::bigint", [seeded.idOf(BETA)]);
      const again = new FakeLlmClient(scripted([ALPHA, BETA]));
      const outcome = await call(tx, again, { kind: "port", description: "in Asia" });

      expect(outcome.semantic?.[0]).toMatchObject({ judged: 1, reused: 2, matched: 2 });
    });
  });

  it("narrows to the ids a query returned before judging anything", async () => {
    await inRollback(async (tx) => {
      const seeded = await seedInbox(tx);
      const llm = new FakeLlmClient(scripted([ALPHA, BETA, GAMMA]));

      const outcome = await call(tx, llm, {
        kind: "port",
        description: "in Asia",
        candidateSql: `select id from core.entities where id = ${seeded.idOf(GAMMA)}`,
      });

      expect(outcome.text).toContain("Narrowed by your query to 1 of them");
      expect(outcome.semantic?.[0]).toMatchObject({ judged: 1, matched: 1 });
    });
  });

  it("refuses a narrowing query that selects two columns, or that writes", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      const llm = new FakeLlmClient(scripted([]));

      const wide = await call(tx, llm, { kind: "port", description: "in Asia", candidateSql: "select id, kind from core.entities" });
      expect(wide.ok).toBe(false);
      expect(wide.preview).toContain("exactly one column");

      const writes = await call(tx, llm, { kind: "port", description: "in Asia", candidateSql: "delete from core.entities" });
      // And a write hidden inside a select is refused on the word, not the shape.
      const hidden = await call(tx, llm, { kind: "port", description: "in Asia", candidateSql: "select id from core.entities where id in (delete from x returning id)" });
      expect(hidden.preview).toContain("`delete` is not allowed");
      expect(writes.ok).toBe(false);
      expect(writes.preview).toContain("does not read, it does something else");

      const two = await call(tx, llm, { kind: "port", description: "in Asia", candidateSql: "select id from core.entities; select 1" });
      expect(two.ok).toBe(false);
      expect(two.preview).toContain("one statement");
      expect(llm.requests).toHaveLength(0);
    });
  });

  it("says partial with the deferred count when the budget runs out, and the backfill finishes it", async () => {
    await inRollback(async (tx) => {
      await seedInbox(tx);
      // One judged per turn: the smallest budget that still answers something.
      const { config } = await import("../../src/config");
      const budget = config.JUDGE_BUDGET;
      Object.assign(config, { JUDGE_BUDGET: 1 });
      try {
        const outcome = await call(tx, new FakeLlmClient(scripted([ALPHA, BETA, GAMMA])), {
          kind: "port",
          description: "in Asia",
          needComplete: true,
        });
        expect(outcome.semantic?.[0]).toMatchObject({ complete: false, judged: 1, deferred: 2 });
        expect(outcome.text).toContain("Any total over this set is a lower bound");

        const wanted = await concepts.wantingBackfill(tx, 5);
        expect(wanted.map((concept) => concept.phrase)).toEqual(["in Asia"]);

        const { backfillConcepts } = await import("../../src/queues/backfill-concepts");
        Object.assign(config, { JUDGE_BUDGET: budget });
        await backfillConcepts({ pool: tx as never, llm: new FakeLlmClient(scripted([ALPHA, BETA, GAMMA])) });
        expect(await concepts.wantingBackfill(tx, 5)).toEqual([]);
      } finally {
        Object.assign(config, { JUDGE_BUDGET: budget });
      }
    });
  });
});
