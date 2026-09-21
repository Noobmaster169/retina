import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closePool, getPool } from "../../src/db";
import { MemorySource } from "../../src/ingest/__fakes__/memory.source";
import { MemoryGateMeter } from "../../src/ingest/gate/__fakes__/memory.meter";
import { type IngestDeps, ingestEmail } from "../../src/ingest/ingest-email";
import type { EmailRecord } from "../../src/ingest/source";
import { attachments, emailRuns, emails, gateDecisions, gateSenders, llmCalls, runs } from "../../src/ontology/repositories";
import { MemoryPriorityCache } from "../../src/queues/__fakes__/memory.priority-cache";
import { RecordingAdder } from "../../src/queues/__fakes__/recording.adder";
import type { ClassifyJob } from "../../src/queues/names";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { uniqueEmailId } from "../db";

/**
 * The gate in front of ingest. These commit, like the ingest tests beside
 * them, and collide with nothing: every id is fresh and every sender domain is
 * unique to its test.
 */

afterAll(closePool);

const SI = "Shipper: APRIL FINE PAPER TRADING\n";
const BL = "SHIPPER: APRIL FINE PAPER TRADING\n";

interface Fixture {
  deps: IngestDeps;
  meter: MemoryGateMeter;
  store: MemoryStore;
  classify: RecordingAdder<ClassifyJob>;
  domain: string;
  send: (overrides?: Partial<EmailRecord>) => Promise<{ emailId: string; admitted: boolean }>;
  runId: string;
}

async function fixture(mode: "observe" | "enforce" | "off" = "enforce"): Promise<Fixture> {
  // A domain of its own per test, so one test's buckets and history can never
  // be another's. The gate keys on the sender and nothing else.
  const domain = `t-${randomUUID().slice(0, 8)}.example`;
  const store = new MemoryStore();
  const classify = new RecordingAdder<ClassifyJob>();
  const meter = new MemoryGateMeter();
  const source = new MemorySource([], new Map());
  const pool = getPool();

  const deps: IngestDeps = {
    pool,
    source,
    store,
    classify,
    priority: new MemoryPriorityCache({}),
    gate: { redis: null, meter, mode },
  };

  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });

  async function send(overrides: Partial<EmailRecord> = {}) {
    const emailId = uniqueEmailId();
    const si = `attachments/${emailId}_SI.txt`;
    const bl = `attachments/${emailId}_BL.txt`;
    const record: EmailRecord = {
      email_id: emailId,
      from: `docs@${domain}`,
      subject: "REQUEST BL DRAFT _ PO 26067",
      body: "Please compare the SI and the draft BL.",
      attachments: [si, bl],
      attachment_bytes: [SI.length, BL.length],
      ...overrides,
    };
    source.put(record, new Map([[si, Buffer.from(SI)], [bl, Buffer.from(BL)]]));
    const admitted = await ingestEmail(deps, run.id, record.email_id);
    return { emailId: record.email_id, admitted };
  }

  return { deps, meter, store, classify, domain, send, runId: run.id };
}

