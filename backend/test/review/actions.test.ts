import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { Queryable } from "../../src/db";
import { TerminalError } from "../../src/lib/errors";
import { classifications, comparisons, extractions, fieldDiffs, reviewActions, reviewCases } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { applyAction, type ReviewDeps } from "../../src/review/actions";
import { inRollback } from "../db";
import { classified, outcome } from "../queues/compare.harness";

/**
 * What each action writes, and what it sends back through the pipeline. The
 * queue is a fake, so a test reads the job that would have been added rather
 * than waiting for a worker to take it.
 */

const SEVEN = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge", "container_count", "gross_weight_kg"] as const;

/** An email that reached the compare stage, was extracted on both sides, and was parked. */
async function parked(tx: PoolClient, reason: "missing_value" | "unreadable" = "missing_value") {
  const { runId, emailId, emailRunId } = await classified(tx, [
    { filename: "e_SI.txt", role: "SI" },
    { filename: "e_BL.txt", role: "BL" },
  ]);
  for (const role of ["SI", "BL"] as const) {
    const { rows } = await tx.query<{ id: string }>(
      `insert into core.documents (email_run_id, attachment_id, role, format, pages)
       select $1, a.id, $2, 'txt', 1 from core.attachments a where a.run_id = $3 and a.filename = $4 returning id`,
      [emailRunId, role, runId, role === "SI" ? "e_SI.txt" : "e_BL.txt"],
    );
    await extractions.replace(tx, {
      documentId: rows[0].id,
      emailRunId,
      role,
      promptVersion: "v1",
      model: "sonnet",
      verified: false,
      fields: Object.fromEntries(
        SEVEN.map((field) => [
          field,
          { value: role === "BL" && field === "gross_weight_kg" ? null : `${role} ${field}`, placeholder: null, source_quote: `${role} ${field}`, confidence: 0.9, note: null },
        ]),
      ) as Parameters<typeof extractions.replace>[1]["fields"],
      evidenceOk: Object.fromEntries(SEVEN.map((field) => [field, true])) as Record<(typeof SEVEN)[number], boolean>,
    });
  }
  await comparisons.upsert(tx, { emailRunId, status: "NEEDS_REVIEW", reviewReason: reason, detail: {} });
  await tx.query("update core.email_runs set stage = 'review', outcome = $2 where id = $1", [emailRunId, reason]);
  const { id } = await reviewCases.raise(tx, { emailRunId, reason, stage: "compare", detail: {} });
  return { runId, emailId, emailRunId, caseId: id };
}

function deps(tx: PoolClient): ReviewDeps & { queues: MemoryRunQueues } {
  const queues = new MemoryRunQueues();
  return { db: tx, tx: (fn: (q: Queryable) => Promise<unknown>) => fn(tx), queues } as ReviewDeps & { queues: MemoryRunQueues };
}

describe("confirm", () => {
  it("closes the case, credits the person, and keeps the email reported as NEEDS_REVIEW", async () => {
    await inRollback(async (tx) => {
      const { emailRunId, caseId } = await parked(tx);
      const result = await applyAction(deps(tx), caseId, { kind: "confirm", actor: "kai", note: "checked by hand" });

      expect(result?.requeued).toBeNull();
      expect(result?.case).toMatchObject({ status: "resolved", actions: 1, lastActionBy: "kai" });
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "missing_value", status: "NEEDS_REVIEW", review_reason: "missing_value" });

      const { rows } = await tx.query("select decided_by from core.comparisons where email_run_id = $1", [emailRunId]);
      expect(rows[0].decided_by).toBe("human");
      expect(await reviewCases.view(tx, caseId)).toMatchObject({ status: "resolved", resolvedBy: "kai" });
      expect((await reviewActions.listForCase(tx, caseId))[0]).toMatchObject({ kind: "confirm", actor: "kai", note: "checked by hand" });
    });
  });
});

describe("correct_field", () => {
  it("stores the value beside the model's, re-queues compare, and leaves the case open", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, caseId } = await parked(tx);
      const at = deps(tx);
      const result = await applyAction(at, caseId, { kind: "correct_field", actor: "kai", field: "gross_weight_kg", side: "BL", value: "131058" });

      expect(result?.requeued).toBe("compare");
      expect(result?.action).toMatchObject({ kind: "correct_field", field: "gross_weight_kg", side: "BL", oldValue: null, newValue: "131058" });
      expect(result?.case.status).toBe("open");
      expect(at.queues.reruns).toHaveLength(1);
      expect(at.queues.reruns[0]).toMatchObject({ queue: "compare", data: { runId, emailId, rerunFrom: "compare" } });
      expect(at.queues.reruns[0].options.jobId).toBe(`${runId}__${emailId}__r1`);

      const stored = (await extractions.listForEmailRun(tx, emailRunId)).find((x) => x.role === "BL");
      expect(stored?.humanValues.gross_weight_kg).toBe("131058");
      // The model's own reading is untouched: it is what the eval measures.
      expect(stored?.fields.gross_weight_kg.value).toBeNull();
      expect(extractions.withHumanValues(stored!).gross_weight_kg.value).toBe("131058");
    });
  });

  it("re-queues at the priority the email already has, not at a default", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, caseId } = await parked(tx);
      // A tier-1 client's email, as ingest would have queued it.
      await tx.query("update core.email_runs set priority = 150 where run_id = $1 and email_id = $2", [runId, emailId]);
      const at = deps(tx);

      await applyAction(at, caseId, { kind: "correct_field", actor: "kai", field: "gross_weight_kg", side: "BL", value: "131058" });

      // Without this, a correction on a tier-1 email joins a burst at 600 and
      // waits behind every tier-3 email that happens to be in the queue.
      expect(at.queues.reruns[0].options.priority).toBe(150);
    });
  });

  it("refuses a field on a side that has not been read", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await classified(tx, [{ filename: "e_SI.txt", role: "SI" }]);
      const emailRunId = (await tx.query<{ id: string }>("select id from core.email_runs where run_id = $1 and email_id = $2", [runId, emailId])).rows[0].id;
      const { id } = await reviewCases.raise(tx, { emailRunId, reason: "missing_attachment", stage: "compare", detail: {} });

      await expect(applyAction(deps(tx), id, { kind: "correct_field", actor: "kai", field: "shipper", side: "BL", value: "x" })).rejects.toThrow(TerminalError);
    });
  });
});

