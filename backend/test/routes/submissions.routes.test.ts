import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import type { Category } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { classifications, emailRuns, emails, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { UpstreamError } from "../../src/lib/errors";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";
import { uniqueEmailId } from "../db";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };

let store: MemoryStore | null;
let scorer: FakeScorer;

function app() {
  return createApp({
    pool: getPool(),
    runQueues: new MemoryRunQueues(),
    store,
    scorer,
    health: async () => ({ status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up" } }),
  });
}

/** A committed run with one email per given category. `null` is an email still being classified. */
async function runWith(
  categories: (Category | null)[],
  ingestion: { totalEmails?: number; finished?: boolean } = {},
): Promise<{ runId: string; emailIds: string[] }> {
  const pool = getPool();
  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  await runs.markStarted(pool, run.id, ingestion.totalEmails ?? categories.length);
  if (ingestion.finished ?? true) await runs.setStatus(pool, run.id, "completed", ["running"]);
  const emailIds: string[] = [];
  for (const category of categories) {
    const emailId = uniqueEmailId();
    emailIds.push(emailId);
    await emails.upsert(pool, {
      emailId,
      from: "a@example.test",
      senderDomain: "example.test",
      subject: "s",
      body: "b",
      attachmentPaths: [],
      tonnageMt: null,
      raw: {},
    });
    await emailRuns.insert(pool, { runId: run.id, emailId, stage: "ingested", priority: 600 });
    if (!category) continue;
    await emailRuns.setStage(pool, run.id, emailId, "done", { outcome: "not_comparable", finished: true });
    await classifications.upsert(pool, {
      emailRunId: (await emailRuns.idOf(pool, run.id, emailId)) as string,
      genCategory: category,
      genConfidence: 0.9,
      finalCategory: category,
      decidedBy: "llm",
      rationale: {},
      model: "sonnet",
      promptVersion: "v1",
    });
  }
  return { runId: run.id, emailIds };
}

beforeEach(() => {
  store = new MemoryStore();
  scorer = new FakeScorer(0.4242);
});
afterAll(closePool);

describe("POST /runs/:id/submit", () => {
  it("stores the payload, sends it to the scorer, records the scoreboard and returns the score", async () => {
    const { runId, emailIds } = await runWith(["SPAM", "GENERAL"]);

    const response = await request(app()).post(`/runs/${runId}/submit`).set(TEAM);

    expect(response.status).toBe(201);
    expect(response.body.finalScore).toBe(0.4242);
    expect(response.body.scoreboard.n_emails).toBe(2);
    expect(Object.keys(scorer.received[0]).sort()).toEqual([...emailIds].sort());

    const [key] = [...(store as MemoryStore).objects.keys()];
    expect(key).toMatch(new RegExp(`^submissions/${runId}/.+\\.json$`));
    expect(JSON.parse((store as MemoryStore).objects.get(key)?.body.toString() ?? "")).toEqual(scorer.received[0]);

    const history = await request(app()).get(`/runs/${runId}/submissions`).set(TEAM);
    expect(history.body.submissions).toEqual([
      expect.objectContaining({ id: response.body.submissionId, finalScore: 0.4242, nEmails: 2, forced: false }),
    ]);

    const summary = await request(app()).get(`/runs/${runId}`).set(TEAM);
    expect(summary.body.lastSubmission).toMatchObject({ finalScore: 0.4242, nEmails: 2 });
  });

  it("refuses an unfinished run with 409 and the unfinished ids, and sends nothing", async () => {
    const { runId, emailIds } = await runWith(["SPAM", null]);

    const response = await request(app()).post(`/runs/${runId}/submit`).set(TEAM);

    expect(response.status).toBe(409);
    expect(response.body.incomplete).toEqual([emailIds[1]]);
    expect(response.body.forcible).toBe(true);
    expect(scorer.received).toEqual([]);
  });

  it("submits an unfinished run when forced, and says so", async () => {
    const { runId } = await runWith(["SPAM", null]);

    const response = await request(app()).post(`/runs/${runId}/submit?force=true`).set(TEAM);

    expect(response.status).toBe(201);
    const history = await request(app()).get(`/runs/${runId}/submissions`).set(TEAM);
    expect(history.body.submissions[0].forced).toBe(true);
  });

  it("relays the scorer's refusal as a 502, keeps the attempt on record unscored, and does not call it the run's score", async () => {
    const { runId } = await runWith(["SPAM"]);
    scorer.failWith = new UpstreamError(502, "the scorer answered 503: ground truth not mounted", { retryable: false });

    const response = await request(app()).post(`/runs/${runId}/submit`).set(TEAM);

    expect(response.status).toBe(502);
    expect(response.body.error).toContain("ground truth not mounted");
    const { submissions } = (await request(app()).get(`/runs/${runId}/submissions`).set(TEAM)).body;
    expect(submissions).toEqual([expect.objectContaining({ finalScore: null, scoreboard: null, nEmails: 1 })]);
    expect((await request(app()).get(`/runs/${runId}`).set(TEAM)).body.lastSubmission).toBeNull();
  });

  it("refuses a run that has not finished ingesting, whose missing emails the scorer would count as GENERAL", async () => {
    const paused = await runWith(["SPAM", "GENERAL"], { totalEmails: 520, finished: false });
    const refused = await request(app()).post(`/runs/${paused.runId}/submit`).set(TEAM);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain("has not finished ingesting");
    expect(refused.body.error).toContain("2 of 520");
    expect(refused.body.forcible).toBe(true);
    expect(scorer.received).toEqual([]);

    expect((await request(app()).post(`/runs/${paused.runId}/submit?force=true`).set(TEAM)).status).toBe(201);
  });

  it("scores a run once when two submits arrive together", async () => {
    const { runId } = await runWith(["SPAM"]);
    scorer.delayMs = 150;
    const server = app();

    const both = await Promise.all([
      request(server).post(`/runs/${runId}/submit`).set(TEAM),
      request(server).post(`/runs/${runId}/submit`).set(TEAM),
    ]);

    expect(both.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(scorer.received).toHaveLength(1);
    // Forcing would not help: the refusal is the other submission, not the run's state.
    const busy = both.find((response) => response.status === 409);
    expect(busy?.body).toMatchObject({ forcible: false, incomplete: [] });
  });

  it("answers 503 where object storage is not configured", async () => {
    const { runId } = await runWith(["SPAM"]);
    store = null;
    expect((await request(app()).post(`/runs/${runId}/submit`).set(TEAM)).status).toBe(503);
  });

  it("answers 404 for an unknown run, 400 for a bad id or a bad force, 401 without a key", async () => {
    const { runId } = await runWith(["SPAM"]);
    expect((await request(app()).post(`/runs/${randomUUID()}/submit`).set(TEAM)).status).toBe(404);
    expect((await request(app()).post("/runs/nope/submit").set(TEAM)).status).toBe(400);
    expect((await request(app()).post(`/runs/${runId}/submit?force=maybe`).set(TEAM)).status).toBe(400);
    expect((await request(app()).post(`/runs/${runId}/submit`)).status).toBe(401);
  });
});

describe("GET /runs/:id/submission.json", () => {
  it("is the payload as it would be sent now", async () => {
    const { runId, emailIds } = await runWith(["INVOICE_QUERY"]);
    const response = await request(app()).get(`/runs/${runId}/submission.json`).set(TEAM);
    expect(response.body).toEqual({
      [emailIds[0]]: { category: "INVOICE_QUERY", status: "OK", review_reason: null, has_defect: false, defect_fields: [], decided_by: "llm" },
    });
  });
});

describe("run summaries", () => {
  it("report LLM usage and no submission for a fresh run", async () => {
    const { runId } = await runWith(["SPAM"]);
    const summary = await request(app()).get(`/runs/${runId}`).set(TEAM);
    expect(summary.body.llm).toEqual({ calls: 0, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(summary.body.lastSubmission).toBeNull();
  });
});

describe("GET /eval/runs/:id", () => {
  it("does not exist where the answer key is not configured", async () => {
    const { runId } = await runWith(["SPAM"]);
    expect((await request(app()).get(`/eval/runs/${runId}`).set(TEAM)).status).toBe(404);
  });
});
