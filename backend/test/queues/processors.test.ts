import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";
import { proxyLlmClient } from "../../src/agents/llm-client";
import { RetryableError, TerminalError, UpstreamError } from "../../src/lib/errors";
import { classifications, emailRuns, llmCalls, runs } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { CompareJob } from "../../src/queues/names";
import { processClassify } from "../../src/queues/processors/classify.processor";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { inRollback, seedEmail, seedRun } from "../db";

// Only the unknown-provider case uses the real client; everything else hands in a FakeLlmClient.
const chat = vi.hoisted(() => vi.fn());
vi.mock("../../src/llm", () => ({ chat, listModels: vi.fn() }));

const verdict = (category: string, confidence = 0.85) =>
  JSON.stringify({ counter_cases: "Weak cases only.", rationale: "It decides.", category, agrees: false, confidence });

const answer = (category: string, confidence = 0.9) =>
  `The sender asks for something.\n\`\`\`json\n${JSON.stringify({ category, confidence, rationale: "because of the request" })}\n\`\`\``;

async function ingested(tx: PoolClient) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
  return { runId: run.id, emailId, emailRunId: (await emailRuns.idOf(tx, run.id, emailId)) as string };
}

describe("classify processor", () => {
  it("stores the model's category and sends a comparison request on to compare", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("BL_COMPARISON", 0.93));
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, llm, compare }, { runId, emailId }, 450);

      expect(await classifications.get(tx, emailRunId)).toMatchObject({
        finalCategory: "BL_COMPARISON",
        genConfidence: 0.93,
        decidedBy: "llm",
        // Whichever version ships: the registry takes the highest on disk.
        promptVersion: expect.stringMatching(/^v\d+$/),
      });
      expect(await emailRuns.stageCounts(tx, runId)).toMatchObject({ classified: 1 });
      expect(compare.added).toEqual([
        {
          name: "compare-email",
          data: { runId, emailId },
          options: expect.objectContaining({ jobId: `${runId}__${emailId}`, priority: 450 }),
        },
      ]);
    });
  });

  it("shows the model the email as it arrived, and asks sonnet", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("SPAM"));

      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      const [request] = llm.requests;
      expect(request.model).toBe("sonnet");
      expect(request.project).toBe("worker");
      expect(request.user).toContain("## from\ndocs@vitalsolutions.sg");
      expect(request.user).toContain("## subject\nREQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT");
      expect(request.user).toContain("Hi Mitchelle, please compare the SI and draft BL.");
      expect(request.system).toContain('"BL_COMPARISON"');
    });
  });

  it.each(["SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"])("finishes a %s email without comparing it", async (category) => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, llm: new FakeLlmClient(answer(category)), compare }, { runId, emailId }, 600);

      const { rows } = await tx.query("select stage, outcome from core.email_runs where run_id = $1", [runId]);
      expect(rows[0]).toEqual({ stage: "done", outcome: "not_comparable" });
      expect(compare.added).toEqual([]);
    });
  });

  it("never stores a category the organisers did not define: the model is asked again, then the job fails", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("PHISHING"));

      await expect(
        processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600),
      ).rejects.toThrow(/structured output invalid/);

      expect(llm.requests).toHaveLength(2);
      expect(await classifications.get(tx, emailRunId)).toBeNull();
      expect(await llmCalls.usageForRun(tx, runId)).toMatchObject({ calls: 2, failedCalls: 2 });
    });
  });

  it("lets a proxy outage through as retryable, with the failed call on the ledger", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const llm = new FakeLlmClient(new RetryableError("llm-proxy returned 503"));

      await expect(
        processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600),
      ).rejects.toBeInstanceOf(RetryableError);
      expect(await llmCalls.usageForRun(tx, runId)).toMatchObject({ calls: 1, failedCalls: 1 });
    });
  });

  it("a confident generator settles the email alone: one call, no verifier", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("SPAM", 0.97));

      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      expect(llm.requests).toHaveLength(1);
      expect(await classifications.get(tx, emailRunId)).toMatchObject({ finalCategory: "SPAM", decidedBy: "llm" });
    });
  });

  it("an unsure generator is checked by the verifier, whose category wins", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const said = JSON.stringify({
        counter_cases: "SI_REQUEST: it mentions an SI.",
        rationale: "A draft is to be checked.",
        category: "BL_COMPARISON",
        agrees: false,
        confidence: 0.85,
      });
      const llm = new FakeLlmClient([answer("SI_REQUEST", 0.62), said]);
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, llm, compare }, { runId, emailId }, 600);

      expect(llm.requests).toHaveLength(2);
      const [, check] = llm.requests;
      expect(check.system).toContain("second reader");
      expect(check.user).toContain("## proposal\ncategory: SI_REQUEST\nconfidence: 0.62");
      expect(await classifications.get(tx, emailRunId)).toMatchObject({ finalCategory: "BL_COMPARISON", decidedBy: "verifier" });
      const { rows } = await tx.query("select gen_category, ver_category, rationale from core.classifications where email_run_id = $1", [
        emailRunId,
      ]);
      expect(rows[0]).toMatchObject({ gen_category: "SI_REQUEST", ver_category: "BL_COMPARISON" });
      expect(rows[0].rationale).toMatchObject({ verifier: "A draft is to be checked." });
      expect(compare.added).toHaveLength(1);
      expect(await llmCalls.listForEmail(tx, runId, emailId)).toMatchObject([
        { step: "classify", ok: true },
        { step: "classify-verify", ok: true, responseText: said },
      ]);
    });
  });

  it("runs the prompt versions and models the run pinned", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx, {
        promptSet: { classify: { version: "v4", model: "haiku" }, "classify-verify": { version: "v1", model: "opus" } },
      });
      const emailId = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
      const llm = new FakeLlmClient(answer("GENERAL", 0.97));

      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId: run.id, emailId }, 600);

      expect(llm.requests[0].model).toBe("haiku");
      const [call] = await llmCalls.listForEmail(tx, run.id, emailId);
      expect(call).toMatchObject({ promptVersion: "v4", model: "haiku" });
    });
  });

  it("fails an unknown provider rather than requeueing it: a 500 the proxy marks permanent", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      chat.mockReset();
      chat.mockImplementation(async () => {
        throw new UpstreamError(500, "llm-proxy returned 500: unknown provider", { retryable: false });
      });
      // The real client, so the proxy's verdict is what turns the 500 into a failure.
      const llm = proxyLlmClient({ sleep: async () => undefined });

      const failure = processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      await expect(failure).rejects.toBeInstanceOf(TerminalError);
      await expect(failure).rejects.not.toBeInstanceOf(RetryableError);
      expect(chat).toHaveBeenCalledTimes(1);
      expect(await llmCalls.usageForRun(tx, runId)).toMatchObject({ calls: 1, failedCalls: 1 });
    });
  });

  it("keeps the generator's category when the verifier fails for good, and says so", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const llm = new FakeLlmClient([answer("GENERAL", 0.6), "not an answer", "still not an answer"]);

      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      expect(await classifications.get(tx, emailRunId)).toMatchObject({ finalCategory: "GENERAL", decidedBy: "llm" });
      const { rows } = await tx.query("select ver_category, rationale from core.classifications where email_run_id = $1", [emailRunId]);
      expect(rows[0].ver_category).toBeNull();
      expect(rows[0].rationale.verifierError).toMatch(/structured output invalid for step classify-verify/);
      expect(await emailRuns.stageCounts(tx, runId)).toMatchObject({ done: 1 });
    });
  });

  it("after a verifier outage, the retry reuses the generator's answer instead of paying for it again", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const compare = new RecordingAdder<CompareJob>();
      const first = new FakeLlmClient([answer("SI_REQUEST", 0.6), new RetryableError("llm-proxy returned 503")]);
      await expect(processClassify({ pool: tx, llm: first, compare }, { runId, emailId }, 600)).rejects.toBeInstanceOf(RetryableError);

      const retry = new FakeLlmClient(verdict("BL_COMPARISON"));
      await processClassify({ pool: tx, llm: retry, compare }, { runId, emailId }, 600);

      expect(retry.requests).toHaveLength(1);
      expect(retry.requests[0].system).toContain("second reader");
      expect(await classifications.get(tx, emailRunId)).toMatchObject({ finalCategory: "BL_COMPARISON", decidedBy: "verifier" });
    });
  });

  it("gives a run created before prompts were pinned the active version, not the newest file", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("SPAM", 0.97));

      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      const [call] = await llmCalls.listForEmail(tx, runId, emailId);
      // Migration 004 makes v3 active; v4, the unvalidated few-shot experiment, is newer on disk.
      expect(call.promptVersion).toBe("v3");
    });
  });

  it("streams each call where the run page can watch it, and clears it when the call ends", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const live = new MemoryLiveCalls();
      const llm = new FakeLlmClient(answer("SPAM", 0.97));

      await processClassify({ pool: tx, llm, live, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);

      expect(llm.requests[0].onText).toBeTypeOf("function");
      expect(live.writes.length).toBeGreaterThan(0);
      expect(live.writes[0]).toMatchObject({ emailRunId, step: "classify", model: "sonnet", attempt: 1 });
      expect(await live.get([emailRunId])).toEqual([]);
    });
  });

  it("does not stream when there is nowhere to show it", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const llm = new FakeLlmClient(answer("SPAM", 0.97));
      await processClassify({ pool: tx, llm, compare: new RecordingAdder<CompareJob>() }, { runId, emailId }, 600);
      expect(llm.requests[0].onText).toBeUndefined();
    });
  });

  it("running twice, as a retry does, leaves one classification and one compare job", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const deps = { pool: tx, llm: new FakeLlmClient(answer("BL_COMPARISON")), compare: new RecordingAdder<CompareJob>() };

      await processClassify(deps, { runId, emailId }, 600);
      await processClassify(deps, { runId, emailId }, 600);

      const { rows } = await tx.query(
        "select count(*)::int as n from core.classifications c join core.email_runs er on er.id = c.email_run_id where er.run_id = $1",
        [runId],
      );
      expect(rows[0].n).toBe(1);
      expect(deps.compare.added).toHaveLength(1);
      // The model is paid for once. The second pass reads the stored category.
      expect(deps.llm.requests).toHaveLength(1);
    });
  });
});

