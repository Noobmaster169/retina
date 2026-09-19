import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmRequest } from "../../src/agents/llm-client";
import { MemoryDocExtractClient, readable, scanned, unreadable } from "../../src/doc-extract/__fakes__/memory.client";
import { DocExtractUnavailableError } from "../../src/lib/errors";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";
import { attachments, comparisons, documents, emailRuns, extractions, llmCalls, reviewCases } from "../../src/ontology/repositories";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { keys } from "../../src/storage";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback, seedEmail, seedRun } from "../db";
import { BL_004, byContent, SI_004, SI_004_FIELDS, SI_516, SI_516_FIELDS } from "./compare.fixtures";

const INVOICE_TEXT = "COMMERCIAL INVOICE\n\nInvoice No.: 1\nTotal Amount: USD 22,500.00\n";
const triage = (request: string) => JSON.stringify({ rationale: "The sender asks for it.", request, confidence: 0.9 });

async function classified(tx: PoolClient, files: { filename: string; role: "SI" | "BL" | "UNKNOWN" }[]) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "classified", priority: 600 });
  for (const file of files) {
    await attachments.insert(tx, {
      runId: run.id,
      emailId,
      filename: file.filename,
      sourcePath: `attachments/${file.filename}`,
      role: file.role,
      objectKey: keys.attachment(run.id, emailId, file.filename),
      contentType: file.filename.endsWith(".pdf") ? "application/pdf" : "text/plain",
      bytes: 600,
      sha256: "0".repeat(64),
    });
  }
  const emailRunId = (await emailRuns.idOf(tx, run.id, emailId)) as string;
  const key = (filename: string) => keys.attachment(run.id, emailId, filename);
  return { runId: run.id, emailId, emailRunId, key };
}

async function outcome(tx: PoolClient, emailRunId: string) {
  const { rows } = await tx.query(
    `select er.stage, er.outcome, er.finished_at, c.status, c.review_reason, c.detail
       from core.email_runs er left join core.comparisons c on c.email_run_id = er.id where er.id = $1`,
    [emailRunId],
  );
  return rows[0];
}

const pair = (tx: PoolClient) =>
  classified(tx, [
    { filename: "e_SI.txt", role: "SI" },
    { filename: "e_BL.txt", role: "BL" },
  ]);

const stepsOf = (llm: FakeLlmClient) => llm.requests.map((r) => r.system.split("\n")[0].slice(0, 40));

