import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import type { HealthReport } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { RetryableError } from "../../src/lib/errors";
import { emailRuns, emails, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";
import { uniqueEmailId } from "../db";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const ALL_UP: HealthReport = { status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up" } };

let runQueues: MemoryRunQueues;
let health: HealthReport;

function app() {
  return createApp({ pool: getPool(), runQueues, store: new MemoryStore(), scorer: new FakeScorer(), health: async () => health });
}

beforeEach(() => {
  runQueues = new MemoryRunQueues();
  health = ALL_UP;
});
afterAll(closePool);

describe("auth", () => {
  it("refuses /runs without a bearer key and with a wrong one", async () => {
    expect((await request(app()).get("/runs")).status).toBe(401);
    expect((await request(app()).get("/runs").set("authorization", "Bearer nope")).status).toBe(401);
  });

  it("accepts either key", async () => {
    const frontend = { authorization: `Bearer ${TEST_ENV.API_SHARED_SECRET}` };
    expect((await request(app()).get("/runs").set(frontend)).status).toBe(200);
    expect((await request(app()).get("/runs").set(TEAM)).status).toBe(200);
  });
});

describe("GET /health", () => {
  it("needs no key and reports every check", async () => {
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(ALL_UP);
  });

  it("stays 200 when degraded, so a MinIO outage does not roll a deploy back", async () => {
    health = { status: "degraded", checks: { ...ALL_UP.checks, minio: "down" } };
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("degraded");
  });

  it("is 503 when the database is down", async () => {
    health = { status: "degraded", checks: { ...ALL_UP.checks, postgres: "down" } };
    expect((await request(app()).get("/health")).status).toBe(503);
  });
});

describe("POST /runs", () => {
  it("creates a run, starts its ingest job and returns the summary", async () => {
    const response = await request(app()).post("/runs").set(TEAM).send({ ratePerSecond: 5, limit: 10 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "created",
      ratePerSecond: 5,
      totalEmails: null,
      stageCounts: { ingested: 0, classifying: 0, classified: 0, comparing: 0, review: 0, done: 0, failed: 0 },
      queues: { classify: { waiting: 0, active: 0, failed: 0 }, compare: { waiting: 0, active: 0, failed: 0 } },
    });
    expect(runQueues.started).toEqual([{ runId: response.body.id, jobId: response.body.id, epoch: 0 }]);
    expect(await runs.get(getPool(), response.body.id)).toMatchObject({ emailLimit: 10, createdBy: "team" });
  });

  it("defaults to the averis source at 2 emails per second", async () => {
    const response = await request(app()).post("/runs").set(TEAM).send({});
    expect(response.status).toBe(201);
    expect(response.body.ratePerSecond).toBe(2);
  });

  it.each([
    [{ ratePerSecond: -1 }],
    [{ ratePerSecond: 51 }],
    [{ ratePerSecond: "fast" }],
    [{ limit: 0 }],
    [{ limit: 1.5 }],
    [{ emailIds: [] }],
    [{ emailIds: ["../../etc/passwd"] }],
    [{ source: "gmail" }],
  ])("rejects %j with 400 and the issues", async (body) => {
    const response = await request(app()).post("/runs").set(TEAM).send(body);
    expect(response.status).toBe(400);
    expect(response.body.issues.length).toBeGreaterThan(0);
    expect(runQueues.started).toEqual([]);
  });

  it("answers 503 and fails the run when the queue cannot be reached", async () => {
    runQueues.failWith = new RetryableError("queue unavailable: start ingest");
    const before = new Date();

    const response = await request(app()).post("/runs").set(TEAM).send({});

    expect(response.status).toBe(503);
    const { rows } = await getPool().query("select status from core.runs where created_at >= $1", [before]);
    expect(rows.map((row) => row.status)).toEqual(["failed"]);
  });

  it("drops repeated emailIds, which would inflate totalEmails", async () => {
    const response = await request(app())
      .post("/runs")
      .set(TEAM)
      .send({ emailIds: ["email_001", "email_002", "email_001"] });

    expect(response.status).toBe(201);
    expect((await runs.get(getPool(), response.body.id))?.emailIds).toEqual(["email_001", "email_002"]);
  });
});

describe("run control", () => {
  async function created(): Promise<string> {
    return (await request(app()).post("/runs").set(TEAM).send({})).body.id;
  }

  it("pauses, resumes with a fresh ingest job, and cancels", async () => {
    const id = await created();

    expect((await request(app()).post(`/runs/${id}/pause`).set(TEAM)).body.status).toBe("paused");
    expect((await request(app()).post(`/runs/${id}/resume`).set(TEAM)).body.status).toBe("running");
    expect(runQueues.started).toHaveLength(2);
    expect(runQueues.started[1]).toEqual({ runId: id, jobId: `${id}__resume__1`, epoch: 1 });

    expect((await request(app()).post(`/runs/${id}/cancel`).set(TEAM)).body.status).toBe("cancelled");
    expect(runQueues.removedFor).toEqual([id]);
  });

  it("raises the epoch on every resume, so each one gets its own job", async () => {
    const id = await created();
    for (let round = 0; round < 2; round++) {
      await request(app()).post(`/runs/${id}/pause`).set(TEAM);
      await request(app()).post(`/runs/${id}/resume`).set(TEAM);
    }
    expect(runQueues.started.map((job) => job.epoch)).toEqual([0, 1, 2]);
  });

  it("answers 409 for a move the status does not allow", async () => {
    const id = await created();
    const response = await request(app()).post(`/runs/${id}/resume`).set(TEAM);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("a created run cannot become running");
  });

  it("answers 404 for an unknown run and 400 for an id that is not a uuid", async () => {
    expect((await request(app()).get(`/runs/${randomUUID()}`).set(TEAM)).status).toBe(404);
    expect((await request(app()).post(`/runs/${randomUUID()}/pause`).set(TEAM)).status).toBe(404);
    expect((await request(app()).get("/runs/not-a-uuid").set(TEAM)).status).toBe(400);
  });
});

describe("GET /runs/:id and /runs/:id/emails", () => {
  it("reports stage counts and lists the run's emails", async () => {
    const pool = getPool();
    const id = (await request(app()).post("/runs").set(TEAM).send({})).body.id;
    const emailId = uniqueEmailId();
    await emails.upsert(pool, {
      emailId,
      from: "docs@algurg.ae",
      senderDomain: "algurg.ae",
      subject: "TO CONFIRM DOCS _ OC1 _ JEBEL ALI",
      body: "Please compare.",
      attachmentPaths: ["attachments/a_SI.txt"],
      tonnageMt: null,
      raw: {},
    });
    await emailRuns.insert(pool, { runId: id, emailId, stage: "ingested", priority: 600 });
    await emailRuns.setStage(pool, id, emailId, "done", { outcome: "OK", finished: true });

    const summary = await request(app()).get(`/runs/${id}`).set(TEAM);
    expect(summary.body.stageCounts.done).toBe(1);

    const listed = await request(app()).get(`/runs/${id}/emails?stage=done&pageSize=10`).set(TEAM);
    expect(listed.body).toEqual({
      emails: [
        { emailId, from: "docs@algurg.ae", subject: "TO CONFIRM DOCS _ OC1 _ JEBEL ALI", stage: "done", attachmentCount: 1, outcome: "OK" },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    expect((await request(app()).get(`/runs/${id}/emails?stage=nonsense`).set(TEAM)).status).toBe(400);
  });
});
