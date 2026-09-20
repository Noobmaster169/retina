import type { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { checkHealth, type HealthDeps } from "../src/health";
import { HEARTBEAT_TTL_S } from "../src/queues/heartbeat";
import { closePool, getPool } from "../src/db";
import { MemoryStore } from "../src/storage/__fakes__/memory.store";

/**
 * What a reading means, not whether each dependency answers: the local stack
 * is up while these run, so postgres, redis and minio really are up and the
 * interesting cases are the ones this file can arrange.
 *
 * The status line is the one thing here with consequences. auto-deploy.sh
 * rolls back on a 503, so a check that turns `down` into a 503 when it should
 * not takes a working image away.
 */

const beating = (agoMs = 0) => async () => new Date(Date.now() - agoMs).toISOString();

function deps(overrides: Partial<HealthDeps> = {}): HealthDeps {
  return {
    pool: getPool(),
    store: new MemoryStore(),
    worker: beating(),
    queues: async () => ({
      classify: { waiting: 0, active: 0, failed: 0 },
      compare: { waiting: 0, active: 0, failed: 0 },
    }),
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
  });

  it("carries what each dependency says about itself, not just that it answered", async () => {
    const report = await checkHealth(deps());

    // The inbox's own count. `emails: 0` is a bind mount that came up empty,
    // which from the outside looks exactly like a healthy empty inbox.
    expect(report.checks.inbox.emails).toBe(520);
    expect(report.checks.inbox.scoringAvailable).toBe(true);
    expect(report.checks.docExtract.tesseract).toMatch(/^\d+\./);
    expect(report.checks.llmProxy.models).toBeGreaterThan(0);
  });

  it("is degraded, not down, when object storage is not configured", async () => {
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
});