describe("reclassify", () => {
  it("to BL_COMPARISON sends the email back through triage and leaves the case open", async () => {
    await inRollback(async (tx) => {
      const { emailRunId, caseId } = await parked(tx);
      const at = deps(tx);
      await tx.query(
        `insert into core.classifications (email_run_id, gen_category, gen_confidence, final_category, decided_by)
         values ($1, 'GENERAL', 0.8, 'GENERAL', 'llm')`,
        [emailRunId],
      );

      const result = await applyAction(at, caseId, { kind: "reclassify", actor: "kai", category: "BL_COMPARISON" });

      expect(result?.requeued).toBe("compare");
      expect(at.queues.reruns[0].data.rerunFrom).toBe("triage");
      expect(result?.action).toMatchObject({ oldValue: "GENERAL", newValue: "BL_COMPARISON" });
      expect(result?.case.status).toBe("open");
      expect(await classifications.get(tx, emailRunId)).toMatchObject({ humanCategory: "BL_COMPARISON", decidedBy: "human" });
    });
  });

  it("to a category with no pair clears the judgements, ends the email OK and closes the case", async () => {
    await inRollback(async (tx) => {
      const { emailRunId, caseId } = await parked(tx);
      const at = deps(tx);
      await tx.query(
        `insert into core.classifications (email_run_id, gen_category, gen_confidence, final_category, decided_by)
         values ($1, 'BL_COMPARISON', 0.8, 'BL_COMPARISON', 'llm')`,
        [emailRunId],
      );
      const comparisonId = (await comparisons.idFor(tx, emailRunId)) as string;
      await fieldDiffs.replaceAll(tx, comparisonId, [
        { field: "consignee", siValue: "a", blValue: "b", same: false, missing: false, confidence: 0.9, rationale: "two companies" },
      ]);

      const result = await applyAction(at, caseId, { kind: "reclassify", actor: "kai", category: "SI_REQUEST" });

      expect(result?.requeued).toBeNull();
      expect(result?.case.status).toBe("resolved");
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "not_comparable", status: "OK", review_reason: null, detail: { reclassified: true } });
      expect(await fieldDiffs.listForComparison(tx, (await comparisons.idFor(tx, emailRunId)) as string)).toEqual([]);
    });
  });
});

describe("note, retry and reopen", () => {
  it("a note writes a row and nothing else", async () => {
    await inRollback(async (tx) => {
      const { caseId } = await parked(tx);
      const at = deps(tx);
      const result = await applyAction(at, caseId, { kind: "note", actor: "kai", note: "the shipper renamed itself last year" });

      expect(result?.requeued).toBeNull();
      expect(result?.case.status).toBe("open");
      expect(at.queues.reruns).toHaveLength(0);
      expect(result?.action.note).toBe("the shipper renamed itself last year");
    });
  });

  it("retry is for a failure case, and an escalation refuses it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, caseId } = await parked(tx);
      await expect(applyAction(deps(tx), caseId, { kind: "retry", actor: "kai" })).rejects.toThrow(/retry is for a job that failed/);

      await reviewCases.resolve(tx, emailRunId, "kai");
      const failure = await reviewCases.openFailure(tx, { emailRunId, stage: "compare", detail: { message: "doc-extract is down" } });
      const at = deps(tx);
      const result = await applyAction(at, failure.id, { kind: "retry", actor: "kai" });

      expect(result?.requeued).toBe("compare");
      expect(at.queues.reruns[0]).toMatchObject({ queue: "compare", data: { runId, emailId, rerunFrom: "triage" } });
      expect(result?.case.status).toBe("open");
    });
  });

  it("reopen needs a resolved case, and confirm needs an open one", async () => {
    await inRollback(async (tx) => {
      const { caseId } = await parked(tx);
      await expect(applyAction(deps(tx), caseId, { kind: "reopen", actor: "kai", note: "not settled" })).rejects.toThrow(/this case is open/);

      await applyAction(deps(tx), caseId, { kind: "confirm", actor: "kai" });
      await expect(applyAction(deps(tx), caseId, { kind: "confirm", actor: "kai" })).rejects.toThrow(/this case is resolved/);

      const result = await applyAction(deps(tx), caseId, { kind: "reopen", actor: "kai", note: "not settled" });
      expect(result?.case).toMatchObject({ status: "open", actions: 2 });
    });
  });

  it("answers null for a case that does not exist", async () => {
    await inRollback(async (tx) => {
      expect(await applyAction(deps(tx), "999999999", { kind: "note", actor: "kai", note: "x" })).toBeNull();
    });
  });
});
