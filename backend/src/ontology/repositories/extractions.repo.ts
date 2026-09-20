import { ComparisonField, type ExtractedFieldView, type ExtractionView } from "../../contracts";
import type { Queryable } from "../../db";
import type { ExtractedFields } from "../../pipeline/compare";

export interface NewExtraction {
  documentId: string;
  emailRunId: string;
  role: "SI" | "BL";
  promptVersion: string;
  model: string;
  verified: boolean;
  fields: ExtractedFields;
  /** Per field, whether the quote was found in the text and the value inside it. */
  evidenceOk: Record<ComparisonField, boolean>;
}

export interface StoredExtraction {
  id: string;
  documentId: string;
  filename: string;
  role: "SI" | "BL";
  promptVersion: string;
  model: string;
  verified: boolean;
  fields: ExtractedFields;
  /** A person's corrections, per field, where one was made. */
  humanValues: Partial<Record<ComparisonField, string>>;
  evidenceOk: Record<ComparisonField, boolean>;
}

interface ExtractionRow {
  id: string;
  document_id: string;
  filename: string;
  role: "SI" | "BL";
  prompt_version: string;
  model: string;
  verified: boolean;
}

interface FieldRow {
  extraction_id: string;
  field: ComparisonField;
  value: string | null;
  placeholder: string | null;
  source_quote: string | null;
  confidence: string;
  evidence_ok: boolean;
  human_value: string | null;
  note: string | null;
}

const EXTRACTION_COLUMNS = "x.id, x.document_id, a.filename, x.role, x.prompt_version, x.model, x.verified";
const FIELD_COLUMNS = "extraction_id, field, value, placeholder, source_quote, confidence, evidence_ok, human_value, note";

function toStored(row: ExtractionRow, fieldRows: FieldRow[]): StoredExtraction {
  const fields = {} as ExtractedFields;
  const evidenceOk = {} as Record<ComparisonField, boolean>;
  const humanValues: Partial<Record<ComparisonField, string>> = {};
  for (const f of fieldRows) {
    fields[f.field] = { value: f.value, placeholder: f.placeholder, source_quote: f.source_quote, confidence: Number(f.confidence), note: f.note };
    evidenceOk[f.field] = f.evidence_ok;
    if (f.human_value !== null) humanValues[f.field] = f.human_value;
  }
  return {
    id: row.id,
    documentId: row.document_id,
    filename: row.filename,
    role: row.role,
    promptVersion: row.prompt_version,
    model: row.model,
    verified: row.verified,
    fields,
    humanValues,
    evidenceOk,
  };
}

/** A stored extraction as the trace shows it. */
export function toView(stored: StoredExtraction): ExtractionView {
  const fields = ComparisonField.options.map((field): ExtractedFieldView => {
    const f = stored.fields[field];
    return {
      field,
      value: f.value,
      placeholder: f.placeholder,
      sourceQuote: f.source_quote,
      confidence: f.confidence,
      evidenceOk: stored.evidenceOk[field],
      humanValue: stored.humanValues[field] ?? null,
      note: f.note,
    };
  });
  return { filename: stored.filename, role: stored.role, verified: stored.verified, promptVersion: stored.promptVersion, model: stored.model, fields };
}

/**
 * Human values win: what the pipeline reads for each field.
 *
 * The quote goes with the value it described. A person's reading is not the
 * one the model took off that line, and leaving the old quote beside it told
 * the judge that "235,550 KG" was quoted from a line reading "N/A", which is
 * exactly the placeholder the correction was made to answer.
 */
export function withHumanValues(stored: StoredExtraction): ExtractedFields {
  const fields = { ...stored.fields };
  for (const field of ComparisonField.options) {
    const human = stored.humanValues[field];
    if (human === undefined) continue;
    fields[field] = { value: human, placeholder: null, source_quote: null, confidence: 1, note: "read off the document by a person" };
  }
  return fields;
}

/**
 * One extraction per document; extracting again replaces the model's reading
 * and keeps a person's corrections, which were made about the document, not
 * about one reading of it.
 */
