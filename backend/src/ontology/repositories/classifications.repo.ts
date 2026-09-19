import type { Category } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewClassification {
  emailRunId: string;
  genCategory: Category;
  genConfidence: number;
  finalCategory: Category;
  decidedBy: "llm" | "verifier" | "human";
  rationale: Record<string, unknown>;
  model: string;
  promptVersion: string;
}

export interface StoredClassification {
  finalCategory: Category;
  humanCategory: Category | null;
  genConfidence: number | null;
  decidedBy: "llm" | "verifier" | "human";
  model: string | null;
  promptVersion: string | null;
}

/** One row per email run. Re-running the stage replaces it; a human's category is never overwritten by a rerun. */
export async function upsert(db: Queryable, row: NewClassification): Promise<void> {
  await db.query(
    `insert into core.classifications
       (email_run_id, gen_category, gen_confidence, final_category, decided_by, rationale, model, prompt_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (email_run_id) do update set
       gen_category = excluded.gen_category,
       gen_confidence = excluded.gen_confidence,
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
    decided_by: StoredClassification["decidedBy"];
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