describe("compare processor: a pair that can be compared", () => {
  it("email_004: both extracted, the judge asked once about all seven, MISMATCH on consignee and notify_party", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "done",
        outcome: "MISMATCH",
        status: "MISMATCH",
        review_reason: null,
        detail: { si: "e_SI.txt", bl: "e_BL.txt", extras: [], swapped: false, status: "MISMATCH", defect_fields: ["consignee", "notify_party"], missing: [] },
      });
      const calls = await llmCalls.listForEmail(tx, runId, emailId);
      expect(calls.map((c) => c.step)).toEqual(["doc-type", "doc-type", "extract", "extract", "field-judge"]);
      expect(calls.every((c) => c.ok)).toBe(true);

      const judge = llm.requests[4];
      expect(judge.user).toContain("## consignee\n- SI value: EAST BRIGHT FZ-LLC");
      expect(judge.user).toContain("- BL value: UAB NOVAKOPA");
      expect(judge.user).toContain("- BL quoted from: To the Order of: UAB NOVAKOPA");

      const stored = await extractions.listForEmailRun(tx, emailRunId);
      expect(stored.map((x) => [x.role, x.filename, x.verified])).toEqual([
        ["SI", "e_SI.txt", false],
        ["BL", "e_BL.txt", false],
      ]);
      expect(stored[0].fields).toEqual(SI_004_FIELDS);
      expect(Object.values(stored[0].evidenceOk).every(Boolean)).toBe(true);

      const view = await comparisons.view(tx, emailRunId);
      expect(view?.defectFields).toEqual(["consignee", "notify_party"]);
      expect(view?.fields).toHaveLength(7);
      expect(view?.fields[1]).toMatchObject({ field: "consignee", siValue: "EAST BRIGHT FZ-LLC", blValue: "UAB NOVAKOPA", same: false, missing: false });
      expect(await reviewCases.latestFor(tx, emailRunId)).toBeNull();
    });
  });

  it("a pair the judge finds the same on every field ends OK with no defect fields", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(SI_004));

      await processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "OK", status: "OK", detail: { defect_fields: [] } });
      expect((await comparisons.view(tx, emailRunId))?.fields.every((f) => f.same)).toBe(true);
    });
  });

  it("email_516: a placeholder on the SI is a missing_value escalation with the other fields judged, never a MISMATCH", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_516)).on(key("e_BL.txt"), readable(BL_004));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "review",
        outcome: "missing_value",
        status: "NEEDS_REVIEW",
        review_reason: "missing_value",
        detail: { missing: ["gross_weight_kg"], si: "e_SI.txt", bl: "e_BL.txt" },
      });
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ reason: "missing_value", stage: "compare", status: "open" });
      // The judge is asked about the six fields with a value on both sides, not the one the SI leaves blank.
      expect(llm.requests[4].user).not.toContain("## gross_weight_kg");
      expect(llm.requests[4].user).toContain("## shipper");
      const view = await comparisons.view(tx, emailRunId);
      expect(view?.fields.find((f) => f.field === "gross_weight_kg")).toMatchObject({ missing: true, siValue: null, blValue: "131,058 KG" });
      expect((await extractions.listForEmailRun(tx, emailRunId))[0].fields).toEqual(SI_516_FIELDS);
    });
  });

  it("a quote the document does not carry sends the document to the verifier, whose reading replaces it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      // The first extraction of the SI misquotes the weight line; the verifier gets it right.
      const llm = new FakeLlmClient((request: LlmRequest) => {
        if (request.system.startsWith("You read one shipping document") && request.user.includes("SHIPPING INSTRUCTION")) {
          return JSON.stringify({ ...SI_004_FIELDS, gross_weight_kg: { ...SI_004_FIELDS.gross_weight_kg, source_quote: "Gross Weight: 131,058 KG" } });
        }
        return byContent(request);
      });

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      const calls = await llmCalls.listForEmail(tx, runId, emailId);
      expect(calls.map((c) => c.step)).toEqual(["doc-type", "doc-type", "extract", "extract-verify", "extract", "field-judge"]);
      const verify = llm.requests[3];
      expect(verify.user).toContain("## in doubt\n- gross_weight_kg: the quoted line is not in the document");
      expect(verify.user).toContain("## first reading");
      const si = (await extractions.listForEmailRun(tx, emailRunId)).find((x) => x.role === "SI");
      expect(si).toMatchObject({ verified: true, fields: SI_004_FIELDS });
      expect(await outcome(tx, emailRunId)).toMatchObject({ status: "MISMATCH" });
    });
  });

  it("a field the verifier still cannot place is not given, and the pair goes to a person as missing_value", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const wrong = JSON.stringify({ ...SI_004_FIELDS, shipper: { ...SI_004_FIELDS.shipper, value: "SOMEONE ELSE", source_quote: "Shipper: SOMEONE ELSE" } });
      const llm = new FakeLlmClient((request: LlmRequest) => {
        const aboutTheSi = request.user.includes("SHIPPING INSTRUCTION");
        if (request.system.startsWith("You read one shipping document") && aboutTheSi) return wrong;
        if (request.system.startsWith("You check a reading") && aboutTheSi) return wrong;
        return byContent(request);
      });

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ review_reason: "missing_value", detail: { missing: ["shipper"], defect_fields: ["consignee", "notify_party"] } });
      const si = (await extractions.listForEmailRun(tx, emailRunId)).find((x) => x.role === "SI");
      expect(si?.fields.shipper).toMatchObject({ value: null, placeholder: null, note: "the verifier could not locate this value in the document" });
      expect(si?.evidenceOk.shipper).toBe(true);
    });
  });

  it("a verifier whose answer never fits its schema degrades: the fields in doubt stand as not given", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const llm = new FakeLlmClient((request: LlmRequest) => {
        if (request.system.startsWith("You check a reading")) return "not json at all";
        if (request.system.startsWith("You read one shipping document") && request.user.includes("SHIPPING INSTRUCTION")) {
          return JSON.stringify({ ...SI_004_FIELDS, shipper: { ...SI_004_FIELDS.shipper, confidence: 0.4 } });
        }
        return byContent(request);
      });

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ review_reason: "missing_value", detail: { missing: ["shipper"] } });
      const calls = await llmCalls.listForEmail(tx, runId, emailId);
      expect(calls.filter((c) => c.step === "extract-verify").map((c) => c.ok)).toEqual([false, false]);
      const si = (await extractions.listForEmailRun(tx, emailRunId)).find((x) => x.role === "SI");
      expect(si?.fields.shipper.note).toContain("the verifier failed");
    });
  });

  it("a second pass reads the extractions back instead of paying for them again", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const deps = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(deps, { runId, emailId });
      await emailRuns.setStage(tx, runId, emailId, "comparing");
      await processCompare(deps, { runId, emailId });

      expect(docExtract.extractCalls).toHaveLength(2);
      // Two doc-type calls, two extractions and one judge the first time; only the judge again.
      expect(stepsOf(deps.llm)).toHaveLength(6);
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", status: "MISMATCH" });
      expect((await comparisons.view(tx, emailRunId))?.fields).toHaveLength(7);
    });
  });

  it("a scanned pair: escalated unreadable, with the comparison on the OCR text attached as provisional", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.pdf", role: "SI" },
        { filename: "e_BL.pdf", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.pdf"), scanned(SI_004)).on(key("e_BL.pdf"), scanned(BL_004));

      await processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId });

      const result = await outcome(tx, emailRunId);
      expect(result).toMatchObject({
        stage: "review",
        outcome: "unreadable",
        review_reason: "unreadable",
        detail: { scanned: true, provisional: { status: "MISMATCH", review_reason: null, defect_fields: ["consignee", "notify_party"], missing: [] } },
      });
      expect(result.detail.pages).toHaveLength(2);
      expect((await comparisons.view(tx, emailRunId))?.fields).toHaveLength(7);
      expect(await extractions.listForEmailRun(tx, emailRunId)).toHaveLength(2);
    });
  });
});

