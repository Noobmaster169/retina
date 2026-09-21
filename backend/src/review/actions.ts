import type { ReviewActionBody, ReviewActionKind, ReviewActionResult } from "../contracts";
import type { Queryable, Transactor } from "../db";
import { TerminalError } from "../lib/errors";
import { type CaseIdentity, reviewActions, reviewCases } from "../ontology/repositories";
import { type Effect, effectOf } from "./effects";
import { enqueueReading, requeue, type ReviewQueues } from "./rerun";

/**
 * Every write a person makes against a case goes through here: one
 * transaction, then the rerun it asks for, then the case read back as the
 * queue will show it.
 *
 * The action row is written in the same transaction as what it describes,
 * because it is the record of what a person said and phase 11 drafts lessons
 * from it. A rerun is enqueued only after that transaction commits, so a job
 * never names a row nobody wrote.
 */

export interface ReviewDeps {
  db: Queryable;
  /** One transaction around what an action writes. The pool's in the api, the test's own inside a rollback. */
  tx: Transactor;
  queues: ReviewQueues;
}

/** What a person typed, shared by every kind. Upload's rest arrives as multipart. */
export interface ActionIdentity {
  kind: ReviewActionKind;
  actor: string;
  note?: string;
}

/** Which state a case has to be in for each kind. A note is the one that fits any. */
const NEEDS: Record<ReviewActionKind, { kind?: "review" | "failure"; status?: "open" | "resolved" }> = {
  confirm: { kind: "review", status: "open" },
  correct_field: { kind: "review", status: "open" },
  reclassify: { kind: "review", status: "open" },
  upload: { kind: "review", status: "open" },
  retry: { kind: "failure", status: "open" },
  reopen: { status: "resolved" },
  note: {},
};

/** Throws when the case is not in a state where this action means anything. The route answers 409. */
export function checkState(at: CaseIdentity, kind: ReviewActionKind): void {
  const needs = NEEDS[kind];
  if (needs.status && at.status !== needs.status) {
    throw new TerminalError(`this case is ${at.status}, and ${kind} needs one that is ${needs.status}`);
  }
  if (needs.kind === "failure" && at.kind !== "failure") {
    throw new TerminalError("retry is for a job that failed, and this case is an escalation");
  }
  if (needs.kind === "review" && at.kind !== "review") {
    throw new TerminalError(`${kind} is for an escalation, and this case is a job that failed`);
  }
}

/** The case an action is about, or null when there is none. The route answers 404. */
export async function findCase(deps: ReviewDeps, caseId: string): Promise<CaseIdentity | null> {
  return reviewCases.identify(deps.db, caseId);
}

/**
 * The transaction, the action row, the rerun and the case read back. `produce`
 * is what this kind writes; upload hands in its own because it has already put
 * the file in the store and only the database work belongs in here.
 */
export async function applyEffect(
  deps: ReviewDeps,
  at: CaseIdentity,
  body: ActionIdentity,
  produce: (tx: Queryable) => Promise<Effect>,
): Promise<ReviewActionResult> {
  const { effect, action } = await deps.tx(async (tx) => {
    const effect = await produce(tx);
    const action = await reviewActions.insert(tx, {
      reviewCaseId: at.id,
      emailRunId: at.emailRunId,
      kind: body.kind,
      actor: body.actor,
      note: body.note ?? null,
      ...effect.row,
    });
    return { effect, action };
  });

  const requeued = effect.rerun ? await requeue(deps.db, deps.queues, at, effect.rerun) : null;
  if (effect.read) await enqueueReading(deps.queues, at);
  const item = await reviewCases.item(deps.db, at.id);
  if (!item) throw new TerminalError(`case ${at.id} disappeared while it was being written to`);
  return { case: item, action, requeued, wrote: effect.wrote };
}

/** One action against one case. Null when there is no such case. */
export async function applyAction(deps: ReviewDeps, caseId: string, body: ReviewActionBody): Promise<ReviewActionResult | null> {
  const at = await findCase(deps, caseId);
  if (!at) return null;
  checkState(at, body.kind);
  return applyEffect(deps, at, body, (tx) => effectOf(tx, at, body));
}
