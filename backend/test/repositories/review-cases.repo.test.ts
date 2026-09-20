import { describe, expect, it } from "vitest";

import { emailRuns, reviewCases } from "../../src/ontology/repositories";
import { inRollback, seedEmail, seedRun } from "../db";

async function parked(tx: Parameters<typeof seedRun>[0]) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "comparing", priority: 600 });
  return { runId: run.id, emailId, emailRunId: (await emailRuns.idOf(tx, run.id, emailId)) as string };
}

describe("reviewCases", () => {
  it("raises one case per email run: a second escalation changes the standing one in place", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await parked(tx);
      const first = await reviewCases.raise(tx, { emailRunId, reason: "unreadable", stage: "compare", detail: { files: [] } });
      expect(first.opened).toBe(true);

      const second = await reviewCases.raise(tx, { emailRunId, reason: "wrong_doc_type", stage: "compare", detail: { note: "an invoice" } });
      expect(second.opened).toBe(false);
      expect(second.id).toBe(first.id);
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({
        id: first.id,
        kind: "review",
        reason: "wrong_doc_type",
        status: "open",
        detail: { note: "an invoice" },
        actions: [],
      });
    });
  });

  it("a job that failed becomes the open case, and carries no review reason", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await parked(tx);
      await reviewCases.raise(tx, { emailRunId, reason: "unreadable", stage: "compare", detail: {} });
      const failure = await reviewCases.openFailure(tx, { emailRunId, stage: "compare", detail: { message: "doc-extract is down" } });

      expect(failure.opened).toBe(false);
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ kind: "failure", reason: null, status: "open" });
    });
  });

  it("resolves the open case and puts it back, one open case at a time throughout", async () => {
    await inRollback(async (tx) => {
      const { emailRunId } = await parked(tx);
      const { id } = await reviewCases.raise(tx, { emailRunId, reason: "missing_value", stage: "compare", detail: {} });

      expect(await reviewCases.resolve(tx, emailRunId, "kai")).toBe(id);
      expect(await reviewCases.openIdFor(tx, emailRunId)).toBeNull();
      expect(await reviewCases.view(tx, id)).toMatchObject({ status: "resolved", resolvedBy: "kai" });

      expect(await reviewCases.reopen(tx, id)).toBe(true);
      expect(await reviewCases.openIdFor(tx, emailRunId)).toBe(id);
      expect(await reviewCases.reopen(tx, id)).toBe(false);
    });
  });

  it("identifies a case by the email run it hangs off", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await parked(tx);
      const { id } = await reviewCases.raise(tx, { emailRunId, reason: "unreadable", stage: "compare", detail: {} });

      expect(await reviewCases.identify(tx, id)).toEqual({
        id,
        emailRunId,
        runId,
        emailId,
        kind: "review",
        reason: "unreadable",
        stage: "compare",
        status: "open",
      });
      expect(await reviewCases.identify(tx, "0")).toBeNull();
    });
  });

  it("counts open cases per run and per reason, every reason present", async () => {
    await inRollback(async (tx) => {
      const a = await parked(tx);
      const b = await parked(tx);
      await reviewCases.raise(tx, { emailRunId: a.emailRunId, reason: "missing_attachment", stage: "compare", detail: {} });

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
