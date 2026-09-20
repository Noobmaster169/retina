import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { HealthReport } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { RetryableError } from "../../src/lib/errors";
import { emailRuns, emails, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { TEST_ENV } from "../../vitest.config";
import { allUp, testApp, withDown } from "../app";
import { uniqueEmailId } from "../db";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
let runQueues: MemoryRunQueues;
let health: HealthReport;

const app = () => testApp({ runQueues, health: async () => health });

beforeEach(() => {
  runQueues = new MemoryRunQueues();
  health = allUp();
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
    expect(response.body).toEqual(health);
  });

  it("stays 200 when degraded, so a MinIO outage does not roll a deploy back", async () => {
    health = withDown("minio");
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("degraded");
  });

  it("stays 200 when the worker heartbeat is stale, so a worker restart does not roll a deploy back", async () => {
    health = withDown("worker");
    const response = await request(app()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.checks.worker).toEqual({ status: "down", heartbeatAt: null });
  });

  it("is 503 when the database or Redis is down, which is what auto-deploy rolls back on", async () => {
    health = withDown("postgres");
    expect((await request(app()).get("/health")).status).toBe(503);
    health = withDown("redis");
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
        {
          emailId,
          from: "docs@algurg.ae",
          subject: "TO CONFIRM DOCS _ OC1 _ JEBEL ALI",
          stage: "done",
          attachmentCount: 1,
          outcome: "OK",
          category: null,
          decidedBy: null,
          confidence: null,
          verifierCategory: null,
          defectFields: [],
          error: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });

    expect((await request(app()).get(`/runs/${id}/emails?stage=nonsense`).set(TEAM)).status).toBe(400);
  });
});

describe("DELETE /runs/:id", () => {
  it("drops the run and everything hanging off it", async () => {
    const created = await request(app()).post("/runs").set(TEAM).send({ limit: 1 }).expect(201);
    const id = created.body.id as string;
    const emailId = uniqueEmailId();
    await emails.upsert(getPool(), {
      emailId,
      from: "docs@algurg.ae",
      senderDomain: "algurg.ae",
      subject: "TO CONFIRM DOCS",
      body: "Please compare.",
      attachmentPaths: [],
      tonnageMt: null,
      raw: {},
    });
    await emailRuns.insert(getPool(), { runId: id, emailId, stage: "ingested", priority: 600 });

    await request(app()).delete(`/runs/${id}`).set(TEAM).expect(204);

    expect(await runs.get(getPool(), id)).toBeNull();
    // The cascade took the email run with it; the email itself is shared and stays.
    expect(await emailRuns.exists(getPool(), id, emailId)).toBe(false);
    expect(await emails.get(getPool(), emailId)).not.toBeNull();
  });

  it("drops the run's waiting jobs so nothing is left pointing at it", async () => {
    const created = await request(app()).post("/runs").set(TEAM).send({ limit: 1 }).expect(201);
    const id = created.body.id as string;
    await request(app()).delete(`/runs/${id}`).set(TEAM).expect(204);
    expect(runQueues.removedFor).toContain(id);
  });

  it("refuses a running run rather than deleting it from under its workers", async () => {
    const created = await request(app()).post("/runs").set(TEAM).send({ limit: 1 }).expect(201);
    const id = created.body.id as string;
    await runs.markStarted(getPool(), id, 1);

    const refused = await request(app()).delete(`/runs/${id}`).set(TEAM).expect(409);
    expect(refused.body.error).toMatch(/cancel it first/i);
    expect(await runs.get(getPool(), id)).not.toBeNull();
  });

  it("deletes a cancelled run, which is what the refusal tells a caller to do first", async () => {
    const created = await request(app()).post("/runs").set(TEAM).send({ limit: 1 }).expect(201);
    const id = created.body.id as string;
    await runs.markStarted(getPool(), id, 1);
    await request(app()).post(`/runs/${id}/cancel`).set(TEAM).expect(200);
    await request(app()).delete(`/runs/${id}`).set(TEAM).expect(204);
    expect(await runs.get(getPool(), id)).toBeNull();
  });

  it("is 404 for a run that is not there", async () => {
    await request(app()).delete(`/runs/${randomUUID()}`).set(TEAM).expect(404);
  });
});
