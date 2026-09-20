import type { Pool } from "pg";

import type { DocumentView, EmailTrace, LiveCallView } from "../contracts";
import {
  classifications,
  comparisons,
  documents,
  emailRuns,
  extractions,
  llmCalls,
  reviewCases,
  type StoredDocument,
} from "./repositories";
import { documentVerdicts } from "../pipeline/compare";

/**
 * Everything known about one email of one run, assembled once.
 *
 * It was inline in run-trace.routes.ts until the chat agent needed the same
 * thing: `get_email` and `explain_decision` both answer from this, and two
 * assemblies of the same story would let the trace page and the chat disagree
 * about an email in front of the person reading both. The route keeps the
 * live-call overlay, which is the only part that needs Redis.
 */

/** The email's documents with the compare stage's verdict on each, so a reader gets a reading rather than making one. */
export function withVerdicts(docs: StoredDocument[]): DocumentView[] {
  const verdicts = documentVerdicts(docs);
  return docs.map((doc) => documents.toView(doc, verdicts.get(doc.filename) ?? "unknown"));
}

/** Null when this email was never part of this run. */
export async function buildEmailTrace(
  db: Pool,
  runId: string,
  emailId: string,
  live: LiveCallView | null = null,
): Promise<EmailTrace | null> {
  const state = await emailRuns.stateOf(db, runId, emailId);
  if (!state) return null;

  const [classification, docs, review, extracted, comparison, calls] = await Promise.all([
    classifications.view(db, state.id),
    documents.listForEmailRun(db, state.id),
    reviewCases.latestFor(db, state.id),
    extractions.listForEmailRun(db, state.id),
    comparisons.view(db, state.id),
    llmCalls.listForEmail(db, runId, emailId),
  ]);

  return {
    emailId,
    stage: state.stage,
    error: state.error,
    classification,
    documents: withVerdicts(docs),
    review,
    extractions: extracted.map(extractions.toView),
    comparison,
    live,
    calls,
  };
}

/**
 * The most recent run this email took part in.
 *
 * What the chat uses when a question names an email and no run: a person
 * asking "explain email_407" means the last time it was looked at, and making
 * them find a run id first would be the tool asking the question back.
 */
export async function latestRunFor(db: Pool, emailId: string): Promise<string | null> {
  const { rows } = await db.query<{ run_id: string }>(
    `select er.run_id
       from core.email_runs er
      where er.email_id = $1
      order by er.started_at desc
      limit 1`,
    [emailId],
  );
  return rows[0]?.run_id ?? null;
}
