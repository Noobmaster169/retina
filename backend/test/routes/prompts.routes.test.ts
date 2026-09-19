import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import type { HealthReport } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const UP: HealthReport = { status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up", docExtract: "up" } };
const app = () =>
  createApp({ pool: getPool(), runQueues: new MemoryRunQueues(), store: new MemoryStore(), scorer: new FakeScorer(), health: async () => UP });

afterAll(closePool);

describe("GET /prompts", () => {
  it("lists every step's versions on disk, newest first, with the active one marked", async () => {
    const response = await request(app()).get("/prompts").set(TEAM);

    expect(response.status).toBe(200);
    const classify = response.body.steps.find((s: { step: string }) => s.step === "classify");
    expect(classify.versions.map((v: { version: string }) => v.version)).toEqual(["v5", "v4", "v3"]);
    expect(classify.versions.filter((v: { active: boolean }) => v.active).map((v: { version: string }) => v.version)).toEqual(["v3"]);
    expect(classify.versions[2]).toMatchObject({ model: "sonnet", notes: expect.stringContaining("Phase 2 final") });
    expect(classify.versions[0]).toMatchObject({ active: false, notes: expect.stringContaining("attachments") });
    expect(response.body.steps.map((s: { step: string }) => s.step)).toEqual([
      "classify",
      "classify-verify",
      "triage",
      "doc-type",
      "extract",
      "extract-verify",
      "field-judge",
    ]);
  });

  it("needs a key", async () => {
    expect((await request(app()).get("/prompts")).status).toBe(401);
  });
});
