import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closePool, getPool } from "../../src/db";
import { MemorySource } from "../../src/ingest/__fakes__/memory.source";
import type { IngestDeps } from "../../src/ingest/ingest-email";
import { replayRun } from "../../src/ingest/replay";
import { emailRuns, runs } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { ClassifyJob } from "../../src/queues/names";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { uniqueEmailId } from "../db";

function inbox(size: number) {
  const ids = Array.from({ length: size }, uniqueEmailId).sort();
  const records = ids.map((email_id) => ({
    email_id,
    from: "ops@aprilasia.com",
    subject: "27 Jan - UPDATE SUMMARY MSC ANNA",
    body: "Hi Team, summary attached.",
    attachments: [],
  }));
  const classify = new RecordingAdder<ClassifyJob>();
  const deps: IngestDeps = {
    pool: getPool(),
    source: new MemorySource(records),
    store: new MemoryStore(),
    classify,
  };
  return { ids, deps, classify };
}

async function newRun(overrides: Partial<runs.NewRun> = {}): Promise<string> {
  const run = await runs.create(getPool(), { id: randomUUID(), source: "averis", ratePerSecond: 0, ...overrides });
  return run.id;
}

afterAll(closePool);

describe("replayRun", () => {
  it("ingests the whole inbox and completes the run", async () => {
    const { ids, deps, classify } = inbox(4);
    const runId = await newRun();
    const progress: number[] = [];

    const outcome = await replayRun(deps, runId, { onProgress: async (fraction) => void progress.push(fraction) });

    expect(outcome).toBe("completed");
    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual(ids);
    expect(classify.added.map((job) => job.data.emailId)).toEqual(ids);
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
    expect(await runs.get(deps.pool, runId)).toMatchObject({ status: "completed", totalEmails: 4 });
  });

  it("respects limit", async () => {
    const { ids, deps } = inbox(4);
    const runId = await newRun({ emailLimit: 2 });

    await replayRun(deps, runId);

    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual(ids.slice(0, 2));
    expect((await runs.get(deps.pool, runId))?.totalEmails).toBe(2);
  });

  it("respects emailIds", async () => {
    const { ids, deps } = inbox(4);
    const runId = await newRun({ emailIds: [ids[3], ids[1]] });

    await replayRun(deps, runId);

    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual([ids[1], ids[3]]);
  });

  it("stops when the run is paused and picks up where it left off on resume", async () => {
    const { ids, deps, classify } = inbox(4);
    const runId = await newRun();

    const paused = await replayRun(deps, runId, {
      onProgress: async (fraction) => {
        if (fraction === 0.5) await runs.setStatus(deps.pool, runId, "paused", ["running"]);
      },
    });
    expect(paused).toBe("paused");
    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual(ids.slice(0, 2));

    await runs.setStatus(deps.pool, runId, "running", ["paused"]);
    expect(await replayRun(deps, runId)).toBe("completed");
    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual(ids);
    expect(classify.added).toHaveLength(4);
  });

  it("does not start a run that was cancelled first", async () => {
    const { deps, classify } = inbox(2);
    const runId = await newRun();
    await runs.setStatus(deps.pool, runId, "cancelled", ["created"]);

    expect(await replayRun(deps, runId)).toBe("cancelled");
    expect(classify.added).toEqual([]);
  });

  it("returns interrupted when the worker is stopping, leaving the run running", async () => {
    const { deps } = inbox(3);
    const runId = await newRun();
    let ingested = 0;

    const outcome = await replayRun(deps, runId, {
      onProgress: async () => void ingested++,
      stopping: () => ingested >= 1,
    });

    expect(outcome).toBe("interrupted");
    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toHaveLength(1);
    expect(await runs.status(deps.pool, runId)).toBe("running");
  });

  it("re-enqueues an email whose row committed but whose job was lost", async () => {
    const { ids, deps, classify } = inbox(2);
    const runId = await newRun();
    await replayRun(deps, runId, { stopping: () => classify.added.length >= 1 });
    classify.added.length = 0;

    await replayRun(deps, runId);

    expect(classify.added.map((job) => job.data.emailId).sort()).toEqual(ids);
  });
});
