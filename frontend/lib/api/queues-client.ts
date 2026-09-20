import { HealthReport, RunQueuesView } from "./queues-schemas";
import { get } from "./transport";

export * from "./queues-schemas";

/**
 * Who holds each queue slot of a run, and whether the dependencies behind them
 * are up. Both are read on the run page's poll, and neither is worth failing
 * the page over: the route answers `reachable: false` rather than throwing
 * when Redis is down.
 */

export async function getRunQueues(runId: string): Promise<RunQueuesView> {
  return get(RunQueuesView, `/runs/${encodeURIComponent(runId)}/queues`);
}

/** A degraded backend still answers 200, so a dependency being down is a reading and not an error. */
export async function getHealth(): Promise<HealthReport> {
  return get(HealthReport, "/health", { timeoutMs: 5_000 });
}
