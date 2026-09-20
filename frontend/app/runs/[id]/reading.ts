import { HealthReport, RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";
import type { Trouble } from "@/components/run/run-header";

/**
 * How the run reads in one sentence, and whether anything is wrong with it.
 * Both are wording over numbers the API returned: nothing here decides a
 * status, and the run's own `status` and every outcome enum come from the
 * backend untouched.
 */

/** The names the health report uses, in the words the banner says them in. */
const NAMES: Record<string, string> = {
  postgres: "postgres",
  redis: "redis",
  minio: "minio",
  inbox: "the inbox",
  docExtract: "doc-extract",
};

/**
 * A dependency that is refusing work. A held queue is the symptom the run page
 * cares about, because failure-policy.ts rate limits a queue exactly when one
 * of these answers a DependencyUnavailableError, and a dependency that is down
 * with no queue held has not cost the run anything yet.
 */
export function troubleOf(health: HealthReport | null, queues: RunQueuesView | null): Trouble | null {
  const down = health ? Object.entries(health.checks).find(([, status]) => status === "down") : undefined;
  const heldQueues = queues
    ? [
        ...(queues.classify.heldUntil !== null ? (["sorting"] as const) : []),
        ...(queues.compare.heldUntil !== null ? (["checking"] as const) : []),
      ]
    : [];
  if (!down && heldQueues.length === 0) return null;

  // A queue is rate limited exactly when an upstream refused, so naming the
  // queue is the useful half even when every health check still reads up: the
  // check ran a moment ago and the refusal happened since.
  const holding = heldQueues.length === 2 ? "both queues are" : `${heldQueues[0]} is`;
  if (down) {
    const [key] = down;
    return {
      what: NAMES[key] ?? key,
      detail:
        heldQueues.length > 0
          ? `UpstreamError: ${NAMES[key] ?? key} refused, ${holding} rate limited, retryable: true`
          : `${NAMES[key] ?? key} is not answering its health check`,
    };
  }
  return {
    what: "an upstream",
    detail: `RateLimitError: ${holding} held after an upstream refused, retryable: true`,
  };
}

/** What the two queues are doing, in one sentence under the title. */
export function runSummaryLine(run: RunSummary, queues: RunQueuesView | null): string {
  if (run.processingDone) {
    const crossed = queues ? ` ${queues.handoff.needCheck} of the ${run.totalEmails ?? run.finishedEmails} crossed into the second queue.` : "";
    return `Both queues are empty.${crossed}`;
  }
  if (!queues) return "Reading the queues.";
  if (queues.compare.heldUntil !== null) return "One queue is running, the other is held.";
  const busy = queues.classify.active > 0 && queues.compare.active > 0;
  return busy ? "Two queues are running at once." : "One queue has work.";
}
