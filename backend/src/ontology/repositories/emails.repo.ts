import type { Category, DecidedBy, EmailListItem, Stage } from "../../contracts";
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
  error: string | null;
  attachment_count: number;
  final_category: Category | null;
  decided_by: DecidedBy | null;
  gen_confidence: string | null;
  ver_category: Category | null;
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
    category: row.final_category,
    decidedBy: row.decided_by,
    confidence: row.gen_confidence === null ? null : Number(row.gen_confidence),
    verifierCategory: row.ver_category,
    error: row.error,
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
  category?: Category;
  decidedBy?: DecidedBy;
  outcome?: string;
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
  const from = `core.email_runs er join core.emails e using (email_id)
     left join core.classifications c on c.email_run_id = er.id`;
  const where = `er.run_id = $1
     and ($2::text is null or er.stage = $2)
     and ($3::text is null or e.subject ilike $3 or e.from_addr ilike $3)
     and ($4::text is null or c.final_category = $4)
     and ($5::text is null or c.decided_by = $5)
     and ($6::text is null or er.outcome = $6)`;
  const params = [
    runId,
    filters.stage ?? null,
    likePattern(filters.q),
    filters.category ?? null,
    filters.decidedBy ?? null,
    filters.outcome ?? null,
  ];

  const counted = await db.query<{ total: string }>(`select count(*) as total from ${from} where ${where}`, params);
  const { rows } = await db.query<ListRow>(
    `select e.email_id, e.from_addr, e.subject, er.stage, er.outcome, er.error,
            cardinality(e.attachment_paths) as attachment_count,
            c.final_category, c.decided_by, c.gen_confidence, c.ver_category
       from ${from}
      where ${where}
      order by e.email_id
      limit $7 offset $8`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return { emails: rows.map(toListItem), total: Number(counted.rows[0].total) };
}
