import type { ReviewReason } from "../../contracts";
import type { Queryable } from "../../db";
import { childLogger } from "../../lib/logger";
import { comparisons, emailRuns, reviewCases } from "../../ontology/repositories";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "escalate" });

/**
 * The email needs a person: one open case, the comparison row saying
 * NEEDS_REVIEW with the organisers' reason, and the email parked at `review`.
 *
 * A second escalation of the same email run updates the case that is already
 * open rather than opening another, so a rerun that escalates for a new reason
 * changes the reason a person is looking at instead of splitting the email
 * across two cases. One open case per email run is a unique index.
 */
export async function escalate(
  pool: Queryable,
  ids: EmailRunIds,
  reason: ReviewReason,
  detail: Record<string, unknown>,
  stage = "compare",
): Promise<void> {
  const { opened } = await reviewCases.raise(pool, { emailRunId: ids.emailRunId, reason, stage, detail });
  await comparisons.upsert(pool, { emailRunId: ids.emailRunId, status: "NEEDS_REVIEW", reviewReason: reason, detail });
  await emailRuns.moveStage(pool, ids.runId, ids.emailId, ["comparing"], "review", { outcome: reason, finished: true });
  log.info({ runId: ids.runId, emailId: ids.emailId, stage, reason, opened }, "escalated");
}
