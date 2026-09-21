import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FakeLlmClient } from "../../src/agents/__fakes__/fake.llm-client";
import type { LlmClient, LlmRequest, LlmResponse } from "../../src/agents/llm-client";
import { closePool, getPool } from "../../src/db";
import { MemoryDocExtractClient } from "../../src/doc-extract/__fakes__/memory.client";
import { MemorySource } from "../../src/ingest/__fakes__/memory.source";
import { newRunId, resumeJobId } from "../../src/lib/ids";
import { emailRuns, runs } from "../../src/ontology/repositories";
import { MemoryPriorityCache } from "../../src/queues/__fakes__/memory.priority-cache";
import { closeQueues, getQueues } from "../../src/queues/queues";
import { closeRedis } from "../../src/queues/connection";
import { bullRunQueues } from "../../src/queues/run-queues";
import { startWorkers, type RunningWorkers } from "../../src/queues/workers";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { getRedis } from "../../src/queues/connection";
import { uniqueEmailId } from "../db";

/**
 * Pause and resume against the real queues, because the thing under test is
 * BullMQ's own behaviour and no fake can stand in for it: whether a job the
 * pause parked is still there afterwards, and whether a resume brings it back.
 *
 * The test env points REDIS_URL at database 1, so a development worker on 0
 * can neither take these jobs nor lose its own. Every other dependency is a
 * fake and nothing here reaches the proxy.
 */

/**
 * A model client that hangs until the call is abandoned, so a pause always
 * lands mid-call. `release` is how the test lets go at the end: a worker's
 * `close` waits for its running jobs, and a job waiting on a model that never
 * answers would hold the shutdown open until the hook timed out.
 */
class HangingLlmClient implements LlmClient {
  readonly started: string[] = [];
  private waiting: (() => void)[] = [];
  private holding: ((error: Error) => void)[] = [];
  private letGo = false;

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    this.started.push(request.model);
    this.wake();
    // Once the test has let go it stays let go: a job BullMQ retries would
    // otherwise hang again on its next attempt and hold the shutdown open.
    if (this.letGo) throw new Error("the test let go");
    await new Promise<void>((_resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      this.holding.push(reject);
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    throw new Error("unreachable: the call is only ever abandoned");
  }

  /** Resolves once at least one call is in the model's hands. */
  firstCall(): Promise<void> {
    if (this.started.length > 0) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Fails every call still waiting, and every later one, so nothing holds a worker open. */
  release(): void {
    this.letGo = true;
    const holding = this.holding;
    this.holding = [];
    for (const reject of holding) reject(new Error("the test let go"));
  }

  private wake(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve();
  }
}

function until(predicate: () => Promise<boolean>, what: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (await predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${what}`));
      setTimeout(() => void poll(), 25);
    };
    void poll();
  });
}

const EMAIL_ID = uniqueEmailId();
const source = new MemorySource([
  { email_id: EMAIL_ID, from: "docs@algurg.ae", subject: "TO CONFIRM DOCS", body: "Please compare.", attachments: [] },
]);

/**
 * One set of workers for the file, answering with whichever client the running
 * test set. Two sets would take each other's jobs off the same queues, and a
 * test whose job was answered by the previous test's model hangs for its whole
 * timeout without saying why.
 */
class SwitchableLlmClient implements LlmClient {
  answering: LlmClient = new FakeLlmClient("{}");
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    return this.answering.complete(request, signal);
  }
}

let workers: RunningWorkers | undefined;
const model = new SwitchableLlmClient();
let llm: HangingLlmClient;

/** A fresh run with its ingest job queued, exactly as POST /runs leaves one. */
async function startRun(): Promise<string> {
  const id = newRunId();
  await runs.create(getPool(), { id, source: "averis", ratePerSecond: 0, emailIds: [EMAIL_ID] });
  await bullRunQueues().startIngest(id, id, 0);
  return id;
}

beforeAll(() => {
  const { classify, compare } = getQueues();
  workers = startWorkers(
    {
      pool: getPool(),
      source,
      store: new MemoryStore(),
      priority: new MemoryPriorityCache(),
      classify,
      compare,
      llm: model,
      docExtract: new MemoryDocExtractClient(),
    },
    getRedis(),
  );
});

beforeEach(async () => {
  const { classify, compare, ingest } = getQueues();
  await Promise.all([classify.obliterate({ force: true }), compare.obliterate({ force: true }), ingest.obliterate({ force: true })]);
  llm = new HangingLlmClient();
  model.answering = llm;
});

afterEach(() => llm.release());

afterAll(async () => {
  llm.release();
  await workers?.stop();
  await closeQueues();
  await closeRedis();
  await closePool();
});

describe("pausing a run with work in flight", () => {
  it("abandons the call, parks the job, and runs it again on the resume", async () => {
    const pool = getPool();
    const runId = await startRun();

    // The email is ingested and the model is holding its classify call. The
    // run already reads `completed`, because that is the ingest's word: this
    // is the state the run page shows for most of a real replay, and the one
    // the controls have to reach.
    await llm.firstCall();
    await until(async () => (await runs.status(pool, runId)) === "completed", "ingest to finish");

    expect(await runs.setStatus(pool, runId, "paused", ["created", "running", "completed"])).toBe(true);

    // The call is abandoned and the job is parked: still there, not failed, not lost.
    await until(
      async () => (await getQueues().classify.getJobCounts("delayed")).delayed === 1,
      "the classify job to be parked in delayed",
    );
    const counts = await getQueues().classify.getJobCounts("failed", "active", "completed");
    expect(counts.failed).toBe(0);
    expect(counts.active).toBe(0);
    expect(counts.completed).toBe(0);

    // The email is where it stopped, so a resume has something to pick up.
    expect(await emailRuns.emailIdsForRun(pool, runId, "classifying")).toEqual([EMAIL_ID]);
    const calls = llm.started.length;

    // Resuming wakes it, and the model is asked again.
    const epoch = await runs.resume(pool, runId);
    expect(epoch).toBe(1);
    expect(await runs.status(pool, runId)).toBe("running");
    await bullRunQueues().startIngest(runId, resumeJobId(runId, epoch ?? 1), epoch ?? 1);
    await bullRunQueues().promoteDelayed(runId);

    await until(async () => llm.started.length > calls, "the classify job to run again after the resume");
  });

  it("finishes the email on the resume when the model answers, and completes the run", async () => {
    const pool = getPool();
    model.answering = new FakeLlmClient(
      JSON.stringify({ category: "SPAM", confidence: 0.99, rationale: "not a shipping document" }),
    );
    const runId = await startRun();

    // The email's own stage, not the run's status: `completed` is the ingest's
    // word and lands the moment the last email is enqueued, with the queue
    // still holding it.
    await until(
      async () => (await emailRuns.emailIdsForRun(pool, runId, "done")).length === 1,
      "the email to finish",
    );
    expect(await runs.status(pool, runId)).toBe("completed");
  });
});

describe("pausing a run whose queues are empty", () => {
  it("refuses a resume of a run nobody paused", async () => {
    const runId = await startRun();
    expect(await runs.resume(getPool(), runId)).toBeNull();
  });

  it("gives every resume its own epoch, so an older ingest job stands down", async () => {
    const pool = getPool();
    const id = randomUUID();
    await runs.create(pool, { id, source: "averis", ratePerSecond: 0, emailIds: [EMAIL_ID] });
    await runs.setStatus(pool, id, "paused", ["created"]);
    expect(await runs.resume(pool, id)).toBe(1);
    await runs.setStatus(pool, id, "paused", ["running"]);
    expect(await runs.resume(pool, id)).toBe(2);
  });
});
