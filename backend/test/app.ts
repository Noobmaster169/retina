import type { HealthChecks, HealthReport } from "../src/contracts";
import { type AppDeps, createApp } from "../src/app";
import { getPool } from "../src/db";
import { MemoryPriorityCache } from "../src/queues/__fakes__/memory.priority-cache";
import { MemoryRunQueues } from "../src/queues/__fakes__/memory.run-queues";
import { FakeScorer } from "../src/scorer/__fakes__/fake.scorer";
import { MemoryStore } from "../src/storage/__fakes__/memory.store";

/**
 * An app wired to fakes, for the route tests.
 *
 * It exists because six files were each writing the same six dependencies and
 * the same health literal, and every field added to either meant six edits in
 * a phase that was not about routes.
 */

/** Everything answering, which is the uninteresting case every route test needs and none of them is about. */
export function allUp(overrides: Partial<HealthChecks> = {}): HealthReport {
  return {
    status: "ok",
    checks: {
      postgres: { status: "up" },
      redis: { status: "up" },
      minio: { status: "up" },
      inbox: { status: "up" },
      docExtract: { status: "up" },
      llmProxy: { status: "up" },
      worker: { status: "up", heartbeatAt: new Date().toISOString() },
      ...overrides,
    },
    version: "test",
    queues: null,
  };
}

/** The same report with one dependency down, which is what the status line is read for. */
export function withDown(name: keyof HealthChecks): HealthReport {
  const report = allUp({ [name]: { status: "down", heartbeatAt: null } } as Partial<HealthChecks>);
  const down = name === "postgres" || name === "redis";
  return { ...report, status: down ? "down" : "degraded" };
}

/** Every dependency a fake, and any of them replaceable by the test that cares about it. */
export function testApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    pool: getPool(),
    runQueues: new MemoryRunQueues(),
    store: new MemoryStore(),
    scorer: new FakeScorer(),
    priority: new MemoryPriorityCache(),
    health: async () => allUp(),
    ...overrides,
  });
}
