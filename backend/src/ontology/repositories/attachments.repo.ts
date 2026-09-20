import type { AttachmentRole } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewAttachment {
  runId: string;
  emailId: string;
  filename: string;
  sourcePath: string;
  role: AttachmentRole;
  objectKey: string;
  contentType: string;
  bytes: number;
  sha256: string;
}

export interface StoredAttachment extends NewAttachment {
  id: string;
  origin: "source" | "human";
}

interface AttachmentRow {
  id: string;
  run_id: string;
  email_id: string;
  filename: string;
  source_path: string;
  role: AttachmentRole;
  origin: "source" | "human";
  object_key: string;
  content_type: string;
  bytes: number;
  sha256: string;
}

function toAttachment(row: AttachmentRow): StoredAttachment {
  return {
    id: row.id,
    runId: row.run_id,
    emailId: row.email_id,
    filename: row.filename,
    sourcePath: row.source_path,
    role: row.role,
    origin: row.origin,
    objectKey: row.object_key,
    contentType: row.content_type,
    bytes: row.bytes,
    sha256: row.sha256,
  };
}

export async function insert(db: Queryable, attachment: NewAttachment): Promise<void> {
  await db.query(
    `insert into core.attachments
       (run_id, email_id, filename, source_path, role, object_key, content_type, bytes, sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (run_id, email_id, filename) do nothing`,
    [
      attachment.runId,
      attachment.emailId,
      attachment.filename,
      attachment.sourcePath,
      attachment.role,
      attachment.objectKey,
      attachment.contentType,
      attachment.bytes,
      attachment.sha256,
    ],
  );
}

export async function listForEmail(db: Queryable, runId: string, emailId: string): Promise<StoredAttachment[]> {
  const { rows } = await db.query<AttachmentRow>(
    `select id, run_id, email_id, filename, source_path, role, origin, object_key, content_type, bytes, sha256
       from core.attachments where run_id = $1 and email_id = $2 order by filename`,
    [runId, emailId],
  );
  return rows.map(toAttachment);
}

export async function listForRun(db: Queryable, runId: string): Promise<StoredAttachment[]> {
  const { rows } = await db.query<AttachmentRow>(
    `select id, run_id, email_id, filename, source_path, role, origin, object_key, content_type, bytes, sha256
       from core.attachments where run_id = $1 order by email_id, filename`,
    [runId],
  );
  return rows.map(toAttachment);
}

/** The filenames of a handful of emails, for the queued rows on the run page. Bounded by its caller. */
export async function filenamesFor(db: Queryable, runId: string, emailIds: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  if (emailIds.length === 0) return found;
  const { rows } = await db.query<{ email_id: string; filename: string }>(
    `select email_id, filename from core.attachments
      where run_id = $1 and email_id = any($2::text[]) order by email_id, filename`,
    [runId, emailIds],
  );
  for (const row of rows) found.set(row.email_id, [...(found.get(row.email_id) ?? []), row.filename]);
  return found;
}

/**
 * A document a person supplied for a case. `origin = 'human'` is what triage
 * reads to prefer it over the file the sender attached for the same role, and
 * the case id is what ties it back to why it was asked for.
 */
export async function insertFromPerson(db: Queryable, attachment: NewAttachment & { reviewCaseId: string }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into core.attachments
       (run_id, email_id, filename, source_path, role, origin, object_key, content_type, bytes, sha256, review_case_id)
     values ($1, $2, $3, $4, $5, 'human', $6, $7, $8, $9, $10)
     on conflict (run_id, email_id, filename) do update set
       role = excluded.role,
       origin = 'human',
       object_key = excluded.object_key,
       content_type = excluded.content_type,
       bytes = excluded.bytes,
       sha256 = excluded.sha256,
       review_case_id = excluded.review_case_id
     returning id`,
    [
      attachment.runId,
      attachment.emailId,
      attachment.filename,
      attachment.sourcePath,
      attachment.role,
      attachment.objectKey,
      attachment.contentType,
      attachment.bytes,
      attachment.sha256,
      attachment.reviewCaseId,
    ],
  );
  return rows[0].id;
}
