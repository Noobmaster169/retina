import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closePool, getPool } from "../../src/db";
import { MemorySource } from "../../src/ingest/__fakes__/memory.source";
import { type IngestDeps, ingestEmail } from "../../src/ingest/ingest-email";
import { attachments, emailRuns, emails, runs } from "../../src/ontology/repositories";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { ClassifyJob } from "../../src/queues/names";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { uniqueEmailId } from "../db";

// ingestEmail opens its own transaction, so these tests commit. They never
// collide: every run id and email id is fresh.
function fixture() {
  const emailId = uniqueEmailId();
  const si = `attachments/${emailId}_SI.txt`;
  const bl = `attachments/${emailId}_BL.txt`;
  const files = new Map([
    [si, Buffer.from("Shipper: APRIL FINE PAPER TRADING\nTotal Containers: 6 x 40'HC\n")],
    [bl, Buffer.from("SHIPPER: APRIL FINE PAPER TRADING\nContainer Count: 7 x 40'HC\n")],
  ]);
  const record = {
    email_id: emailId,
    from: "docs@vitalsolutions.sg",
    subject: "REQUEST BL DRAFT _ PO 26067_ COATED IVORY BOARD__138MT",
    body: "Hi Mitchelle, please compare the SI and draft BL.",
    attachments: [si, bl],
  };
  const store = new MemoryStore();
  const classify = new RecordingAdder<ClassifyJob>();
  const deps: IngestDeps = { pool: getPool(), source: new MemorySource([record], files), store, classify };
  return { emailId, files, si, deps, store, classify };
}

async function newRun(): Promise<string> {
  const run = await runs.create(getPool(), { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  return run.id;
}

afterAll(closePool);

describe("ingestEmail", () => {
  it("writes the email, its run row and its attachments, then enqueues classify", async () => {
    const { emailId, files, si, deps, store, classify } = fixture();
    const runId = await newRun();

    await ingestEmail(deps, runId, emailId);

    expect(await emails.get(deps.pool, emailId)).toMatchObject({ senderDomain: "vitalsolutions.sg", tonnageMt: 138 });
    expect(await emailRuns.stageCounts(deps.pool, runId)).toMatchObject({ ingested: 1 });

    const stored = await attachments.listForEmail(deps.pool, runId, emailId);
    expect(stored.map((a) => [a.filename, a.role])).toEqual([
      [`${emailId}_BL.txt`, "BL"],
      [`${emailId}_SI.txt`, "SI"],
    ]);
    const storedSi = stored[1];
    const original = files.get(si) as Buffer;
    expect(storedSi.objectKey).toBe(`runs/${runId}/emails/${emailId}/attachments/${emailId}_SI.txt`);
    expect(storedSi.sha256).toBe(createHash("sha256").update(original).digest("hex"));
    expect(storedSi.bytes).toBe(original.length);
    expect(await store.get(storedSi.objectKey)).toEqual(original);

    expect(classify.added).toEqual([
      {
        name: "classify-email",
        data: { runId, emailId },
        options: expect.objectContaining({ jobId: `${runId}__${emailId}`, priority: 600, attempts: 3 }),
      },
    ]);
  });

  it("is idempotent: a second call adds no rows, no objects and no job", async () => {
    const { emailId, deps, store, classify } = fixture();
    const runId = await newRun();

    await ingestEmail(deps, runId, emailId);
    await ingestEmail(deps, runId, emailId);

    expect(await emailRuns.emailIdsForRun(deps.pool, runId)).toEqual([emailId]);
    expect(await attachments.listForEmail(deps.pool, runId, emailId)).toHaveLength(2);
    expect(store.objects.size).toBe(2);
    expect(classify.added).toHaveLength(1);
  });

  it("keeps two runs of the same email apart", async () => {
    const { emailId, deps, store } = fixture();
    const first = await newRun();
    const second = await newRun();

    await ingestEmail(deps, first, emailId);
    await ingestEmail(deps, second, emailId);

    expect(await attachments.listForEmail(deps.pool, second, emailId)).toHaveLength(2);
    expect(store.objects.size).toBe(4);
  });

  it("writes nothing when an attachment cannot be read", async () => {
    const { emailId, files, si, deps, classify } = fixture();
    const runId = await newRun();
    files.delete(si);

    await expect(ingestEmail(deps, runId, emailId)).rejects.toThrow(/no such attachment/);

    expect(await emailRuns.exists(deps.pool, runId, emailId)).toBe(false);
    expect(await attachments.listForEmail(deps.pool, runId, emailId)).toEqual([]);
    expect(classify.added).toEqual([]);
  });
});
