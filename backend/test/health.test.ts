import type { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { FakeProbes } from "../src/__fakes__/fake.probes";
import { checkHealth, type HealthDeps } from "../src/health";
import { HEARTBEAT_TTL_S } from "../src/queues/heartbeat";
import { closePool, getPool } from "../src/db";
import { MemoryStore } from "../src/storage/__fakes__/memory.store";

/**
 * What a reading means, not whether any particular service is up today.
 *
 * Every HTTP dependency is a fake, so this never dials the llm-proxy (which
 * CLAUDE.md bans outright) and never asserts a number that belongs to one seed
 * of one dataset. Postgres and Redis are the local stack, because those two
 * are what the status line is actually about.
 *
 * That status line is the one thing here with consequences: auto-deploy rolls
 * back on a 503, so a check that turns `down` into a 503 when it should not
 * takes a working image away.
 */

const beating = (agoMs = 0) => async () => new Date(Date.now() - agoMs).toISOString();

const EMPTY = { waiting: 0, active: 0, failed: 0 };

function deps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    pool: getPool(),
    store: new MemoryStore(),
    worker: beating(),
    queues: async () => ({ classify: EMPTY, compare: EMPTY }),
    probes: new FakeProbes(),
    ...overrides,
  };
}

afterAll(closePool);

describe("checkHealth", () => {
  it("reads every dependency and reports the build it is running", async () => {
    const report = await checkHealth(deps());

    expect(Object.keys(report.checks).sort()).toEqual(
      ["docExtract", "inbox", "llmProxy", "minio", "postgres", "redis", "worker"].sort(),
    );
    expect(report.checks.postgres).toMatchObject({ status: "up" });
    expect(report.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.version).toBe("dev");
    expect(report.status).toBe("ok");
  });

  it("carries what each dependency says about itself, not just that it answered", async () => {
    const probes = new FakeProbes();
    probes.inboxAnswer = { emails: 104, scoringAvailable: false };
    probes.docExtractAnswer = { tesseract: "5.3.0" };

    const report = await checkHealth(deps({ probes }));

    // The inbox's own count. `emails: 0` is a bind mount that came up empty,
    // which from the outside looks exactly like a healthy empty inbox.
    expect(report.checks.inbox).toMatchObject({ emails: 104, scoringAvailable: false });
    expect(report.checks.docExtract.tesseract).toBe("5.3.0");
    expect(report.checks.llmProxy.models).toBe(4);
  });

  it("is degraded, not down, when a dependency the api can serve without is away", async () => {
    const probes = new FakeProbes();
    probes.llmProxyAnswer = new Error("connect ECONNREFUSED");

    const report = await checkHealth(deps({ probes }));

    expect(report.checks.llmProxy.status).toBe("down");
    expect(report.status).toBe("degraded");
  });

  it("is degraded when object storage is not configured", async () => {
    const report = await checkHealth(deps({ store: null }));

    expect(report.checks.minio.status).toBe("down");
    expect(report.status).toBe("degraded");
  });

  it("is down when the database cannot be reached, which is the 503 auto-deploy rolls back on", async () => {
    const refusing = { query: async () => Promise.reject(new Error("no connection")) } as unknown as Pool;

    expect((await checkHealth(deps({ pool: refusing }))).status).toBe("down");
  });

  it("reports a worker with no heartbeat as down, and the report only as degraded", async () => {
    const report = await checkHealth(deps({ worker: async () => null }));

    expect(report.checks.worker).toEqual({ status: "down", heartbeatAt: null });
    expect(report.status).toBe("degraded");
  });

  it("reports a stale heartbeat as down without taking the api with it", async () => {
    const report = await checkHealth(deps({ worker: beating(HEARTBEAT_TTL_S * 1000 + 5000) }));

    expect(report.checks.worker.status).toBe("down");
    expect(report.status).toBe("degraded");
  });

  it("survives a Redis it cannot read, because /health is the route that must answer during an outage", async () => {
    const report = await checkHealth(
      deps({
        worker: async () => Promise.reject(new Error("redis is reconnecting")),
        queues: async () => Promise.reject(new Error("redis is reconnecting")),
      }),
    );

    expect(report.checks.worker).toEqual({ status: "down", heartbeatAt: null });
    expect(report.queues).toBeNull();
  });

  it("still answers when a probe's detail does not fit the contract", async () => {
    const probes = new FakeProbes();
    // What a dependency renaming a field looks like from here.
    probes.inboxAnswer = { emails: "many" } as unknown as { emails?: number };

    const report = await checkHealth(deps({ probes }));

    expect(report.status).toBe("down");
    expect(report.version).toBe("dev");
  });
});
