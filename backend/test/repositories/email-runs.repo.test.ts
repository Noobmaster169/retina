import { describe, expect, it } from "vitest";

import { attachments, emailRuns, emails } from "../../src/ontology/repositories";
import { inRollback, seedEmail, seedRun } from "../db";

describe("emails repository", () => {
  it("stores an email once: a second upsert changes nothing", async () => {
    await inRollback(async (tx) => {
      const emailId = await seedEmail(tx);
      await emails.upsert(tx, {
        emailId,
        from: "someone@else.com",
        senderDomain: "else.com",
        subject: "changed",
        body: "changed",
        attachmentPaths: [],
        tonnageMt: null,
        raw: {},
      });

      const stored = await emails.get(tx, emailId);
      expect(stored).toMatchObject({ senderDomain: "vitalsolutions.sg", tonnageMt: 138 });
      expect(stored?.attachmentPaths).toHaveLength(2);
    });
  });

  it("lists a run's emails with stage, attachment count and filters", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const first = await seedEmail(tx);
      const second = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId: first, stage: "ingested", priority: 600 });
      await emailRuns.insert(tx, { runId: run.id, emailId: second, stage: "ingested", priority: 600 });
      await emailRuns.setStage(tx, run.id, second, "done", { outcome: "OK", finished: true });

      const all = await emails.listForRun(tx, run.id, {}, { page: 1, pageSize: 50 });
      expect(all.total).toBe(2);
      expect(all.emails[0]).toMatchObject({ attachmentCount: 2, from: "docs@vitalsolutions.sg" });

      const done = await emails.listForRun(tx, run.id, { stage: "done" }, { page: 1, pageSize: 50 });
      expect(done.emails).toEqual([expect.objectContaining({ emailId: second, stage: "done", outcome: "OK" })]);

      const none = await emails.listForRun(tx, run.id, { q: "100%_no_match" }, { page: 1, pageSize: 50 });
      expect(none.total).toBe(0);

      const paged = await emails.listForRun(tx, run.id, {}, { page: 2, pageSize: 1 });
      expect(paged.total).toBe(2);
      expect(paged.emails).toHaveLength(1);
    });
  });
});

describe("email-runs repository", () => {
  it("allows one row per run and email", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);

      expect(await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 })).toBe(true);
      expect(await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 })).toBe(false);
      expect(await emailRuns.exists(tx, run.id, emailId)).toBe(true);
      expect(await emailRuns.emailIdsForRun(tx, run.id)).toEqual([emailId]);
    });
  });

  it("groups stage counts and zero-fills the stages nothing is in", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const other = await seedRun(tx);
      const ids = [await seedEmail(tx), await seedEmail(tx), await seedEmail(tx)];
      for (const emailId of ids) {
        await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
      }
      await emailRuns.setStage(tx, run.id, ids[0], "done", { outcome: "OK", finished: true });
      await emailRuns.setStage(tx, run.id, ids[1], "failed", { error: "boom", finished: true });

      expect(await emailRuns.stageCounts(tx, run.id)).toEqual({
        ingested: 1,
        classifying: 0,
        classified: 0,
        comparing: 0,
        review: 0,
        done: 1,
        failed: 1,
      });
      expect((await emailRuns.stageCounts(tx, other.id)).done).toBe(0);
      expect(await emailRuns.emailIdsForRun(tx, run.id, "ingested")).toEqual([ids[2]]);
    });
  });

  it("counts attempts", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);
      await emailRuns.insert(tx, { runId: run.id, emailId, stage: "ingested", priority: 600 });
      await emailRuns.incrementAttempt(tx, run.id, emailId);
      await emailRuns.incrementAttempt(tx, run.id, emailId);

      const { rows } = await tx.query("select attempt from core.email_runs where run_id = $1", [run.id]);
      expect(rows[0].attempt).toBe(2);
    });
  });
});

describe("attachments repository", () => {
  it("inserts once per filename and reads back in filename order", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const emailId = await seedEmail(tx);
      const base = { runId: run.id, emailId, contentType: "text/plain", bytes: 3, sha256: "abc" };
      const si = { ...base, filename: "x_SI.txt", sourcePath: "attachments/x_SI.txt", role: "SI" as const, objectKey: "k/si" };
      const bl = { ...base, filename: "x_BL.txt", sourcePath: "attachments/x_BL.txt", role: "BL" as const, objectKey: "k/bl" };

      await attachments.insert(tx, si);
      await attachments.insert(tx, bl);
      await attachments.insert(tx, si);

      const stored = await attachments.listForEmail(tx, run.id, emailId);
      expect(stored.map((a) => a.filename)).toEqual(["x_BL.txt", "x_SI.txt"]);
      expect(stored[0]).toMatchObject({ role: "BL", origin: "source", objectKey: "k/bl", bytes: 3 });
    });
  });
});
