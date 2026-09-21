import { createHash, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { closePool, getPool } from "../../src/db";
import { MemorySource } from "../../src/ingest/__fakes__/memory.source";
import { type IngestDeps, ingestEmail } from "../../src/ingest/ingest-email";
import { attachments, emailRuns, emails, runs } from "../../src/ontology/repositories";
import { MemoryPriorityCache } from "../../src/queues/__fakes__/memory.priority-cache";
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
  // vitalsolutions.sg at tier 1, so the test can see the tier reach the job.
  const priority = new MemoryPriorityCache({ "vitalsolutions.sg": 1 });
  const deps: IngestDeps = { pool: getPool(), source: new MemorySource([record], files), store, classify, priority };
  return { emailId, files, si, deps, store, classify, priority };
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

    // tier 1, and 138 MT in the subject: 1 * 200 - 13. The row and the job
    // carry the same number, which is what lets a rerun keep it.
    expect(classify.added).toEqual([
      {
        name: "classify-email",
        data: { runId, emailId },
        options: expect.objectContaining({ jobId: `${runId}__${emailId}`, priority: 187, attempts: 3 }),
      },
    ]);
    expect(await emailRuns.priorityOf(deps.pool, runId, emailId)).toBe(187);
  });

  it("queues an email from an unranked sender at the default tier rather than refusing it", async () => {
    const { emailId, deps, classify, priority } = fixture();
    priority.failWith = new Error("redis is reconnecting");
    const runId = await newRun();

    await ingestEmail(deps, runId, emailId);

    // 3 * 200 - 13: the sender's tier was unreadable, the tonnage still counts.
    expect(classify.added[0].options).toMatchObject({ priority: 587 });
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

describe("two attachments whose paths end in the same name", () => {
  /**
   * The shape this guards against: one row saying `BL.pdf` over the bytes of the
   * other `BL.pdf`. A forwarded chain attaching the same-named draft twice is the
   * ordinary way it happens, and before this the second upload overwrote the
   * first's object and then lost its own row to `on conflict do nothing`.
   */
  async function ingestTwoNamed(sameName: string) {
    const emailId = uniqueEmailId();
    const first = `2024/${sameName}`;
    const second = `2025/${sameName}`;
    const files = new Map([
      [first, Buffer.from("SHIPPING INSTRUCTION: the first one")],
      [second, Buffer.from("BILL OF LADING: the second one")],
    ]);
    const store = new MemoryStore();
    const deps: IngestDeps = {
      pool: getPool(),
      source: new MemorySource(
        [{ email_id: emailId, from: "a@b.c", subject: "s", body: "b", attachments: [first, second] }],
        files,
      ),
      store,
      classify: new RecordingAdder<ClassifyJob>(),
      priority: new MemoryPriorityCache({}),
    };
    const runId = await newRun();
    await ingestEmail(deps, runId, emailId);
    return { runId, emailId, store, rows: await attachments.listForEmail(getPool(), runId, emailId) };
  }

  it("keeps both, under names of their own", async () => {
    const { rows } = await ingestTwoNamed("BL.pdf");

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.filename)).size).toBe(2);
    expect(rows.map((row) => row.sourcePath).sort()).toEqual(["2024/BL.pdf", "2025/BL.pdf"]);
  });

  it("gives each its own object, holding its own bytes", async () => {
    const { store, rows } = await ingestTwoNamed("BL.pdf");

    expect(new Set(rows.map((row) => row.objectKey)).size).toBe(2);
    const held = await Promise.all(rows.map(async (row) => (await store.get(row.objectKey)).toString("utf8")));
    // Neither overwrote the other: the row that came from the 2024 path holds the
    // 2024 bytes, and nothing is a copy of its neighbour.
    const byPath = new Map(rows.map((row, index) => [row.sourcePath, held[index]]));
    expect(byPath.get("2024/BL.pdf")).toBe("SHIPPING INSTRUCTION: the first one");
    expect(byPath.get("2025/BL.pdf")).toBe("BILL OF LADING: the second one");
  });

  it("ingested again, changes nothing and adds nothing", async () => {
    const { runId, emailId, rows } = await ingestTwoNamed("BL.pdf");
    const again = await attachments.listForEmail(getPool(), runId, emailId);
    expect(again.map((row) => row.objectKey)).toEqual(rows.map((row) => row.objectKey));
  });
});
