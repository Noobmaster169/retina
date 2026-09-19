import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmRequest } from "../../src/agents/llm-client";
import { MemoryDocExtractClient, readable, scanned, unreadable } from "../../src/doc-extract/__fakes__/memory.client";
import { DocExtractUnavailableError } from "../../src/lib/errors";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";
import { attachments, comparisons, documents, emailRuns, llmCalls, reviewCases } from "../../src/ontology/repositories";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { keys } from "../../src/storage";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback, seedEmail, seedRun } from "../db";

const SI_TEXT = "SHIPPING INSTRUCTION\n\nShipper: ACME\nConsignee: BETA\nPort of Loading: NANTONG\n";
const BL_TEXT = "BILL OF LADING (DRAFT)\n\nShipper: ACME\nTo the Order of: BETA\nBill of Lading No.: SINF1\n";
const INVOICE_TEXT = "COMMERCIAL INVOICE\n\nInvoice No.: 1\nTotal Amount: USD 22,500.00\n";

const docType = (doc_type: string, confidence = 0.96) => JSON.stringify({ rationale: "It says what it is.", doc_type, confidence });
const triage = (request: string) => JSON.stringify({ rationale: "The sender asks for it.", request, confidence: 0.9 });

/** The model reads the file's own text: an invoice is an invoice whatever the name says. */
function byContent(request: LlmRequest): string {
  if (request.user.includes("COMMERCIAL INVOICE")) return docType("INVOICE");
  if (request.user.includes("BILL OF LADING")) return docType("BL");
  return docType("SI");
}

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

