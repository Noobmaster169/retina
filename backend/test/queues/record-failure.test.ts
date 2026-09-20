import { UnrecoverableError } from "bullmq";
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { emailRuns, reviewCases } from "../../src/ontology/repositories";
import { type FailedJob, recordJobFailure } from "../../src/queues/record-failure";
import { inRollback, seedEmail, seedRun } from "../db";

/**
 * A failure is not one of the organisers' review reasons. It is the email
 * having stopped, so it becomes a case a person can retry and the email is
 * reported as incomplete rather than escalated.
 */

const job = (attemptsMade: number, attempts = 3): FailedJob => ({ attemptsMade, opts: { attempts }, id: "run__email_1" });

async function classifying(tx: PoolClient) {
  const run = await seedRun(tx);
  const emailId = await seedEmail(tx);
  await emailRuns.insert(tx, { runId: run.id, emailId, stage: "classifying", priority: 600 });
  return { runId: run.id, emailId, emailRunId: (await emailRuns.idOf(tx, run.id, emailId)) as string };
}

async function stateOf(tx: PoolClient, emailRunId: string) {
  const { rows } = await tx.query("select stage, attempt, error, finished_at from core.email_runs where id = $1", [emailRunId]);
  return rows[0];
}

describe("recordJobFailure", () => {
  it("counts an attempt and opens no case while the job has another one coming", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classifying(tx);
      await recordJobFailure(tx, job(1), { runId, emailId }, "classify", new Error("proxy timed out"));

      expect(await stateOf(tx, emailRunId)).toMatchObject({ stage: "classifying", attempt: 1, error: null });
      expect(await reviewCases.openIdFor(tx, emailRunId)).toBeNull();
    });
  });

  it("fails the email and opens a case with no review reason on the last attempt", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classifying(tx);
      const error = new Error("doc-extract answered 500");
      await recordJobFailure(tx, job(3), { runId, emailId }, "compare", error);

      expect(await stateOf(tx, emailRunId)).toMatchObject({ stage: "failed", error: "doc-extract answered 500" });
      expect((await stateOf(tx, emailRunId)).finished_at).not.toBeNull();
      const opened = await reviewCases.view(tx, (await reviewCases.openIdFor(tx, emailRunId)) as string);
      expect(opened).toMatchObject({ kind: "failure", reason: null, stage: "compare", status: "open" });
      expect(opened?.detail).toMatchObject({ message: "doc-extract answered 500", attempts: 3, jobId: "run__email_1" });
      expect((opened?.detail.stack as string[]).length).toBeLessThanOrEqual(5);
    });
  });

  it("opens the case after one attempt when the error will fail the same way again", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classifying(tx);
      await recordJobFailure(tx, job(1), { runId, emailId }, "classify", new UnrecoverableError("the model answered outside the schema twice"));

      expect(await stateOf(tx, emailRunId)).toMatchObject({ stage: "failed" });
      expect(await reviewCases.latestFor(tx, emailRunId)).toMatchObject({ kind: "failure", reason: null, stage: "classify" });
    });
  });

  it("takes over the case an escalation had open, because an email is only ever in one place", async () => {
    await inRollback(async (tx) => {
      const { runId, emailId, emailRunId } = await classifying(tx);
      const escalation = await reviewCases.raise(tx, { emailRunId, reason: "unreadable", stage: "compare", detail: {} });

      await recordJobFailure(tx, job(3), { runId, emailId }, "compare", new Error("minio is unreachable"));

      const { rows } = await tx.query<{ n: string }>("select count(*) as n from core.review_cases where email_run_id = $1", [emailRunId]);
      expect(Number(rows[0].n)).toBe(1);
      expect(await reviewCases.view(tx, escalation.id)).toMatchObject({ kind: "failure", reason: null, status: "open" });
    });
  });
});
