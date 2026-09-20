import type { ReviewActionBody } from "../contracts";
import type { Queryable } from "../db";
import { TerminalError } from "../lib/errors";
import {
  type CaseIdentity,
  classifications,
  comparisons,
  emailRuns,
  extractions,
  fieldDiffs,
  type NewReviewAction,
  reviewCases,
} from "../ontology/repositories";
import type { RerunFrom } from "../queues/names";

/**
 * What each action writes, and what it sends back through the pipeline. One
 * function per kind, each running inside the caller's transaction.
 *
 * Nothing here decides that a value is correct. A correction records what a
 * person says one document reads; the comparison is judged again from both
 * sides and may still come out MISMATCH, which is the point.
 */

export interface Effect {
  /** The columns this kind fills on its action row, beside the kind, the actor and the note. */
  row: Pick<NewReviewAction, "field" | "side" | "oldValue" | "newValue">;
  /** Where the pipeline picks the email up again, or null where the action changed nothing outside the database. */
  rerun: RerunFrom | null;
  /** One sentence naming what was written, in the product's own voice. The frontend holds no wording of its own. */
  wrote: string;
}

const NOTHING: Effect["row"] = { field: null, side: null, oldValue: null, newValue: null };

/**
 * The escalation was right and a person has seen it. The reported status stays
 * NEEDS_REVIEW with its reason: confirming does not turn a case into a clean
 * comparison, it records that a person agreed the email needs one.
 */
async function confirm(tx: Queryable, at: CaseIdentity, actor: string): Promise<Effect> {
  await comparisons.setDecidedBy(tx, at.emailRunId, "human");
  await emailRuns.setStage(tx, at.runId, at.emailId, "done", { finished: true });
  await reviewCases.resolve(tx, at.emailRunId, actor);
  return { row: NOTHING, rerun: null, wrote: `Recorded that ${at.emailId} needs a person. It is still reported as NEEDS_REVIEW.` };
}

/**
 * What a person says one document reads, stored beside the model's reading of
 * it rather than over it. The pair is then judged again with the corrected
 * value in place; the case stays open until that rerun settles it.
 */
async function correctField(tx: Queryable, at: CaseIdentity, body: Extract<ReviewActionBody, { kind: "correct_field" }>): Promise<Effect> {
  const changed = await extractions.setHumanValue(tx, at.emailRunId, body.side, body.field, body.value);
  if (!changed) throw new TerminalError(`the ${body.side} of ${at.emailId} has not been read, so there is no ${body.field} to correct`);
  return {
    row: { field: body.field, side: body.side, oldValue: changed.oldValue, newValue: body.value },
    rerun: "compare",
    wrote: `Recorded the ${body.side}'s ${body.field} as "${body.value}".`,
  };
}

/**
 * A person's category. A comparison request goes back through the compare
 * stage from triage; anything else is not a pair at all, so its comparison row
 * is replaced with a clean one and the judgements that belonged to the old
 * reading are cleared rather than left to contradict it.
 */
async function reclassify(tx: Queryable, at: CaseIdentity, body: Extract<ReviewActionBody, { kind: "reclassify" }>): Promise<Effect> {
  const was = await classifications.setHumanCategory(tx, at.emailRunId, body.category);
  const row = { field: null, side: null, oldValue: was, newValue: body.category };
  if (body.category === "BL_COMPARISON") {
    return { row, rerun: "triage", wrote: `Recorded ${at.emailId} as BL_COMPARISON and sent it back to be compared.` };
  }
  await comparisons.upsert(tx, { emailRunId: at.emailRunId, status: "OK", reviewReason: null, detail: { reclassified: true } });
  const comparisonId = await comparisons.idFor(tx, at.emailRunId);
  if (comparisonId) await fieldDiffs.replaceAll(tx, comparisonId, []);
  await emailRuns.setStage(tx, at.runId, at.emailId, "done", { outcome: "not_comparable", finished: true });
  await reviewCases.resolve(tx, at.emailRunId, body.actor);
  return { row, rerun: null, wrote: `Recorded ${at.emailId} as ${body.category}. There is no pair to compare, so the case is closed.` };
}

/** A failed job, sent back to the queue it failed on. The case stays open until the rerun says how it went. */
async function retry(tx: Queryable, at: CaseIdentity): Promise<Effect> {
  await emailRuns.setStage(tx, at.runId, at.emailId, at.stage === "classify" ? "ingested" : "classified", {});
  const from: RerunFrom = at.stage === "classify" ? "classify" : "triage";
  return { row: NOTHING, rerun: from, wrote: `Sent ${at.emailId} back through ${at.stage}.` };
}

/** The case was closed too soon. Nothing is re-queued: reopening is a person saying they want to look again. */
async function reopen(tx: Queryable, at: CaseIdentity): Promise<Effect> {
  if (!(await reviewCases.reopen(tx, at.id))) throw new TerminalError("this case is already open");
  await emailRuns.setStage(tx, at.runId, at.emailId, "review", { finished: true });
  return { row: NOTHING, rerun: null, wrote: `Put the case on ${at.emailId} back.` };
}

/** What the action does, inside the caller's transaction. Upload is not here: it needs the file and the object store. */
export async function effectOf(tx: Queryable, at: CaseIdentity, body: ReviewActionBody): Promise<Effect> {
  switch (body.kind) {
    case "confirm":
      return confirm(tx, at, body.actor);
    case "correct_field":
      return correctField(tx, at, body);
    case "reclassify":
      return reclassify(tx, at, body);
    case "note":
      return { row: NOTHING, rerun: null, wrote: `Kept the note on ${at.emailId}.` };
    case "retry":
      return retry(tx, at);
    case "reopen":
      return reopen(tx, at);
  }
}
