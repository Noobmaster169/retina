import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ClientRow } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { comparisons, emailRuns, emails, runs } from "../../src/ontology/repositories";
import { MemoryPriorityCache } from "../../src/queues/__fakes__/memory.priority-cache";
import { TEST_ENV } from "../../vitest.config";
import { testApp } from "../app";
import { uniqueEmailId } from "../db";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };

let priority: MemoryPriorityCache;

const app = () => testApp({ priority });

const find = (body: { clients: ClientRow[] }, domain: string) => body.clients.find((one) => one.domain === domain);

/** One email from `domain`, in a run, optionally ending in a mismatch. */
async function sent(domain: string, status?: "OK" | "MISMATCH"): Promise<string> {
  const pool = getPool();
  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  const emailId = uniqueEmailId();
  await emails.upsert(pool, {
    emailId,
    from: `desk@${domain}`,
    senderDomain: domain,
    subject: "REQUEST BL DRAFT __138MT",
    body: "Please compare the SI and the draft BL.",
    attachmentPaths: [],
    tonnageMt: 138,
    raw: { email_id: emailId },
  });
  await emailRuns.insert(pool, { runId: run.id, emailId, stage: "ingested", priority: 600 });
  if (status) {
    const emailRunId = (await emailRuns.idOf(pool, run.id, emailId)) as string;
    await comparisons.upsert(pool, { emailRunId, status, reviewReason: null, detail: {} });
  }
  return emailId;
}

beforeEach(() => {
  priority = new MemoryPriorityCache();
});
afterAll(closePool);

describe("GET /clients", () => {
  it("lists the seeded clients with the tier a person would see", async () => {
    const response = await request(app()).get("/clients").set(TEAM);

    expect(response.status).toBe(200);
    expect(find(response.body, "aprilasia.com")).toMatchObject({ tier: 3, kind: "internal", known: true });
    expect(find(response.body, "roxcel.at")).toMatchObject({ tier: 3, kind: "customer", known: true });
  });

  it("lists a sender nobody has ranked, marked as unknown at the default tier", async () => {
    const domain = `sender-${randomUUID().slice(0, 8)}.example`;
    await sent(domain);

    const row = find((await request(app()).get("/clients").set(TEAM)).body, domain);

    // The point of the full outer join. A phishing sender is a sender; it is
    // on the page because it emailed us, not because a migration listed it.
    expect(row).toMatchObject({ tier: 3, kind: "customer", known: false, emails: 1 });
  });

  it("counts the emails a domain sent and the mismatches they ended in", async () => {
    const domain = `counted-${randomUUID().slice(0, 8)}.example`;
    await sent(domain, "MISMATCH");
    await sent(domain, "OK");

    expect(find((await request(app()).get("/clients").set(TEAM)).body, domain)).toMatchObject({ emails: 2, mismatches: 1 });
  });

  it("needs a key", async () => {
    expect((await request(app()).get("/clients")).status).toBe(401);
  });
});

describe("PUT /clients/:domain", () => {
  // Every write is against a domain this test made up. core.clients is seeded
  // and shared, not created per test like a run is, so a test that ranked
  // roxcel.at would change what the next test reads.
  const mine = () => `client-${randomUUID().slice(0, 8)}.example`;

  it("writes the tier to Postgres and to the cache the enqueue path reads", async () => {
    const domain = mine();

    const response = await request(app()).put(`/clients/${domain}`).set(TEAM).send({ tier: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ domain, tier: 1 });
    expect(await priority.tierOf(domain)).toBe(1);
    expect(find((await request(app()).get("/clients").set(TEAM)).body, domain)).toMatchObject({ tier: 1 });
  });

  it("creates a row for a sender the migration never seeded", async () => {
    const domain = mine();

    const response = await request(app()).put(`/clients/${domain}`).set(TEAM).send({ tier: 2, kind: "forwarder" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tier: 2, kind: "forwarder", known: true });
  });

  it("changes only what was sent, so ranking a client does not clear its name", async () => {
    const domain = mine();
    await request(app()).put(`/clients/${domain}`).set(TEAM).send({ name: "ROXCEL TRADING GMBH", kind: "customer" });

    await request(app()).put(`/clients/${domain}`).set(TEAM).send({ tier: 2 });

    expect(find((await request(app()).get("/clients").set(TEAM)).body, domain)).toMatchObject({
      tier: 2,
      name: "ROXCEL TRADING GMBH",
      kind: "customer",
    });
  });

  it("refuses a tier outside the range and a body that changes nothing", async () => {
    expect((await request(app()).put(`/clients/${mine()}`).set(TEAM).send({ tier: 9 })).status).toBe(400);
    expect((await request(app()).put(`/clients/${mine()}`).set(TEAM).send({})).status).toBe(400);
  });

  it("refuses something that is not a sender domain", async () => {
    expect((await request(app()).put("/clients/not-a-domain").set(TEAM).send({ tier: 1 })).status).toBe(400);
  });

  it("changes no category: a tier is not a classification", async () => {
    const domain = mine();

    await request(app()).put(`/clients/${domain}`).set(TEAM).send({ tier: 1, kind: "spam" });

    // `spam` is a label a person set. Nothing reads it to decide anything, and
    // the contract this answers with carries no category at all.
    const row = find((await request(app()).get("/clients").set(TEAM)).body, domain);
    expect(row).toMatchObject({ kind: "spam" });
    expect(row).not.toHaveProperty("category");
  });
});
