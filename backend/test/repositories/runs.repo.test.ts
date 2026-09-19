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
      // Dated ahead of everything else, so neither can fall past the list's limit
      // however many runs the committing tests have left in this database.
      const older = await seedRun(tx);
      const newer = await seedRun(tx);
      await tx.query("update core.runs set created_at = now() + interval '1 hour' where id = $1", [older.id]);
      await tx.query("update core.runs set created_at = now() + interval '2 hours' where id = $1", [newer.id]);

      const ids = (await runs.list(tx)).map((run) => run.id);
      expect(ids.slice(0, 2)).toEqual([newer.id, older.id]);
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

  it("still reads a run whose prompt set names a step this code does not know, as after a rollback", async () => {
    await inRollback(async (tx) => {
      const run = await seedRun(tx);
      const later = { classify: { version: "v3", model: "sonnet" }, "review-summary": { version: "v1", model: "sonnet" } };
      await tx.query("update core.runs set prompt_set = $2 where id = $1", [run.id, JSON.stringify(later)]);

      expect((await runs.get(tx, run.id))?.promptSet).toEqual({ classify: { version: "v3", model: "sonnet" } });
      expect((await runs.list(tx)).some((listed) => listed.id === run.id)).toBe(true);
    });
  });
});
