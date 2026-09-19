import type { Queryable } from "../../db";

export interface PromptVersionRow {
  step: string;
  version: string;
  active: boolean;
  notes: string | null;
}

/** Every recorded version, active or not, with what was noted about it. */
export async function list(db: Queryable): Promise<PromptVersionRow[]> {
  const { rows } = await db.query<PromptVersionRow>("select step, version, active, notes from core.prompt_versions");
  return rows;
}

/** The version each step runs when a run names none, keyed by step. A step with no active row is absent. */
export async function activeVersions(db: Queryable): Promise<Record<string, string>> {
  const { rows } = await db.query<{ step: string; version: string }>(
    "select step, version from core.prompt_versions where active",
  );
  return Object.fromEntries(rows.map((row) => [row.step, row.version]));
}
