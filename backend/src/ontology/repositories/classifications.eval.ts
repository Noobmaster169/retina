import type { Category, ClassifyChain, DecidedBy } from "../../contracts";
import type { Queryable } from "../../db";

/**
 * Every classification of one run at once, keyed by email id. Its own file
 * beside classifications.repo.ts for the reason email-runs.submission.ts is:
 * this is one shape assembled for one consumer, the eval report, and the
 * report wants the whole run in a single read rather than a call per email.
 */

export async function chainsForRun(db: Queryable, runId: string): Promise<Map<string, ClassifyChain>> {
  const { rows } = await db.query<{
    email_id: string;
    gen_category: Category;
    gen_confidence: string;
    ver_category: Category | null;
    ver_confidence: string | null;
    decided_by: DecidedBy;
    human_category: Category | null;
    model: string | null;
    prompt_version: string | null;
  }>(
    `select er.email_id, c.gen_category, c.gen_confidence, c.ver_category, c.ver_confidence,
            c.decided_by, c.human_category, c.model, c.prompt_version
       from core.classifications c join core.email_runs er on er.id = c.email_run_id
      where er.run_id = $1`,
    [runId],
  );
  return new Map(
    rows.map((row) => [
      row.email_id,
      {
        genCategory: row.gen_category,
        genConfidence: Number(row.gen_confidence),
        verCategory: row.ver_category,
        verConfidence: row.ver_confidence === null ? null : Number(row.ver_confidence),
        decidedBy: row.decided_by,
        humanCategory: row.human_category,
        model: row.model,
        promptVersion: row.prompt_version,
      },
    ]),
  );
}
