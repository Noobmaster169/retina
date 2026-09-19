import type { Queryable } from "../../db";

/** The version each step runs when a run names none, keyed by step. A step with no active row is absent. */
export async function activeVersions(db: Queryable): Promise<Record<string, string>> {
  const { rows } = await db.query<{ step: string; version: string }>(
    "select step, version from core.prompt_versions where active",
  );
  return Object.fromEntries(rows.map((row) => [row.step, row.version]));
}
