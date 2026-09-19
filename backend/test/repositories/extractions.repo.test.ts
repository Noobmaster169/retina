import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { attachments, comparisons, documents, emailRuns, extractions, fieldDiffs } from "../../src/ontology/repositories";
import type { ExtractedFields, FieldJudgement } from "../../src/pipeline/compare";
import { keys } from "../../src/storage";
import { inRollback, seedEmail, seedRun } from "../db";

const FIELDS: ExtractedFields = {
  shipper: { value: "APRIL FAR EAST (M) SDN BHD", placeholder: null, source_quote: "Shipper: APRIL FAR EAST (M) SDN BHD", confidence: 0.98, note: null },
  consignee: { value: "EAST BRIGHT FZ-LLC", placeholder: null, source_quote: "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC", confidence: 0.96, note: null },
  notify_party: { value: "EAST BRIGHT FZ-LLC", placeholder: null, source_quote: "Notify: EAST BRIGHT FZ-LLC", confidence: 0.95, note: null },
  port_of_loading: { value: "NANTONG, CHINA (CNNTG)", placeholder: null, source_quote: "Port of Loading (POL): NANTONG, CHINA (CNNTG)", confidence: 0.99, note: null },
  port_of_discharge: { value: "KARACHI, PAKISTAN (PKKHI)", placeholder: null, source_quote: "POD: KARACHI, PAKISTAN (PKKHI)", confidence: 0.99, note: null },
  container_count: { value: "6 x 40'HC", placeholder: null, source_quote: "Total Containers: 6 x 40'HC", confidence: 0.99, note: null },
  gross_weight_kg: { value: null, placeholder: "N/A", source_quote: "Gross Weight毛重(KGS): N/A", confidence: 0.9, note: null },
};
const EVIDENCE = {
  shipper: true,
  consignee: true,
  notify_party: true,
  port_of_loading: true,
  port_of_discharge: false,
  container_count: true,
  gross_weight_kg: true,
};

async function documentRow(tx: PoolClient) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "comparing", priority: 600 });
  const emailRunId = (await emailRuns.idOf(tx, run.id, emailId)) as string;
  await attachments.insert(tx, {
    runId: run.id,
    emailId,
    filename: "e_SI.txt",
    sourcePath: "attachments/e_SI.txt",
    role: "SI",
    objectKey: keys.attachment(run.id, emailId, "e_SI.txt"),
    contentType: "text/plain",
    bytes: 600,
    sha256: "0".repeat(64),
  });
  const file = (await attachments.listForEmail(tx, run.id, emailId))[0];
  await documents.upsert(tx, {
    emailRunId,
    attachmentId: file.id,
    role: "SI",
    format: "txt",
    textObjectKey: keys.text(run.id, emailId, "e_SI.txt"),
    pages: 1,
    scanned: false,
    unreadable: false,
    warnings: [],
  });
  const doc = (await documents.listForEmailRun(tx, emailRunId))[0];
  return { runId: run.id, emailId, emailRunId, doc };
}