describe("the gate in front of ingest", () => {
  it("admits the first email from a stranger: one ordinary email fits an unknown sender's burst", async () => {
    const { send, classify } = await fixture();
    const { admitted } = await send();
    expect(admitted).toBe(true);
    expect(classify.added).toHaveLength(1);
  });

  it("holds the second, because a stranger gets one look and not two", async () => {
    const { send } = await fixture();
    await send();
    const second = await send();
    expect(second.admitted).toBe(false);
  });

  describe("a held email", () => {
    it("costs no model call at all, which is the whole reason the gate exists", async () => {
      const { send, deps, runId } = await fixture();
      await send();
      const before = await llmCalls.usageForRuns(deps.pool, [runId]);
      const held = await send();

      expect(held.admitted).toBe(false);
      const after = await llmCalls.usageForRuns(deps.pool, [runId]);
      expect(after(runId).calls).toBe(before(runId).calls);
      expect(after(runId).calls).toBe(0);
    });

    it("writes nothing to object storage: the attachments are never even fetched", async () => {
      const { send, store } = await fixture();
      await send();
      const wrote = store.objects.size;
      await send();
      expect(store.objects.size).toBe(wrote);
    });

    it("adds no job, so no worker ever picks it up", async () => {
      const { send, classify } = await fixture();
      await send();
      await send();
      expect(classify.added).toHaveLength(1);
    });

    it("has no email_runs row, so no stage count claims it is in the pipeline", async () => {
      const { send, deps, runId } = await fixture();
      await send();
      await send();
      const counts = await emailRuns.stageCounts(deps.pool, runId);
      expect(counts.ingested).toBe(1);
      expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(1);
    });

    it("stores the email itself, because that is what the holding pen shows a person", async () => {
      const { send, deps, runId } = await fixture();
      await send();
      const held = await send();
      expect(await emails.get(deps.pool, held.emailId)).toMatchObject({ emailId: held.emailId });
      expect(await attachments.listForEmail(deps.pool, runId, held.emailId)).toEqual([]);
    });

    it("is counted against the run, so the run can still read as finished", async () => {
      const { send, deps, runId } = await fixture();
      await send();
      await send();
      const heldByRun = await gateDecisions.heldByRun(deps.pool, [runId]);
      expect(heldByRun(runId)).toBe(1);
    });
  });

  describe("the decision it wrote down", () => {
    it("says which bucket refused and what the email would have cost", async () => {
      const { send, deps } = await fixture();
      await send();
      await send();
      const [newest] = await gateDecisions.recent(deps.pool, 1);
      expect(newest).toMatchObject({ decision: "hold", enforced: true, standing: "new", units: 16 });
      expect(newest.breakdown).toMatchObject({ email: 3, attachments: 6, comparison: 7 });
      expect(newest.buckets.map((bucket) => bucket.scope)).toEqual(["address", "domain", "global"]);
    });

    it("records the admitted ones too, so the page shows traffic and not only refusals", async () => {
      const { send, deps } = await fixture();
      const { emailId } = await send();
      const decisions = await gateDecisions.recent(deps.pool, 5);
      expect(decisions.some((one) => one.emailId === emailId && one.decision === "admit")).toBe(true);
    });
  });

  describe("observe", () => {
    it("reaches the hold and lets the email through anyway", async () => {
      const { send } = await fixture("observe");
      await send();
      const second = await send();
      expect(second.admitted).toBe(true);
    });

    it("still writes the verdict down, marked as one that did not bite", async () => {
      const { send, deps } = await fixture("observe");
      await send();
      await send();
      const [newest] = await gateDecisions.recent(deps.pool, 1);
      expect(newest).toMatchObject({ decision: "hold", enforced: false });
    });

    it("charges the buckets all the same, so its numbers are the ones enforce would have seen", async () => {
      const observed = await fixture("observe");
      await observed.send();
      await observed.send();
      const [newest] = await gateDecisions.recent(observed.deps.pool, 1);
      // The second email met a bucket the first had already emptied.
      expect(newest.buckets[0].burstRemaining).toBeLessThan(16);
    });
  });

  describe("what a person decided", () => {
    it("holds a blacklisted domain's first email even while the mode is observe", async () => {
      const { send, deps, domain } = await fixture("observe");
      await gateSenders.setPolicy(deps.pool, domain, "domain", "block", "a test", null);
      const { admitted } = await send();
      expect(admitted).toBe(false);
    });

    it("admits again the moment the blacklist is lifted", async () => {
      const { send, deps, domain } = await fixture("observe");
      await gateSenders.setPolicy(deps.pool, domain, "domain", "block", "a test", null);
      expect((await send()).admitted).toBe(false);
      await gateSenders.setPolicy(deps.pool, domain, "domain", "auto", "a test", null);
      expect((await send()).admitted).toBe(true);
    });

    it("carries a whitelisted sender well past what its record would allow", async () => {
      const { send, deps, domain } = await fixture();
      await gateSenders.setPolicy(deps.pool, domain, "domain", "allow", "a test", null);
      for (let i = 0; i < 5; i += 1) expect((await send()).admitted).toBe(true);
    });

    it("a decision about one address beats the one about its domain", async () => {
      const { send, deps, domain } = await fixture("observe");
      await gateSenders.setPolicy(deps.pool, domain, "domain", "block", "a test", null);
      await gateSenders.setPolicy(deps.pool, `docs@${domain}`, "address", "allow", "a test", null);
      expect((await send()).admitted).toBe(true);
    });
  });

  it("prices an enormous body above an ordinary one, which a count of emails could not", async () => {
    const { send, deps } = await fixture("observe");
    await send({ body: "a".repeat(3_000_000) });
    const [newest] = await gateDecisions.recent(deps.pool, 1);
    expect(newest.breakdown.oversize).toBeGreaterThan(20);
    expect(newest.units).toBeGreaterThan(16);
  });

  it("holds a stranger when the meter cannot be reached, and says so", async () => {
    const { send, meter, deps } = await fixture();
    meter.fail = true;
    const { admitted } = await send();
    expect(admitted).toBe(false);
    const [newest] = await gateDecisions.recent(deps.pool, 1);
    expect(newest.reason).toBe("meter_unavailable");
  });

  it("is not in the way at all when the mode is off", async () => {
    const { send } = await fixture("off");
    for (let i = 0; i < 4; i += 1) expect((await send()).admitted).toBe(true);
  });

  it("does not run when no gate is configured, and ingest behaves exactly as it did before", async () => {
    const { deps, send } = await fixture();
    delete deps.gate;
    for (let i = 0; i < 4; i += 1) expect((await send()).admitted).toBe(true);
  });

  describe("releasing one", () => {
    it("carries it into the pipeline, attachments and all", async () => {
      const { send, deps, runId, store, classify } = await fixture();
      await send();
      const held = await send();

      const admitted = await ingestEmail(deps, runId, held.emailId, true);

      expect(admitted).toBe(true);
      expect(classify.added.map((job) => job.data.emailId)).toContain(held.emailId);
      expect(await attachments.listForEmail(deps.pool, runId, held.emailId)).toHaveLength(2);
      expect(store.objects.size).toBeGreaterThan(2);
    });

    it("does not ask the gate a second time about a verdict a person has overruled", async () => {
      const { send, deps, runId } = await fixture();
      await send();
      const held = await send();
      const before = (await gateDecisions.recent(deps.pool, 50)).length;

      await ingestEmail(deps, runId, held.emailId, true);

      expect((await gateDecisions.recent(deps.pool, 50)).length).toBe(before);
    });
  });
});

beforeEach(() => {
  // Nothing to reset: every fixture has its own domain, its own run and its
  // own in-memory meter. This is here to say that on purpose.
});
