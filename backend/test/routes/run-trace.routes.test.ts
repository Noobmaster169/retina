import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

import { closePool, getPool } from "../../src/db";
import { subsetIds } from "../../src/eval/id-lists";
import { classifications, emailRuns, emails, llmCalls, runs } from "../../src/ontology/repositories";
import { MemoryLiveCalls } from "../../src/live/__fakes__/memory.live-calls";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { TEST_ENV } from "../../vitest.config";
import { testApp } from "../app";
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
const app = (live?: MemoryLiveCalls) => testApp({ live });

afterAll(closePool);

describe("POST /runs, choosing what and how", () => {
  it("pins the active prompt of every step, and the model each file names", async () => {
    const response = await request(app()).post("/runs").set(TEAM).send({ limit: 1 });

    expect(response.status).toBe(201);
    expect(response.body.promptSet).toEqual({
      classify: { version: "v6", model: "sonnet" },
      "classify-verify": { version: "v3", model: "sonnet" },
      triage: { version: "v1", model: "sonnet" },
      "doc-type": { version: "v1", model: "sonnet" },
      extract: { version: "v1", model: "sonnet" },
      "extract-verify": { version: "v1", model: "sonnet" },
      "field-judge": { version: "v1", model: "sonnet" },
    });
    expect((await runs.get(getPool(), response.body.id))?.promptSet).toEqual(response.body.promptSet);
  });

  it("pins the version and model a run asks for", async () => {
    const body = { limit: 1, promptSet: { classify: "v4" }, models: { "classify-verify": "haiku" } };
    const response = await request(app()).post("/runs").set(TEAM).send(body);

    expect(response.status).toBe(201);
    expect(response.body.promptSet).toEqual({
      classify: { version: "v4", model: "sonnet" },
      "classify-verify": { version: "v3", model: "haiku" },
      triage: { version: "v1", model: "sonnet" },
      "doc-type": { version: "v1", model: "sonnet" },
      extract: { version: "v1", model: "sonnet" },
      "extract-verify": { version: "v1", model: "sonnet" },
      "field-judge": { version: "v1", model: "sonnet" },
    });
  });

  it.each([
    ["a prompt version that does not exist", { promptSet: { classify: "v99" } }, /no prompt classify\/v99/],
    ["a model that is not a proxy alias", { models: { classify: "gpt-5" } }, /not a proxy alias: gpt-5/],
    ["both a subset and explicit ids", { subset: "dev", emailIds: ["email_001"] }, /invalid body/],
    ["a subset that is not one", { subset: "everything" }, /invalid body/],
  ])("refuses %s before queueing anything", async (_name, body, message) => {
    const queues = new MemoryRunQueues();
    const refusing = testApp({ runQueues: queues });

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
  // The llm cap is both concurrencies added up, not the classify one alone.
  // Eight classify jobs used to be able to hold every model slot while four
  // compare jobs sat blocked in the semaphore, which the run page drew as
  // sorting unaffected and checking paused.
  it("says how parallel a run is, from the env, with the model cap covering both queues", async () => {
    const response = await request(app()).get("/runs").set(TEAM);
    expect(response.body.concurrency).toEqual({ classify: 8, llm: 12 });
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
      rationale: decidedBy === "verifier"
        ? { generator: "Looks general.", verifier: "It is a request.", counterCases: "SPAM: none." }
        : { generator: "Looks general." },
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
    // Both emails are done, but the run never recorded a size, so it cannot call itself finished.
    expect(summary.body).toMatchObject({ finishedEmails: 2, processingDone: false });
  });

  it("shows one email's calls exactly as they went out and came back, and how its category was settled", async () => {
    const { runId, spam, si } = await classifiedRun();

    const trace = await request(app()).get(`/runs/${runId}/emails/${spam}/trace`).set(TEAM);

    expect(trace.status).toBe(200);
    expect(trace.body).toMatchObject({
      emailId: spam,
      stage: "done",
      live: null,
      classification: {
        finalCategory: "SPAM",
        decidedBy: "llm",
        generator: { category: "GENERAL", confidence: 0.97, rationale: "Looks general." },
        verifier: null,
      },
    });
    const checked = await request(app()).get(`/runs/${runId}/emails/${si}/trace`).set(TEAM);
    expect(checked.body.classification).toMatchObject({
      finalCategory: "SI_REQUEST",
      decidedBy: "verifier",
      verifier: { category: "SI_REQUEST", confidence: 0.9, rationale: "It is a request.", counterCases: "SPAM: none." },
    });
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
    expect((await request(app()).get(`/runs/${runId}/emails/nope/trace`).set(TEAM)).status).toBe(400);
    expect((await request(app()).get(`/runs/${runId}/emails/email_999999/trace`).set(TEAM)).status).toBe(404);
  });

  it("shows what a running call has written so far, and nothing for an email that is not running", async () => {
    const { runId, spam, si } = await classifiedRun();
    await emailRuns.setStage(getPool(), runId, si, "classifying");
    const siRun = (await emailRuns.idOf(getPool(), runId, si)) as string;
    const spamRun = (await emailRuns.idOf(getPool(), runId, spam)) as string;
    const live = new MemoryLiveCalls();
    const writing = { step: "classify", model: "sonnet", promptVersion: "v3", attempt: 1, startedAt: "t0", updatedAt: "t1" };
    await live.put({ ...writing, emailRunId: siRun, text: '{"rationale": "The sender' });
    // A leftover for an email that is done must not show: only running emails are asked about.
    await live.put({ ...writing, emailRunId: spamRun, text: "stale" });

    const feed = await request(app(live)).get(`/runs/${runId}/live`).set(TEAM);
    expect(feed.body.calls).toEqual([{ ...writing, emailId: si, text: '{"rationale": "The sender' }]);

    const trace = await request(app(live)).get(`/runs/${runId}/emails/${si}/trace`).set(TEAM);
    expect(trace.body).toMatchObject({ stage: "classifying", live: { emailId: si, text: '{"rationale": "The sender' } });
    expect((await request(app()).get(`/runs/${runId}/live`).set(TEAM)).body).toEqual({ calls: [] });
  });

  it("feeds a live view newest first, and only what is new after a given id", async () => {
    const { runId, spam, si } = await classifiedRun();

    const feed = await request(app()).get(`/runs/${runId}/calls`).set(TEAM);
    expect(feed.body.calls.map((c: { emailId: string }) => c.emailId)).toEqual([si, spam]);
    // A summary: a live view polls this, so no prompt or email text rides along.
    expect(Object.keys(feed.body.calls[0])).not.toContain("system");
    expect(Object.keys(feed.body.calls[0])).not.toContain("user");
    expect(feed.body.calls[0].parsed).toEqual({ category: "GENERAL" });

    const newest = feed.body.calls[0].id;
    const after = await request(app()).get(`/runs/${runId}/calls?after=${newest}`).set(TEAM);
    expect(after.body.calls).toEqual([]);
  });
});
