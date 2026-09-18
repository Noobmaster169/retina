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