describe("compare processor, phase 5: parse, type, and the structural escalations", () => {
  it("a readable SI and BL: both parsed, both typed by the model, placeholder OK", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.txt", role: "SI" },
        { filename: "e_BL.txt", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_TEXT)).on(key("e_BL.txt"), readable(BL_TEXT));
      const store = new MemoryStore();
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "done",
        outcome: "OK",
        status: "OK",
        review_reason: null,
        detail: { placeholder: true, si: "e_SI.txt", bl: "e_BL.txt", extras: [] },
      });
      const docs = await documents.listForEmailRun(tx, emailRunId);
      expect(docs.map((d) => [d.filename, d.role, d.docType, d.format, d.unreadable])).toEqual([
        ["e_BL.txt", "BL", "BL", "txt", false],
        ["e_SI.txt", "SI", "SI", "txt", false],
      ]);
      expect(docs[0].docTypeConfidence).toBe(0.96);
      // The text is in the store for phase 6 to read, not re-parsed.
      expect((await store.get(keys.text(runId, emailId, "e_SI.txt"))).toString()).toBe(SI_TEXT);
      expect(llm.requests).toHaveLength(2);
      expect(llm.requests[0].user).toContain("## claim\nthe file name says it is a Bill of Lading");
      expect(llm.requests[0].user).toContain(BL_TEXT.trim());
      expect(await llmCalls.listForEmail(tx, runId, emailId)).toMatchObject([{ step: "doc-type", ok: true }, { step: "doc-type", ok: true }]);
      expect(await reviewCases.latestFor(tx, emailRunId)).toBeNull();
    });
  });

  it("a BL that is an invoice: wrong_doc_type, with the model's evidence, and the email waits for a person", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.txt", role: "SI" },
        { filename: "e_BL.txt", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_TEXT)).on(key("e_BL.txt"), readable(INVOICE_TEXT));

      await processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "review",
        outcome: "wrong_doc_type",
        status: "NEEDS_REVIEW",
        review_reason: "wrong_doc_type",
        detail: { files: [{ filename: "e_BL.txt", claimed: "BL", detected: "INVOICE", confidence: 0.96 }], pages: [] },
      });
      expect((await outcome(tx, emailRunId)).finished_at).not.toBeNull();
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ reason: "wrong_doc_type", stage: "compare", status: "open" });
    });
  });

  it("a BL that will not open: unreadable, with the parser's reason; nothing is asked of the model about it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.txt", role: "SI" },
        { filename: "e_BL.pdf", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient()
        .on(key("e_SI.txt"), readable(SI_TEXT))
        .on(key("e_BL.pdf"), unreadable("could not open: no xref"));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "review",
        outcome: "unreadable",
        review_reason: "unreadable",
        detail: { files: [{ filename: "e_BL.pdf", warnings: ["could not open: no xref"] }], pages: [] },
      });
      expect(llm.requests).toHaveLength(1);
      expect(docExtract.renderCalls.map((r) => r.filename)).toEqual(["e_BL.pdf"]);
      const docs = await documents.listForEmailRun(tx, emailRunId);
      expect(docs.find((d) => d.filename === "e_BL.pdf")).toMatchObject({ unreadable: true, docType: null, textObjectKey: null });
    });
  });

  it("a scanned pair: read by OCR, typed, and still escalated as unreadable with its page images", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.pdf", role: "SI" },
        { filename: "e_BL.pdf", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.pdf"), scanned(SI_TEXT)).on(key("e_BL.pdf"), scanned(BL_TEXT));

      await processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId });

      const result = await outcome(tx, emailRunId);
      expect(result).toMatchObject({ stage: "review", review_reason: "unreadable", detail: { scanned: true, provisional: null } });
      expect(result.detail.pages).toEqual([
        `${keys.pages(runId, emailId, "e_BL.pdf")}/1.png`,
        `${keys.pages(runId, emailId, "e_SI.pdf")}/1.png`,
      ]);
      expect((await documents.listForEmailRun(tx, emailRunId)).map((d) => [d.scanned, d.docType])).toEqual([[true, "BL"], [true, "SI"]]);
    });
  });

  it("only the SI attached: missing_attachment, decided by code", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [{ filename: "e_SI.txt", role: "SI" }]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_TEXT));
      const llm = new FakeLlmClient(byContent);

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        stage: "review",
        review_reason: "missing_attachment",
        detail: { missing: ["BL"], attachments: ["e_SI.txt"] },
      });
      expect(llm.requests.map((r) => r.system.includes("what kind of document"))).toEqual([true]);
    });
  });

  it("nothing attached and the sender asks for the draft: OK, awaiting the draft, decided by the model", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classified(tx, []);
      const llm = new FakeLlmClient(triage("send_draft"));

      await processCompare({ pool: tx, llm, docExtract: new MemoryDocExtractClient(), store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", outcome: "OK", status: "OK", detail: { awaiting_draft: true } });
      expect(llm.requests).toHaveLength(1);
      expect(llm.requests[0].system).toContain("nothing attached");
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

  it("a second pass reuses the parsed rows, the typed documents and the triage answer: nothing is paid for twice", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.txt", role: "SI" },
        { filename: "e_BL.txt", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_TEXT)).on(key("e_BL.txt"), readable(BL_TEXT));
      const deps = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(deps, { runId, emailId });
      // As a retry would: the first pass moved the email on, so the second is a no-op at the stage check.
      await processCompare(deps, { runId, emailId });
      // And as a reclaimed stalled job would, from `comparing` with the rows already there.
      await emailRuns.setStage(tx, runId, emailId, "comparing");
      await processCompare(deps, { runId, emailId });

      expect(docExtract.extractCalls).toHaveLength(2);
      expect(deps.llm.requests).toHaveLength(2);
      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "done", status: "OK" });
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
      expect(await comparisons.upsert).toBeDefined();
    });
  });

  it("streams each doc-type and triage call where the run page can watch it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classified(tx, []);
      const live = new MemoryLiveCalls();
      const llm = new FakeLlmClient(triage("send_draft"));

      await processCompare({ pool: tx, llm, live, docExtract: new MemoryDocExtractClient(), store: new MemoryStore() }, { runId, emailId });

      expect(llm.requests[0].onText).toBeTypeOf("function");
      expect(live.writes[0]).toMatchObject({ emailRunId, step: "triage" });
      expect(await live.get([emailRunId])).toEqual([]);
    });
  });
});
