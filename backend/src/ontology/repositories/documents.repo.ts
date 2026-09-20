import type { AttachmentRole, DocType, DocumentFormat, DocumentView, TypeVerdict } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewDocument {
  emailRunId: string;
  attachmentId: string;
  role: AttachmentRole;
  format: DocumentFormat;
  textObjectKey: string | null;
  pages: number;
  scanned: boolean;
  unreadable: boolean;
  warnings: string[];
  /** Mean OCR word confidence per page, in page order. Empty for a document with a text layer. */
  pageConfidence: number[];
}

export interface StoredDocument extends NewDocument {
  /** The file's size on disk, from its attachment row. The message card states it beside the name. */
  bytes: number;
  id: string;
  filename: string;
  objectKey: string;
  contentType: string;
  docType: DocType | null;
  docTypeConfidence: number | null;
  docTypeRationale: string | null;
}

export interface DocTypeVerdict {
  docType: DocType;
  confidence: number;
  rationale: string;
}

interface DocumentRow {
  id: string;
  email_run_id: string;
  attachment_id: string;
  filename: string;
  object_key: string;
  content_type: string;
  role: AttachmentRole;
  doc_type: DocType | null;
  doc_type_confidence: string | null;
  doc_type_rationale: string | null;
  format: DocumentFormat;
  text_object_key: string | null;
  pages: number;
  scanned: boolean;
  unreadable: boolean;
  warnings: string[];
  page_confidence: number[];
  bytes: number;
}

const COLUMNS = `d.id, d.email_run_id, d.attachment_id, a.filename, a.object_key, a.content_type, d.role, d.doc_type,
  d.doc_type_confidence, d.doc_type_rationale, d.format, d.text_object_key, d.pages, d.scanned, d.unreadable, d.warnings, d.page_confidence, a.bytes`;

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    emailRunId: row.email_run_id,
    attachmentId: row.attachment_id,
    filename: row.filename,
    objectKey: row.object_key,
    contentType: row.content_type,
    role: row.role,
    docType: row.doc_type,
    docTypeConfidence: row.doc_type_confidence === null ? null : Number(row.doc_type_confidence),
    docTypeRationale: row.doc_type_rationale,
    format: row.format,
    textObjectKey: row.text_object_key,
    pages: row.pages,
    scanned: row.scanned,
    unreadable: row.unreadable,
    warnings: row.warnings,
    pageConfidence: row.page_confidence ?? [],
    bytes: row.bytes,
  };
}

/** The verdict comes from the compare pipeline, which reads the documents together; a row on its own cannot tell. */
export function toView(doc: StoredDocument, typeVerdict: TypeVerdict): DocumentView {
  return {
    filename: doc.filename,
    role: doc.role,
    docType: doc.docType,
    docTypeConfidence: doc.docTypeConfidence,
    docTypeRationale: doc.docTypeRationale,
    typeVerdict,
    format: doc.format,
    pages: doc.pages,
    scanned: doc.scanned,
    unreadable: doc.unreadable,
    warnings: doc.warnings,
    pageConfidence: doc.pageConfidence,
    bytes: doc.bytes,
  };
}

/** One row per attachment per email run. Parsing again replaces what the parser found and clears the model's verdict. */
export async function upsert(db: Queryable, doc: NewDocument): Promise<void> {
  await db.query(
    `insert into core.documents
       (email_run_id, attachment_id, role, format, text_object_key, pages, scanned, unreadable, warnings, page_confidence)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (email_run_id, attachment_id) do update set
       role = excluded.role,
       format = excluded.format,
       text_object_key = excluded.text_object_key,
       pages = excluded.pages,
       scanned = excluded.scanned,
       unreadable = excluded.unreadable,
       warnings = excluded.warnings,
       page_confidence = excluded.page_confidence,
       doc_type = null,
       doc_type_confidence = null,
       doc_type_rationale = null,
       created_at = now()`,
    [
      doc.emailRunId,
      doc.attachmentId,
      doc.role,
      doc.format,
      doc.textObjectKey,
      doc.pages,
      doc.scanned,
      doc.unreadable,
      JSON.stringify(doc.warnings),
      doc.pageConfidence,
    ],
  );
}

export async function setDocType(db: Queryable, id: string, verdict: DocTypeVerdict): Promise<void> {
  await db.query(
    "update core.documents set doc_type = $2, doc_type_confidence = $3, doc_type_rationale = $4 where id = $1",
    [id, verdict.docType, verdict.confidence, verdict.rationale],
  );
}

/** Every document of one email run, in filename order, with the attachment it came from. */
export async function listForEmailRun(db: Queryable, emailRunId: string): Promise<StoredDocument[]> {
  const { rows } = await db.query<DocumentRow>(
    `select ${COLUMNS} from core.documents d join core.attachments a on a.id = d.attachment_id
      where d.email_run_id = $1 order by a.filename`,
    [emailRunId],
  );
  return rows.map(toDocument);
}
