import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmRequest } from "../../src/agents/llm-client";
import { MemoryDocExtractClient, readable, scanned } from "../../src/doc-extract/__fakes__/memory.client";
import { TerminalError } from "../../src/lib/errors";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";
import { comparisons, emailRuns, extractions, llmCalls, reviewCases } from "../../src/ontology/repositories";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback } from "../db";
import { BL_004, byContent, SI_004, SI_004_FIELDS, SI_516, SI_516_FIELDS } from "./compare.fixtures";
import { classified, outcome, pair } from "./compare.harness";

const EXTRACTING = "You read one shipping document";
const VERIFYING = "You check a reading";
const JUDGING = "You compare a Shipping Instruction";

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

  it("a crossed pair: the file names the other way round, the model's reading decides, and each extraction records the place the file filled", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(BL_004)).on(key("e_BL.txt"), readable(SI_004));

      await processCompare({ pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({
        status: "MISMATCH",
        detail: { si: "e_BL.txt", bl: "e_SI.txt", swapped: true, defect_fields: ["consignee", "notify_party"] },
      });
      const stored = await extractions.listForEmailRun(tx, emailRunId);
      expect(stored.map((x) => [x.role, x.filename])).toEqual([
        ["SI", "e_BL.txt"],
        ["BL", "e_SI.txt"],
      ]);
      expect((await comparisons.view(tx, emailRunId))?.fields[1]).toMatchObject({ siValue: "EAST BRIGHT FZ-LLC", blValue: "UAB NOVAKOPA" });
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

  it("a quote the document does not carry sends the document to the verifier, whose reading replaces only the fields in doubt", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      // The first reading of the SI misquotes the weight line. The verifier gets the weight right but
      // re-copies the shipper with a quote of its own that is not in the document: that copy must not win.
      const llm = new FakeLlmClient((request: LlmRequest) => {
        const aboutTheSi = request.user.includes("SHIPPING INSTRUCTION");
        if (request.system.startsWith(EXTRACTING) && aboutTheSi) {
          return JSON.stringify({ ...SI_004_FIELDS, gross_weight_kg: { ...SI_004_FIELDS.gross_weight_kg, source_quote: "Gross Weight: 131,058 KG" } });
        }
        if (request.system.startsWith(VERIFYING) && aboutTheSi) {
          return JSON.stringify({ ...SI_004_FIELDS, shipper: { ...SI_004_FIELDS.shipper, source_quote: "Shipper APRIL FAR EAST" } });
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
      expect(Object.values(si?.evidenceOk ?? {}).every(Boolean)).toBe(true);
      expect(await outcome(tx, emailRunId)).toMatchObject({ status: "MISMATCH" });
    });
  });

  it("a field the verifier still cannot place is not given, carries no evidence, and the pair goes to a person as missing_value", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const wrong = JSON.stringify({ ...SI_004_FIELDS, shipper: { ...SI_004_FIELDS.shipper, value: "SOMEONE ELSE", source_quote: "Shipper: SOMEONE ELSE" } });
      const llm = new FakeLlmClient((request: LlmRequest) => {
        const aboutTheSi = request.user.includes("SHIPPING INSTRUCTION");
        if ((request.system.startsWith(EXTRACTING) || request.system.startsWith(VERIFYING)) && aboutTheSi) return wrong;
        return byContent(request);
      });

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      expect(await outcome(tx, emailRunId)).toMatchObject({ review_reason: "missing_value", detail: { missing: ["shipper"], defect_fields: ["consignee", "notify_party"] } });
      const si = (await extractions.listForEmailRun(tx, emailRunId)).find((x) => x.role === "SI");
      expect(si?.fields.shipper).toMatchObject({ value: null, placeholder: null, note: "the verifier could not locate this value in the document" });
      expect(si?.evidenceOk.shipper).toBe(false);
      expect(si?.evidenceOk.consignee).toBe(true);
    });
  });

  it("a verifier whose answer never fits its schema degrades: the fields in doubt stand as not given", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const llm = new FakeLlmClient((request: LlmRequest) => {
        if (request.system.startsWith(VERIFYING)) return "not json at all";
        if (request.system.startsWith(EXTRACTING) && request.user.includes("SHIPPING INSTRUCTION")) {
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
      expect(si?.evidenceOk.shipper).toBe(false);
    });
  });

  it("a judge whose answer never fits its schema fails the email, with the extractions kept for the retry", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const llm = new FakeLlmClient((request: LlmRequest) => (request.system.startsWith(JUDGING) ? "not json" : byContent(request)));

      await expect(processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId })).rejects.toBeInstanceOf(TerminalError);

      expect(await outcome(tx, emailRunId)).toMatchObject({ stage: "comparing", status: null });
      expect(await extractions.listForEmailRun(tx, emailRunId)).toHaveLength(2);
    });
  });

  it("a second pass reads the extractions and the judge's answer back instead of paying for them again", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await pair(tx);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.txt"), readable(SI_004)).on(key("e_BL.txt"), readable(BL_004));
      const deps = { pool: tx, llm: new FakeLlmClient(byContent), docExtract, store: new MemoryStore() };

      await processCompare(deps, { runId, emailId });
      await emailRuns.setStage(tx, runId, emailId, "comparing");
      await processCompare(deps, { runId, emailId });

      expect(docExtract.extractCalls).toHaveLength(2);
      // Two doc-type calls, two extractions and one judge the first time; nothing the second.
      expect(deps.llm.requests).toHaveLength(5);
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

  it("a scanned pair whose comparison fails for good is still escalated unreadable, without a provisional result", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId, key } = await classified(tx, [
        { filename: "e_SI.pdf", role: "SI" },
        { filename: "e_BL.pdf", role: "BL" },
      ]);
      const docExtract = new MemoryDocExtractClient().on(key("e_SI.pdf"), scanned(SI_004)).on(key("e_BL.pdf"), scanned(BL_004));
      const llm = new FakeLlmClient((request: LlmRequest) => (request.system.startsWith(JUDGING) ? "garbled" : byContent(request)));

      await processCompare({ pool: tx, llm, docExtract, store: new MemoryStore() }, { runId, emailId });

      const result = await outcome(tx, emailRunId);
      expect(result).toMatchObject({ stage: "review", review_reason: "unreadable", detail: { scanned: true, provisional: null } });
      expect((await comparisons.view(tx, emailRunId))?.fields).toEqual([]);
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ reason: "unreadable", status: "open" });
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
