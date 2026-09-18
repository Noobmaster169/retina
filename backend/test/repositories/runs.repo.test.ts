import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runs } from "../../src/ontology/repositories";
import { inRollback, seedRun } from "../db";

describe("runs repository", () => {
  it("creates a run in `created` and reads it back", async () => {
    await inRollback(async (tx) => {
      const id = randomUUID();
      const created = await runs.create(tx, {
        id,
        source: "averis",
        ratePerSecond: 2.5,
        emailLimit: 10,
        emailIds: ["email_001", "email_002"],
        createdBy: "team",
      });

      expect(created).toMatchObject({
        id,
        status: "created",
        ratePerSecond: 2.5,
        emailLimit: 10,
        emailIds: ["email_001", "email_002"],
        totalEmails: null,
        createdBy: "team",
        startedAt: null,
        finishedAt: null,
      });
      expect(await runs.get(tx, id)).toEqual(created);
    });
  });

  it("returns null for a run that does not exist", async () => {
    await inRollback(async (tx) => {
      expect(await runs.get(tx, randomUUID())).toBeNull();
      expect(await runs.status(tx, randomUUID())).toBeNull();
    });
  });

  it("lists newest first", async () => {
    await inRollback(async (tx) => {
      const first = await seedRun(tx);
      await tx.query("update core.runs set created_at = now() - interval '1 hour' where id = $1", [first.id]);
      const second = await seedRun(tx);

      const ids = (await runs.list(tx)).map((run) => run.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    });
  });

  it("markStarted moves a created run to running and records its size", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      expect(await runs.markStarted(tx, run.id, 520)).toBe("running");

      const started = await runs.get(tx, run.id);
      expect(started?.totalEmails).toBe(520);
      expect(started?.startedAt).not.toBeNull();
    });
  });

  it("markStarted does not un-pause a run that was paused before the controller started", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      await runs.setStatus(tx, run.id, "paused", ["created"]);
      expect(await runs.markStarted(tx, run.id, 520)).toBe("paused");
    });
  });

  it("setStatus only moves from an allowed status", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      expect(await runs.setStatus(tx, run.id, "running", ["paused"])).toBe(false);
      expect(await runs.status(tx, run.id)).toBe("created");

      expect(await runs.setStatus(tx, run.id, "cancelled", ["created", "running", "paused"])).toBe(true);
      const cancelled = await runs.get(tx, run.id);
      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.finishedAt).not.toBeNull();
    });
  });
});
