import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { Category } from "../../src/contracts";
import { classifications, comparisons, emailRuns, fieldDiffs } from "../../src/ontology/repositories";
import { buildSubmission } from "../../src/ontology/submission";
import type { FieldJudgement } from "../../src/pipeline/compare";
import { inRollback, seedEmail, seedRun } from "../db";

async function email(tx: PoolClient, runId: string, category: Category | null, stage: "done" | "classifying" | "failed" = "done") {
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId, emailId, stage: "ingested", priority: 600 });
  await emailRuns.setStage(tx, runId, emailId, stage);
  const emailRunId = (await emailRuns.idOf(tx, runId, emailId)) as string;
  if (category) {
    await classifications.upsert(tx, {
      emailRunId,
      genCategory: category,
      genConfidence: 0.9,
      verCategory: null,
      verConfidence: null,
      finalCategory: category,
      decidedBy: "llm",
      rationale: {},
      model: "sonnet",
      promptVersion: "v1",
    });
  }
  return { emailId, emailRunId };
}

describe("buildSubmission", () => {
  it("has a row for every email in the run, shaped as the scorer reads it", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const spam = await email(tx, run.id, "SPAM");
      const bl = await email(tx, run.id, "BL_COMPARISON");
      await comparisons.upsert(tx, { emailRunId: bl.emailRunId, status: "OK", reviewReason: null, detail: {} });

      const { payload, incomplete } = await buildSubmission(tx, run.id);

      expect(incomplete).toEqual([]);
      expect(Object.keys(payload).sort()).toEqual([spam.emailId, bl.emailId].sort());
      expect(payload[spam.emailId]).toEqual({
        category: "SPAM",
        status: "OK",
        review_reason: null,
        has_defect: false,
        defect_fields: [],
        decided_by: "llm",
      });
      expect(payload[bl.emailId].category).toBe("BL_COMPARISON");
    });
  });

  it("carries an escalation through with the organisers' reason", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const bl = await email(tx, run.id, "BL_COMPARISON");
      await comparisons.upsert(tx, { emailRunId: bl.emailRunId, status: "NEEDS_REVIEW", reviewReason: "unreadable", detail: {} });

      const { payload } = await buildSubmission(tx, run.id);
      expect(payload[bl.emailId]).toMatchObject({ status: "NEEDS_REVIEW", review_reason: "unreadable", has_defect: false });
    });
  });

  it("flags a mismatch as a defect", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const bl = await email(tx, run.id, "BL_COMPARISON");
      await comparisons.upsert(tx, { emailRunId: bl.emailRunId, status: "MISMATCH", reviewReason: null, detail: {} });
      const comparisonId = (await comparisons.idFor(tx, bl.emailRunId)) as string;
      const judged = (field: FieldJudgement["field"], same: boolean, missing = false): FieldJudgement => ({
        field,
        siValue: "a",
        blValue: "b",
        same,
        missing,
        confidence: 0.9,
        rationale: null,
      });
      await fieldDiffs.replaceAll(tx, comparisonId, [judged("notify_party", false), judged("shipper", true), judged("consignee", false), judged("gross_weight_kg", false, true)]);

      const { payload } = await buildSubmission(tx, run.id);
      expect(payload[bl.emailId]).toMatchObject({ status: "MISMATCH", has_defect: true, review_reason: null, defect_fields: ["consignee", "notify_party"] });
    });
  });

  it("a pair sent to review submits no defect fields, whatever the judge saw on the other fields", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const bl = await email(tx, run.id, "BL_COMPARISON");
      await comparisons.upsert(tx, { emailRunId: bl.emailRunId, status: "NEEDS_REVIEW", reviewReason: "missing_value", detail: {} });
      const comparisonId = (await comparisons.idFor(tx, bl.emailRunId)) as string;
      await fieldDiffs.replaceAll(tx, comparisonId, [
        { field: "consignee", siValue: "a", blValue: "b", same: false, missing: false, confidence: 0.9, rationale: null },
        { field: "gross_weight_kg", siValue: null, blValue: "b", same: false, missing: true, confidence: null, rationale: null },
      ]);

      const { payload } = await buildSubmission(tx, run.id);
      expect(payload[bl.emailId]).toMatchObject({ status: "NEEDS_REVIEW", review_reason: "missing_value", has_defect: false, defect_fields: [] });
    });
  });

  it("lets a human's category win over the model's", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const mail = await email(tx, run.id, "GENERAL");
      await tx.query("update core.classifications set human_category = 'INVOICE_QUERY' where email_run_id = $1", [mail.emailRunId]);

      expect((await buildSubmission(tx, run.id)).payload[mail.emailId].category).toBe("INVOICE_QUERY");
    });
  });

  it("lists what is unfinished, failed or unclassified, and still submits the scorer's default for it", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const done = await email(tx, run.id, "SPAM");
      const inFlight = await email(tx, run.id, null, "classifying");
      const failed = await email(tx, run.id, "SI_REQUEST", "failed");

      const { payload, incomplete } = await buildSubmission(tx, run.id);

      expect(incomplete.sort()).toEqual([inFlight.emailId, failed.emailId].sort());
      expect(incomplete).not.toContain(done.emailId);
      expect(payload[inFlight.emailId]).toMatchObject({ category: "GENERAL", status: "OK" });
      expect(payload[failed.emailId].category).toBe("SI_REQUEST");
    });
  });

  it("is empty for a run with no emails", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      expect(await buildSubmission(tx, run.id)).toEqual({ payload: {}, incomplete: [] });
    });
  });
});

describe("the comparisons table holds the README's status table", () => {
  it.each([
    ["a reason on an OK row", { status: "OK", reviewReason: "missing_value" }],
    ["NEEDS_REVIEW with no reason", { status: "NEEDS_REVIEW", reviewReason: null }],
  ] as const)("refuses %s", async (_name, row) => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const bl = await email(tx, run.id, "BL_COMPARISON");
      await expect(comparisons.upsert(tx, { emailRunId: bl.emailRunId, detail: {}, ...row })).rejects.toThrow(/check constraint/);
    });
  });
});