describe("compare processor: the structural escalations, unchanged from phase 5", () => {
  it("a BL that is an invoice: wrong_doc_type, and nothing is extracted", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(INVOICE_TEXT));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "review",
        review_reason: "wrong_doc_type",
        detail: { files: [{ filename: "e_BL.txt", claimed: "BL", detected: "INVOICE", confidence: 0.96 }], pages: [] },
      });
      expect(llm.requests).toHaveLength(2);
      expect(await extractions.listForEmailRun(tx, emailRunId)).toEqual([]);
    });
  });

  it("a BL that will not open: unreadable, with the parser's reason and no provisional result", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.txt", role: "SI" },
        { filename: "e_BL.pdf", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.pdf"), unreadable("could not open: no xref"));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      const result = await outcome(tx, emailRunId);
      expect(result).toMatchObject({ stage: "review", review_reason: "unreadable", detail: { files: [{ filename: "e_BL.pdf", warnings: ["could not open: no xref"] }], pages: [] } });
      expect(result.detail).not.toHaveProperty("provisional");
      expect(llm.requests).toHaveLength(1);
      expect(docExtract.renderCalls.map((r) => r.filename)).toEqual(["e_BL.pdf"]);
      expect((await documents.listForEmailRun(tx, emailRunId)).find((d) => d.filename === "e_BL.pdf")).toMatchObject({ unreadable: true, docType: null });
    });
  });

  it("only the SI attached: missing_attachment, decided by code", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [{ filename: "e_SI.txt", role: "SI" }]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "review", review_reason: "missing_attachment", detail: { missing: ["BL"], attachments: ["e_SI.txt"] } });
      expect(llm.requests).toHaveLength(1);
    });
  });

  it("nothing attached and the sender asks for the draft: OK, awaiting the draft, decided by the model", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classified(tx, []);
      const llm = new FakeLlmClient(triage("send_draft"));

      await processCompare({ pool: tx, llm, docExtract: new MemoryDocExtractClient(), store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "OK", status: "OK", detail: { awaiting_draft: true } });
      expect(llm.requests).toHaveLength(1);
      expect(llm.requests[0].user).toContain("## body\nHi Mitchelle, please compare the SI and draft BL.");
      expect(await llmCalls.listForEmail(tx, runId, emailId)).toMatchObject([{ step: "triage", ok: true }]);
    });
  });

  it("nothing attached and the sender asks for a comparison: missing_attachment", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classified(tx, []);
      const deps = { pool: tx, llm: new FakeLlmClient(triage("compare_documents")), docExtract: new MemoryDocExtractClient(), store: new MemoryStore() };

      await processCompare(deps, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "review", review_reason: "missing_attachment", detail: { missing: ["SI", "BL"] } });
    });
  });

  it("a doc-extract outage is let through as an outage, and no row is written for the file", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [{ filename: "e_SI.txt", role: "SI" }]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), new DocExtractUnavailableError("doc-extract unreachable"));

      await expect(
        processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId }),
      ).rejects.toBeInstanceOf(DocExtractUnavailableError);

      expect(await documents.listForEmailRun(tx, emailRunId)).toEqual([]);
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "comparing", status: null });
    });
  });

  it("escalating twice leaves one open case", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classified(tx, []);
      const deps = { pool: tx, llm: new FakeLlmClient(triage("compare_documents")), docExtract: new MemoryDocExtractClient(), store: new MemoryStore() };
      await processCompare(deps, { runId, emailId });
      await emailRuns.setStage(tx, runId, emailId, "comparing");
      await processCompare(deps, { runId, emailId });

      const { rows } = await tx.query("select count(*)::int as n from core.review_cases where email_run_id = $1 and status = 'open'", [emailRunId]);
      expect(rows[0].n).toBe(1);
    });
  });

  it("streams each call where the run page can watch it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const live = new MemoryLiveCalls();
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, live, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(llm.requests.every((r) => typeof r.onText === "function")).toBe(true);
      expect(live.writes.map((w) => w.step)).toContain("field-judge");
      expect(live.writes.map((w) => w.step)).toContain("extract");
      expect(live.writes[0]).toMatchObject({ emailRunId });
      expect(await live.get([emailRunId])).toEqual([]);
    });
  });
});
