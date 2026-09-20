import { z } from "zod";

import type { Category, ClassificationView, DecidedBy } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewClassification {
  emailRunId: string;
  genCategory: Category;
  genConfidence: number;
  /** Null when the generator was sure enough that the verifier did not run. */
  verCategory: Category | null;
  verConfidence: number | null;
  finalCategory: Category;
  decidedBy: DecidedBy;
  rationale: Record<string, unknown>;
  model: string;
  promptVersion: string;
}

export interface StoredClassification {
  finalCategory: Category;
  humanCategory: Category | null;
  genConfidence: number | null;
  decidedBy: DecidedBy;
  model: string | null;
  promptVersion: string | null;
}

/** One row per email run. Re-running the stage replaces it; a human's category is never overwritten by a rerun. */
export async function upsert(db: Queryable, row: NewClassification): Promise<void> {
  await db.query(
    `insert into core.classifications
       (email_run_id, gen_category, gen_confidence, ver_category, ver_confidence, final_category, decided_by,
        rationale, model, prompt_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (email_run_id) do update set
       gen_category = excluded.gen_category,
       gen_confidence = excluded.gen_confidence,
       ver_category = excluded.ver_category,
       ver_confidence = excluded.ver_confidence,
       final_category = excluded.final_category,
       decided_by = excluded.decided_by,
       rationale = excluded.rationale,
       model = excluded.model,
       prompt_version = excluded.prompt_version,
       created_at = now()`,
    [
      row.emailRunId,
      row.genCategory,
      row.genConfidence,
      row.verCategory,
      row.verConfidence,
      row.finalCategory,
      row.decidedBy,
      JSON.stringify(row.rationale),
      row.model,
      row.promptVersion,
    ],
  );
}

export async function get(db: Queryable, emailRunId: string): Promise<StoredClassification | null> {
  const { rows } = await db.query<{
    final_category: Category;
    human_category: Category | null;
    gen_confidence: string | null;
    decided_by: DecidedBy;
    model: string | null;
    prompt_version: string | null;
  }>(
    `select final_category, human_category, gen_confidence, decided_by, model, prompt_version
       from core.classifications where email_run_id = $1`,
    [emailRunId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    finalCategory: row.final_category,
    humanCategory: row.human_category,
    genConfidence: row.gen_confidence === null ? null : Number(row.gen_confidence),
    decidedBy: row.decided_by,
    model: row.model,
    promptVersion: row.prompt_version,
  };
}

/**
 * Of each run's classified emails, the share the verifier settled, as a total
 * lookup: a run with nothing classified reads as 0 rather than as absent.
 */
export async function verifierShareForRuns(db: Queryable, runIds: string[]): Promise<(runId: string) => number> {
  if (runIds.length === 0) return () => 0;
  const { rows } = await db.query<{ run_id: string; share: string }>(
    `select er.run_id, avg(case when c.decided_by = 'verifier' then 1 else 0 end) as share
       from core.classifications c join core.email_runs er on er.id = c.email_run_id
      where er.run_id = any($1::uuid[]) group by er.run_id`,
    [runIds],
  );
  const shares = new Map(rows.map((row) => [row.run_id, Number(row.share)]));
  return (runId) => shares.get(runId) ?? 0;
}

/** What the rationale column holds: each reader's reasoning, and a verifier failure if one happened. */
const Rationale = z.object({
  generator: z.string().default(""),
  verifier: z.string().optional(),
  counterCases: z.string().optional(),
  verifierError: z.string().optional(),
});

/** How the email's category was settled, for the run page. Null before it is classified. */
export async function view(db: Queryable, emailRunId: string): Promise<ClassificationView | null> {
  const { rows } = await db.query<{
    final_category: Category;
    human_category: Category | null;
    decided_by: DecidedBy;
    gen_category: Category;
    gen_confidence: string;
    ver_category: Category | null;
    ver_confidence: string | null;
    rationale: unknown;
    model: string | null;
    prompt_version: string | null;
  }>(
    `select final_category, human_category, decided_by, gen_category, gen_confidence, ver_category, ver_confidence,
            rationale, model, prompt_version
       from core.classifications where email_run_id = $1`,
    [emailRunId],
  );
  const row = rows[0];
  if (!row) return null;
  const why = Rationale.parse(row.rationale ?? {});
  return {
    finalCategory: row.final_category,
    humanCategory: row.human_category,
    decidedBy: row.decided_by,
    generator: { category: row.gen_category, confidence: Number(row.gen_confidence), rationale: why.generator },
    verifier: row.ver_category
      ? {
          category: row.ver_category,
          confidence: Number(row.ver_confidence),
          rationale: why.verifier ?? "",
          counterCases: why.counterCases ?? null,
        }
      : null,
    verifierError: why.verifierError ?? null,
    model: row.model,
    promptVersion: row.prompt_version,
  };
}

/**
 * A person's category. Stored beside the model's rather than over it, because
 * the model's answer is the eval's subject and a correction is a second fact
 * about the same email. `human_value ?? value` is the rule everywhere; here it
 * is `human_category ?? final_category`, read by the submission builder.
 *
 * Returns the category the model had settled on, for the action's old value.
 */
export async function setHumanCategory(db: Queryable, emailRunId: string, category: Category): Promise<Category | null> {
  // RETURNING on an update gives the new row, so what stood before is read in
  // a CTE first. The action row is only worth keeping if it says what changed.
  const { rows } = await db.query<{ was: Category | null }>(
    `with was as (
       select id, coalesce(human_category, final_category) as category
         from core.classifications where email_run_id = $1
     )
     update core.classifications c set human_category = $2, decided_by = 'human'
       from was where c.id = was.id
       returning was.category as was`,
    [emailRunId, category],
  );
  return rows[0]?.was ?? null;
}
