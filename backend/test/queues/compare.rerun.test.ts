import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { MemoryDocExtractClient, readable } from "../../src/doc-extract/__fakes__/memory.client";
import type { Queryable } from "../../src/db";
import { comparisons, reviewCases } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { applyAction, type ReviewDeps } from "../../src/review/actions";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback } from "../db";
import { BL_004, byContent, SI_004, SI_516 } from "./compare.fixtures";
import { outcome, pair } from "./compare.harness";

/**
 * What a person's correction does when the pipeline picks the email up again.
 * The rerun is the thing that settles the case, not the action: a correction
 * is a fact about one document, and the pair is judged again from both sides.
 */

function deps(tx: PoolClient): ReviewDeps & { queues: MemoryRunQueues } {
  const queues = new MemoryRunQueues();
  return { db: tx, tx: (fn: (q: Queryable) => Promise<unknown>) => fn(tx), queues } as ReviewDeps & { queues: MemoryRunQueues };
}

async function openCases(tx: PoolClient, emailRunId: string): Promise<number> {
  const { rows } = await tx.query<{ n: string }>("select count(*) as n from core.review_cases where email_run_id = $1", [emailRunId]);
  return Number(rows[0].n);
}

describe("a correction, then the rerun it asks for", () => {
  it("a blank weight filled in closes the case, and the pair is judged again on every field", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_516)).on(key("e_BL.txt"), readable(BL_004));
      const compare = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(compare, { runId, emailId });
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "review", status: "NEEDS_REVIEW", review_reason: "missing_value" });
      const opened = await reviewCases.openIdFor(tx, emailRunId);
      expect(opened).not.toBeNull();

      await applyAction(deps(tx), opened as string, { kind: "correct_field", actor: "kai", field: "gross_weight_kg", side: "SI", value: "131,058 KG" });
      await processCompare(compare, { runId, emailId, rerunFrom: "compare" });

      // Two companies still differ, so the pair is a MISMATCH rather than OK;
      // what the correction settled is that nothing is missing any more.
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "MISMATCH", status: "MISMATCH", review_reason: null });
      const view = await comparisons.view(tx, emailRunId);
      expect(view?.fields.find((f) => f.field === "gross_weight_kg")).toMatchObject({ siValue: "131,058 KG", same: true, missing: false });
      expect(await reviewCases.openIdFor(tx, emailRunId)).toBeNull();
      expect(await reviewCases.view(tx, opened as string)).toMatchObject({ status: "resolved", resolvedBy: "kai" });
      expect(await openCases(tx, emailRunId)).toBe(1);
    });
  });

  it("a rerun that escalates again changes the case that is open, never opens a second", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_516)).on(key("e_BL.txt"), readable(BL_004));
      const compare = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(compare, { runId, emailId });
      const opened = (await reviewCases.openIdFor(tx, emailRunId)) as string;

      // A field that was never the problem: the weight is still blank, so the
      // email comes back needing a person for the same reason it did before.
      await applyAction(deps(tx), opened, { kind: "correct_field", actor: "kai", field: "consignee", side: "BL", value: "EAST BRIGHT FZ-LLC" });
      await processCompare(compare, { runId, emailId, rerunFrom: "compare" });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "review", status: "NEEDS_REVIEW", review_reason: "missing_value" });
      expect(await reviewCases.openIdFor(tx, emailRunId)).toBe(opened);
      expect(await openCases(tx, emailRunId)).toBe(1);
    });
  });

  it("does not reuse the judgement given before the correction", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const compare = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(compare, { runId, emailId });
      expect((await comparisons.view(tx, emailRunId))?.defectFields).toEqual(["consignee", "notify_party"]);

      // No case was ever open: a MISMATCH is an answer, not an escalation. The
      // correction still reaches the judge, which is what this is about.
      const { id } = await reviewCases.raise(tx, { emailRunId, reason: "missing_value", stage: "compare", detail: {} });
      await applyAction(deps(tx), id, { kind: "correct_field", actor: "kai", field: "consignee", side: "BL", value: "EAST BRIGHT FZ-LLC" });
      await processCompare(compare, { runId, emailId, rerunFrom: "compare" });

      expect((await comparisons.view(tx, emailRunId))?.defectFields).toEqual(["notify_party"]);
    });
  });
});
