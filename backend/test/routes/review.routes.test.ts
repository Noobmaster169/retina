import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";
import type { HealthReport } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { attachments, emailRuns, emails, reviewCases, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../../src/scorer/__fakes__/fake.scorer";
import { MAX_UPLOAD_BYTES } from "../../src/review/upload";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { keys } from "../../src/storage";
import { TEST_ENV } from "../../vitest.config";
import { uniqueEmailId } from "../db";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const ALL_UP: HealthReport = { status: "ok", checks: { postgres: "up", redis: "up", minio: "up", inbox: "up", docExtract: "up" } };

let runQueues: MemoryRunQueues;
let store: MemoryStore;

function app() {
  return createApp({ pool: getPool(), runQueues, store, scorer: new FakeScorer(), health: async () => ALL_UP });
}

/** An escalated email of a fresh run, and the case waiting on it. */
async function parked(reason: "unreadable" | "missing_attachment" = "missing_attachment") {
  const pool = getPool();
  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  const emailId = uniqueEmailId();
  await emails.upsert(pool, {
    emailId,
    from: "docs@roxcel.at",
    senderDomain: "roxcel.at",
    subject: "RE_ Draft BL MSC LORETO NANTONG",
    body: "Please check the draft against the instruction.",
    attachmentPaths: [],
    tonnageMt: null,
    raw: { email_id: emailId },
  });
  await emailRuns.insert(pool, { runId: run.id, emailId, stage: "review", priority: 600 });
  const emailRunId = (await emailRuns.idOf(pool, run.id, emailId)) as string;
  const { id } = await reviewCases.raise(pool, { emailRunId, reason, stage: "compare", detail: { missing: ["BL"] } });
  return { runId: run.id, emailId, emailRunId, caseId: id };
}

beforeEach(() => {
  runQueues = new MemoryRunQueues();
  store = new MemoryStore();
});
afterAll(closePool);

describe("GET /review", () => {
  it("lists open cases with the email beside each, and filters by run", async () => {
    const { runId, emailId, caseId } = await parked();
    const response = await request(app()).get(`/review?runId=${runId}`).set(TEAM);

    expect(response.status).toBe(200);
    expect(response.body.cases).toHaveLength(1);
    expect(response.body.cases[0]).toMatchObject({
      id: caseId,
      runId,
      emailId,
      subject: "RE_ Draft BL MSC LORETO NANTONG",
      kind: "review",
      reason: "missing_attachment",
      status: "open",
      actions: 0,
      lastActionBy: null,
    });

    const elsewhere = await request(app()).get(`/review?runId=${randomUUID()}`).set(TEAM);
    expect(elsewhere.body).toMatchObject({ cases: [], total: 0 });
  });

  it("refuses a reason the organisers did not define", async () => {
    const response = await request(app()).get("/review?reason=job_failed").set(TEAM);
    expect(response.status).toBe(400);
  });

  it("counts what is open by reason", async () => {
    const { runId } = await parked("unreadable");
    const response = await request(app()).get(`/review/stats?runId=${runId}`).set(TEAM);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ open: 1, failures: 0, byReason: { unreadable: 1, missing_value: 0 } });
  });
});

describe("GET /review/:id", () => {
  it("answers the case with its history, and 404 for one that does not exist", async () => {
    const { caseId } = await parked();
    const response = await request(app()).get(`/review/${caseId}`).set(TEAM);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: caseId, kind: "review", reason: "missing_attachment", status: "open", actions: [] });
    expect((await request(app()).get("/review/999999999").set(TEAM)).status).toBe(404);
    expect((await request(app()).get("/review/not-a-number").set(TEAM)).status).toBe(400);
  });
});

