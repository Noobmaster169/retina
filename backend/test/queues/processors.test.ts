import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { RetryableError } from "../../src/lib/errors";
import { classifications, emailRuns, llmCalls, runs } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { CompareJob } from "../../src/queues/names";
import { processClassify } from "../../src/queues/processors/classify.processor";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { inRollback, seedEmail, seedRun } from "../db";

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