describe("a cancelled run", () => {
  it("is left alone by both processors: no model call, no stage moves, no compare job", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      await runs.setStatus(tx, runId, "cancelled", ["created"]);
      const llm = new FakeLlmClient(answer("BL_COMPARISON"));
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, llm, compare }, { runId, emailId }, 600);
      await processCompare({ pool: tx }, { runId, emailId });

      expect(llm.requests).toEqual([]);
      expect(await emailRuns.stageCounts(tx, runId)).toMatchObject({ ingested: 1, classified: 0, done: 0 });
      expect(compare.added).toEqual([]);
    });
  });
});

describe("compare processor (placeholder until phases 5 and 6)", () => {
  it("finishes the email OK and says it was not really compared", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      await emailRuns.setStage(tx, runId, emailId, "classified");

      await processCompare({ pool: tx }, { runId, emailId });
      await processCompare({ pool: tx }, { runId, emailId });

      const email = await tx.query("select stage, outcome, finished_at from core.email_runs where id = $1", [emailRunId]);
      expect(email.rows[0]).toMatchObject({ stage: "done", outcome: "OK" });
      expect(email.rows[0].finished_at).not.toBeNull();

      const stored = await tx.query(
        "select status, review_reason, has_defect, detail from core.comparisons where email_run_id = $1",
        [emailRunId],
      );
      expect(stored.rows).toEqual([{ status: "OK", review_reason: null, has_defect: false, detail: { placeholder: true } }]);
    });
  });
});