describe("POST /review/:id/actions", () => {
  it("validates the body per kind, naming the field that is wrong", async () => {
    const { caseId } = await parked();
    const missingField = await request(app()).post(`/review/${caseId}/actions`).set(TEAM).send({ kind: "correct_field", actor: "kai", side: "SI", value: "x" });

    expect(missingField.status).toBe(400);
    expect(missingField.body.issues[0].path).toContain("field");

    const noActor = await request(app()).post(`/review/${caseId}/actions`).set(TEAM).send({ kind: "note", actor: "  ", note: "x" });
    expect(noActor.status).toBe(400);

    const unknownKind = await request(app()).post(`/review/${caseId}/actions`).set(TEAM).send({ kind: "approve", actor: "kai" });
    expect(unknownKind.status).toBe(400);
  });

  it("writes the action and says what it wrote", async () => {
    const { emailId, caseId } = await parked();
    const response = await request(app()).post(`/review/${caseId}/actions`).set(TEAM).send({ kind: "note", actor: "kai", note: "chasing the shipper" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      action: { kind: "note", actor: "kai", note: "chasing the shipper" },
      requeued: null,
      wrote: `Kept the note on ${emailId}.`,
      case: { actions: 1, lastActionBy: "kai" },
    });
  });

  it("refuses an action the case is not in a state for, and 404s an unknown case", async () => {
    const { caseId } = await parked();
    const retry = await request(app()).post(`/review/${caseId}/actions`).set(TEAM).send({ kind: "retry", actor: "kai" });

    expect(retry.status).toBe(409);
    expect(retry.body.error).toMatch(/retry is for a job that failed/);
    expect((await request(app()).post("/review/999999999/actions").set(TEAM).send({ kind: "note", actor: "kai", note: "x" })).status).toBe(404);
  });
});

describe("POST /review/:id/upload", () => {
  const pdf = () => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(64, 0x20)]);

  it("stores the file under the case, marks it as the person's, and re-queues from triage", async () => {
    const { runId, emailId, caseId } = await parked();
    const response = await request(app())
      .post(`/review/${caseId}/upload`)
      .set(TEAM)
      .field("actor", "kai")
      .field("role", "BL")
      .attach("file", pdf(), "email_074_BL.pdf");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ requeued: "compare", wrote: `Stored email_074_BL.pdf as the BL of ${emailId}.` });
    expect(runQueues.reruns[0]).toMatchObject({ queue: "compare", data: { runId, emailId, rerunFrom: "triage" } });

    const key = keys.upload(caseId, "email_074_BL.pdf");
    expect(await store.exists(key)).toBe(true);
    const stored = await attachments.listForEmail(getPool(), runId, emailId);
    expect(stored[0]).toMatchObject({ filename: "email_074_BL.pdf", role: "BL", origin: "human", objectKey: key });
  });

  it("refuses bytes that are not the kind the name claims", async () => {
    const { caseId } = await parked();
    const response = await request(app())
      .post(`/review/${caseId}/upload`)
      .set(TEAM)
      .field("actor", "kai")
      .field("role", "BL")
      .attach("file", Buffer.from("this is not a pdf"), "renamed.pdf");

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/does not begin like one/);
  });

  it("refuses a format Retina cannot read, an empty file, and one with no role", async () => {
    const { caseId } = await parked();
    const send = () => request(app()).post(`/review/${caseId}/upload`).set(TEAM).field("actor", "kai").field("role", "BL");

    expect((await send().attach("file", Buffer.from("MZ"), "draft.exe")).status).toBe(409);
    expect((await send().attach("file", Buffer.alloc(0), "empty.txt")).status).toBe(409);

    const noRole = await request(app()).post(`/review/${caseId}/upload`).set(TEAM).field("actor", "kai").attach("file", pdf(), "bl.pdf");
    expect(noRole.status).toBe(400);
  });

  it("refuses a file larger than the cap before it reaches the store", async () => {
    const { caseId } = await parked();
    const response = await request(app())
      .post(`/review/${caseId}/upload`)
      .set(TEAM)
      .field("actor", "kai")
      .field("role", "BL")
      .attach("file", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(MAX_UPLOAD_BYTES, 0x20)]), "huge.pdf");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(store.objects.size).toBe(0);
  });
});
