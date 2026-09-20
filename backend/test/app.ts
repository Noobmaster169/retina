import { FakeLlmClient } from "../src/agents/__fakes__/fake.llm-client";
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
    // The read-only pool is the ordinary one here: retina_ro exists in the
    // test database, but a rolled-back transaction is invisible to a second
    // connection, so a route test that seeded rows would read none of them.
    // The guardrail is what run_sql is tested on, and it is pure.
    roPool: getPool(),
    // No test may reach the proxy. A chat route test scripts this instead.
    llm: new FakeLlmClient("{}"),
    ...overrides,
  });
}
