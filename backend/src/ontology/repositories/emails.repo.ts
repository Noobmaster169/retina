import type { EmailListItem, Stage } from "../../contracts";
import type { Queryable } from "../../db";

export interface NewEmail {
  emailId: string;
  from: string;
  senderDomain: string;
  subject: string;
  body: string;
  attachmentPaths: string[];
  tonnageMt: number | null;
  raw: unknown;
}

export interface StoredEmail {
  emailId: string;
  from: string;
  senderDomain: string;
  subject: string;
  body: string;
  attachmentPaths: string[];
  tonnageMt: number | null;
}

interface EmailRow {
  email_id: string;
  from_addr: string;
  sender_domain: string;
  subject: string;
  body: string;
  attachment_paths: string[];
  tonnage_mt: number | null;
}

interface ListRow {
  email_id: string;
  from_addr: string;
  subject: string;
  stage: Stage;
  outcome: string | null;
  attachment_count: number;
}

function toEmail(row: EmailRow): StoredEmail {
  return {
    emailId: row.email_id,
    from: row.from_addr,
    senderDomain: row.sender_domain,
    subject: row.subject,
    body: row.body,
    attachmentPaths: row.attachment_paths,
    tonnageMt: row.tonnage_mt,
  };
}

function toListItem(row: ListRow): EmailListItem {
  return {
    emailId: row.email_id,
    from: row.from_addr,
    subject: row.subject,
    stage: row.stage,
    attachmentCount: row.attachment_count,
    outcome: row.outcome,
  };
}

/** An email is the same in every run, so the first write wins and later ones change nothing. */
export async function upsert(db: Queryable, email: NewEmail): Promise<void> {
  await db.query(
    `insert into core.emails (email_id, from_addr, sender_domain, subject, body, attachment_paths, tonnage_mt, raw)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (email_id) do nothing`,
    [
      email.emailId,
      email.from,
      email.senderDomain,
      email.subject,
      email.body,
      email.attachmentPaths,
      email.tonnageMt,
      JSON.stringify(email.raw),
    ],
  );
}

export async function get(db: Queryable, emailId: string): Promise<StoredEmail | null> {
  const { rows } = await db.query<EmailRow>(
    `select email_id, from_addr, sender_domain, subject, body, attachment_paths, tonnage_mt
       from core.emails where email_id = $1`,
    [emailId],
  );
  return rows[0] ? toEmail(rows[0]) : null;
}

export interface RunEmailFilters {
  stage?: Stage;
  q?: string;
}

function likePattern(q: string | undefined): string | null {
  const needle = q?.trim();
  return needle ? `%${needle.replace(/[\\%_]/g, "\\$&")}%` : null;
}

export async function listForRun(
  db: Queryable,
  runId: string,
  filters: RunEmailFilters,
  page: { page: number; pageSize: number },
): Promise<{ emails: EmailListItem[]; total: number }> {
  const where = `er.run_id = $1
     and ($2::text is null or er.stage = $2)
     and ($3::text is null or e.subject ilike $3 or e.from_addr ilike $3)`;
  const params = [runId, filters.stage ?? null, likePattern(filters.q)];

  const counted = await db.query<{ total: string }>(
    `select count(*) as total from core.email_runs er join core.emails e using (email_id) where ${where}`,
    params,
  );
  const { rows } = await db.query<ListRow>(
    `select e.email_id, e.from_addr, e.subject, er.stage, er.outcome,
            cardinality(e.attachment_paths) as attachment_count
       from core.email_runs er join core.emails e using (email_id)
      where ${where}
      order by e.email_id
      limit $4 offset $5`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return { emails: rows.map(toListItem), total: Number(counted.rows[0].total) };
}
