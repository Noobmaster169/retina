import { HealthReport, RunQueuesView } from "@/lib/api/queues-schemas";
import { RunSummary } from "@/lib/api/runs-schemas";

/**
 * How the run reads in one sentence, and whether anything is wrong with it.
 * Both are wording over numbers the API returned: nothing here decides a
 * status, and the run's own `status` and every outcome enum come from the
 * backend untouched.
 */

/**
 * Whether a dependency is refusing this run work. One word in the status chip
 * is all that is left of it: the banner and the chip that used to name the
 * dependency both arrived and left on the thirty second cycle of a hold that
 * had failed nothing, and the queue that stopped already says so in its own
 * panel.
 *
 * A held queue is the symptom, because failure-policy.ts rate limits a queue
 * exactly when a dependency answers a DependencyUnavailableError, and one that
 * is down with no queue held has not cost the run anything yet.
 */
export function degraded(health: HealthReport | null, queues: RunQueuesView | null): boolean {
  const down = health ? Object.values(health.checks).some((check) => check.status === "down") : false;
  const held = queues ? queues.classify.heldUntil !== null || queues.compare.heldUntil !== null : false;
  return down || held;
}

/** What the two queues are doing, in one sentence under the title. */
export function runSummaryLine(run: RunSummary, queues: RunQueuesView | null): string {
  if (run.processingDone) {
    const crossed = queues ? ` ${queues.handoff.needCheck} of them crossed into the second queue.` : "";
    return `Both queues are empty.${crossed}`;
  }
  if (!queues) return "Reading the queues.";
  if (queues.compare.heldUntil !== null) return "One queue is running, the other is held.";
  const busy = queues.classify.active > 0 && queues.compare.active > 0;
  return busy ? "Two queues are running at once." : "One queue has work.";
}
