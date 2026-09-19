import type { ComparisonField, FieldJudgementView } from "../../contracts";
import type { Queryable } from "../../db";
import type { FieldJudgement } from "../../pipeline/compare";

interface DiffRow {
  field: ComparisonField;
  si_value: string | null;
  bl_value: string | null;
  same: boolean;
  missing: boolean;
  confidence: string | null;
  rationale: string | null;
}

function toView(row: DiffRow): FieldJudgementView {
  return {
    field: row.field,
    siValue: row.si_value,
    blValue: row.bl_value,
    same: row.same,
    missing: row.missing,
    confidence: row.confidence === null ? null : Number(row.confidence),
    rationale: row.rationale,
  };
}

/** Every field's judgement for one comparison. Judging again replaces the set. */
export async function replaceAll(db: Queryable, comparisonId: string, fields: FieldJudgement[]): Promise<void> {
  await db.query("delete from core.field_diffs where comparison_id = $1", [comparisonId]);
  for (const f of fields) {
    await db.query(
      `insert into core.field_diffs (comparison_id, field, si_value, bl_value, same, missing, confidence, rationale)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [comparisonId, f.field, f.siValue, f.blValue, f.same, f.missing, f.confidence, f.rationale],
    );
  }
}

/** The seven judgements of one comparison in the enum's order, or none when the pair was never judged. */
export async function listForComparison(db: Queryable, comparisonId: string): Promise<FieldJudgementView[]> {
  const { rows } = await db.query<DiffRow>(
    `select field, si_value, bl_value, same, missing, confidence, rationale from core.field_diffs
      where comparison_id = $1
      order by array_position(array['shipper','consignee','notify_party','port_of_loading','port_of_discharge','container_count','gross_weight_kg'], field)`,
    [comparisonId],
  );
  return rows.map(toView);
}
