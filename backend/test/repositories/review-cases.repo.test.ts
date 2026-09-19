import { describe, expect, it } from "vitest";

import { emailRuns, reviewCases } from "../../src/ontology/repositories";
import { inRollback, seedEmail, seedRun } from "../db";

async function parked(tx: Parameters<typeof seedRun>[0]) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "comparing", priority: 600 });
  return { runId: run.id, emailRunId: (await emailRuns.idOf(tx, run.id, emailId)) as string };
}

describe("reviewCases", () => {
  it("opens one case per email run: a second open on the same run changes nothing", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await parked(tx);
      expect(await reviewCases.open(tx, { emailRunId, reason: "unreadable", stage: "compare", detail: { files: [] } })).toBe(true);
      expect(await reviewCases.open(tx, { emailRunId, reason: "wrong_doc_type", stage: "compare", detail: {} })).toBe(false);
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ reason: "unreadable", status: "open", detail: { files: [] } });
    });
  });

  it("counts open cases per run and per reason, every reason present", async () => {
    await inRollback(async (tx) => {
      const a = await parked(tx);
      const b = await parked(tx);
      await reviewCases.open(tx, { emailRunId: a.emailRunId, reason: "missing_attachment", stage: "compare", detail: {} });

      const counts = await reviewCases.openCountsForRuns(tx, [a.runId, b.runId]);
      expect(counts(a.runId)).toEqual({
        open: 1,
        byReason: { wrong_doc_type: 0, missing_attachment: 1, unreadable: 0, missing_value: 0 },
      });
      expect(counts(b.runId).open).toBe(0);
      expect(counts("00000000-0000-0000-0000-000000000000").open).toBe(0);
    });
  });

  it("refuses a reason the organisers did not define", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await parked(tx);
      await expect(
        tx.query("insert into core.review_cases (email_run_id, reason, stage) values ($1, 'job_failed', 'compare')", [emailRunId]),
      ).rejects.toThrow(/check constraint/);
    });
  });
});