describe("extractions repository", () => {
  it("stores one extraction per document with its seven fields, and reads it back as the pipeline and the trace need it", async () => {
    await inRollback(async (tx) => {
      const { emailRunId, doc } = await documentRow(tx);
      await extractions.replace(tx, { documentId: doc.id, emailRunId, role: "SI", promptVersion: "v1", model: "sonnet", verified: false, fields: FIELDS, evidenceOk: EVIDENCE });

      const stored = await extractions.forDocument(tx, doc.id);
      expect(stored).toMatchObject({ documentId: doc.id, filename: "e_SI.txt", role: "SI", promptVersion: "v1", model: "sonnet", verified: false, humanValues: {} });
      expect(stored?.fields).toEqual(FIELDS);
      expect(stored?.evidenceOk).toEqual(EVIDENCE);
      expect(await extractions.listForEmailRun(tx, emailRunId)).toHaveLength(1);

      const view = extractions.toView(stored!);
      expect(view.fields).toHaveLength(7);
      expect(view.fields[6]).toEqual({
        field: "gross_weight_kg",
        value: null,
        placeholder: "N/A",
        sourceQuote: "Gross Weight毛重(KGS): N/A",
        confidence: 0.9,
        evidenceOk: true,
        humanValue: null,
        note: null,
      });
    });
  });

  it("extracting again replaces the reading and keeps a person's correction, which wins when read back", async () => {
    await inRollback(async (tx) => {
      const { emailRunId, doc } = await documentRow(tx);
      await extractions.replace(tx, { documentId: doc.id, emailRunId, role: "SI", promptVersion: "v1", model: "sonnet", verified: false, fields: FIELDS, evidenceOk: EVIDENCE });
      await tx.query(
        `update core.extraction_fields set human_value = '235,550 KG'
          where field = 'gross_weight_kg' and extraction_id = (select id from core.extractions where document_id = $1)`,
        [doc.id],
      );
      const again = { ...FIELDS, shipper: { ...FIELDS.shipper, confidence: 0.5 } };
      await extractions.replace(tx, { documentId: doc.id, emailRunId, role: "SI", promptVersion: "v2", model: "opus", verified: true, fields: again, evidenceOk: EVIDENCE });

      const stored = await extractions.forDocument(tx, doc.id);
      expect(stored).toMatchObject({ promptVersion: "v2", model: "opus", verified: true, humanValues: { gross_weight_kg: "235,550 KG" } });
      expect(stored?.fields.shipper.confidence).toBe(0.5);
      expect(extractions.withHumanValues(stored!).gross_weight_kg).toMatchObject({ value: "235,550 KG", placeholder: null });
      const { rows } = await tx.query("select count(*)::int as n from core.extractions where document_id = $1", [doc.id]);
      expect(rows[0].n).toBe(1);
    });
  });

  it("answers null for a document not yet read", async () => {
    await inRollback(async (tx) => {
      const { doc } = await documentRow(tx);
      expect(await extractions.forDocument(tx, doc.id)).toBeNull();
    });
  });
});

describe("field diffs repository", () => {
  const judged = (field: FieldJudgement["field"], same: boolean, missing = false): FieldJudgement => ({
    field,
    siValue: "a",
    blValue: same ? "a" : "b",
    same,
    missing,
    confidence: missing ? null : 0.9,
    rationale: "because",
  });

  it("keeps every field's judgement against the comparison, in the enum's order, and the view derives the defect fields", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await documentRow(tx);
      await comparisons.upsert(tx, { emailRunId, status: "MISMATCH", reviewReason: null, detail: {} });
      const comparisonId = (await comparisons.idFor(tx, emailRunId)) as string;
      await fieldDiffs.replaceAll(tx, comparisonId, [judged("gross_weight_kg", false), judged("shipper", true), judged("consignee", false)]);

      const view = await comparisons.view(tx, emailRunId);
      expect(view?.fields.map((f) => f.field)).toEqual(["shipper", "consignee", "gross_weight_kg"]);
      expect(view?.defectFields).toEqual(["consignee", "gross_weight_kg"]);
      expect(view?.status).toBe("MISMATCH");

      await fieldDiffs.replaceAll(tx, comparisonId, [judged("shipper", true)]);
      expect((await comparisons.view(tx, emailRunId))?.fields).toHaveLength(1);
    });
  });

  it("a missing field is never a defect field", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await documentRow(tx);
      await comparisons.upsert(tx, { emailRunId, status: "NEEDS_REVIEW", reviewReason: "missing_value", detail: {} });
      const comparisonId = (await comparisons.idFor(tx, emailRunId)) as string;
      await fieldDiffs.replaceAll(tx, comparisonId, [judged("gross_weight_kg", false, true), judged("shipper", false)]);
      expect((await comparisons.view(tx, emailRunId))?.defectFields).toEqual(["shipper"]);
    });
  });

  it("counts a run's outcomes and which fields differed, zero where nothing was compared", async () => {
    await inRollback(async (tx) => {
      const { runId, emailRunId } = await documentRow(tx);
      await comparisons.upsert(tx, { emailRunId, status: "MISMATCH", reviewReason: null, detail: {} });
      const comparisonId = (await comparisons.idFor(tx, emailRunId)) as string;
      await fieldDiffs.replaceAll(tx, comparisonId, [judged("consignee", false), judged("notify_party", false), judged("shipper", true)]);

      const outcomes = await comparisons.outcomesForRuns(tx, [runId, "00000000-0000-0000-0000-000000000001"]);
      expect(outcomes(runId)).toMatchObject({ ok: 0, mismatch: 1, byField: { consignee: 1, notify_party: 1, shipper: 0 } });
      expect(outcomes("00000000-0000-0000-0000-000000000001")).toMatchObject({ ok: 0, mismatch: 0 });
    });
  });
});
