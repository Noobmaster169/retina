import type { Queryable } from "../../db";
import { childLogger } from "../../lib/logger";
import { reviewActions, reviewCases } from "../../ontology/repositories";
import type { EmailRunIds } from "./ids";

const log = childLogger({ module: "resolve-case" });

/** Where a case that nobody touched came from. Only an action sets a rerun off, so this is a floor and not a normal path. */
const NOBODY = "retina";

/**
 * The email came out of the pipeline without needing a person, so the case
 * waiting on it is closed. It is credited to whoever set the rerun off: they
 * asked for the work that settled it and they are not standing here when it
 * finishes.
 *
 * A stage that ends in an escalation never reaches this; `escalate` updates
 * the standing case in place instead, so a re-escalation is the same case with
 * a new reason rather than a second one.
 */
export async function resolveCase(pool: Queryable, ids: EmailRunIds): Promise<void> {
  const caseId = await reviewCases.openIdFor(pool, ids.emailRunId);
  if (!caseId) return;
  const by = (await reviewActions.lastActor(pool, caseId)) ?? NOBODY;
  await reviewCases.resolve(pool, ids.emailRunId, by);
  log.info({ ...ids, caseId, by }, "case resolved by a rerun");
}
