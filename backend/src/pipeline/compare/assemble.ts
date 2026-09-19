import { ComparisonField } from "../../contracts";
import { TerminalError } from "../../lib/errors";
import type { ExtractedField, ExtractedFields, Judgement } from "./fields";

/** One field of the pair as it will be stored and shown: the two values and the word on them. */
export interface FieldJudgement {
  field: ComparisonField;
  siValue: string | null;
  blValue: string | null;
  same: boolean;
  missing: boolean;
  confidence: number | null;
  rationale: string | null;
}

export interface Assembled {
  /** All seven, in the enum's order. */
  fields: FieldJudgement[];
  /** Judged different, with a value on both sides. */
  defectFields: ComparisonField[];
  /** Blank, a placeholder, or never located, on either side. */
  missing: ComparisonField[];
}

/** The fields with a value on both sides: the only ones there is a judgement to make. */
export function judgeable(si: ExtractedFields, bl: ExtractedFields): ComparisonField[] {
  return ComparisonField.options.filter((field) => si[field].value !== null && bl[field].value !== null);
}

function absent(side: "SI" | "BL", field: ExtractedField): string {
  if (field.placeholder !== null) return `${side}: "${field.placeholder}" stands where the value should be`;
  return `${side}: ${field.note ?? "the document does not give this value"}`;
}

/**
 * The seven judgements turned into the two sets the decision needs. Code
 * collects; it does not decide. A side the extractor found nothing on is
 * missing without asking the judge, since there is nothing to compare; a
 * judgement for a name outside the organisers' seven is refused rather than
 * stored. `judged` must cover every field `judgeable` names.
 */
export function assemble(si: ExtractedFields, bl: ExtractedFields, judged: Partial<Record<ComparisonField, Judgement>>): Assembled {
  for (const name of Object.keys(judged)) {
    if (!ComparisonField.safeParse(name).success) throw new TerminalError(`the judge answered for "${name}", which is not one of the seven fields`);
  }

  const fields = ComparisonField.options.map((field): FieldJudgement => {
    const base = { field, siValue: si[field].value, blValue: bl[field].value };
    const gaps = [si[field].value === null ? absent("SI", si[field]) : null, bl[field].value === null ? absent("BL", bl[field]) : null].filter(
      (gap): gap is string => gap !== null,
    );
    if (gaps.length > 0) return { ...base, same: false, missing: true, confidence: null, rationale: gaps.join("; ") };

    const judgement = judged[field];
    if (!judgement) throw new TerminalError(`no judgement for ${field}, which has a value on both sides`);
    return { ...base, same: judgement.same, missing: judgement.missing, confidence: judgement.confidence, rationale: judgement.rationale };
  });

  return {
    fields,
    defectFields: fields.filter((f) => !f.missing && !f.same).map((f) => f.field),
    missing: fields.filter((f) => f.missing).map((f) => f.field),
  };
}
