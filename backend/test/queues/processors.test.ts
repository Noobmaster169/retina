import { describe, expect, it } from "vitest";

import { emailRuns } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { CompareJob } from "../../src/queues/names";
import { processClassify } from "../../src/queues/processors/classify.processor";
import { processCompare } from "../../src/queues/processors/compare.processor";
import { inRollback, seedEmail, seedRun } from "../db";

describe("classify processor (phase 1 pass-through)", () => {
  it("marks the email classified and hands it to compare at the same priority", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, compare }, { runId: run.id, emailId }, 450);

      expect(await emailRuns.stageCounts(tx, run.id)).toMatchObject({ classified: 1, ingested: 0 });
      expect(compare.added).toEqual([
        {
          name: "compare-email",
          data: { runId: run.id, emailId },
          options: expect.objectContaining({ jobId: `${run.id}__${emailId}`, priority: 450 }),
        },
      ]);
    });
  });

  it("running twice, as a retry does, still leaves one compare job", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
      const compare = new RecordingAdder<CompareJob>();

      await processClassify({ pool: tx, compare }, { runId: run.id, emailId }, 600);
      await processClassify({ pool: tx, compare }, { runId: run.id, emailId }, 600);

      expect(compare.added).toHaveLength(1);
    });
  });
});

describe("compare processor (phase 1 pass-through)", () => {
  it("finishes the email as OK", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId, stage: "classified", priority: 600 });

      await processCompare({ pool: tx }, { runId: run.id, emailId });

      const { rows } = await tx.query(
        "select stage, outcome, finished_at from core.email_runs where run_id = $1 and email_id = $2",
        [run.id, emailId],
      );
      expect(rows[0]).toMatchObject({ stage: "done", outcome: "OK" });
      expect(rows[0].finished_at).not.toBeNull();
    });
  });
});
