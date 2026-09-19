import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import { closePool, getPool } from "../../src/db";
import { RetryableError } from "../../src/lib/errors";
import { runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };

let runQueues: MemoryRunQueues;

function app() {
  return createApp({
    pool: getPool(),
    runQueues,
    store: new MemoryStore(),
    scorer: new FakeScorer(),
    health: async () => ({ status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up" } }),
  });
}

async function created(): Promise<string> {
  return (await request(app()).post("/runs").set(TEAM).send({})).body.id;
}

beforeEach(() => {
  runQueues = new MemoryRunQueues();
});
afterAll(closePool);

describe("runs routes while the queues cannot be reached", () => {
  it("still lists and shows runs, with queues null", async () => {
    const id = await created();
    runQueues.failWith = new RetryableError("queue unavailable: queue counts");

    const listed = await request(app()).get("/runs").set(TEAM);
    expect(listed.status).toBe(200);
    expect(listed.body.runs.find((run: { id: string }) => run.id === id)).toMatchObject({ queues: null });

    const one = await request(app()).get(`/runs/${id}`).set(TEAM);
    expect(one.status).toBe(200);
    expect(one.body.queues).toBeNull();
  });

  it("puts the run back to paused when the resume job cannot be queued", async () => {
    const id = await created();
    await request(app()).post(`/runs/${id}/pause`).set(TEAM);
    runQueues.failWith = new RetryableError("queue unavailable: start ingest");

    expect((await request(app()).post(`/runs/${id}/resume`).set(TEAM)).status).toBe(503);
    expect(await runs.status(getPool(), id)).toBe("paused");

    runQueues.failWith = undefined;
    expect((await request(app()).post(`/runs/${id}/resume`).set(TEAM)).body.status).toBe("running");
  });

  it("still cancels when the queue cannot be reached", async () => {
    const id = await created();
    runQueues.failWith = new RetryableError("queue unavailable: remove waiting jobs");

    const response = await request(app()).post(`/runs/${id}/cancel`).set(TEAM);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "cancelled", queues: null });
  });
});