export async function replace(db: Queryable, row: NewExtraction): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `insert into core.extractions (document_id, email_run_id, role, prompt_version, model, verified)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (document_id) do update set
       role = excluded.role,
       prompt_version = excluded.prompt_version,
       model = excluded.model,
       verified = excluded.verified,
       created_at = now()
     returning id`,
    [row.documentId, row.emailRunId, row.role, row.promptVersion, row.model, row.verified],
  );
  const extractionId = rows[0].id;
  for (const field of ComparisonField.options) {
    const f = row.fields[field];
    await db.query(
      `insert into core.extraction_fields (extraction_id, field, value, placeholder, source_quote, confidence, evidence_ok, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (extraction_id, field) do update set
         value = excluded.value,
         placeholder = excluded.placeholder,
         source_quote = excluded.source_quote,
         confidence = excluded.confidence,
         evidence_ok = excluded.evidence_ok,
         note = excluded.note`,
      [extractionId, field, f.value, f.placeholder, f.source_quote, f.confidence, row.evidenceOk[field], f.note],
    );
  }
}

async function fieldsOf(db: Queryable, extractionIds: string[]): Promise<Map<string, FieldRow[]>> {
  const byExtraction = new Map<string, FieldRow[]>(extractionIds.map((id) => [id, []]));
  if (extractionIds.length === 0) return byExtraction;
  const { rows } = await db.query<FieldRow>(
    `select ${FIELD_COLUMNS} from core.extraction_fields where extraction_id = any($1::bigint[]) order by field`,
    [extractionIds],
  );
  for (const row of rows) byExtraction.get(row.extraction_id)?.push(row);
  return byExtraction;
}

/** The document's extraction with its fields, or null when it has not been read yet. */
export async function forDocument(db: Queryable, documentId: string): Promise<StoredExtraction | null> {
  const { rows } = await db.query<ExtractionRow>(
    `select ${EXTRACTION_COLUMNS} from core.extractions x
       join core.documents d on d.id = x.document_id join core.attachments a on a.id = d.attachment_id
      where x.document_id = $1`,
    [documentId],
  );
  if (!rows[0]) return null;
  const fields = (await fieldsOf(db, [rows[0].id])).get(rows[0].id) ?? [];
  // The row and its seven fields are written one statement at a time. A crash
  // between them leaves a reading with fields missing, which is no reading at all.
  if (fields.length < ComparisonField.options.length) return null;
  return toStored(rows[0], fields);
}

/** Every extraction of one email run, SI first. */
export async function listForEmailRun(db: Queryable, emailRunId: string): Promise<StoredExtraction[]> {
  const { rows } = await db.query<ExtractionRow>(
    `select ${EXTRACTION_COLUMNS} from core.extractions x
       join core.documents d on d.id = x.document_id join core.attachments a on a.id = d.attachment_id
      where x.email_run_id = $1 order by x.role desc`,
    [emailRunId],
  );
  const fields = await fieldsOf(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toStored(row, fields.get(row.id) ?? []));
}

/**
 * A person's reading of one field of one document. It is stored beside the
 * model's and never over it: the model's answer is what the eval measures, and
 * a correction is a second fact about the same document rather than a repair
 * of the first. `withHumanValues` is what makes it win downstream.
 *
 * Returns the value that stood before, for the action's old value. Null when
 * the document has not been read yet, which is when there is nothing to correct.
 */
export async function setHumanValue(
  db: Queryable,
  emailRunId: string,
  role: "SI" | "BL",
  field: ComparisonField,
  value: string,
): Promise<{ oldValue: string | null } | null> {
  // RETURNING on an update gives the new row, so what stood before is read in
  // a CTE first. The action row is only worth keeping if it says what changed.
  const { rows } = await db.query<{ old_value: string | null }>(
    `with was as (
       select f.id, coalesce(f.human_value, f.value) as old_value
         from core.extraction_fields f join core.extractions x on x.id = f.extraction_id
        where x.email_run_id = $1 and x.role = $2 and f.field = $3
     )
     update core.extraction_fields f set human_value = $4
       from was where f.id = was.id
       returning was.old_value`,
    [emailRunId, role, field, value],
  );
  return rows[0] ? { oldValue: rows[0].old_value } : null;
}
