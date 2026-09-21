import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GateHeldList, GateOverview, GateSenderList } from "../../src/contracts";
import { closePool, getPool } from "../../src/db";
import { gateDecisions, gateSenders, runs } from "../../src/ontology/repositories";
import { MemoryRunQueues } from "../../src/queues/__fakes__/memory.run-queues";
import { TEST_ENV } from "../../vitest.config";
import { testApp } from "../app";
import { uniqueEmailId } from "../db";

const KEY = { authorization: `Bearer ${TEST_ENV.API_SHARED_SECRET}` };

let runQueues: MemoryRunQueues;
const app = () => testApp({ runQueues });

beforeEach(() => {
  runQueues = new MemoryRunQueues();
});
afterAll(closePool);

/** A principal no other test can have used. */
function principal(): string {
  return `t-${randomUUID().slice(0, 8)}.example`;
}

async function seedHold(domain: string): Promise<{ id: string; runId: string; emailId: string }> {
  const pool = getPool();
  const run = await runs.create(pool, { id: randomUUID(), source: "averis", ratePerSecond: 0 });
  const emailId = uniqueEmailId();
  const id = await gateDecisions.insert(pool, {
    runId: run.id,
    emailId,
    from: `docs@${domain}`,
    verdict: {
      decision: "hold",
      reason: "daily",
      scope: "domain",
      principal: domain,
      standing: "new",
      units: 16,
      breakdown: { email: 3, attachments: 6, comparison: 7, oversize: 0, bytes: 9000 },
      buckets: [{ scope: "domain", principal: domain, burstCapacity: 45, burstRemaining: 12, dailyUsed: 300, dailyCap: 300 }],
      enforced: true,
      retryAfterMs: 3600_000,
    },
  });
  return { id, runId: run.id, emailId };
}

describe("GET /gate", () => {
  it("says which mode the gate is in and what the day has cost", async () => {
    const response = await request(app()).get("/gate").set(KEY);
    expect(response.status).toBe(200);
    const overview = GateOverview.parse(response.body);
    expect(overview.mode).toBe("observe");
    expect(overview.budget.squeezeAt).toBe(0.8);
    expect(overview.global?.scope).toBe("global");
  });

  it("needs a key like everything else", async () => {
    expect((await request(app()).get("/gate")).status).toBe(401);
  });
});

describe("GET /gate/senders", () => {
  it("answers inside the contract, with the caps the enqueue path would use", async () => {
    const domain = principal();
    await gateSenders.recordArrival(getPool(), [{ principal: domain, scope: "domain" }], 16, false);

    // Every principal, not the busiest 500: this database keeps what earlier
    // runs committed, and a row with one email would otherwise fall off the end.
    const response = await request(app()).get("/gate/senders?limit=100000").set(KEY);
    expect(response.status).toBe(200);
    const { senders } = GateSenderList.parse(response.body);

    const row = senders.find((one) => one.principal === domain);
    expect(row).toMatchObject({ scope: "domain", policy: "auto", standing: "new", unitsToday: 16 });
    // `new` is 45 burst and 300 a day, and the growth clamp leaves `new` alone.
    expect(row).toMatchObject({ burstCapacity: 45, dailyCap: 300 });
  });

  it("refuses a limit that is not a sensible one", async () => {
    for (const bad of ["0", "-1", "1.5", "nope", "100001"]) {
      expect((await request(app()).get(`/gate/senders?limit=${bad}`).set(KEY)).status).toBe(400);
    }
  });
});

describe("PUT /gate/senders/:principal", () => {
  it("blacklists a sender and gives the row back with its standing changed", async () => {
    const domain = principal();
    const response = await request(app()).put(`/gate/senders/${domain}`).set(KEY).send({ scope: "domain", policy: "block" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ principal: domain, policy: "block", standing: "blocked", burstCapacity: 0 });
    expect((await gateSenders.recordFor(getPool(), domain, "domain")).policy).toBe("block");
  });

  it("whitelists it back, and the row says nobody has decided anything again", async () => {
    const domain = principal();
    await request(app()).put(`/gate/senders/${domain}`).set(KEY).send({ scope: "domain", policy: "block" });
    const response = await request(app()).put(`/gate/senders/${domain}`).set(KEY).send({ scope: "domain", policy: "auto" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ policy: "auto", standing: "unknown" });
  });

  it("carries the note a person left with their decision", async () => {
    const domain = principal();
    const response = await request(app())
      .put(`/gate/senders/${domain}`)
      .set(KEY)
      .send({ scope: "domain", policy: "block", note: "4000 emails on a Sunday" });
    expect(response.body.note).toBe("4000 emails on a Sunday");
  });

  it("refuses a scope that is not a sender, so nobody can blacklist everybody", async () => {
    const response = await request(app()).put("/gate/senders/global").set(KEY).send({ scope: "global", policy: "block" });
    expect(response.status).toBe(400);
  });

  it("refuses a policy it does not know and a principal that is not one", async () => {
    expect((await request(app()).put(`/gate/senders/${principal()}`).set(KEY).send({ scope: "domain", policy: "maybe" })).status).toBe(400);
    expect((await request(app()).put("/gate/senders/a%20b").set(KEY).send({ scope: "domain", policy: "block" })).status).toBe(400);
  });
});

describe("GET /gate/held", () => {
  it("lists what is waiting, inside the contract", async () => {
    const domain = principal();
    const { emailId } = await seedHold(domain);

    const response = await request(app()).get("/gate/held").set(KEY);
    expect(response.status).toBe(200);
    const { held } = GateHeldList.parse(response.body);

    const mine = held.find((one) => one.emailId === emailId);
    expect(mine).toMatchObject({ reason: "daily", scope: "domain", units: 16, enforced: true });
    expect(mine?.buckets[0]).toMatchObject({ dailyUsed: 300, dailyCap: 300 });
  });
});

describe("POST /gate/held/:id/release", () => {
  it("stamps the row and enqueues exactly one release", async () => {
    const { id, runId, emailId } = await seedHold(principal());

    const response = await request(app()).post(`/gate/held/${id}/release`).set(KEY).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ emailId, runId });
    expect(runQueues.released).toEqual([{ runId, emailId }]);
    expect((await gateDecisions.get(getPool(), id))?.releasedAt).not.toBeNull();
  });

  it("refuses the second click, so two clicks are never two emails", async () => {
    const { id } = await seedHold(principal());
    await request(app()).post(`/gate/held/${id}/release`).set(KEY).send({});

    const second = await request(app()).post(`/gate/held/${id}/release`).set(KEY).send({});
    expect(second.status).toBe(409);
    expect(runQueues.released).toHaveLength(1);
  });

  it("is a 404 for a decision that does not exist and a 400 for something that is not one", async () => {
    expect((await request(app()).post("/gate/held/999999999/release").set(KEY).send({})).status).toBe(404);
    expect((await request(app()).post("/gate/held/nope/release").set(KEY).send({})).status).toBe(400);
  });
});
