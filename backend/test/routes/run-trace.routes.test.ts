import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app";
import type { HealthReport } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { subsetIds } from "../../src/eval/id-lists";
import { classifications, emailRuns, emails, llmCalls, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";
import { uniqueEmailId } from "../db";

// The proxy's alias list, without a proxy.
vi.mock("../../src/llm", () => ({
  chat: vi.fn(),
  listModels: vi.fn(async () => [
    { id: "sonnet", provider: "claudecli", model: "sonnet" },
    { id: "haiku", provider: "claudecli", model: "haiku" },
  ]),
}));

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const UP: HealthReport = { status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up" } };

function app() {
  return createApp({
    pool: getPool(),
    runQueues: new MemoryRunQueues(),
    store: new MemoryStore(),
    scorer: new FakeScorer(),
    health: async () => UP,
  });
}

afterAll(closePool);

describe("POST /runs, choosing what and how", () => {
  it("pins the active prompt of every step, and the model each file names", async () => {
    const response = await request(app()).post("/runs").set(TEAM).send({ limit: 1 });

    expect(response.status).toBe(201);
    expect(response.body.promptSet).toEqual({
      classify: { version: "v3", model: "sonnet" },
      "classify-verify": { version: "v1", model: "sonnet" },
    });
    expect((await runs.get(getPool(), response.body.id))?.promptSet).toEqual(response.body.promptSet);
  });

  it("pins the version and model a run asks for", async () => {
    const body = { limit: 1, promptSet: { classify: "v2" }, models: { "classify-verify": "haiku" } };
    const response = await request(app()).post("/runs").set(TEAM).send(body);

    expect(response.status).toBe(201);
    expect(response.body.promptSet).toEqual({
      classify: { version: "v2", model: "sonnet" },
      "classify-verify": { version: "v1", model: "haiku" },
    });
  });

  it.each([
    ["a prompt version that does not exist", { promptSet: { classify: "v99" } }, /no prompt classify\/v99/],
    ["a model that is not a proxy alias", { models: { classify: "gpt-5" } }, /not a proxy alias: gpt-5/],
    ["both a subset and explicit ids", { subset: "dev", emailIds: ["email_001"] }, /invalid body/],
    ["a subset that is not one", { subset: "everything" }, /invalid body/],
  ])("refuses %s before queueing anything", async (_name, body, message) => {
    const queues = new MemoryRunQueues();
    const refusing = createApp({ pool: getPool(), runQueues: queues, store: new MemoryStore(), scorer: new FakeScorer(), health: async () => UP });

    const response = await request(refusing).post("/runs").set(TEAM).send(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(message);
    expect(queues.started).toEqual([]);
  });

  it.each(["dev", "holdout"] as const)("runs the %s subset's ids", async (subset) => {
    const response = await request(app()).post("/runs").set(TEAM).send({ subset });

    expect(response.status).toBe(201);
    expect((await runs.get(getPool(), response.body.id))?.emailIds).toEqual(await subsetIds(subset));
  });

  it("keeps the dev sample small: a subset to iterate on, not a run of the inbox", async () => {
    expect((await subsetIds("dev")).length).toBe(30);
  });
});

describe("GET /runs", () => {
  it("says how parallel a run is, from the env", async () => {
    const response = await request(app()).get("/runs").set(TEAM);
    expect(response.body.concurrency).toEqual({ classify: 2, llm: 2 });
  });
});

async function classifiedRun() {
  const pool = getPool();
  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  const add = async (category: "SPAM" | "SI_REQUEST", decidedBy: "llm" | "verifier") => {
    const emailId = uniqueEmailId();
    await emails.upsert(pool, {
      emailId,
      from: "a@b.c",
      subject: "s",
      senderDomain: "b.c",
      body: "b",
      attachmentPaths: [],
      tonnageMt: null,
      raw: {},
    });
    await emailRuns.insert(pool, { runId: run.id, emailId, stage: "done", priority: 600 });
    const emailRunId = (await emailRuns.idOf(pool, run.id, emailId)) as string;
    await classifications.upsert(pool, {
      emailRunId,
      genCategory: "GENERAL",
      genConfidence: decidedBy === "verifier" ? 0.6 : 0.97,
      verCategory: decidedBy === "verifier" ? category : null,
      verConfidence: decidedBy === "verifier" ? 0.9 : null,
      finalCategory: category,
      decidedBy,
      rationale: {},
      model: "sonnet",
      promptVersion: "v3",
    });
    await llmCalls.insert(pool, {
      runId: run.id,
      emailRunId,
      step: "classify",
      model: "sonnet",
      promptVersion: "v3",
      request: { model: "sonnet", system: "the system prompt", user: `## subject\n${emailId}`, project: "worker" },
      response: { text: '{"category":"GENERAL"}', model: "claudecli/sonnet", stopReason: "end_turn" },
      parsed: { category: "GENERAL" },
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.01,
      latencyMs: 900,
      ok: true,
      attempt: 1,
    });
    return emailId;
  };
  const spam = await add("SPAM", "llm");
  const si = await add("SI_REQUEST", "verifier");
  return { runId: run.id, spam, si };
}

describe("a run's emails and calls", () => {
  it("lists each email with its category, who decided it, and the generator's confidence", async () => {
    const { runId, si } = await classifiedRun();

    const listed = await request(app()).get(`/runs/${runId}/emails?category=SI_REQUEST`).set(TEAM);

    expect(listed.body.total).toBe(1);
    expect(listed.body.emails[0]).toMatchObject({
      emailId: si,
      category: "SI_REQUEST",
      decidedBy: "verifier",
      confidence: 0.6,
      verifierCategory: "SI_REQUEST",
    });
    const byVerifier = await request(app()).get(`/runs/${runId}/emails?decidedBy=llm`).set(TEAM);
    expect(byVerifier.body.emails.map((e: { category: string }) => e.category)).toEqual(["SPAM"]);
    expect((await request(app()).get(`/runs/${runId}/emails?category=PHISHING`).set(TEAM)).status).toBe(400);
  });

  it("reports the verifier's share of the run", async () => {
    const { runId } = await classifiedRun();
    const summary = await request(app()).get(`/runs/${runId}`).set(TEAM);
    expect(summary.body.llm).toMatchObject({ calls: 2, verifierShare: 0.5 });
  });

  it("shows one email's calls exactly as they went out and came back", async () => {
    const { runId, spam } = await classifiedRun();

    const trace = await request(app()).get(`/runs/${runId}/emails/${spam}/calls`).set(TEAM);

    expect(trace.status).toBe(200);
    expect(trace.body.calls).toEqual([
      expect.objectContaining({
        emailId: spam,
        step: "classify",
        system: "the system prompt",
        user: `## subject\n${spam}`,
        responseText: '{"category":"GENERAL"}',
        parsed: { category: "GENERAL" },
        latencyMs: 900,
        ok: true,
      }),
    ]);
    expect((await request(app()).get(`/runs/${runId}/emails/nope/calls`).set(TEAM)).status).toBe(400);
  });

  it("feeds a live view newest first, and only what is new after a given id", async () => {
    const { runId, spam, si } = await classifiedRun();

    const feed = await request(app()).get(`/runs/${runId}/calls`).set(TEAM);
    expect(feed.body.calls.map((c: { emailId: string }) => c.emailId)).toEqual([si, spam]);

    const newest = feed.body.calls[0].id;
    const after = await request(app()).get(`/runs/${runId}/calls?after=${newest}`).set(TEAM);
    expect(after.body.calls).toEqual([]);
  });
});
