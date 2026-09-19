import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { MemoryDocExtractClient, readable, unreadable } from "../../src/doc-extract/__fakes__/memory.client";
import { DocExtractUnavailableError } from "../../src/lib/errors";
import { documents, emailRuns, extractions, llmCalls } from "../../src/ontology/repositories";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback } from "../db";
import { byContent, SI_004 } from "./compare.fixtures";
import { classified, INVOICE_TEXT, outcome, pair, triage } from "./compare.harness";

describe("compare processor: the structural escalations, decided before any field is read", () => {
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
});
