import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import { MemoryDocExtractClient } from "../../src/doc-extract/__fakes__/memory.client";
import { classifications, emailRuns, runs } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { CompareJob } from "../../src/queues/names";
import { processClassify } from "../../src/queues/processors/classify.processor";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { inRollback, seedEmail, seedRun } from "../db";

const answer = (category: string) => JSON.stringify({ rationale: "because of the request", category, confidence: 0.9 });
const sendDraft = JSON.stringify({ rationale: "asks for the draft", request: "send_draft", confidence: 0.9 });

/** No attachment rows are seeded here, so nothing is parsed; the fakes only have to exist. */
const parsers = () => ({ docExtract: new MemoryDocExtractClient(), store: new MemoryStore() });

async function ingested(tx: PoolClient) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
  return { runId: run.id, emailId, emailRunId: (await emailRuns.idOf(tx, run.id, emailId)) as string };
}

/** What a retry, or a stalled job reclaimed while its first copy finishes, must not undo. */
describe("a classify job that runs again", () => {
  it("does not drag an email that compare already finished back to classified", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId } = await ingested(tx);
      const deps = { ...parsers(), pool: tx, llm: new FakeLlmClient(answer("BL_COMPARISON")), compare: new RecordingAdder<CompareJob>() };
      await processClassify(deps, { runId, emailId }, 600);
      // With nothing attached, compare asks the model what the sender wants; the classify answer is not reused for that.
      await processCompare({ ...parsers(), pool: tx, llm: new FakeLlmClient(sendDraft) }, { runId, emailId });

      await processClassify(deps, { runId, emailId }, 600);

      const { rows } = await tx.query("select stage, finished_at from core.email_runs where run_id = $1", [runId]);
      expect(rows[0].stage).toBe("done");
      expect(rows[0].finished_at).not.toBeNull();
      expect(deps.llm.requests).toHaveLength(1);
    });
  });

  it("picks up after a first pass that stored the category and died before moving the email on", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      await emailRuns.setStage(tx, runId, emailId, "classifying");
      await classifications.upsert(tx, {
        emailRunId,
        genCategory: "BL_COMPARISON",
        genConfidence: 0.9,
        verCategory: null,
        verConfidence: null,
        finalCategory: "BL_COMPARISON",
        decidedBy: "llm",
        rationale: {},
        model: "sonnet",
        promptVersion: "v3",
      });
      const deps = { ...parsers(), pool: tx, llm: new FakeLlmClient(answer("SPAM")), compare: new RecordingAdder<CompareJob>() };

      await processClassify(deps, { runId, emailId }, 600);

      expect(deps.llm.requests).toEqual([]);
      expect(await emailRuns.stageCounts(tx, runId)).toMatchObject({ classified: 1 });
      expect(deps.compare.added).toHaveLength(1);
    });
  });
});

describe("a run cancelled while the model is answering", () => {
  it("keeps the call on the ledger and writes nothing else", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await ingested(tx);
      const compare = new RecordingAdder<CompareJob>();
      const llm = new FakeLlmClient(answer("BL_COMPARISON"));
      const complete = llm.complete.bind(llm);
      // The cancel lands between the request going out and the answer coming back.
      llm.complete = async (request) => {
        await runs.setStatus(tx, runId, "cancelled", ["created"]);
        return complete(request);
      };

      await processClassify({ ...parsers(), pool: tx, llm, compare }, { runId, emailId }, 600);

      expect(await classifications.get(tx, emailRunId)).toBeNull();
      expect(await emailRuns.stageCounts(tx, runId)).toMatchObject({ classifying: 1, classified: 0, done: 0 });
      expect(compare.added).toEqual([]);
      const { rows } = await tx.query("select count(*)::int as n from core.llm_calls where run_id = $1", [runId]);
      expect(rows[0].n).toBe(1);
    });
  });
});
